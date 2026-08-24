import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../common/Modal';
import { PERS_ET_SERVICES } from '../../data/permissions';
import { SOURCES_INSTRUCTION_LIMEX } from '../../data/constants';
import { decouperInstructionEnActions, construireTacheExecutant, trouverSuiviLimexExistant } from '../../utils/limexCoordination';

/**
 * §8-11 : transforme un message WhatsApp collé en actions structurées.
 * Composant partagé (Ma journée + Suivi LIMEX) — un seul endroit pour ce
 * flux, pas de duplication entre les deux pages qui l'ouvrent.
 */
export default function InstructionLimexModal({ codeReferenceInitial, onClose, onEnvoyee }) {
  const { db, updateDB, genCode, audit, notifier, userCourant } = useDB();
  const { toast } = useToast();

  const [codeReference, setCodeReference] = useState(codeReferenceInitial || '');
  const [source, setSource] = useState('WhatsApp LIMEX');
  const [texte, setTexte] = useState('');
  const [destinataires, setDestinataires] = useState([]);
  const [propositions, setPropositions] = useState(null);

  const personnes = PERS_ET_SERVICES(db);

  const handleDecouper = () => {
    if (!codeReference.trim()) { toast('Indiquez le code du dossier.'); return; }
    if (!texte.trim()) { toast('Collez le message à découper.'); return; }
    const libelles = decouperInstructionEnActions(texte);
    if (!libelles.length) { toast('Aucune action détectée — modifiez le texte ou ajoutez une action manuellement.'); }
    setPropositions(libelles.map(l => ({ libelle: l, responsable: destinataires[0] || '', echeance: '', priorite: 'Normale', incluse: true })));
  };

  const majProposition = (i, patch) => setPropositions(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const supprimerProposition = (i) => setPropositions(prev => prev.filter((_, idx) => idx !== i));
  const ajouterProposition = () => setPropositions(prev => [...prev, { libelle: '', responsable: destinataires[0] || '', echeance: '', priorite: 'Normale', incluse: true }]);

  const toggleDestinataire = (nom) => setDestinataires(prev => prev.includes(nom) ? prev.filter(d => d !== nom) : [...prev, nom]);

  const handleEnvoyer = () => {
    const retenues = (propositions || []).filter(p => p.incluse && p.libelle.trim() && p.responsable);
    if (!retenues.length) { toast('Aucune action valide (libellé + responsable requis).'); return; }

    let suivi = trouverSuiviLimexExistant(db, codeReference, null);
    const nextSuivisLimex = [...(db.suivisLimex || [])];
    if (!suivi) {
      suivi = {
        code: genCode('SVL'), codeReference: codeReference.trim(), etatGlobal: 'Nouveau',
        coordinateur: userCourant, memoire: [], blocages: [], par: userCourant, ts: Date.now()
      };
      nextSuivisLimex.unshift(suivi);
    }

    const nouvellesActions = [];
    const nouvellesTaches = [];
    retenues.forEach(p => {
      const action = {
        code: genCode('ACL'), suivi: suivi.code, libelle: p.libelle.trim(), responsable: p.responsable,
        echeance: p.echeance || '', priorite: p.priorite || 'Normale', statut: 'À faire', source: 'instruction',
        ts: Date.now(), par: userCourant
      };
      nouvellesActions.push(action);
      nouvellesTaches.push(construireTacheExecutant(action, suivi, genCode, userCourant));
    });

    const instruction = {
      code: genCode('INL'), suivi: suivi.code, source, texteOriginal: texte, auteur: userCourant,
      destinataires: destinataires.join(', '), statut: 'Envoyée', actionsGenerees: nouvellesActions.map(a => a.code),
      ts: Date.now(), par: userCourant
    };

    updateDB({
      ...db,
      suivisLimex: nextSuivisLimex,
      actionsLimex: [...nouvellesActions, ...(db.actionsLimex || [])],
      instructionsLimex: [instruction, ...(db.instructionsLimex || [])],
      taches: [...nouvellesTaches, ...(db.taches || [])]
    });
    audit('Suivi LIMEX', 'Instruction envoyée', suivi.code, '—', '—', `${retenues.length} action(s) créée(s)`);
    [...new Set(retenues.map(p => p.responsable))].forEach(resp => {
      notifier(resp, `Nouvelle(s) action(s) LIMEX — Code ${suivi.codeReference}\n${retenues.filter(p => p.responsable === resp).map(p => `• ${p.libelle}`).join('\n')}\nLien : #ficheSuiviLimex:${suivi.code}`, 'Suivi LIMEX');
    });
    toast(`${retenues.length} action(s) envoyée(s) aux exécutants.`);
    if (onEnvoyee) onEnvoyee(suivi.code);
    onClose();
  };

  return (
    <Modal title="+ Instruction LIMEX" onClose={onClose} large footer={
      propositions ? (
        <><button className="btn doux" onClick={() => setPropositions(null)}>Retour</button><button className="btn or" onClick={handleEnvoyer}>Envoyer aux exécutants</button></>
      ) : (
        <><button className="btn doux" onClick={onClose}>Annuler</button><button className="btn or" onClick={handleDecouper}>Découper en actions</button></>
      )
    }>
      {!propositions ? (
        <div className="corps">
          <div className="champ"><label>Code du dossier</label><input value={codeReference} onChange={e => setCodeReference(e.target.value)} placeholder="Ex. 9340" /></div>
          <div className="champ"><label>Source de l'instruction</label>
            <select value={source} onChange={e => setSource(e.target.value)}>
              {SOURCES_INSTRUCTION_LIMEX.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="champ large">
            <label>Destinataires</label>
            <div className="grille-cases">
              {personnes.map(p => (
                <label key={p}><input type="checkbox" checked={destinataires.includes(p)} onChange={() => toggleDestinataire(p)} />{p}</label>
              ))}
            </div>
          </div>
          <div className="champ large"><label>Message collé</label><textarea value={texte} onChange={e => setTexte(e.target.value)} rows={6} placeholder="Collez ici le message WhatsApp…" /></div>
        </div>
      ) : (
        <div className="corps">
          <p style={{ gridColumn: '1/-1', color: 'var(--gris)' }}>Vérifiez, corrigez ou complétez avant d'envoyer.</p>
          {propositions.map((p, i) => (
            <div key={i} className="champ large" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="checkbox" checked={p.incluse} onChange={e => majProposition(i, { incluse: e.target.checked })} />
              <input style={{ flex: 2 }} value={p.libelle} onChange={e => majProposition(i, { libelle: e.target.value })} placeholder="Action" />
              <select style={{ flex: 1 }} value={p.responsable} onChange={e => majProposition(i, { responsable: e.target.value })}>
                <option value="">Responsable…</option>
                {personnes.map(pe => <option key={pe} value={pe}>{pe}</option>)}
              </select>
              <input type="date" value={p.echeance} onChange={e => majProposition(i, { echeance: e.target.value })} />
              <button className="btn mini rouge" onClick={() => supprimerProposition(i)}>Suppr.</button>
            </div>
          ))}
          <button className="btn mini doux" onClick={ajouterProposition}>+ Ajouter une action</button>
        </div>
      )}
    </Modal>
  );
}

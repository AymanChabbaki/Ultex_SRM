import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import InstructionLimexModal from './InstructionLimexModal';
import { pill } from '../../utils/format';
import {
  genererProgrammeImane, genererAlertesLimex, suivisLimexDeCoordinateur, estSuiviLimexOuvert,
  compterCalculsAValider, compterPaiementsProches, trouverSuiviLimexExistant, enregistrerActionRapide, actionsDuSuivi
} from '../../utils/limexCoordination';

const ACTIONS_RAPIDES = ['Fait', 'Relancé', 'Réponse reçue', 'En cours', 'Attente fournisseur', 'Attente collègue', 'Bloqué'];

export default function MaJourneeImane({ user }) {
  const { db, updateDB, genCode, audit, userCourant } = useDB();
  const { toast } = useToast();
  const cible = user || {};
  const [showAjouter, setShowAjouter] = useState(false);
  const [nouveauCode, setNouveauCode] = useState('');
  const [responsableInitial, setResponsableInitial] = useState('');
  const [conflit, setConflit] = useState(null);
  const [showInstruction, setShowInstruction] = useState(false);
  const [filtreActif, setFiltreActif] = useState(null);
  const [actionTraitee, setActionTraitee] = useState(null);
  const [noteTraitement, setNoteTraitement] = useState('');

  const suivis = suivisLimexDeCoordinateur(db, cible);
  const suivisOuverts = suivis.filter(estSuiviLimexOuvert);
  const programme = genererProgrammeImane(db, cible);
  const alertes = genererAlertesLimex(db, cible);
  const calculsAValider = compterCalculsAValider(db, cible);
  const paiementsProches = compterPaiementsProches(db, cible);

  const retoursAttendusListe = [];
  suivisOuverts.forEach(s => {
    actionsDuSuivi(db, s.code).filter(a => ['Attente fournisseur', 'Attente collègue'].includes(a.statut)).forEach(a => {
      retoursAttendusListe.push({ code: a.code, suiviCode: s.code, statut: a.statut, codeReference: s.codeReference, libelle: a.libelle, responsable: a.responsable, echeance: a.echeance || '—', priorite: a.priorite || 'Normale', pill: 'p-ambre', lien: `#ficheSuiviLimex:${s.code}` });
    });
  });

  const CARTES = [
    { id: 'actions', label: "Actions aujourd'hui", liste: programme },
    { id: 'urgentes', label: 'Urgentes', liste: programme.filter(p => ['Critique', 'Urgente'].includes(p.priorite)), alerte: true },
    { id: 'retard', label: 'En retard', liste: programme.filter(p => p.priorite === 'Retard'), alerte: true },
    { id: 'retours', label: 'Retours attendus', liste: retoursAttendusListe },
    { id: 'calculs', label: 'Calculs à valider', liste: [] },
    { id: 'paiements', label: 'Paiements proches', liste: [] }
  ];
  const carteActive = CARTES.find(c => c.id === filtreActif);

  const handleAjouter = () => {
    const codeSaisi = nouveauCode.trim();
    if (!codeSaisi) { toast('Entrez un code.'); return; }
    const existant = trouverSuiviLimexExistant(db, codeSaisi);
    if (existant) { setConflit(existant); return; }
    const code = genCode('SVL');
    const suivi = {
      code, codeReference: codeSaisi, etatGlobal: 'Nouveau', coordinateur: userCourant,
      executantPrincipal: responsableInitial || undefined, memoire: [], blocages: [], par: userCourant, ts: Date.now()
    };
    updateDB({ ...db, suivisLimex: [suivi, ...(db.suivisLimex || [])] });
    audit('Suivi LIMEX', 'Création (suivi provisoire)', code, '—', '—', codeSaisi);
    toast(`Suivi LIMEX provisoire ${codeSaisi} créé.`);
    fermerAjout();
    window.location.hash = `#ficheSuiviLimex:${code}`;
  };

  const fermerAjout = () => { setShowAjouter(false); setNouveauCode(''); setResponsableInitial(''); setConflit(null); };

  const handleTraiterAction = (label) => {
    if (!actionTraitee) return;
    const patch = enregistrerActionRapide(actionTraitee, label, noteTraitement);
    updateDB({ ...db, actionsLimex: (db.actionsLimex || []).map(a => a.code === actionTraitee.code ? { ...a, ...patch } : a) });
    audit('Suivi LIMEX', `Action rapide (${label})`, actionTraitee.suiviCode, 'statut', actionTraitee.statut, patch.statut || label);
    toast(`${actionTraitee.libelle} — ${label}.`);
    setActionTraitee(null);
    setNoteTraitement('');
  };

  return (
    <div>
      <Topbar titre={`Bonjour ${(cible.nomComplet || 'Imane').split(' ')[0]} — Programme du ${new Date().toLocaleDateString('fr-FR')}`} />

      <div className="outils">
        <span className="spacer"></span>
        <button className="btn doux gros" style={{ flex: 'none' }} onClick={() => setShowInstruction(true)}>+ Instruction LIMEX</button>
        <button className="btn or gros" style={{ flex: 'none' }} onClick={() => setShowAjouter(true)}>➕ Ajouter un code</button>
      </div>

      <div className="stats">
        {CARTES.map(c => (
          <div key={c.id} onClick={() => setFiltreActif(filtreActif === c.id ? null : c.id)} style={{ cursor: 'pointer' }}>
            <div className={`stat-card-modern ${filtreActif === c.id ? 'alerte-border' : ''}`}>
              <div className="stat-card-top">
                <span className="stat-label">{c.label}</span>
                {c.alerte && c.liste.length > 0 ? <span className="stat-badge alert">Attention</span> : <span className="stat-badge active">Actif</span>}
              </div>
              <div className="stat-card-val-wrap"><span className="stat-val">{c.id === 'calculs' ? calculsAValider : c.id === 'paiements' ? paiementsProches : c.liste.length}</span></div>
              <div className="stat-card-bar"></div>
            </div>
          </div>
        ))}
      </div>

      {carteActive && carteActive.id !== 'calculs' && carteActive.id !== 'paiements' && (
        <div className="panneau">
          <div className="outils">
            <b>{carteActive.label}</b>
            <span className="spacer"></span>
            <button className="btn mini doux" onClick={() => setFiltreActif(null)}>✕ Retirer le filtre</button>
          </div>
          <div className="defile">
            <table>
              <thead><tr><th>Code</th><th>Action</th><th>Responsable</th><th>Échéance</th><th>Priorité</th><th></th></tr></thead>
              <tbody>
                {carteActive.liste.length ? carteActive.liste.map(item => (
                  <tr key={item.code}>
                    <td className="code">{item.codeReference}</td>
                    <td>{item.libelle}</td>
                    <td>{item.responsable}</td>
                    <td>{item.echeance}</td>
                    <td>{pill(item.priorite, item.pill)}</td>
                    <td>
                      <button className="btn mini or" onClick={() => setActionTraitee(item)}>TRAITER</button>{' '}
                      <a className="btn mini doux" href={item.lien}>OUVRIR</a>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6"><div className="vide">Rien dans cette catégorie.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {(filtreActif === 'calculs' || filtreActif === 'paiements') && (
        <div className="vide" style={{ textAlign: 'left' }}>
          <a href={filtreActif === 'calculs' ? '#etudesCalcul' : '#paiementsEcheances'}>Ouvrir {filtreActif === 'calculs' ? 'Études & Calcul' : 'Paiements & Échéances'} →</a>
          <button className="btn mini doux" style={{ marginLeft: '10px' }} onClick={() => setFiltreActif(null)}>✕ Retirer le filtre</button>
        </div>
      )}

      {programme.length > 0 && (
        <div className="bloc-fiche large">
          <h4>UBOS vous recommande de commencer par :</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {programme.slice(0, 4).map((item, i) => (
              <div key={item.code} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--bord)' : 'none' }}>
                {pill(item.priorite, item.pill)}
                <span style={{ flex: 1 }}>CODE {item.codeReference} — {item.libelle} <span style={{ color: 'var(--gris)' }}>({item.responsable})</span></span>
                <button className="btn mini or" onClick={() => setActionTraitee(item)}>TRAITER</button>
                <a className="btn mini doux" href={item.lien}>OUVRIR</a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bloc-fiche large">
        <h4>Alertes</h4>
        {alertes.length ? alertes.map((a, i) => (
          <div key={i} style={{ marginBottom: '10px' }}>
            <b>{a.titre}</b> {pill(a.suivis.length, 'p-rouge')}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              {a.suivis.map(s => <a key={s.code} className="pill p-gris" href={`#ficheSuiviLimex:${s.code}`}>{s.codeReference}</a>)}
            </div>
          </div>
        )) : <div className="vide">Aucune alerte pour l'instant — UBOS surveille.</div>}
      </div>

      {showAjouter && (
        <Modal title="Ajouter un code" onClose={fermerAjout} footer={
          conflit ? (
            <button className="btn doux" onClick={fermerAjout}>Fermer</button>
          ) : (
            <><button className="btn doux" onClick={fermerAjout}>Annuler</button><button className="btn or" onClick={handleAjouter}>Ajouter</button></>
          )
        }>
          {conflit ? (
            <div className="corps">
              <p style={{ gridColumn: '1/-1' }}>Un suivi LIMEX existe déjà pour le code <b>{conflit.codeReference}</b>.</p>
              <div className="champ large"><a className="btn or" href={`#ficheSuiviLimex:${conflit.code}`}>Ouvrir le suivi</a></div>
            </div>
          ) : (
            <div className="corps">
              <div className="champ large"><label>Code</label><input autoFocus value={nouveauCode} onChange={e => setNouveauCode(e.target.value)} placeholder="Ex. 9340" onKeyDown={e => e.key === 'Enter' && handleAjouter()} /></div>
              <div className="champ large"><label>Responsable (optionnel)</label><input value={responsableInitial} onChange={e => setResponsableInitial(e.target.value)} placeholder="Ex. Yasser" /></div>
            </div>
          )}
        </Modal>
      )}

      {showInstruction && <InstructionLimexModal onClose={() => setShowInstruction(false)} />}

      {actionTraitee && (
        <Modal title={`Que s'est-il passé ? — ${actionTraitee.libelle}`} onClose={() => { setActionTraitee(null); setNoteTraitement(''); }} footer={
          <button className="btn doux" onClick={() => { setActionTraitee(null); setNoteTraitement(''); }}>Annuler</button>
        }>
          <div className="corps">
            <div className="champ large" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ACTIONS_RAPIDES.map(a => (
                <button key={a} className="btn doux" onClick={() => handleTraiterAction(a)}>{a.toUpperCase()}</button>
              ))}
            </div>
            <div className="champ large"><label>Note (facultatif)</label><input value={noteTraitement} onChange={e => setNoteTraitement(e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

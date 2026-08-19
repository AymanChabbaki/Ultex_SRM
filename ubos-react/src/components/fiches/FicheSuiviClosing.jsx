import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import DataTable from '../common/DataTable';
import { pill, pillStatut } from '../../utils/format';
import { RESULTATS_CONTACT_CLOSING, MOTIFS_REVOIR_DEVIS_CLOSING, STATUTS_RAPIDES_CLOSING } from '../../data/constants';
import {
  calculerPrioriteSuivi, enregistrerResultatContact, calculerEcheanceRelance,
  OPTIONS_DELAI_RELANCE, construireMessageSuiviClosing, changerStatutRapide, construireTachePourMansouri
} from '../../utils/closingCoordination';

const CHECKLIST_DEVIS = [
  ['valeurMarchandise', 'Valeur marchandise'], ['transport', 'Transport'], ['douane', 'Douane'],
  ['taxes', 'Taxes'], ['fraisUltex', 'Frais ULTEx'], ['marge', 'Marge'], ['positionTarifaire', 'Position tarifaire']
];

export default function FicheSuiviClosing({ codeProp, code: codeFromProp }) {
  const { db, updateDB, audit, notifier, genCode, userCourant } = useDB();
  const { toast } = useToast();
  const code = codeProp || codeFromProp || (window.location.hash.startsWith('#ficheSuiviClosing:') ? window.location.hash.split(':')[1] : '');

  const [panneau, setPanneau] = useState(null);
  const [contactResultat, setContactResultat] = useState(null);
  const [delai, setDelai] = useState('2 jours');
  const [dateChoisie, setDateChoisie] = useState('');
  const [checklist, setChecklist] = useState({});
  const [hsCode, setHsCode] = useState('');
  const [motifRevoir, setMotifRevoir] = useState(MOTIFS_REVOIR_DEVIS_CLOSING[0]);
  const [noteMemoire, setNoteMemoire] = useState('');
  const [relanceDate, setRelanceDate] = useState('');
  const [montantAvance, setMontantAvance] = useState('');

  const suivi = (db?.suivisClosing || []).find(s => s.code === code);

  if (!suivi) {
    return (
      <div>
        <Topbar titre="Suivi Closing" />
        <div className="panneau"><div className="vide"><b>Suivi introuvable</b> {code ? `(${code})` : ''}</div></div>
      </div>
    );
  }

  const historique = (db.audit || []).filter(a => a.objet === code).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const p = calculerPrioriteSuivi(suivi);

  const majSuivi = (patch, action, avant, apres) => {
    updateDB({ ...db, suivisClosing: (db.suivisClosing || []).map(s => s.code === code ? { ...s, ...patch } : s) });
    if (action) audit('Suivi Closing', action, code, '—', avant ?? '—', apres ?? '—');
  };

  const fermer = () => { setPanneau(null); setContactResultat(null); setChecklist({}); setHsCode(''); setNoteMemoire(''); setRelanceDate(''); setMontantAvance(''); };

  const handleEnvoyerAuCalcul = () => {
    const tCode = genCode('T');
    updateDB({
      ...db,
      taches: [{
        code: tCode, ts: Date.now(), par: userCourant, titre: `Calcul demandé par ${userCourant} — Code ${suivi.codeSuivi}`,
        assigne: 'Études & Chiffrage', priorite: 'Normale', type: 'Calcul & Chiffrage', statut: 'À faire', nbReports: 0,
        objetType: 'suivisClosing', objetCode: code, resultatAttendu: 'Devis chiffré', origine: 'Coordination Closing'
      }, ...(db.taches || [])],
      suivisClosing: (db.suivisClosing || []).map(s => s.code === code ? { ...s, statutPipeline: 'Calcul demandé' } : s)
    });
    audit('Suivi Closing', 'Envoyé au calcul', code, 'statutPipeline', suivi.statutPipeline, 'Calcul demandé');
    notifier('Études & Chiffrage', construireMessageSuiviClosing({ ...suivi, statutPipeline: 'Calcul demandé' }, { titre: `Calcul demandé par ${userCourant} — Code ${suivi.codeSuivi}` }), 'Suivi Closing');
    toast('Envoyé au calcul.');
    fermer();
  };

  const handleValiderContact = () => {
    if (!contactResultat) { toast('Choisissez un résultat de contact.'); return; }
    const echeance = calculerEcheanceRelance(delai, dateChoisie || null);
    const patch = enregistrerResultatContact(suivi, contactResultat, echeance);
    majSuivi(patch, 'Contact enregistré', suivi.resultatDernierContact, contactResultat);
    toast(`Contact enregistré. Prochaine relance : ${echeance}.`);
    fermer();
  };

  const handleValiderDevis = () => {
    majSuivi({ statutDevis: 'Validé', hsCodePropose: hsCode, checklistDevis: checklist }, 'Devis validé', suivi.statutDevis, 'Validé');
    notifier(suivi.coordinateur, construireMessageSuiviClosing(suivi, { titre: `Position tarifaire validée — Code ${suivi.codeSuivi}` }), 'Suivi Closing');
    toast('Devis validé.');
    fermer();
  };

  const handleRevoirDevis = () => {
    majSuivi({ statutDevis: 'À revoir', motifRevoir, statutPipeline: 'Calcul demandé' }, 'Devis à revoir', suivi.statutDevis, `À revoir (${motifRevoir})`);
    notifier('Études & Chiffrage', construireMessageSuiviClosing({ ...suivi, statutPipeline: 'Calcul demandé' }, { titre: `Devis à revoir — Code ${suivi.codeSuivi}`, extra: `Motif : ${motifRevoir}` }), 'Suivi Closing');
    toast('Renvoyé à Études & Chiffrage pour correction.');
    fermer();
  };

  const handleDemanderVerification = () => {
    audit('Suivi Closing', 'Vérification demandée', code, 'statutDevis', suivi.statutDevis, suivi.statutDevis);
    notifier('Études & Chiffrage', construireMessageSuiviClosing(suivi, { titre: `Vérification demandée par ${userCourant} — Code ${suivi.codeSuivi}`, extra: noteMemoire || 'Point à clarifier avant validation.' }), 'Suivi Closing');
    toast('Vérification demandée à Études & Chiffrage.');
    fermer();
  };

  const handleConfierMansouri = () => {
    updateDB({
      ...db,
      taches: [construireTachePourMansouri(suivi, genCode, userCourant), ...(db.taches || [])],
      suivisClosing: (db.suivisClosing || []).map(s => s.code === code ? { ...s, responsableActionActuelle: 'Mansouri' } : s)
    });
    audit('Suivi Closing', 'Confié à Mansouri', code, 'responsableActionActuelle', suivi.responsableActionActuelle, 'Mansouri');
    notifier('Mansouri', construireMessageSuiviClosing({ ...suivi, responsableActionActuelle: 'Mansouri' }, { titre: `Code confié par ${userCourant} — Code ${suivi.codeSuivi}` }), 'Suivi Closing');
    toast('Confié à Mansouri.');
    fermer();
  };

  const handleStatutRapide = (statut) => {
    majSuivi(changerStatutRapide(statut), 'Changement de statut', suivi.statutPipeline, statut);
    toast(`Statut : ${statut}.`);
  };

  const handleProgrammerRelance = () => {
    if (!relanceDate) { toast('Choisissez une date.'); return; }
    majSuivi({ echeanceActionSuivante: relanceDate }, 'Relance programmée', suivi.echeanceActionSuivante, relanceDate);
    toast(`Relance programmée le ${relanceDate}.`);
    fermer();
  };

  const handleConfirmation = () => {
    const patch = { statutPipeline: montantAvance ? 'Avance reçue' : 'Confirmation', dateConfirmation: suivi.dateConfirmation || new Date().toISOString().slice(0, 10) };
    if (montantAvance) { patch.montantAvance = montantAvance; patch.dateAvance = new Date().toISOString().slice(0, 10); }
    majSuivi(patch, montantAvance ? 'Avance reçue' : 'Confirmation', suivi.statutPipeline, patch.statutPipeline);
    notifier('Direction', construireMessageSuiviClosing({ ...suivi, ...patch }, { titre: `${montantAvance ? 'Avance reçue' : 'Confirmation'} — Code ${suivi.codeSuivi}` }), 'Suivi Closing');
    toast(montantAvance ? 'Avance enregistrée.' : 'Confirmation enregistrée.');
    fermer();
  };

  const handleAjouterMemoire = () => {
    if (!noteMemoire.trim()) return;
    const memoire = [...(suivi.memoire || []), { texte: noteMemoire.trim(), date: new Date().toISOString().slice(0, 10), auteur: userCourant }];
    majSuivi({ memoire }, 'Note mémoire ajoutée', '—', noteMemoire.trim());
    setNoteMemoire('');
    toast('Note enregistrée.');
  };

  return (
    <div>
      <Topbar titre={`Code ${suivi.codeSuivi}`} />
      <div className="panneau">

        <div className="outils">
          <span className="pill p-or" style={{ fontSize: '14px', padding: '6px 14px' }}>{suivi.codeSuivi}</span>
          {pillStatut(suivi.statutPipeline)}
          {pill(p.tag, p.pill)}
          <span className="spacer"></span>
        </div>

        <div className="bloc-fiche large">
          <div className="kv">
            <div><label>Statut actuel</label><span>{suivi.statutPipeline || 'Nouveau'}</span></div>
            <div><label>Responsable actuel</label><span>{suivi.responsableActionActuelle || suivi.coordinateur}</span></div>
            <div><label>Ancienneté du suivi</label><span>{Math.max(0, Math.floor((Date.now() - (suivi.ts || Date.now())) / 864e5))} jour(s)</span></div>
            <div><label>Dernier contact</label><span>{suivi.dernierContact ? `${suivi.dernierContact}${suivi.dernierContactHeure ? ' – ' + suivi.dernierContactHeure : ''}` : '—'}</span></div>
            <div><label>Prochaine action</label><span>{suivi.actionRecommandee || (suivi.dernierContact ? 'Relancer' : 'Premier contact')}</span></div>
            <div><label>Échéance</label><span>{suivi.echeanceActionSuivante || '—'}</span></div>
          </div>
        </div>

        <div className="bloc-fiche large">
          <h4>Que faire ?</h4>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn or gros" onClick={() => setPanneau('contact')}>📞 Contact client</button>
            <button className="btn or gros" onClick={() => setPanneau('devis')}>💰 Calcul / devis</button>
            <button className="btn or gros" onClick={() => setPanneau('mansouri')}>👤 Mansouri</button>
            <button className="btn or gros" onClick={() => setPanneau('relance')}>⏰ Programmer relance</button>
            <button className="btn or gros" onClick={() => setPanneau('confirmation')}>✅ Confirmation</button>
          </div>
          <div style={{ marginTop: '14px' }}>
            <label style={{ fontSize: '12px', color: 'var(--gris)' }}>Changer le statut en un clic</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              {STATUTS_RAPIDES_CLOSING.map(s => (
                <button key={s} className={`btn mini ${suivi.statutPipeline === s ? 'or' : 'doux'}`} onClick={() => handleStatutRapide(s)}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="bloc-fiche large">
          <h4>Mémoire</h4>
          {(suivi.memoire || []).length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              {suivi.memoire.map((m, i) => <li key={i}><b>{m.date}</b> — {m.texte} <span style={{ color: 'var(--gris)' }}>({m.auteur})</span></li>)}
            </ul>
          ) : <div className="vide">Aucune note pour l'instant.</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input value={noteMemoire} onChange={e => setNoteMemoire(e.target.value)} placeholder="Ex. Client préfère être contacté après 16h" style={{ flex: 1 }} />
            <button className="btn mini" onClick={handleAjouterMemoire}>Ajouter</button>
          </div>
        </div>

        <div className="bloc-fiche large">
          <h4>Historique</h4>
          <DataTable
            columns={[
              { key: 'date', label: 'Date', render: (v, o) => `${v} ${o.heure || ''}` },
              { key: 'utilisateur', label: 'Utilisateur' },
              { key: 'action', label: 'Action' },
              { key: 'apres', label: 'Détail' }
            ]}
            data={historique}
          />
        </div>

        {panneau === 'contact' && (
          <Modal title="Résultat du contact" onClose={fermer} footer={
            <>
              <button className="btn doux" onClick={fermer}>Annuler</button>
              <button className="btn or" onClick={handleValiderContact} disabled={!contactResultat}>Valider</button>
            </>
          }>
            <div className="corps">
              <div className="champ large">
                <label>Résultat</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {RESULTATS_CONTACT_CLOSING.map(r => (
                    <button key={r} className={`btn mini ${contactResultat === r ? 'or' : 'doux'}`} onClick={() => setContactResultat(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="champ large">
                <label>Prochaine action</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {OPTIONS_DELAI_RELANCE.map(d => (
                    <button key={d} className={`btn mini ${delai === d && !dateChoisie ? 'or' : 'doux'}`} onClick={() => { setDelai(d); setDateChoisie(''); }}>{d}</button>
                  ))}
                  <input type="date" value={dateChoisie} onChange={e => setDateChoisie(e.target.value)} />
                </div>
              </div>
            </div>
          </Modal>
        )}

        {panneau === 'devis' && (
          <Modal title="Calcul / devis" onClose={fermer} footer={
            suivi.statutPipeline === 'Nouveau' ? (
              <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn or" onClick={handleEnvoyerAuCalcul}>Envoyer au calcul</button></>
            ) : (
              <>
                <button className="btn doux" onClick={fermer}>Fermer</button>
                <button className="btn doux" onClick={handleDemanderVerification}>🔍 Demander vérification</button>
                <button className="btn rouge" onClick={handleRevoirDevis}>❌ Retourner pour correction</button>
                <button className="btn vert" onClick={handleValiderDevis}>✅ Valider</button>
              </>
            )
          }>
            {suivi.statutPipeline === 'Nouveau' ? (
              <div className="corps"><p style={{ gridColumn: '1/-1' }}>Aucun calcul demandé pour ce code — envoyer au Service Études & Chiffrage ?</p></div>
            ) : (
              <div className="corps">
                <div className="champ large">
                  <label>Checklist</label>
                  <div className="grille-cases">
                    {CHECKLIST_DEVIS.map(([k, l]) => (
                      <label key={k}>
                        <input type="checkbox" checked={!!checklist[k]} onChange={e => setChecklist(prev => ({ ...prev, [k]: e.target.checked }))} />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="champ"><label>HS proposé</label><input value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="Ex. 84371000" /></div>
                <div className="champ"><label>Motif si à revoir</label>
                  <select value={motifRevoir} onChange={e => setMotifRevoir(e.target.value)}>
                    {MOTIFS_REVOIR_DEVIS_CLOSING.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            )}
          </Modal>
        )}

        {panneau === 'mansouri' && (
          <Modal title="Confier à Mansouri" onClose={fermer} footer={
            <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn or" onClick={handleConfierMansouri}>Confier à Mansouri</button></>
          }>
            <div className="corps"><p style={{ gridColumn: '1/-1' }}>Une tâche sera créée pour Mansouri. Vous restez coordinateur — le code réapparaîtra dans votre tableau dès son retour.</p></div>
          </Modal>
        )}

        {panneau === 'relance' && (
          <Modal title="Programmer une relance" onClose={fermer} footer={
            <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn or" onClick={handleProgrammerRelance}>Programmer</button></>
          }>
            <div className="corps"><div className="champ large"><label>Date de relance</label><input type="date" value={relanceDate} onChange={e => setRelanceDate(e.target.value)} /></div></div>
          </Modal>
        )}

        {panneau === 'confirmation' && (
          <Modal title="Confirmation" onClose={fermer} footer={
            <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn or" onClick={handleConfirmation}>Enregistrer</button></>
          }>
            <div className="corps">
              <p style={{ gridColumn: '1/-1' }}>Marquer ce code comme confirmé. Si l'avance a déjà été reçue, indiquez le montant.</p>
              <div className="champ"><label>Montant de l'avance (MAD, optionnel)</label><input type="number" value={montantAvance} onChange={e => setMontantAvance(e.target.value)} /></div>
            </div>
          </Modal>
        )}

      </div>
    </div>
  );
}

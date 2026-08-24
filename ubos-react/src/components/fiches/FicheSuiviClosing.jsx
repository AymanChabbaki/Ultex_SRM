import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import DataTable from '../common/DataTable';
import { pill, pillStatut } from '../../utils/format';
import { MOTIFS_REVOIR_DEVIS_CLOSING, MOTIFS_ARCHIVAGE_CLOSING, STATUTS_PIPELINE_CLOSING, PRIORITES_CLOSING } from '../../data/constants';
import {
  calculerPrioriteSuivi, calculerEcheanceRelance, libelleCode,
  OPTIONS_DELAI_RELANCE, construireMessageSuiviClosing, construireTachePourMansouri, confierAMansouri,
  PROCHAINS_STATUTS, ACTIONS_TRAITER, construirePatchTraiter, trouverClientExistant, genererCodeDossierSuivant,
  fusionnerSuivis
} from '../../utils/closingCoordination';

const CHECKLIST_DEVIS = [
  ['valeurMarchandise', 'Valeur marchandise'], ['transport', 'Transport'], ['douane', 'Douane'],
  ['taxes', 'Taxes'], ['fraisUltex', 'Frais ULTEx'], ['marge', 'Marge'], ['positionTarifaire', 'Position tarifaire']
];

export default function FicheSuiviClosing({ codeProp, code: codeFromProp }) {
  const { db, updateDB, audit, notifier, genCode, userCourant } = useDB();
  const { estDirection } = useAuth();
  const { toast } = useToast();
  const code = codeProp || codeFromProp || (window.location.hash.startsWith('#ficheSuiviClosing:') ? window.location.hash.split(':')[1] : '');

  const [panneau, setPanneau] = useState(null);
  const [actionChoisie, setActionChoisie] = useState(null);
  const [delai, setDelai] = useState('2 jours');
  const [dateChoisie, setDateChoisie] = useState('');
  const [noteTraiter, setNoteTraiter] = useState('');
  const [checklist, setChecklist] = useState({});
  const [hsCode, setHsCode] = useState('');
  const [motifRevoir, setMotifRevoir] = useState(MOTIFS_REVOIR_DEVIS_CLOSING[0]);
  const [noteMemoire, setNoteMemoire] = useState('');
  const [relanceDate, setRelanceDate] = useState('');
  const [montantAvance, setMontantAvance] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [conflitEdit, setConflitEdit] = useState(null);
  const [motifArchivage, setMotifArchivage] = useState(MOTIFS_ARCHIVAGE_CLOSING[0]);
  const [codeFusionCible, setCodeFusionCible] = useState('');

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
  const prochainsStatuts = PROCHAINS_STATUTS[suivi.statutPipeline] || [];

  const majSuivi = (patch, action, avant, apres) => {
    updateDB({ ...db, suivisClosing: (db.suivisClosing || []).map(s => s.code === code ? { ...s, ...patch } : s) });
    if (action) audit('Suivi Closing', action, code, '—', avant ?? '—', apres ?? '—');
  };

  const fermer = () => {
    setPanneau(null); setActionChoisie(null); setChecklist({}); setHsCode(''); setNoteMemoire('');
    setRelanceDate(''); setMontantAvance(''); setEditForm(null); setConflitEdit(null); setCodeFusionCible('');
    setNoteTraiter(''); setDelai('2 jours'); setDateChoisie('');
  };

  const handleEnvoyerAuCalcul = () => {
    const tCode = genCode('T');
    updateDB({
      ...db,
      taches: [{
        code: tCode, ts: Date.now(), par: userCourant, titre: `Calcul demandé par ${userCourant} — Code ${libelleCode(suivi)}`,
        assigne: 'Études & Chiffrage', priorite: 'Normale', type: 'Calcul & Chiffrage', statut: 'À faire', nbReports: 0,
        objetType: 'suivisClosing', objetCode: code, resultatAttendu: 'Devis chiffré', origine: 'Coordination Closing'
      }, ...(db.taches || [])],
      suivisClosing: (db.suivisClosing || []).map(s => s.code === code ? { ...s, statutPipeline: 'Calcul demandé' } : s)
    });
    audit('Suivi Closing', 'Envoyé au calcul', code, 'statutPipeline', suivi.statutPipeline, 'Calcul demandé');
    notifier('Études & Chiffrage', construireMessageSuiviClosing({ ...suivi, statutPipeline: 'Calcul demandé' }, { titre: `Calcul demandé par ${userCourant} — Code ${libelleCode(suivi)}` }), 'Suivi Closing');
    toast('Envoyé au calcul.');
    fermer();
  };

  const handleConfierMansouri = () => {
    updateDB({
      ...db,
      taches: [construireTachePourMansouri(suivi, genCode, userCourant), ...(db.taches || [])],
      suivisClosing: (db.suivisClosing || []).map(s => s.code === code ? { ...s, ...confierAMansouri() } : s)
    });
    audit('Suivi Closing', 'Confié à Mansouri', code, 'responsableActionActuelle', suivi.responsableActionActuelle, 'Mansouri');
    notifier('Mansouri', construireMessageSuiviClosing({ ...suivi, responsableActionActuelle: 'Mansouri' }, { titre: `Code confié par ${userCourant} — Code ${libelleCode(suivi)}` }), 'Suivi Closing');
    toast('Confié à Mansouri.');
    fermer();
  };

  // Flux TRAITER unifié (§17) : les deux actions à effet de bord (calcul,
  // Mansouri) réutilisent directement les gestionnaires existants au lieu
  // d'être dupliquées ; les six autres passent par le patch générique.
  const handleChoisirAction = (actionDef) => {
    if (actionDef.type === 'calcul') { handleEnvoyerAuCalcul(); return; }
    if (actionDef.type === 'mansouri') { handleConfierMansouri(); return; }
    setActionChoisie(actionDef);
  };

  const handleValiderTraiter = () => {
    const echeance = calculerEcheanceRelance(delai, dateChoisie || null);
    const patch = construirePatchTraiter(suivi, actionChoisie, echeance, noteTraiter);
    majSuivi(patch, actionChoisie.label, suivi.statutPipeline, patch.statutPipeline || suivi.statutPipeline);
    toast(`${actionChoisie.label}. Prochaine échéance : ${echeance}.`);
    fermer();
  };

  const handleValiderDevis = () => {
    majSuivi({ statutDevis: 'Validé', statutPipeline: 'Devis validé', hsCodePropose: hsCode, checklistDevis: checklist }, 'Devis validé', suivi.statutDevis, 'Validé');
    notifier(suivi.coordinateur, construireMessageSuiviClosing(suivi, { titre: `Position tarifaire validée — Code ${libelleCode(suivi)}` }), 'Suivi Closing');
    toast('Devis validé.');
    fermer();
  };

  const handleRevoirDevis = () => {
    majSuivi({ statutDevis: 'À revoir', motifRevoir, statutPipeline: 'Devis retourné' }, 'Devis à revoir', suivi.statutDevis, `À revoir (${motifRevoir})`);
    notifier('Études & Chiffrage', construireMessageSuiviClosing({ ...suivi, statutPipeline: 'Devis retourné' }, { titre: `Devis à revoir — Code ${libelleCode(suivi)}`, extra: `Motif : ${motifRevoir}` }), 'Suivi Closing');
    toast('Renvoyé à Études & Chiffrage pour correction.');
    fermer();
  };

  const handleDemanderVerification = () => {
    audit('Suivi Closing', 'Vérification demandée', code, 'statutDevis', suivi.statutDevis, suivi.statutDevis);
    notifier('Études & Chiffrage', construireMessageSuiviClosing(suivi, { titre: `Vérification demandée par ${userCourant} — Code ${libelleCode(suivi)}`, extra: noteMemoire || 'Point à clarifier avant validation.' }), 'Suivi Closing');
    toast('Vérification demandée à Études & Chiffrage.');
    fermer();
  };

  const handleStatutRapide = (statut) => {
    majSuivi({ statutPipeline: statut }, 'Changement de statut', suivi.statutPipeline, statut);
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
    notifier('Direction', construireMessageSuiviClosing({ ...suivi, ...patch }, { titre: `${montantAvance ? 'Avance reçue' : 'Confirmation'} — Code ${libelleCode(suivi)}` }), 'Suivi Closing');
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

  // MODIFIER (§4) — vérification de doublon avant tout enregistrement si le
  // code client change ; jamais d'écriture silencieuse d'un second client.
  const handleOuvrirModifier = () => {
    setEditForm({
      codeClient: suivi.codeClient || suivi.codeSuivi, codeDossier: suivi.codeDossier || suivi.codeSuivi,
      remarque: suivi.remarque || '', statutPipeline: suivi.statutPipeline, priorite: suivi.priorite || 'Normale',
      actionRecommandee: suivi.actionRecommandee || '', echeanceActionSuivante: suivi.echeanceActionSuivante || '',
      responsableActionActuelle: suivi.responsableActionActuelle || ''
    });
    setConflitEdit(null);
    setPanneau('modifier');
  };

  const handleEnregistrerModifier = () => {
    const codeClientChange = editForm.codeClient !== (suivi.codeClient || suivi.codeSuivi);
    if (codeClientChange) {
      const conflit = trouverClientExistant(db, editForm.codeClient, code);
      if (conflit) { setConflitEdit(conflit); return; }
    }
    majSuivi({ ...editForm, codeSuivi: editForm.codeClient }, 'Modification', '—', 'Champs mis à jour');
    toast('Suivi mis à jour.');
    fermer();
  };

  const handleRattacherAuClientExistant = () => {
    const codeDossier = genererCodeDossierSuivant(db, conflitEdit.codeClient);
    majSuivi({ codeClient: conflitEdit.codeClient, codeDossier, codeSuivi: codeDossier, coordinateur: conflitEdit.coordinateur }, 'Rattaché à un client existant', suivi.codeClient, conflitEdit.codeClient);
    toast(`Rattaché au client ${conflitEdit.codeClient} — nouveau dossier ${codeDossier}.`);
    fermer();
  };

  // ARCHIVER / RESTAURER (§5) — jamais de suppression définitive.
  const handleArchiver = () => {
    majSuivi({ archive: true, archiveMotif: motifArchivage, archiveDate: new Date().toISOString().slice(0, 10), archivePar: userCourant }, 'Archivé', suivi.statutPipeline, `Archivé (${motifArchivage})`);
    toast('Suivi archivé.');
    fermer();
  };

  const handleRestaurer = () => {
    majSuivi({ archive: false }, 'Restauré', 'Archivé', 'Actif');
    toast('Suivi restauré.');
  };

  // FUSIONNER (§6) — réassigne les tâches liées, complète la cible sans
  // rien écraser, archive la source avec traçabilité (fusionneDans).
  const handleFusionner = () => {
    const cible = trouverClientExistant(db, codeFusionCible, code);
    if (!cible) { toast('Aucun autre suivi trouvé pour ce code.'); return; }
    const patchCible = fusionnerSuivis(suivi, cible);
    updateDB({
      ...db,
      taches: (db.taches || []).map(t => (t.objetType === 'suivisClosing' && t.objetCode === code) ? { ...t, objetCode: cible.code } : t),
      suivisClosing: (db.suivisClosing || []).map(s => {
        if (s.code === cible.code) return { ...s, ...patchCible };
        if (s.code === code) return { ...s, archive: true, archiveMotif: 'Doublon', archiveDate: new Date().toISOString().slice(0, 10), archivePar: userCourant, fusionneDans: cible.code };
        return s;
      })
    });
    audit('Suivi Closing', 'Fusionné', code, 'fusionneDans', '—', cible.code);
    audit('Suivi Closing', 'Reçu une fusion', cible.code, '—', '—', `Fusionné depuis ${code}`);
    toast(`Fusionné dans ${libelleCode(cible)}.`);
    window.location.hash = `#ficheSuiviClosing:${cible.code}`;
  };

  return (
    <div>
      <Topbar titre={`Code ${libelleCode(suivi)}`} />
      <div className="panneau">

        <div className="outils">
          <span className="pill p-or" style={{ fontSize: '14px', padding: '6px 14px' }}>{libelleCode(suivi)}</span>
          {pillStatut(suivi.statutPipeline)}
          {pill(p.tag, p.pill)}
          {suivi.priorite && suivi.priorite !== 'Normale' && pill(suivi.priorite, ['Critique', 'Urgente'].includes(suivi.priorite) ? 'p-rouge' : 'p-ambre')}
          {suivi.archive && pill('Archivé', 'p-rouge')}
          <span className="spacer"></span>
          <a className="btn doux" href={`#ficheClientClosing:${suivi.codeClient || suivi.codeSuivi}`}>Voir le client</a>
          {!suivi.archive && <button className="btn doux" onClick={handleOuvrirModifier}>Modifier</button>}
          {!suivi.archive && <button className="btn doux" onClick={() => setPanneau('archiver')}>Archiver</button>}
          {!suivi.archive && <button className="btn doux" onClick={() => setPanneau('fusionner')}>Fusionner</button>}
          {suivi.archive && estDirection() && <button className="btn or" onClick={handleRestaurer}>Restaurer</button>}
        </div>

        {suivi.codeDossier && suivi.codeDossier !== suivi.codeClient && (
          <div className="vide" style={{ textAlign: 'left', marginBottom: '10px' }}>
            CLIENT {suivi.codeClient} · DOSSIER {suivi.codeDossier}{suivi.produit ? ` — ${suivi.produit}` : ''}
          </div>
        )}

        {!suivi.echeanceActionSuivante && !suivi.archive && (
          <div className="vide" style={{ textAlign: 'left', marginBottom: '10px', color: 'var(--rouge)' }}>
            🔴 AUCUNE PROCHAINE ACTION — ce dossier actif n'a ni prochaine action ni date de contrôle.
          </div>
        )}

        <div className="bloc-fiche large">
          <div className="kv">
            <div><label>Statut actuel</label><span>{suivi.statutPipeline || 'Nouveau'}</span></div>
            <div><label>Responsable actuel</label><span>{suivi.responsableActionActuelle || suivi.coordinateur}</span></div>
            <div><label>Ancienneté du suivi</label><span>{Math.max(0, Math.floor((Date.now() - (suivi.ts || Date.now())) / 864e5))} jour(s)</span></div>
            <div><label>Dernier contact</label><span>{suivi.dernierContact ? `${suivi.dernierContact}${suivi.dernierContactHeure ? ' – ' + suivi.dernierContactHeure : ''}` : '—'}</span></div>
            <div><label>Prochaine action</label><span>{suivi.actionRecommandee || (suivi.dernierContact ? 'Relancer' : 'Premier contact')}</span></div>
            <div><label>Échéance</label><span>{suivi.echeanceActionSuivante || '—'}</span></div>
            {suivi.dateSourceData && <div><label>Date source / DATA (historique)</label><span>{suivi.dateSourceData}</span></div>}
            <div><label>Créé dans UBOS</label><span>{suivi.ts ? new Date(suivi.ts).toLocaleDateString('fr-FR') : '—'}</span></div>
          </div>
        </div>

        {!suivi.archive && (
          <div className="bloc-fiche large">
            <h4>TRAITER</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn or gros" onClick={() => setPanneau('traiter')}>Que s'est-il passé ?</button>
              <button className="btn doux gros" onClick={() => setPanneau('devis')}>💰 Calcul / devis</button>
              <button className="btn doux gros" onClick={() => setPanneau('mansouri')}>👤 Mansouri</button>
              <button className="btn doux gros" onClick={() => setPanneau('relance')}>⏰ Programmer relance</button>
              <button className="btn doux gros" onClick={() => setPanneau('confirmation')}>✅ Confirmation</button>
            </div>
            {prochainsStatuts.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--gris)' }}>Changer le statut en un clic</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {prochainsStatuts.map(s => (
                    <button key={s} className="btn mini doux" onClick={() => handleStatutRapide(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bloc-fiche large">
          <h4>Mémoire</h4>
          {(suivi.memoire || []).length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              {suivi.memoire.map((m, i) => <li key={i}><b>{m.date}</b> — {m.texte} <span style={{ color: 'var(--gris)' }}>({m.auteur})</span></li>)}
            </ul>
          ) : <div className="vide">Aucune note pour l'instant.</div>}
          {!suivi.archive && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <input value={noteMemoire} onChange={e => setNoteMemoire(e.target.value)} placeholder="Ex. Client préfère être contacté après 16h" style={{ flex: 1 }} />
              <button className="btn mini" onClick={handleAjouterMemoire}>Ajouter</button>
            </div>
          )}
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

        {panneau === 'traiter' && (
          <Modal title="Que s'est-il passé ?" onClose={fermer} footer={
            actionChoisie ? (
              <><button className="btn doux" onClick={() => setActionChoisie(null)}>Retour</button><button className="btn or" onClick={handleValiderTraiter}>Valider</button></>
            ) : (
              <button className="btn doux" onClick={fermer}>Annuler</button>
            )
          }>
            {!actionChoisie ? (
              <div className="corps">
                <div className="champ large" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {ACTIONS_TRAITER.map(a => (
                    <button key={a.label} className="btn doux" onClick={() => handleChoisirAction(a)}>{a.label}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="corps">
                <div className="champ large">
                  <label>Prochaine action</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {OPTIONS_DELAI_RELANCE.map(d => (
                      <button key={d} className={`btn mini ${delai === d && !dateChoisie ? 'or' : 'doux'}`} onClick={() => { setDelai(d); setDateChoisie(''); }}>{d}</button>
                    ))}
                    <input type="date" value={dateChoisie} onChange={e => setDateChoisie(e.target.value)} />
                  </div>
                </div>
                <div className="champ large"><label>Note (facultatif)</label><input value={noteTraiter} onChange={e => setNoteTraiter(e.target.value)} /></div>
              </div>
            )}
          </Modal>
        )}

        {panneau === 'devis' && (
          <Modal title="Calcul / devis" onClose={fermer} footer={
            suivi.statutPipeline === 'Nouveau' || suivi.statutPipeline === 'Calcul à demander' ? (
              <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn or" onClick={handleEnvoyerAuCalcul}>Envoyer au calcul</button></>
            ) : (
              <>
                <button className="btn doux" onClick={fermer}>Fermer</button>
                <button className="btn doux" onClick={handleDemanderVerification}>DEMANDER EXPLICATION</button>
                <button className="btn rouge" onClick={handleRevoirDevis}>RETOURNER POUR CORRECTION</button>
                <button className="btn vert" onClick={handleValiderDevis}>VALIDER</button>
              </>
            )
          }>
            {suivi.statutPipeline === 'Nouveau' || suivi.statutPipeline === 'Calcul à demander' ? (
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

        {panneau === 'modifier' && editForm && (
          <Modal title="Modifier le suivi" onClose={fermer} large footer={
            <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn or" onClick={handleEnregistrerModifier}>Enregistrer</button></>
          }>
            <div className="corps">
              {conflitEdit && (
                <div className="champ large" style={{ background: 'var(--fond-jaune)', padding: '10px', borderRadius: '8px' }}>
                  Le code <b>{conflitEdit.codeClient}</b> existe déjà.
                  <div style={{ marginTop: '8px' }}>
                    <button className="btn mini or" onClick={handleRattacherAuClientExistant}>Rattacher ce suivi au client {conflitEdit.codeClient}</button>
                  </div>
                </div>
              )}
              <div className="champ"><label>Code client</label><input value={editForm.codeClient} onChange={e => setEditForm(prev => ({ ...prev, codeClient: e.target.value }))} /></div>
              <div className="champ"><label>Code dossier</label><input value={editForm.codeDossier} onChange={e => setEditForm(prev => ({ ...prev, codeDossier: e.target.value }))} /></div>
              <div className="champ"><label>Statut</label>
                <select value={editForm.statutPipeline} onChange={e => setEditForm(prev => ({ ...prev, statutPipeline: e.target.value }))}>
                  {STATUTS_PIPELINE_CLOSING.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="champ"><label>Priorité</label>
                <select value={editForm.priorite} onChange={e => setEditForm(prev => ({ ...prev, priorite: e.target.value }))}>
                  {PRIORITES_CLOSING.map(p2 => <option key={p2} value={p2}>{p2}</option>)}
                </select>
              </div>
              <div className="champ"><label>Responsable actuel</label><input value={editForm.responsableActionActuelle} onChange={e => setEditForm(prev => ({ ...prev, responsableActionActuelle: e.target.value }))} /></div>
              <div className="champ"><label>Prochaine échéance</label><input type="date" value={editForm.echeanceActionSuivante} onChange={e => setEditForm(prev => ({ ...prev, echeanceActionSuivante: e.target.value }))} /></div>
              <div className="champ large"><label>Action recommandée</label><input value={editForm.actionRecommandee} onChange={e => setEditForm(prev => ({ ...prev, actionRecommandee: e.target.value }))} /></div>
              <div className="champ large"><label>Remarque</label><textarea value={editForm.remarque} onChange={e => setEditForm(prev => ({ ...prev, remarque: e.target.value }))} /></div>
            </div>
          </Modal>
        )}

        {panneau === 'archiver' && (
          <Modal title="Archiver le suivi" onClose={fermer} footer={
            <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn rouge" onClick={handleArchiver}>Archiver</button></>
          }>
            <div className="corps">
              <p style={{ gridColumn: '1/-1' }}>L'historique et les tâches liées restent conservés. La Direction pourra restaurer ce suivi si besoin.</p>
              <div className="champ large"><label>Motif *</label>
                <select value={motifArchivage} onChange={e => setMotifArchivage(e.target.value)}>
                  {MOTIFS_ARCHIVAGE_CLOSING.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {motifArchivage === 'Doublon' && (
                <p style={{ gridColumn: '1/-1', color: 'var(--gris)' }}>Un doublon ? Préférez « Fusionner » pour ne perdre aucune donnée avant d'archiver.</p>
              )}
            </div>
          </Modal>
        )}

        {panneau === 'fusionner' && (
          <Modal title="Fusionner avec un autre code" onClose={fermer} footer={
            <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn or" onClick={handleFusionner}>Fusionner</button></>
          }>
            <div className="corps">
              <p style={{ gridColumn: '1/-1' }}>Ce suivi ({libelleCode(suivi)}) sera archivé et son historique/tâches réassignés au code cible. Rien n'est perdu.</p>
              <div className="champ large"><label>Code cible (client)</label><input value={codeFusionCible} onChange={e => setCodeFusionCible(e.target.value)} placeholder="Ex. 8477" /></div>
            </div>
          </Modal>
        )}

      </div>
    </div>
  );
}

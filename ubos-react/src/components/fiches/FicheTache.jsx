import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import ModuleForm from '../modules/ModuleForm';
import LigneModal from '../common/LigneModal';
import { MODS } from '../../data/modules';
import { PERS_ET_SERVICES } from '../../data/permissions';
import { pill, pillStatut } from '../../utils/format';
import { OBJETS_LIABLES_TACHE } from '../../data/constants';
import { estTacheOuverte, estAjouteParDirection, calculerAlertesTache, construireMessageTache } from '../../utils/tachesPilotage';

const ETAPE_CHAMPS = [
  { k: 'libelle', l: 'Étape', t: 'text', req: 1, large: 1 },
  { k: 'obligatoire', l: 'Obligatoire', t: 'select', opts: ['Oui', 'Non'] },
  { k: 'statut', l: 'Statut', t: 'select', opts: ['À faire', 'En cours', 'Terminée'] },
  { k: 'responsable', l: 'Responsable', t: 'select', opts: (DB) => PERS_ET_SERVICES(DB) },
  { k: 'date', l: 'Date', t: 'date' },
  { k: 'heureRealisation', l: 'Heure de réalisation', t: 'text' },
  { k: 'commentaire', l: 'Commentaire', t: 'textarea', large: 1 },
  { k: 'preuve', l: 'Preuve', t: 'file' }
];

const lienObjet = (type, code) => {
  if (!type || !code) return null;
  const def = OBJETS_LIABLES_TACHE.find(o => o.v === type);
  if (def?.fiche) return `#${def.fiche}:${code}`;
  return `#${type}`;
};

export default function FicheTache({ codeProp, code: codeFromProp }) {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { peut, estDirection, userCourant } = useAuth();
  const { toast } = useToast();
  const code = codeProp || codeFromProp || (window.location.hash.startsWith('#ficheTache:') ? window.location.hash.split(':')[1] : '');

  const [showEdit, setShowEdit] = useState(false);
  const [etapeEnCours, setEtapeEnCours] = useState(null);
  const [showTerminer, setShowTerminer] = useState(false);
  const [showReporter, setShowReporter] = useState(false);
  const [showReaffecter, setShowReaffecter] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showBlocage, setShowBlocage] = useState(false);

  const tache = (db?.taches || []).find(t => t.code === code);

  if (!tache) {
    return (
      <div>
        <Topbar titre="Fiche Tâche" />
        <div className="panneau"><div className="vide"><b>Tâche introuvable</b> {code ? `(${code})` : ''}</div></div>
      </div>
    );
  }

  const etapes = (db.tacheEtapes || []).filter(e => e.tache === code);
  const historique = (db.audit || []).filter(a => a.objet === code).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const ajouteeParDirection = estAjouteParDirection(db, tache);
  const alertes = calculerAlertesTache(tache, { ajouteParDirection: ajouteeParDirection });
  const ouverte = estTacheOuverte(tache);
  const etapesObligatoiresIncompletes = etapes.filter(e => e.obligatoire === 'Oui' && e.statut !== 'Terminée');
  const objLien = lienObjet(tache.objetType, tache.objetCode);
  const enValidation = tache.statut === 'Terminée — En attente de validation';
  const peutValider = enValidation && (userCourant === tache.validateur || estDirection());

  const mainFields = [
    { k: 'titre', l: 'Titre' },
    { k: 'remarque', l: 'Description' },
    { k: 'type', l: 'Type' },
    { k: 'assigne', l: 'Responsable' },
    { k: 'par', l: 'Créé par' },
    { k: 'datePrevue', l: 'Date prévue' },
    { k: 'heure', l: 'Heure' },
    { k: 'echeance', l: 'Échéance' },
    { k: 'dossier', l: 'Dossier lié', render: (v) => v ? <a href={`#ficheDossier:${v}`}>{v}</a> : '—' },
    { k: 'objetCode', l: 'Lié à', render: () => objLien ? <a href={objLien}>{tache.objetType} · {tache.objetCode}</a> : '—' },
    { k: 'resultatAttendu', l: 'Résultat attendu' },
    { k: 'preuveObligatoire', l: 'Preuve obligatoire' },
    { k: 'validateur', l: 'Validateur' },
    { k: 'recurrence', l: 'Récurrence' },
    { k: 'resultatObtenu', l: 'Résultat obtenu' },
    { k: 'prochaineAction', l: 'Prochaine action' },
    { k: 'motifReport', l: 'Motif du dernier report' },
    { k: 'causeReport', l: 'Cause du blocage' },
    { k: 'responsableBlocage', l: 'Responsable du blocage' },
    { k: 'nbReports', l: 'Nombre de reports' },
    { k: 'assigneOriginal', l: 'Responsable d\'origine (avant réaffectation)' },
    { k: 'blocage', l: 'Motif du blocage' },
    { k: 'luLe', l: 'Prise de connaissance', render: (v) => v ? new Date(v).toLocaleString('fr-FR') : '—' },
    { k: 'priseEnChargeLe', l: 'Prise en charge', render: (v) => v ? new Date(v).toLocaleString('fr-FR') : '—' }
  ];

  const peutAccuserReception = ajouteeParDirection && !tache.luLe && tache.assigne === userCourant;

  const handleAjouterEtape = (data) => {
    const isEdit = !!etapeEnCours?.code;
    if (isEdit) {
      updateDB({ ...db, tacheEtapes: (db.tacheEtapes || []).map(e => e.code === etapeEnCours.code ? { ...e, ...data } : e) });
      audit('Étapes de tâche', 'Modification', etapeEnCours.code, 'libelle', etapeEnCours.libelle, data.libelle, code);
    } else {
      const newCode = genCode('TE');
      updateDB({ ...db, tacheEtapes: [...(db.tacheEtapes || []), { code: newCode, tache: code, ...data, ts: Date.now() }] });
      audit('Étapes de tâche', 'Création', newCode, '—', '—', data.libelle, code);
    }
    setEtapeEnCours(null);
  };

  const handleSupprimerEtape = (etapeCode) => {
    if (!window.confirm(`Supprimer l'étape ${etapeCode} ?`)) return;
    updateDB({ ...db, tacheEtapes: (db.tacheEtapes || []).filter(e => e.code !== etapeCode) });
    audit('Étapes de tâche', 'Suppression', etapeCode, '—', '—', '—', code);
  };

  const handleOuvrirTerminer = () => {
    if (etapesObligatoiresIncompletes.length) {
      toast(`Impossible de terminer : ${etapesObligatoiresIncompletes.length} étape(s) obligatoire(s) non terminée(s) — ${etapesObligatoiresIncompletes.map(e => e.libelle).join(', ')}.`);
      return;
    }
    setShowTerminer(true);
  };

  const handleTerminer = (data) => {
    if (tache.preuveObligatoire === 'Oui' && !data.preuveFichier) {
      toast('La preuve est obligatoire pour terminer cette tâche.');
      return;
    }
    const nouveauStatut = tache.validateur ? 'Terminée — En attente de validation' : 'Terminée';
    const next = { ...tache, ...data, statut: nouveauStatut };
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? next : t) });
    audit('Tâches', 'Terminée', code, 'statut', tache.statut, nouveauStatut, tache.dossier);
    const extra = `Terminée à : ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}\nRésultat : ${data.resultatObtenu}`;
    if (tache.validateur) {
      notifier(tache.validateur, construireMessageTache(next, { titre: `Tâche terminée par ${userCourant}, en attente de votre validation`, extra }), 'Tâches');
    }
    if (tache.par && tache.par !== userCourant && tache.par !== tache.validateur) {
      notifier(tache.par, construireMessageTache(next, { titre: `Tâche terminée par ${userCourant}`, extra }), 'Tâches');
    }
    toast(tache.validateur ? 'Tâche terminée — en attente de validation.' : 'Tâche terminée.');
    setShowTerminer(false);
  };

  const handleReporter = (data) => {
    const nbReports = (tache.nbReports || 0) + 1;
    const next = {
      ...tache, echeance: data.nouveauDelai, statut: 'Reportée', nbReports,
      motifReport: data.motif, causeReport: data.cause, responsableBlocage: data.responsableBlocage
    };
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? next : t) });
    audit('Tâches', 'Report', code, 'echeance', tache.echeance, data.nouveauDelai, tache.dossier);
    if (data.commentaire) audit('Tâches', 'Commentaire de report', code, 'commentaire', '—', data.commentaire, tache.dossier);
    const extra = `Motif : ${data.motif}\nNouveau délai : ${data.nouveauDelai}`;
    if (tache.par && tache.par !== userCourant) {
      notifier(tache.par, construireMessageTache(next, { titre: `Tâche reportée par ${userCourant}`, extra }), 'Tâches');
    }
    if (data.responsableBlocage && data.responsableBlocage !== userCourant) {
      notifier(data.responsableBlocage, construireMessageTache(next, { titre: `Tâche reportée — vous êtes identifié comme responsable du blocage`, extra }), 'Tâches');
    }
    if (nbReports >= 3) {
      notifier('Direction', construireMessageTache(next, { titre: `Tâche reportée ${nbReports} fois — vérification recommandée`, extra }), 'Tâches');
    }
    toast('Tâche reportée.');
    setShowReporter(false);
  };

  const handleSignalerBlocage = (data) => {
    const next = { ...tache, statut: 'Bloquée', blocage: data.blocage };
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? next : t) });
    audit('Tâches', 'Blocage signalé', code, 'statut', tache.statut, 'Bloquée', tache.dossier);
    const extra = `Motif du blocage : ${data.blocage}`;
    if (tache.par && tache.par !== userCourant) notifier(tache.par, construireMessageTache(next, { titre: `Tâche déclarée bloquée par ${userCourant}`, extra }), 'Tâches');
    notifier('Direction', construireMessageTache(next, { titre: `Tâche déclarée bloquée par ${userCourant}`, extra }), 'Tâches');
    toast('Blocage signalé.');
    setShowBlocage(false);
  };

  const handleAccuserReception = () => {
    const luLe = new Date().toISOString();
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? { ...t, luLe } : t) });
    audit('Tâches', 'Prise de connaissance', code, 'luLe', '—', new Date(luLe).toLocaleString('fr-FR'), tache.dossier);
    if (tache.par) notifier(tache.par, `${userCourant} a pris connaissance de la tâche ${code} à ${new Date(luLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} : ${tache.titre}`, 'Tâches');
    toast('Prise de connaissance enregistrée.');
  };

  const handleValider = () => {
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? { ...t, statut: 'Terminée' } : t) });
    audit('Tâches', 'Validation', code, 'statut', tache.statut, 'Terminée', tache.dossier);
    notifier(tache.assigne, `Tâche ${code} validée : ${tache.titre}`, 'Tâches');
    toast('Tâche validée.');
  };

  const handleRejeter = () => {
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? { ...t, statut: 'Annulée' } : t) });
    audit('Tâches', 'Rejet', code, 'statut', tache.statut, 'Annulée', tache.dossier);
    notifier(tache.assigne, `Tâche ${code} rejetée : ${tache.titre}`, 'Tâches');
    toast('Tâche rejetée.');
  };

  const handleDemanderCorrection = (data) => {
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? { ...t, statut: 'À faire' } : t) });
    audit('Tâches', 'Correction demandée', code, 'statut', tache.statut, 'À faire', tache.dossier);
    notifier(tache.assigne, `Correction demandée sur ${code} : ${data.commentaire || tache.titre}`, 'Tâches');
    toast('Correction demandée.');
    setShowCorrection(false);
  };

  const handleReaffecter = (data) => {
    const next = { ...tache, assigneOriginal: tache.assigneOriginal || tache.assigne, assigne: data.assigne };
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? next : t) });
    audit('Tâches', 'Réaffectation', code, 'assigne', tache.assigne, data.assigne, tache.dossier);
    notifier(data.assigne, construireMessageTache(next, { titre: `Tâche réaffectée à vous par ${userCourant}`, extra: `Ancien responsable : ${tache.assigne}` }), 'Tâches');
    toast('Tâche réaffectée.');
    setShowReaffecter(false);
  };

  return (
    <div>
      <Topbar titre={`Tâche : ${tache.titre}`} />
      <div className="panneau">

        <div className="outils">
          <b className="titre-fiche">{code}</b>
          {pillStatut(tache.statut)}
          {pill(tache.priorite || 'Normale', ['Critique', 'Très urgente', 'Urgente'].includes(tache.priorite) ? 'p-rouge' : tache.priorite === 'Haute' ? 'p-ambre' : 'p-gris')}
          <span className="spacer"></span>
          {peut('modifier') && <button className="btn doux" onClick={() => setShowEdit(true)}>Modifier</button>}
          {estDirection() && <button className="btn doux" onClick={() => setShowReaffecter(true)}>Réaffecter</button>}
          {ouverte && !enValidation && tache.statut !== 'Bloquée' && peut('modifier') && <button className="btn doux" onClick={() => setShowBlocage(true)}>Signaler un blocage</button>}
          {ouverte && !enValidation && peut('modifier') && <button className="btn doux" onClick={() => setShowReporter(true)}>Reporter</button>}
          {ouverte && !enValidation && peut('modifier') && <button className="btn or" onClick={handleOuvrirTerminer}>Terminer la tâche</button>}
        </div>

        {peutAccuserReception && (
          <div className="bloc-fiche large" style={{ background: 'var(--fond-jaune)' }}>
            <h4>Tâche ajoutée par la Direction</h4>
            <button className="btn or" onClick={handleAccuserReception}>J'ai pris connaissance de cette tâche</button>
          </div>
        )}

        {peutValider && (
          <div className="bloc-fiche large" style={{ background: 'var(--fond-jaune)' }}>
            <h4>En attente de votre validation</h4>
            <button className="btn vert" onClick={handleValider}>Valider</button>
            <button className="btn doux" style={{ marginLeft: '8px' }} onClick={() => setShowCorrection(true)}>Demander correction</button>
            <button className="btn rouge" style={{ marginLeft: '8px' }} onClick={handleRejeter}>Rejeter</button>
          </div>
        )}

        {alertes.length > 0 && (
          <div className="bloc-fiche large">
            <h4>Alertes</h4>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {alertes.map((a, i) => <span key={i} className="pill p-rouge">{a}</span>)}
            </div>
          </div>
        )}

        {showEdit && <ModuleForm moduleId="taches" MODS={MODS} recordCode={code} onClose={() => setShowEdit(false)} />}

        <div className="bloc-fiche large">
          <h4>Détails</h4>
          <KVDisplay data={tache} fields={mainFields} />
        </div>

        <div className="bloc-fiche large">
          <h4>
            Étapes
            {peut('modifier') && <button className="btn mini" style={{ float: 'right' }} onClick={() => setEtapeEnCours({})}>+ Ajouter une étape</button>}
          </h4>
          <DataTable
            columns={[
              { key: 'libelle', label: 'Étape' },
              { key: 'obligatoire', label: 'Obligatoire', render: (v) => v === 'Oui' ? pill('Oui', 'p-ambre') : 'Non' },
              { key: 'responsable', label: 'Responsable' },
              { key: 'statut', label: 'Statut', render: (v) => pillStatut(v) },
              {
                key: 'actions', label: 'Actions', render: (_v, row) => (
                  <>
                    {peut('modifier') && <button className="btn mini doux" onClick={() => setEtapeEnCours(row)}>Éditer</button>}
                    {peut('supprimer') && <button className="btn mini rouge" onClick={() => handleSupprimerEtape(row.code)}>Suppr.</button>}
                  </>
                )
              }
            ]}
            data={etapes}
          />
        </div>

        <div className="bloc-fiche large">
          <h4>Historique</h4>
          <DataTable
            columns={[
              { key: 'date', label: 'Date', render: (v, o) => `${v} ${o.heure || ''}` },
              { key: 'utilisateur', label: 'Utilisateur' },
              { key: 'action', label: 'Action' },
              { key: 'champ', label: 'Champ' },
              { key: 'avant', label: 'Avant' },
              { key: 'apres', label: 'Après' }
            ]}
            data={historique}
          />
        </div>

        {etapeEnCours && (
          <LigneModal
            title={etapeEnCours.code ? `Modifier l'étape ${etapeEnCours.code}` : 'Ajouter une étape'}
            champs={ETAPE_CHAMPS}
            initialData={etapeEnCours}
            onSave={handleAjouterEtape}
            onClose={() => setEtapeEnCours(null)}
          />
        )}

        {showTerminer && (
          <LigneModal
            title="Terminer la tâche"
            champs={[
              { k: 'resultatObtenu', l: 'Résultat obtenu', t: 'text', req: 1, large: 1 },
              { k: 'preuveFichier', l: `Preuve${tache.preuveObligatoire === 'Oui' ? ' (obligatoire)' : ''}`, t: 'file' },
              { k: 'prochaineAction', l: 'Prochaine action', t: 'text', large: 1 }
            ]}
            initialData={{}}
            onSave={handleTerminer}
            onClose={() => setShowTerminer(false)}
          />
        )}

        {showReporter && (
          <LigneModal
            title="Reporter la tâche"
            champs={[
              { k: 'nouveauDelai', l: 'Nouveau délai', t: 'date', req: 1 },
              { k: 'motif', l: 'Motif', t: 'text', req: 1, large: 1 },
              { k: 'cause', l: 'Cause', t: 'text', req: 1, large: 1 },
              { k: 'responsableBlocage', l: 'Responsable du blocage', t: 'select', opts: PERS_ET_SERVICES(db), req: 1 },
              { k: 'commentaire', l: 'Commentaire', t: 'textarea', large: 1 }
            ]}
            initialData={{}}
            onSave={handleReporter}
            onClose={() => setShowReporter(false)}
          />
        )}

        {showBlocage && (
          <LigneModal
            title="Signaler un blocage"
            champs={[{ k: 'blocage', l: 'Motif du blocage', t: 'textarea', req: 1, large: 1 }]}
            initialData={{}}
            onSave={handleSignalerBlocage}
            onClose={() => setShowBlocage(false)}
          />
        )}

        {showCorrection && (
          <LigneModal
            title="Demander une correction"
            champs={[{ k: 'commentaire', l: 'Ce qui doit être corrigé', t: 'textarea', req: 1, large: 1 }]}
            initialData={{}}
            onSave={handleDemanderCorrection}
            onClose={() => setShowCorrection(false)}
          />
        )}

        {showReaffecter && (
          <LigneModal
            title="Réaffecter la tâche"
            champs={[{ k: 'assigne', l: 'Nouveau responsable', t: 'select', opts: PERS_ET_SERVICES(db), req: 1 }]}
            initialData={{}}
            onSave={handleReaffecter}
            onClose={() => setShowReaffecter(false)}
          />
        )}

      </div>
    </div>
  );
}

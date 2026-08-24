import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import LigneModal from '../common/LigneModal';
import DataTable from '../common/DataTable';
import { pill, pillStatut } from '../../utils/format';
import { PERS_ET_SERVICES } from '../../data/permissions';
import { PRIORITES_LIMEX } from '../../data/constants';
import {
  actionsDuSuivi, calculerEtatGlobal, pillEtatGlobal, calculerPrioriteAction, estActionOuverte,
  construireTacheExecutant, construireMessageSuiviLimex, enregistrerActionRapide
} from '../../utils/limexCoordination';

const CHAMPS_ACTION = [
  { k: 'libelle', l: 'Que faut-il faire ?', t: 'text', req: 1, large: 1 },
  { k: 'responsable', l: 'Responsable', t: 'select', opts: (DB) => PERS_ET_SERVICES(DB), req: 1 },
  { k: 'echeance', l: 'Échéance', t: 'date' },
  { k: 'priorite', l: 'Priorité', t: 'select', opts: PRIORITES_LIMEX }
];

const ACTIONS_RAPIDES = ['Fait', 'Relancé', 'Réponse reçue', 'En cours', 'Attente fournisseur', 'Attente collègue', 'Bloqué'];

export default function FicheSuiviLimex({ codeProp, code: codeFromProp }) {
  const { db, updateDB, audit, notifier, genCode, userCourant } = useDB();
  const { toast } = useToast();
  const code = codeProp || codeFromProp || (window.location.hash.startsWith('#ficheSuiviLimex:') ? window.location.hash.split(':')[1] : '');

  const [actionEnCours, setActionEnCours] = useState(null);
  const [actionTraitee, setActionTraitee] = useState(null);
  const [noteTraitement, setNoteTraitement] = useState('');
  const [showBlocage, setShowBlocage] = useState(false);
  const [motifBlocage, setMotifBlocage] = useState('');
  const [conditions, setConditions] = useState(['']);
  const [noteMemoire, setNoteMemoire] = useState('');

  const suivi = (db?.suivisLimex || []).find(s => s.code === code);

  if (!suivi) {
    return (
      <div>
        <Topbar titre="Suivi LIMEX" />
        <div className="panneau"><div className="vide"><b>Suivi introuvable</b> {code ? `(${code})` : ''}</div></div>
      </div>
    );
  }

  const actions = actionsDuSuivi(db, code);
  const etat = calculerEtatGlobal(actions);
  const historique = (db.audit || []).filter(a => a.objet === code).sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const majSuivi = (patch, action, avant, apres) => {
    updateDB({ ...db, suivisLimex: (db.suivisLimex || []).map(s => s.code === code ? { ...s, ...patch } : s) });
    if (action) audit('Suivi LIMEX', action, code, '—', avant ?? '—', apres ?? '—');
  };

  const handleAjouterAction = (data) => {
    if (actionEnCours?.code) {
      updateDB({ ...db, actionsLimex: (db.actionsLimex || []).map(a => a.code === actionEnCours.code ? { ...a, ...data } : a) });
      audit('Suivi LIMEX', 'Action modifiée', code, 'libelle', actionEnCours.libelle, data.libelle);
    } else {
      const nouvelleAction = { code: genCode('ACL'), suivi: code, statut: 'À faire', ts: Date.now(), par: userCourant, ...data };
      const tache = construireTacheExecutant(nouvelleAction, suivi, genCode, userCourant);
      updateDB({
        ...db,
        actionsLimex: [nouvelleAction, ...(db.actionsLimex || [])],
        taches: [tache, ...(db.taches || [])]
      });
      audit('Suivi LIMEX', 'Action ajoutée', code, '—', '—', data.libelle);
      notifier(data.responsable, `Nouvelle action LIMEX — Code ${suivi.codeReference}\n${data.libelle}\nLien : #ficheSuiviLimex:${code}`, 'Suivi LIMEX');
    }
    setActionEnCours(null);
  };

  const handleSupprimerAction = (actionCode) => {
    if (!window.confirm(`Supprimer cette action ?`)) return;
    updateDB({ ...db, actionsLimex: (db.actionsLimex || []).filter(a => a.code !== actionCode) });
    audit('Suivi LIMEX', 'Action supprimée', code, '—', actionCode, '—');
  };

  const handleTraiterAction = (label) => {
    if (!actionTraitee) return;
    const patch = enregistrerActionRapide(actionTraitee, label, noteTraitement);
    updateDB({ ...db, actionsLimex: (db.actionsLimex || []).map(a => a.code === actionTraitee.code ? { ...a, ...patch } : a) });
    audit('Suivi LIMEX', `Action rapide (${label})`, code, 'statut', actionTraitee.statut, patch.statut || label);
    toast(`${actionTraitee.libelle} — ${label}.`);
    setActionTraitee(null);
    setNoteTraitement('');
  };

  const handleAjouterBlocage = () => {
    if (!motifBlocage.trim()) { toast('Indiquez le motif du blocage.'); return; }
    const blocage = {
      motif: motifBlocage.trim(), actif: true, dateCreation: new Date().toISOString().slice(0, 10),
      conditions: conditions.filter(c => c.trim()).map(c => ({ texte: c.trim(), valide: false }))
    };
    majSuivi({ blocages: [...(suivi.blocages || []), blocage] }, 'Blocage créé', '—', motifBlocage);
    notifier('Direction', construireMessageSuiviLimex(suivi, { titre: `Blocage — Code ${suivi.codeReference}`, extra: motifBlocage }), 'Suivi LIMEX');
    setShowBlocage(false); setMotifBlocage(''); setConditions(['']);
    toast('Blocage enregistré.');
  };

  const toggleCondition = (blocageIdx, condIdx) => {
    const blocages = (suivi.blocages || []).map((b, bi) => {
      if (bi !== blocageIdx) return b;
      const nextConditions = b.conditions.map((c, ci) => ci === condIdx ? { ...c, valide: !c.valide } : c);
      const toutesValides = nextConditions.every(c => c.valide);
      return { ...b, conditions: nextConditions, actif: !toutesValides };
    });
    majSuivi({ blocages }, 'Condition de blocage modifiée', '—', '—');
  };

  const handleAjouterMemoire = () => {
    if (!noteMemoire.trim()) return;
    majSuivi({ memoire: [...(suivi.memoire || []), { texte: noteMemoire.trim(), date: new Date().toISOString().slice(0, 10), auteur: userCourant }] }, 'Note mémoire ajoutée', '—', noteMemoire.trim());
    setNoteMemoire('');
    toast('Note enregistrée.');
  };

  return (
    <div>
      <Topbar titre={`Code ${suivi.codeReference}`} />
      <div className="panneau">

        <div className="outils">
          <span className="pill p-or" style={{ fontSize: '14px', padding: '6px 14px' }}>{suivi.codeReference}</span>
          {pill(etat, pillEtatGlobal(etat))}
          <span className="spacer"></span>
          <button className="btn doux" onClick={() => setShowBlocage(true)}>⛔ Signaler un blocage</button>
        </div>

        <div className="bloc-fiche large">
          <div className="kv">
            <div><label>État global</label><span>{etat}</span></div>
            <div><label>Coordination</label><span>{suivi.coordinateur}</span></div>
            <div><label>Exécutant principal</label><span>{suivi.executantPrincipal || '—'}</span></div>
            <div><label>Dernière actualité</label><span>{suivi.derniereActualite || '—'}</span></div>
            <div><label>Prochaine vérification</label><span>{suivi.prochaineVerification || '—'}</span></div>
            <div><label>Attente</label><span>{suivi.attenteType ? `${suivi.attenteType}${suivi.attenteDetail ? ' — ' + suivi.attenteDetail : ''}` : '—'}</span></div>
          </div>
        </div>

        {(suivi.blocages || []).filter(b => b.actif).length > 0 && (
          <div className="bloc-fiche large" style={{ background: 'var(--fond-jaune)' }}>
            <h4>⛔ Blocage(s) actif(s)</h4>
            {suivi.blocages.map((b, bi) => b.actif && (
              <div key={bi} style={{ marginBottom: '10px' }}>
                <b>{b.motif}</b> <span style={{ color: 'var(--gris)' }}>({b.dateCreation})</span>
                {(b.conditions || []).map((c, ci) => (
                  <label key={ci} style={{ display: 'block', marginTop: '4px' }}>
                    <input type="checkbox" checked={c.valide} onChange={() => toggleCondition(bi, ci)} /> {c.texte}
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="bloc-fiche large">
          <h4>
            Actions du dossier
            <button className="btn mini" style={{ float: 'right' }} onClick={() => setActionEnCours({})}>+ Ajouter une action</button>
          </h4>
          <DataTable
            columns={[
              { key: 'libelle', label: 'Point' },
              { key: 'responsable', label: 'Responsable' },
              { key: 'statut', label: 'Statut', render: v => pillStatut(v) },
              { key: 'echeance', label: 'Échéance', render: (v, o) => { const p = calculerPrioriteAction(o); return v ? `${v} ${p.tag === 'Retard' ? pill('Retard', 'p-rouge') : ''}` : '—'; } },
              {
                key: 'actions', label: '', render: (_v, row) => estActionOuverte(row) ? (
                  <>
                    <button className="btn mini or" onClick={() => setActionTraitee(row)}>Traiter</button>{' '}
                    <button className="btn mini doux" onClick={() => setActionEnCours(row)}>Éditer</button>{' '}
                    <button className="btn mini rouge" onClick={() => handleSupprimerAction(row.code)}>Suppr.</button>
                  </>
                ) : <span style={{ color: 'var(--gris)' }}>{row.resultat || '—'}</span>
              }
            ]}
            data={actions}
          />
        </div>

        <div className="bloc-fiche large">
          <h4>Mémoire</h4>
          {(suivi.memoire || []).length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              {suivi.memoire.map((m, i) => <li key={i}><b>{m.date}</b> — {m.texte} <span style={{ color: 'var(--gris)' }}>({m.auteur})</span></li>)}
            </ul>
          ) : <div className="vide">Aucune note pour l'instant.</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input value={noteMemoire} onChange={e => setNoteMemoire(e.target.value)} placeholder="Note libre" style={{ flex: 1 }} />
            <button className="btn mini" onClick={handleAjouterMemoire}>Ajouter</button>
          </div>
        </div>

        <div className="bloc-fiche large">
          <h4>Timeline</h4>
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

        {actionEnCours && (
          <LigneModal
            title={actionEnCours.code ? 'Modifier l\'action' : '+ Ajouter une action'}
            champs={CHAMPS_ACTION}
            initialData={actionEnCours}
            onSave={handleAjouterAction}
            onClose={() => setActionEnCours(null)}
          />
        )}

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

        {showBlocage && (
          <Modal title="Signaler un point bloquant" onClose={() => setShowBlocage(false)} footer={
            <><button className="btn doux" onClick={() => setShowBlocage(false)}>Annuler</button><button className="btn rouge" onClick={handleAjouterBlocage}>Bloquer</button></>
          }>
            <div className="corps">
              <div className="champ large"><label>Motif</label><input value={motifBlocage} onChange={e => setMotifBlocage(e.target.value)} placeholder="Ex. Ne pas passer engagement" /></div>
              <div className="champ large">
                <label>Conditions pour lever le blocage</label>
                {conditions.map((c, i) => (
                  <input key={i} value={c} onChange={e => setConditions(prev => prev.map((x, xi) => xi === i ? e.target.value : x))} placeholder="Ex. baisse prix validée" style={{ marginBottom: '6px', display: 'block', width: '100%' }} />
                ))}
                <button className="btn mini doux" onClick={() => setConditions(prev => [...prev, ''])}>+ Ajouter une condition</button>
              </div>
            </div>
          </Modal>
        )}

      </div>
    </div>
  );
}

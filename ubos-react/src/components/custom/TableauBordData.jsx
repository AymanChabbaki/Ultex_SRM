import React, { useMemo, useState } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import DataTable from '../common/DataTable';
import { pill } from '../../utils/format';
import {
  genererFileDeTravail, genererAlertesData, calculerObjectifActif, calculerProgressionJour,
  calculerSourcingsObtenus, genererResumeJournalier, clientsDeAgent, calculerPrioriteClient
} from '../../utils/dataPipeline';
import { PIPELINE_ETAPES_CLIENT } from '../../data/constants';

const TAG_PILL_CLASS = { Urgent: 'p-rouge', 'Très chaud': 'p-or', Chaud: 'p-ambre', Normal: 'p-gris', Froid: 'p-bleu', Dormant: 'p-gris', VIP: 'p-vert' };

export default function TableauBordData({ user, isAdminView }) {
  const { db } = useDB();
  const [resume, setResume] = useState(null);

  const file = useMemo(() => genererFileDeTravail(db, user), [db, user]);
  const alertes = useMemo(() => genererAlertesData(db, user), [db, user]);
  const objectif = useMemo(() => calculerObjectifActif(db, user), [db, user]);
  const progression = useMemo(() => calculerProgressionJour(db, user), [db, user]);
  const sourcings = useMemo(() => calculerSourcingsObtenus(db, user), [db, user]);
  const clientsAgent = useMemo(() => clientsDeAgent(db, user), [db, user]);

  const parEtape = useMemo(() => {
    const map = Object.fromEntries(PIPELINE_ETAPES_CLIENT.map(e => [e, []]));
    clientsAgent.forEach(c => { if (map[c.etapePipeline]) map[c.etapePipeline].push(c); });
    return map;
  }, [clientsAgent]);

  const barre = (val, obj, label) => {
    const pct = obj ? Math.min(100, Math.round((val / obj) * 100)) : 0;
    const cls = pct >= 100 ? '' : pct >= 50 ? 'attention' : 'alerte';
    return (
      <div style={{ marginBottom: '14px' }} key={label}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
          <span>{label}</span><b>{val} / {obj || '—'}</b>
        </div>
        <div className={`barre-progression ${cls}`}><div style={{ width: `${pct}%` }}></div></div>
      </div>
    );
  };

  return (
    <div>
      <Topbar titre={isAdminView ? `Tableau de bord Data — ${user.nomComplet}` : 'Mon tableau de bord Data'} />

      {isAdminView && (
        <div className="outils mb-lg">
          <button className="btn mini doux" onClick={() => window.location.hash = 'performance'}>← Retour à l'équipe</button>
        </div>
      )}

      {objectif.parDefaut && (
        <div className="vide" style={{ textAlign: 'left', marginBottom: '14px' }}>{objectif.label}</div>
      )}

      <div className="panneau mb-lg" style={{ padding: '18px 22px' }}>
        <h4 style={{ marginTop: 0 }}>Objectifs du jour {!objectif.parDefaut ? `— ${objectif.label}` : ''}</h4>
        {barre(progression.demandesCreees, objectif.demandesParJour, "Demandes créées aujourd'hui")}
        {barre(progression.clientsContactes, objectif.clientsContactesParJour, 'Clients contactés')}
        {barre(progression.relancesEffectuees, objectif.relancesParJour, 'Relances effectuées')}
        {barre(progression.nouveauxClients, objectif.nouveauxClientsParJour, 'Nouveaux clients créés')}
        <div style={{ fontSize: '13px', color: 'var(--gris)', marginTop: '6px' }}>Sourcings obtenus (cumulé) : <b>{sourcings}</b></div>
      </div>

      <div className="outils">
        <button className="btn or" onClick={() => setResume(genererResumeJournalier(user, file, alertes, progression, objectif))}>Organiser ma journée</button>
      </div>
      {resume && (
        <div className="panneau mb-lg" style={{ padding: '16px 20px', whiteSpace: 'pre-wrap', fontSize: '14px', marginTop: '10px' }}>
          {resume}
        </div>
      )}

      <h3 className="titre-sec mt-lg">Mon travail aujourd'hui</h3>
      <div className="panneau liste-notif mb-lg">
        {file.length ? file.map(item => (
          <div key={item.type + item.code} className="notif nonlu">
            <div className="pt-n" style={{ background: item.retard ? 'var(--rouge)' : 'var(--or)' }}></div>
            <div className="spacer">
              <div><a href={item.lien}><b>{item.libelle}</b></a></div>
              <div className="qui">{item.sousLibelle}</div>
            </div>
            {pill(item.tag, TAG_PILL_CLASS[item.tag] || 'p-gris')}
          </div>
        )) : (
          <div className="vide"><b>Rien d'urgent</b>Aucune relance ou tâche prioritaire pour le moment.</div>
        )}
      </div>

      <h3 className="titre-sec mt-lg">Alertes</h3>
      <div className="panneau mb-lg" style={{ padding: '14px 18px' }}>
        {alertes.length ? alertes.map((a, i) => (
          <div key={i} style={{ marginBottom: '10px' }}>
            <b style={{ color: 'var(--rouge)' }}>{a.titre}</b> ({(a.clients || a.lignes || []).length})
            <div style={{ fontSize: '13px', marginTop: '4px' }}>
              {(a.clients || []).slice(0, 6).map(c => <a key={c.code} href={`#ficheClient:${c.code}`} style={{ marginRight: '10px' }}>{c.nom}</a>)}
              {(a.lignes || []).slice(0, 6).map(l => <a key={l.code} href={`#ficheDemandeLigne:${l.code}`} style={{ marginRight: '10px' }}>{l.code}</a>)}
            </div>
          </div>
        )) : <div className="vide"><b>Rien à signaler</b>Aucune alerte pour le moment.</div>}
      </div>

      <h3 className="titre-sec mt-lg">Pipeline</h3>
      <div className="panneau mb-lg">
        <div className="defile">
          <table>
            <thead><tr>{PIPELINE_ETAPES_CLIENT.map(e => <th key={e}>{e}</th>)}</tr></thead>
            <tbody><tr>{PIPELINE_ETAPES_CLIENT.map(e => <td key={e} style={{ textAlign: 'center', fontWeight: 700 }}>{parEtape[e]?.length || 0}</td>)}</tr></tbody>
          </table>
        </div>
      </div>

      <h3 className="titre-sec mt-lg">Mes clients ({clientsAgent.length})</h3>
      <DataTable
        columns={[
          { key: 'code', label: 'Code', render: (v) => <a href={`#ficheClient:${v}`}>{v}</a> },
          { key: 'nom', label: 'Nom' },
          { key: 'etapePipeline', label: 'Étape', render: (v) => v ? pill(v, 'p-gris') : '—' },
          { key: 'dernierContact', label: 'Dernier contact', render: (v) => v || '—' },
          { key: 'echeanceActionSuivante', label: 'Prochaine relance', render: (v) => v || '—' },
          { key: 'priorite', label: 'Priorité', render: (_, o) => { const p = calculerPrioriteClient(o); return pill(p.tag, TAG_PILL_CLASS[p.tag] || 'p-gris'); } }
        ]}
        data={clientsAgent}
      />
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import DataTable from '../common/DataTable';
import BarreProgression from '../common/BarreProgression';
import StatCard from '../common/StatCard';
import { pill } from '../../utils/format';
import {
  genererFileDeTravail, genererAlertesData, calculerObjectifActif, calculerProgressionJour,
  calculerSourcingsObtenus, genererResumeJournalier, calculerPrioriteClient,
  leadsDuJour, codesSansSuiviDepuis, clientsActifsData
} from '../../utils/dataPipeline';
import { localDay, deadlineDue } from '../../utils/dataFollowup';

const TAG_PILL_CLASS = { Urgent: 'p-rouge', "Aujourd'hui": 'p-or', Nouveau: 'p-vert', 'Très chaud': 'p-or', Chaud: 'p-ambre', Normal: 'p-gris', Froid: 'p-bleu', Dormant: 'p-gris', VIP: 'p-vert' };

export default function TableauBordData({ user, isAdminView }) {
  const { db } = useDB();
  const [resume, setResume] = useState(null);
  const [dateObjectif, setDateObjectif] = useState(localDay());
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const file = useMemo(() => genererFileDeTravail(db, user), [db, user, clock]);
  const alertes = useMemo(() => genererAlertesData(db, user), [db, user, clock]);
  const objectif = useMemo(() => calculerObjectifActif(db, user, new Date(dateObjectif + 'T12:00')), [db, user, dateObjectif]);
  const progression = useMemo(() => calculerProgressionJour(db, user, new Date(dateObjectif + 'T12:00')), [db, user, dateObjectif]);
  const sourcings = useMemo(() => calculerSourcingsObtenus(db, user), [db, user]);
  const clientsAgent = useMemo(() => clientsActifsData(db, user), [db, user]);
  const nouveauxLeads = useMemo(() => leadsDuJour(db, user), [db, user]);
  const sansSuiviUnMois = useMemo(() => codesSansSuiviDepuis(db, user, 7), [db, user]);
  const echeancesCodes = useMemo(() => {
    const jour = new Date().toISOString().slice(0, 10);
    return clientsAgent.filter(c => deadlineDue(c.echeanceCode));
  }, [clientsAgent, clock]);


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

      <div className="stats">
        <StatCard val={nouveauxLeads.length} label="Leads reçus aujourd'hui" />
        <StatCard val={file.length} label="Actions Data à traiter" alerte={file.some(item => item.retard)} />
        <StatCard val={echeancesCodes.length} label="Échéances code arrivées" alerte={echeancesCodes.length > 0} />
        <StatCard val={sansSuiviUnMois.length} label="Sans changement d’état depuis 1 semaine" alerte={sansSuiviUnMois.length > 0} />
      </div>

      <h3 className="titre-sec mt-lg">Leads reçus aujourd'hui</h3>
      <div className="panneau mb-lg">
        <DataTable
          columns={[
            { key: 'codeClientUltex', label: 'Code client', render: (v, o) => <a href={`#ficheClient:${o.client}`}>{v || o.client || '—'}</a> },
            { key: 'objectifGeneral', label: 'Besoin / produit' },
            { key: 'dateHeureReception', label: 'Reçu le', render: (v, o) => v || o.dateDemande || '—' },
            { key: 'sourceSynchronisation', label: 'Source', render: (v, o) => pill(v || o.source || '—', 'p-gris') },
            { key: 'dataTag', label: 'Data Tag', render: (v, o) => v ? pill((o.etatVersion ? 'V' + o.etatVersion + ' · ' : '') + v, 'p-bleu') : '—' },
            { key: 'statut', label: 'État', render: (v) => pill(v || 'Nouvelle', 'p-gris') },
          ]}
          data={nouveauxLeads}
        />
      </div>

      <div className="panneau mb-lg" style={{ padding: '18px 22px' }}>
        <label>Date des objectifs <input type="date" value={dateObjectif} onChange={e => e.target.value && setDateObjectif(e.target.value)} /></label>
        <h4 style={{ marginTop: 0 }}>Objectifs du {dateObjectif} {!objectif.parDefaut ? `— ${objectif.label}` : ''}</h4>
        <BarreProgression val={progression.demandesCreees} obj={objectif.demandesParJour} label="Demandes créées à la date sélectionnée" />
        <BarreProgression val={progression.clientsContactes} obj={objectif.clientsContactesParJour} label="Clients contactés" />
        <BarreProgression val={progression.relancesEffectuees} obj={objectif.relancesParJour} label="Relances effectuées" />
        <BarreProgression val={progression.nouveauxClients} obj={objectif.nouveauxClientsParJour} label="Nouveaux clients créés" />
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
          <div key={`${item.type}-${item.code}-${item.motif || ''}`} className="notif nonlu">
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

      <h3 className="titre-sec mt-lg">Mes clients actifs depuis le 18/09/2026 ({clientsAgent.length})</h3>
      <DataTable
        columns={[
          { key: 'code', label: 'Code', render: (v) => <a href={`#ficheClient:${v}`}>{v}</a> },
          { key: 'nom', label: 'Nom' },
          { key: 'etapePipeline', label: 'Étape', render: (v) => v ? pill(v, 'p-gris') : '—' },
          { key: 'dataTag', label: 'Data Tag', render: (v) => v ? pill(v, 'p-bleu') : '—' },
          { key: 'dernierContact', label: 'Dernier contact', render: (v) => v || '—' },
          { key: 'echeanceCode', label: 'Échéance code', render: (v) => v || '—' },
          { key: 'echeanceActionSuivante', label: 'Prochaine relance', render: (v) => v || '—' },
          { key: 'priorite', label: 'Priorité', render: (_, o) => { const p = calculerPrioriteClient(o); return pill(p.tag, TAG_PILL_CLASS[p.tag] || 'p-gris'); } }
        ]}
        data={clientsAgent}
      />
      <div className="panneau" style={{padding:'12px 16px', marginTop:'10px', fontSize:'13px'}}>
        <b>Priorités :</b> Très chaud = jamais contacté · Chaud = contact dans les 3 derniers jours · Normal = 4 à 15 jours · Froid = 16 à 30 jours · Dormant = plus de 30 jours · Urgent = échéance dépassée ou urgence déclarée.
      </div>
    </div>
  );
}

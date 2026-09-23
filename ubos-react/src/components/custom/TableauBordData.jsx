import React, { useEffect, useMemo, useState } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { useToast } from '../../context/ToastContext';
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
import { localDay, deadlineDue, formatGMTDateTime } from '../../utils/dataFollowup';
import { supprimerDemandeTestGoogleSheets } from '../../services/security';
import { fetchDataDashboard, subscribeDataDashboard } from '../../services/api';

const TAG_PILL_CLASS = { Urgent: 'p-rouge', "Aujourd'hui": 'p-or', Nouveau: 'p-vert', 'Très chaud': 'p-or', Chaud: 'p-ambre', Normal: 'p-gris', Froid: 'p-bleu', Dormant: 'p-gris', VIP: 'p-vert' };
const EMPTY_DASHBOARD_DB = { clients: [], demandes: [], demandeLignes: [], taches: [], objectifsData: [], audit: [] };

function leadDejaTraite(demande) {
  const statut = String(demande.statut || '').trim();
  return Boolean(
    demande.dataTag || demande.actionSuivante || demande.dernierContact || demande.dernierSuiviData
    || (statut && !['Nouvelle', 'Nouveau', 'À traiter', 'Brouillon'].includes(statut))
  );
}

export default function TableauBordData({ user, isAdminView }) {
  const { demanderElevation } = useSecurity();
  const { toast } = useToast();
  const [resume, setResume] = useState(null);
  const [dateObjectif, setDateObjectif] = useState(localDay());
  const [dashboard, setDashboard] = useState({ db: EMPTY_DASHBOARD_DB, metrics: { sourcings: 0 } });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const db = dashboard.db || EMPTY_DASHBOARD_DB;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    fetchDataDashboard(dateObjectif, user?.identifiant || user?.nomComplet || '', refreshKey > 0)
      .then(result => { if (active) setDashboard(result); })
      .catch(error => { if (active) setLoadError(error?.message || 'Chargement impossible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dateObjectif, user?.identifiant, user?.nomComplet, refreshKey]);

  useEffect(() => {
    let stopped = false;
    let controller = null;
    let retryTimer = null;
    let refreshTimer = null;

    const connect = async () => {
      controller = new AbortController();
      try {
        await subscribeDataDashboard(() => {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            if (!stopped) setRefreshKey(value => value + 1);
          }, 300);
        }, { signal: controller.signal });
      } catch (error) {
        if (stopped || error?.name === 'AbortError') return;
      }
      if (!stopped) retryTimer = setTimeout(connect, 3000);
    };

    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(retryTimer);
      clearTimeout(refreshTimer);
    };
  }, []);

  const file = useMemo(() => genererFileDeTravail(db, user), [db, user]);
  const alertes = useMemo(() => genererAlertesData(db, user), [db, user]);
  const objectif = useMemo(() => calculerObjectifActif(db, user, new Date(dateObjectif + 'T12:00')), [db, user, dateObjectif]);
  const progression = useMemo(() => calculerProgressionJour(db, user, new Date(dateObjectif + 'T12:00')), [db, user, dateObjectif]);
  const sourcings = dashboard.metrics?.sourcings ?? calculerSourcingsObtenus(db, user);
  const clientsAgent = useMemo(() => clientsActifsData(db, user), [db, user]);
  const nouveauxLeads = useMemo(() => {
    const todayLeads = leadsDuJour(db, user);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const delayed = leadsDuJour(db, user, yesterdayDate)
      .filter(demande => !leadDejaTraite(demande))
      .map(demande => ({ ...demande, _retardTraitement: true }));
    const todayCodes = new Set(todayLeads.map(demande => demande.code));
    return [...todayLeads, ...delayed.filter(demande => !todayCodes.has(demande.code))];
  }, [db, user]);
  const sansSuiviUnMois = useMemo(() => codesSansSuiviDepuis(db, user, 7), [db, user]);
  const echeancesCodes = useMemo(() => {
    return clientsAgent.filter(c => deadlineDue(c.echeanceCode));
  }, [clientsAgent]);

  const supprimerLeadTest = async (demande) => {
    const codeClient = demande.codeClientUltex || demande.client;
    const confirmation = window.prompt(
      `Supprimer ${codeClient} et toutes ses données de test Google Sheets ?\n\nSaisissez exactement ${codeClient} pour confirmer.`
    );
    if (confirmation !== codeClient) {
      if (confirmation !== null) toast('Code de confirmation incorrect.');
      return;
    }
    try {
      const elevationToken = await demanderElevation(`Suppression de la demande test Google Sheets ${demande.code}`);
      const result = await supprimerDemandeTestGoogleSheets(demande.code, elevationToken);
      setRefreshKey(value => value + 1);
      const total = Object.values(result.counts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      toast(`Test ${demande.code} supprimé (${total} enregistrement(s)).`);
    } catch (error) {
      if (error?.message !== 'Vérification annulée.') toast(error?.message || 'Suppression impossible.');
    }
  };


  return (
    <div>
      <Topbar titre={isAdminView ? `Tableau de bord Data — ${user.nomComplet}` : 'Mon tableau de bord Data'} />

      {loading && <div className="panneau mb-lg"><div className="vide"><b>Actualisation du tableau Data…</b></div></div>}
      {loadError && <div className="note-verrou mb-lg">{loadError}</div>}

      {isAdminView && (
        <div className="outils mb-lg">
          <button className="btn mini doux" onClick={() => window.location.hash = 'performance'}>← Retour à l'équipe</button>
        </div>
      )}

      {objectif.parDefaut && (
        <div className="vide" style={{ textAlign: 'left', marginBottom: '14px' }}>{objectif.label}</div>
      )}

      <div className="stats">
        <StatCard val={nouveauxLeads.length} label="Leads à traiter (aujourd'hui + retards)" alerte={nouveauxLeads.some(lead => lead._retardTraitement)} />
        <StatCard val={file.length} label="Actions Data à traiter" alerte={file.some(item => item.retard)} />
        <StatCard val={echeancesCodes.length} label="Échéances code arrivées" alerte={echeancesCodes.length > 0} />
        <StatCard val={sansSuiviUnMois.length} label="Sans changement d’état depuis 1 semaine" alerte={sansSuiviUnMois.length > 0} />
      </div>

      <h3 className="titre-sec mt-lg">Leads reçus aujourd'hui + hier non traités</h3>
      <div className="panneau mb-lg">
        <DataTable
          columns={[
            { key: 'codeClientUltex', label: 'Code client', render: (v, o) => <a href={`#ficheClient:${o.client}`}>{v || o.client || '—'}</a> },
            { key: 'objectifGeneral', label: 'Besoin / produit' },
            { key: 'dateHeureReception', label: 'Reçu le (GMT)', render: (v, o) => formatGMTDateTime(v || o.dateDemande) || '—' },
            { key: 'sourceSynchronisation', label: 'Source', render: (v, o) => pill(v || o.source || '—', 'p-gris') },
            { key: 'dataTag', label: 'Data Tag', render: (v, o) => v ? pill((o.etatVersion ? 'V' + o.etatVersion + ' · ' : '') + v, 'p-bleu') : '—' },
            { key: 'statut', label: 'État', render: (v) => pill(v || 'Nouvelle', 'p-gris') },
            { key: '_retardTraitement', label: 'Alerte', render: (v) => v ? pill('Hier — non traité', 'p-rouge') : pill("Aujourd'hui", 'p-vert') },
            { key: 'actionsTest', label: 'Actions', render: (_, o) =>
              (o.sourceSynchronisation === 'Google Sheets' || o.source === 'Google Sheets') && /^L\d+$/.test(o.codeClientUltex || o.client || '')
                ? <button className="btn mini rouge" onClick={() => supprimerLeadTest(o)}>Supprimer le test</button>
                : '—'
            },
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

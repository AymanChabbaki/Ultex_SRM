import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileSearch, Plus, RefreshCcw, Search, Users } from 'lucide-react';
import Topbar from '../layout/Topbar';
import { useDB } from '../../context/DBContext';
import { subscribeDataDashboard } from '../../services/api';
import './SourcingWorkspace.css';

const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const sourcingType = value => ['Sourcing (B)', 'Négociation (A2)'].includes(value);
const pageSize = 8;

function businessTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    return value > 0 && value < 1e12 ? value * 1000 : value;
  }
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return numeric > 0 && numeric < 1e12 ? numeric * 1000 : numeric;
  }
  const frenchDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (frenchDate) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = frenchDate;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function demandeDate(demande, sourcing) {
  const values = [
    demande?.dateHeureReception,
    demande?.dateDemande,
    demande?.dateCreation,
    demande?.createdAt,
    demande?.ts,
    sourcing?.dateHeureReception,
    sourcing?.dateDemande,
    sourcing?.createdAt,
    sourcing?.ts,
  ];
  for (const value of values) {
    const timestamp = businessTimestamp(value);
    if (timestamp) return { value, timestamp };
  }
  return { value: '', timestamp: 0 };
}

function displayDate(value) {
  const timestamp = businessTimestamp(value);
  if (!timestamp) return 'Date à préciser';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}

function statusClass(value) {
  if (value === 'Validé' || value === 'Clôturé') return 'is-success';
  if (value === 'Offre reçue' || value === 'Recommandé') return 'is-warning';
  if (value === 'Échantillon') return 'is-purple';
  return 'is-info';
}

function firstSupplier(sourcing) {
  return sourcing?.detailsFournisseurs?.[0] || null;
}

export default function SourcingDashboard() {
  const { db, chargerCollections } = useDB();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const collections = ['clients', 'demandes', 'demandeLignes', 'sourcings', 'fournisseurs'];
    const controller = new AbortController();
    let active = true;
    let refreshTimer = null;

    // The route loader may hold an older in-memory snapshot if this screen
    // was already visited. Refresh it on entry, then use the existing CRM
    // live-change stream so a Workflow sync appears without a hard reload.
    chargerCollections(collections, { maxAgeMs: 10_000 }).catch(() => {});
    subscribeDataDashboard(() => {
      if (!active) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        chargerCollections(collections, { force: true }).catch(() => {});
      }, 250);
    }, { signal: controller.signal }).catch(error => {
      if (error?.name !== 'AbortError') console.warn('Actualisation temps réel sourcing indisponible:', error);
    });

    return () => {
      active = false;
      clearTimeout(refreshTimer);
      controller.abort();
    };
  }, [chargerCollections]);

  const allRows = useMemo(() => {
    const clients = new Map((db.clients || []).map(item => [item.code, item]));
    const sourcings = db.sourcings || [];
    const linesByDemande = new Map();
    (db.demandeLignes || []).forEach(line => {
      const current = linesByDemande.get(line.demande) || [];
      current.push(line);
      linesByDemande.set(line.demande, current);
    });

    return (db.demandes || [])
      .filter(item => sourcingType(item.typeDemande))
      .map(demande => {
        const sourcing = sourcings.find(item => item.demande === demande.code || (
          demande.ultexDossierId && item.ultexDossierId === demande.ultexDossierId
        ));
        const lines = linesByDemande.get(demande.code) || [];
        const supplier = firstSupplier(sourcing);
        const ficheProducts = sourcing?.ficheProduits || sourcing?.detailsProduits || [];
        const products = sourcing?.produits || ficheProducts.map(p => p.nomProduit || p.name).filter(Boolean).join(' · ')
          || lines.map(line => line.nomProduit || line.designationTechnique).filter(Boolean).join(' · ');
        const supplierName = sourcing?.fournisseursConfirmes || sourcing?.fournisseur || supplier?.nom || 'Fournisseur à identifier';
        const origin = supplier?.pays || ficheProducts[0]?.paysFournisseur || lines[0]?.paysFournisseur || '—';
        const price = supplier?.prixExw ?? sourcing?.prixFOB ?? ficheProducts[0]?.prixUnitaire;
        const currency = supplier?.devise || sourcing?.devise || ficheProducts[0]?.devise || 'USD';
        const moq = supplier?.moq || sourcing?.moq || '—';
        const delay = supplier?.delaiProduction || sourcing?.delai || '—';
        const state = sourcing?.statut || 'À traiter';
        const created = demandeDate(demande, sourcing);
        return {
          demande,
          sourcing,
          client: clients.get(demande.client),
          products,
          supplierName,
          origin,
          price,
          currency,
          moq,
          delay,
          responsible: sourcing?.responsable || demande.responsable || 'À assigner',
          state,
          nextAction: sourcing?.prochaineAction || (state === 'Validé' ? 'Préparer la commande' : state === 'Offre reçue' ? 'Comparer les offres' : 'Poursuivre la recherche'),
          nextDate: sourcing?.echeanceAction || '',
          createdDate: created.value,
          timestamp: created.timestamp,
        };
      });
  }, [db]);

  const newestRecordSignature = useMemo(() => {
    const newest = allRows.reduce((best, row) => row.timestamp > (best?.timestamp || 0) ? row : best, null);
    return newest ? `${newest.demande.code}:${newest.timestamp}:${allRows.length}` : `empty:${allRows.length}`;
  }, [allRows]);

  // A Workflow sync can arrive while the dashboard is already open. Return
  // to page one only when a genuinely newer demande appears, so the user sees
  // it immediately instead of remaining on a stale pagination page.
  useEffect(() => {
    setPage(1);
  }, [newestRecordSignature]);

  const countries = useMemo(() => [...new Set(allRows.map(row => row.origin).filter(v => v && v !== '—'))].sort(), [allRows]);
  const filtered = useMemo(() => {
    const rows = allRows.filter(row => {
      const haystack = norm([
        row.sourcing?.code, row.demande.code, row.demande.referenceMetier, row.demande.referenceCode,
        row.client?.nom, row.products, row.supplierName, row.responsible, row.origin,
      ].join(' '));
      return (!search || haystack.includes(norm(search)))
        && (!status || row.state === status)
        && (!country || row.origin === country);
    });
    return rows.sort((a, b) => {
      const codeA = a.sourcing?.code || a.demande.referenceMetier || a.demande.code;
      const codeB = b.sourcing?.code || b.demande.referenceMetier || b.demande.code;
      const codeTieBreak = String(codeB).localeCompare(String(codeA), 'fr', { numeric: true });
      if (sort === 'oldest') return a.timestamp - b.timestamp || -codeTieBreak;
      if (sort === 'status') return String(a.state).localeCompare(String(b.state), 'fr');
      return b.timestamp - a.timestamp || codeTieBreak;
    });
  }, [allRows, search, status, country, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const today = new Date().toISOString().slice(0, 10);
  const inProgress = allRows.filter(row => !['Validé', 'Clôturé'].includes(row.state)).length;
  const toCompare = allRows.filter(row => ['Offre reçue', 'Recommandé'].includes(row.state) || (row.sourcing?.detailsFournisseurs?.length || 0) > 1).length;
  const reminders = allRows.filter(row => row.nextDate && row.nextDate <= today && !['Validé', 'Clôturé'].includes(row.state)).length;
  const validated = allRows.filter(row => row.state === 'Validé').length;

  const openRow = row => {
    window.location.hash = row.sourcing?.code
      ? `ficheSourcing:${row.sourcing.code}`
      : `ficheSourcing:demande-${row.demande.code}`;
  };

  const resetPage = setter => event => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <>
      <Topbar titre="Sourcing" />
      <div className="sourcing-shell">
        <div className="source-page-heading">
          <div><h1>Sourcing</h1><p>Suivez vos demandes fournisseurs de la recherche à la validation.</p></div>
          <button className="source-secondary-button" onClick={() => { window.location.hash = 'fournisseurs'; }}><Users size={17} /> Banque fournisseurs</button>
        </div>

        <section className="source-kpi-grid source-kpi-grid-four">
          <article className="source-kpi-card blue"><Clock3 /><div><span>Demandes en cours</span><strong>{inProgress}</strong><small>{allRows.length} demandes au total</small></div></article>
          <article className="source-kpi-card amber"><FileSearch /><div><span>Devis à comparer</span><strong>{toCompare}</strong><small>Offres et fournisseurs à arbitrer</small></div></article>
          <article className="source-kpi-card red"><RefreshCcw /><div><span>Relances à faire</span><strong>{reminders}</strong><small>Échéance atteinte aujourd’hui</small></div></article>
          <article className="source-kpi-card green"><CheckCircle2 /><div><span>Fournisseurs validés</span><strong>{validated}</strong><small>Demandes sourcing validées</small></div></article>
        </section>

        <section className="source-card source-dashboard-card">
          <div className="source-card-title-row">
            <div><h2>Demandes de sourcing</h2><p>Toutes vos recherches fournisseurs au même endroit.</p></div>
            <button className="source-primary-button" onClick={() => { window.location.hash = 'ficheSourcing:nouveau'; }}><Plus size={17} /> Nouvelle demande</button>
          </div>

          <div className="source-filter-row">
            <label className="source-search"><Search size={16} /><input value={search} onChange={resetPage(setSearch)} placeholder="Rechercher par produit, fournisseur, client ou code…" /></label>
            <select value={status} onChange={resetPage(setStatus)}><option value="">Tous les statuts</option>{['À traiter', 'En cours', 'Recherche', 'Offre reçue', 'Échantillon', 'Recommandé', 'Validé', 'Clôturé'].map(v => <option key={v}>{v}</option>)}</select>
            <select value={country} onChange={resetPage(setCountry)}><option value="">Tous les pays</option>{countries.map(v => <option key={v}>{v}</option>)}</select>
            <select value={sort} onChange={resetPage(setSort)}><option value="recent">Plus récentes</option><option value="oldest">Plus anciennes</option><option value="status">Par statut</option></select>
          </div>

          <div className="source-table-wrap">
            <table className="source-table">
              <thead><tr><th>Code / Code client / Produit</th><th>Date demande</th><th>Fournisseur</th><th>Origine</th><th>FOB / MOQ</th><th>Délai</th><th>Statut</th><th>Prochaine action</th><th></th></tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.demande.code} onDoubleClick={() => openRow(row)}>
                    <td><button className="source-link" onClick={() => openRow(row)}>{row.sourcing?.code || row.demande.referenceMetier || row.demande.code}</button><small>Client : {row.client?.codeClientUltex || row.client?.code || row.demande.codeClientUltex || row.demande.client || '—'}</small><small>{row.products || 'Produit à préciser'}</small></td>
                    <td><strong>{displayDate(row.createdDate)}</strong><small>{row.demande.sourceSynchronisation || row.sourcing?.source || 'CRM'}</small></td>
                    <td><strong>{row.supplierName}</strong><small>{row.responsible}</small></td>
                    <td>{row.origin}</td>
                    <td><strong>{row.price != null ? `${Number(row.price).toLocaleString('fr-FR')} ${row.currency}` : '—'}</strong><small>MOQ {row.moq}</small></td>
                    <td>{row.delay}</td>
                    <td><span className={`source-status ${statusClass(row.state)}`}>{row.state}</span></td>
                    <td><strong>{row.nextAction}</strong><small>{row.nextDate || 'Échéance à définir'}</small></td>
                    <td><button className="source-icon-button" onClick={() => openRow(row)} aria-label="Ouvrir">•••</button></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan="9" className="source-empty">Aucune demande correspondant aux filtres.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="source-pagination">
            <span>Affichage de {rows.length} demande{rows.length > 1 ? 's' : ''} sur {filtered.length}</span>
            <div><button disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>{Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, safePage - 3), Math.max(5, safePage + 2)).map(value => <button key={value} className={value === safePage ? 'active' : ''} onClick={() => setPage(value)}>{value}</button>)}<button disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button></div>
          </div>
        </section>
      </div>
    </>
  );
}

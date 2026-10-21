import React, { useMemo, useState } from 'react';
import { Check, Link2, Plus, Search, Users } from 'lucide-react';
import Topbar from '../layout/Topbar';
import ModuleForm from '../modules/ModuleForm';
import { useDB } from '../../context/DBContext';
import './SourcingWorkspace.css';

const norm = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const categoryOf = supplier => supplier.categorieBanque || (supplier.workflowSupplierId ? 'Confirmé' : 'Collecté');
const pageSize = 10;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export default function SupplierBank() {
  const { db } = useDB();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [activeState, setActiveState] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const groups = useMemo(() => {
    const byName = new Map();
    (db.fournisseurs || []).forEach(item => {
      const key = norm(item.nom) || item.code;
      const current = byName.get(key) || [];
      current.push(item);
      byName.set(key, current);
    });
    return [...byName.values()].map(records => {
      const confirmed = records.filter(item => categoryOf(item) === 'Confirmé');
      const collected = records.filter(item => categoryOf(item) === 'Collecté');
      const primary = confirmed[0] || collected[0] || records[0];
      const demandCodes = unique(records.map(item => item.derniereDemande));
      const demands = (db.demandes || []).filter(item => demandCodes.includes(item.code));
      const clientCodes = unique(demands.map(item => item.client));
      const clients = (db.clients || []).filter(item => clientCodes.includes(item.code));
      const products = unique(records.flatMap(item => String(item.produitsFournis || '').split(/\s*[·;,]\s*/)));
      const statuses = records.map(item => item.statut);
      const isActive = !statuses.some(value => ['Blacklisté', 'Suspendu', 'Inactif'].includes(value));
      return {
        key: norm(primary.nom) || primary.code,
        primary,
        records,
        confirmed,
        collected,
        hasConfirmed: confirmed.length > 0,
        hasCollected: collected.length > 0,
        products,
        clients,
        isActive,
        country: primary.pays || records.find(item => item.pays)?.pays || '',
        city: primary.ville || records.find(item => item.ville)?.ville || '',
        contact: primary.contact || primary.whatsapp || primary.wechat || primary.email || '',
      };
    }).sort((a, b) => String(a.primary.nom || '').localeCompare(String(b.primary.nom || ''), 'fr'));
  }, [db]);

  const countries = unique(groups.map(group => group.country)).sort();
  const filtered = groups.filter(group => {
    const matchesTab = tab === 'all'
      || (tab === 'collected' && group.hasCollected)
      || (tab === 'confirmed' && group.hasConfirmed)
      || (tab === 'associate' && group.hasCollected && !group.hasConfirmed);
    const haystack = norm([
      group.primary.code, group.primary.nom, group.country, group.city, group.contact,
      group.products.join(' '), group.clients.map(item => `${item.code} ${item.nom}`).join(' '),
    ].join(' '));
    return matchesTab
      && (!search || haystack.includes(norm(search)))
      && (!country || group.country === country)
      && (!activeState || (activeState === 'active') === group.isActive);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const both = groups.filter(group => group.hasConfirmed && group.hasCollected).length;
  const toAssociate = groups.filter(group => group.hasCollected && !group.hasConfirmed).length;
  const active = groups.filter(group => group.isActive).length;

  const changeTab = value => { setTab(value); setPage(1); };
  const open = group => { window.location.hash = `ficheFournisseur:${group.primary.code}`; };

  return (
    <>
      <Topbar titre="Dashboard Fournisseurs" />
      <div className="sourcing-shell">
        <div className="source-page-heading"><div><h1>Dashboard Fournisseurs</h1><p>Répertoire unifié des fournisseurs collectés par le sourcing et des clients confirmés.</p></div></div>

        <section className="supplier-origin-grid">
          <article className="source-card supplier-origin-card"><div className="source-round-icon"><Search size={20} /></div><div><h2>Collectés par le sourcing</h2><p>Fournisseurs saisis dans les fiches sourcing.</p><strong>{groups.filter(group => group.hasCollected).length}</strong><small> fournisseurs · {(db.sourcings || []).length} codes sourcing</small></div><button onClick={() => changeTab('collected')}>Voir la liste →</button></article>
          <article className="source-card supplier-origin-card green"><div className="source-round-icon"><Check size={20} /></div><div><h2>Répertoire fournisseurs des clients confirmés</h2><p>Fournisseurs liés aux demandes validées.</p><strong>{groups.filter(group => group.hasConfirmed).length}</strong><small> fournisseurs confirmés</small></div><button onClick={() => changeTab('confirmed')}>Voir le répertoire →</button></article>
        </section>

        <section className="source-kpi-grid source-kpi-grid-four supplier-kpis">
          <article className="source-kpi-card blue"><Users /><div><span>Fournisseurs uniques</span><strong>{groups.length}</strong><small>dans les deux sources</small></div></article>
          <article className="source-kpi-card green"><Link2 /><div><span>Présents dans les deux</span><strong>{both}</strong><small>rapprochés par société</small></div></article>
          <article className="source-kpi-card amber"><Link2 /><div><span>À associer / vérifier</span><strong>{toAssociate}</strong><small>collectés non confirmés</small></div></article>
          <article className="source-kpi-card blue"><Check /><div><span>Fournisseurs actifs</span><strong>{active}</strong><small>{groups.length - active} inactifs</small></div></article>
        </section>

        <section className="source-card source-dashboard-card">
          <div className="supplier-tabs">
            <button className={tab === 'all' ? 'active' : ''} onClick={() => changeTab('all')}>Tous les fournisseurs</button>
            <button className={tab === 'collected' ? 'active' : ''} onClick={() => changeTab('collected')}>Collectés par sourcing ({groups.filter(group => group.hasCollected).length})</button>
            <button className={tab === 'confirmed' ? 'active' : ''} onClick={() => changeTab('confirmed')}>Répertoire clients confirmés ({groups.filter(group => group.hasConfirmed).length})</button>
            <button className={tab === 'associate' ? 'active' : ''} onClick={() => changeTab('associate')}>À associer ({toAssociate})</button>
            <button className="source-primary-button" onClick={() => setShowCreate(true)}><Plus size={16} /> Ajouter fournisseur</button>
          </div>

          <div className="source-filter-row supplier-filter-row">
            <label className="source-search"><Search size={16} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Rechercher par code, société, client ou produit…" /></label>
            <select value={country} onChange={event => { setCountry(event.target.value); setPage(1); }}><option value="">Tous les pays</option>{countries.map(value => <option key={value}>{value}</option>)}</select>
            <select value={activeState} onChange={event => { setActiveState(event.target.value); setPage(1); }}><option value="">Actifs et inactifs</option><option value="active">Actifs</option><option value="inactive">Inactifs</option></select>
            <button className="source-secondary-button" onClick={() => { setSearch(''); setCountry(''); setActiveState(''); setPage(1); }}><Link2 size={15} /> Actualiser les liens</button>
          </div>

          <div className="source-table-wrap">
            <table className="source-table supplier-table">
              <thead><tr><th>Code fournisseur</th><th>Société / Pays</th><th>Client confirmé</th><th>Produits / Catégories</th><th>Contact principal</th><th>Source</th><th>Statut</th><th>Action</th></tr></thead>
              <tbody>
                {rows.map(group => {
                  const client = group.clients[0];
                  const source = group.hasConfirmed && group.hasCollected ? 'Sourcing + Répertoire' : group.hasConfirmed ? 'Répertoire client' : 'Sourcing uniquement';
                  return <tr key={group.key}>
                    <td><strong>{group.hasConfirmed ? (group.primary.codeFournisseur || group.primary.code) : 'À générer'}</strong><small>{group.hasConfirmed ? 'Code fournisseur' : 'Code manquant'}</small></td>
                    <td><strong>{group.primary.nom || 'Sans nom'}</strong><small>{[group.country, group.city].filter(Boolean).join(' · ') || 'Pays à compléter'}</small></td>
                    <td>{client ? <><strong>{client.nom || client.code}</strong><small>{client.code} · Client confirmé</small></> : <><strong>—</strong><small>Non associé</small></>}</td>
                    <td><strong>{group.products.slice(0, 2).join(' · ') || 'À compléter'}</strong><small>{group.products.length} article{group.products.length > 1 ? 's' : ''}</small></td>
                    <td><strong>{group.contact || 'Aucun contact principal'}</strong><small>{group.primary.email || group.primary.whatsapp || 'Ajouter depuis la fiche'}</small></td>
                    <td><span className={`source-status ${group.hasConfirmed ? 'is-success' : 'is-warning'}`}>{source}</span></td>
                    <td><span className={`source-status ${group.isActive ? 'is-success' : ''}`}>{group.isActive ? 'Actif' : 'Inactif'}</span></td>
                    <td><button className="source-primary-button small" onClick={() => open(group)}>{group.hasConfirmed ? 'Voir fiche →' : 'Associer →'}</button></td>
                  </tr>;
                })}
                {!rows.length && <tr><td colSpan="8" className="source-empty">Aucun fournisseur correspondant aux filtres.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="source-directory-note"><strong>Rapprochement automatique</strong> Société identique → fiche société → contacts et produits rattachés. Si aucun code n’existe, le tableau propose « Associer » ou « Générer un code » avant l’ajout au répertoire.</div>
          <div className="source-pagination"><span>{filtered.length} fournisseur{filtered.length > 1 ? 's' : ''} unique{filtered.length > 1 ? 's' : ''}</span><div><button disabled={safePage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map(value => <button key={value} className={value === safePage ? 'active' : ''} onClick={() => setPage(value)}>{value}</button>)}<button disabled={safePage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>›</button></div></div>
        </section>
      </div>
      {showCreate && <ModuleForm moduleId="fournisseurs" initialData={{ categorieBanque: 'Collecté', statut: 'En test', devise: 'USD', sourceBanque: 'Saisie CRM' }} onClose={() => setShowCreate(false)} />}
    </>
  );
}

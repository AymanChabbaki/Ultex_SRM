import React, { useEffect, useMemo, useState } from 'react';
import Topbar from '../layout/Topbar';
import { fetchWorkflowV2Leads, subscribeDataDashboard } from '../../services/api';
import { formatGMTDateTime } from '../../utils/dataFollowup';

function productSummary(lead) {
  const products = Array.isArray(lead.products) ? lead.products : [];
  const names = products.map(item => item?.nomProduit).filter(Boolean);
  return names.length ? names.join(' · ') : (lead.produit || lead.objectifGeneral || '—');
}

function pageNumbers(page, totalPages) {
  const values = new Set([1, totalPages, page - 1, page, page + 1]);
  return [...values].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
}

export default function WorkflowV2Leads() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchWorkflowV2Leads({ page, pageSize, q: debouncedQuery })
      .then(data => { if (active) setResult(data); })
      .catch(err => { if (active) setError(err?.message || 'Chargement impossible'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, pageSize, debouncedQuery, refreshKey]);

  useEffect(() => {
    let stopped = false;
    let controller;
    let retryTimer;
    let refreshTimer;
    const connect = async () => {
      controller = new AbortController();
      try {
        await subscribeDataDashboard(() => {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            if (!stopped) setRefreshKey(value => value + 1);
          }, 300);
        }, { signal: controller.signal });
      } catch (err) {
        if (stopped || err?.name === 'AbortError') return;
      }
      if (!stopped) retryTimer = setTimeout(connect, 3000);
    };
    connect();
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(retryTimer);
      clearTimeout(refreshTimer);
    };
  }, []);

  const pages = useMemo(() => pageNumbers(page, result.totalPages || 1), [page, result.totalPages]);

  return (
    <>
      <Topbar titre="CRM V2 — Leads Workflow" />
      <div className="banniere-brouillon">
        <b>Espace isolé V2</b>
        <span>Ces leads ne créent ni client, ni demande, ni activité dans le CRM principal. Ils basculent automatiquement après leur promotion dans Workflow V2.</span>
        <a className="btn mini doux" href="https://workflow.ultex.ma/v2" target="_blank" rel="noreferrer">Ouvrir Workflow V2</a>
      </div>

      <div className="outils">
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Rechercher nom, téléphone, code ou produit…"
        />
        <span className="pill p-bleu">{result.total || 0} lead(s) V2</span>
        <button className="btn mini" onClick={() => setRefreshKey(value => value + 1)}>Actualiser</button>
      </div>

      <div className="panneau">
        {error ? <div className="note-verrou"><b>{error}</b></div> : (
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Besoin / produit</th>
                  <th>Demande</th>
                  <th>Reçu le (GMT)</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {loading && !result.items.length ? (
                  <tr><td className="table-empty-row" colSpan="7">Chargement des leads V2…</td></tr>
                ) : !result.items.length ? (
                  <tr><td className="table-empty-row" colSpan="7">Aucun lead V2 en attente.</td></tr>
                ) : result.items.map(lead => {
                  const rowId = String(lead.ultexDossierId || lead.id);
                  const isOpen = expanded === rowId;
                  return (
                    <React.Fragment key={rowId}>
                      <tr onClick={() => setExpanded(isOpen ? '' : rowId)} style={{ cursor: 'pointer' }} title="Cliquer pour afficher les détails">
                        <td><span className="pill p-or">{lead.referenceCode || lead.code || 'V2'}</span></td>
                        <td><b>{lead.nom || '—'}</b></td>
                        <td>{lead.telephone || lead.email || '—'}</td>
                        <td style={{ maxWidth: 320, whiteSpace: 'normal' }}>{productSummary(lead)}</td>
                        <td>{lead.typeDemande || lead.sensOperation || '—'}</td>
                        <td>{formatGMTDateTime(lead.dateReception)}</td>
                        <td><span className="pill p-ambre">En attente de promotion</span></td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan="7" style={{ background: 'var(--ivoire)' }}>
                            <div className="deux-col" style={{ padding: 8 }}>
                              <div><b>Description</b><br />{lead.objectifGeneral || lead.remarque || '—'}</div>
                              <div><b>Localisation</b><br />{[lead.ville, lead.paysProvenance].filter(Boolean).join(' · ') || '—'}</div>
                              <div><b>Quantité</b><br />{lead.quantite || '—'}</div>
                              <div><b>Étape Workflow</b><br />{lead.etape || 'Analyse Dossier'}</div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-pagination">
          <span className="table-pagination-summary"><strong>{result.total || 0}</strong> résultat(s)</span>
          <label className="table-page-size">Par page
            <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
          <div className="table-page-buttons">
            <button className="table-page-nav" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>‹</button>
            {pages.map((value, index) => (
              <React.Fragment key={value}>
                {index > 0 && value - pages[index - 1] > 1 ? <span className="table-page-gap">…</span> : null}
                <button className={`table-page-number ${value === page ? 'active' : ''}`} onClick={() => setPage(value)}>{value}</button>
              </React.Fragment>
            ))}
            <button className="table-page-nav" disabled={page >= (result.totalPages || 1)} onClick={() => setPage(value => value + 1)}>›</button>
          </div>
        </div>
      </div>
    </>
  );
}

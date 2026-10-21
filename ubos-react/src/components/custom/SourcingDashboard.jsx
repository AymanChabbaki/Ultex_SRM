import React, { useMemo, useState } from 'react';
import Topbar from '../layout/Topbar';
import ModuleForm from '../modules/ModuleForm';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import './SourcingWorkspace.css';

const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const sourcingType = value => ['Sourcing (B)', 'Négociation (A2)'].includes(value);

export default function SourcingDashboard() {
  const { db } = useDB();
  const { userCourant } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const rows = useMemo(() => {
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
        const products = sourcing?.produits || lines.map(line => line.nomProduit || line.designationTechnique).filter(Boolean).join(' · ');
        return {
          demande,
          sourcing,
          client: clients.get(demande.client),
          products,
          responsible: sourcing?.responsable || demande.responsable || 'À assigner',
          state: sourcing?.statut || 'À traiter',
        };
      })
      .filter(row => {
        const haystack = norm([
          row.demande.code, row.demande.referenceMetier, row.demande.referenceCode,
          row.client?.nom, row.products, row.sourcing?.fournisseur, row.responsible,
        ].join(' '));
        return (!search || haystack.includes(norm(search)))
          && (!status || row.state === status)
          && (!owner || row.responsible === owner);
      })
      .sort((a, b) => String(b.demande.dateHeureReception || b.demande.dateDemande || '').localeCompare(
        String(a.demande.dateHeureReception || a.demande.dateDemande || '')
      ));
  }, [db, search, status, owner]);

  const allSourcingDemandes = (db.demandes || []).filter(item => sourcingType(item.typeDemande));
  const owners = [...new Set(allSourcingDemandes.map(item => item.responsable).filter(Boolean))].sort();
  const validated = rows.filter(row => row.state === 'Validé').length;
  const pending = rows.filter(row => row.state !== 'Validé' && row.state !== 'Clôturé').length;

  return (
    <>
      <Topbar titre="Dashboard Sourcing" />
      <div className="panneau sourcing-workspace" style={{ display: 'grid', gap: 18 }}>
        <div className="entete-section">
          <div>
            <h2>Demandes Sourcing & Négociation</h2>
            <p className="muted">Une demande reste liée au même responsable et au même sourcing, qu’elle soit créée ici ou synchronisée depuis Workflow.</p>
          </div>
          <button className="btn or" onClick={() => setShowCreate(true)}>+ Nouvelle demande</button>
        </div>

        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="kpi"><b>{allSourcingDemandes.length}</b><span>Total demandes</span></div>
          <div className="kpi"><b>{pending}</b><span>À traiter / en cours</span></div>
          <div className="kpi"><b>{validated}</b><span>Sourcings validés</span></div>
        </div>

        <div className="filtres" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 220px 220px', gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher client, demande, produit ou fournisseur…" />
          <select value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">Tous les responsables</option>
            {owners.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {['À traiter', 'En cours', 'Offre reçue', 'Recommandé', 'Validé', 'Clôturé'].map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Demande</th><th>Client</th><th>Type</th><th>Produits</th><th>Responsable</th><th>Fournisseur retenu</th><th>Source</th><th>Statut</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(({ demande, sourcing, client, products, responsible, state }) => (
                <tr key={demande.code}>
                  <td><button className="lien" onClick={() => { window.location.hash = `#ficheDemande:${demande.code}`; }}>{demande.referenceMetier || demande.referenceCode || demande.code}</button></td>
                  <td><b>{client?.nom || demande.client || '—'}</b><br /><small>{demande.codeClientUltex || ''}</small></td>
                  <td>{demande.typeDemande}</td>
                  <td style={{ maxWidth: 300, whiteSpace: 'normal' }}>{products || '—'}</td>
                  <td>{responsible === 'À assigner' ? <span className="pill p-rouge">À assigner</span> : <b>{responsible}</b>}</td>
                  <td>{sourcing?.fournisseursConfirmes || sourcing?.fournisseur || '—'}</td>
                  <td><span className="pill p-gris">{demande.sourceSynchronisation || demande.source || 'CRM'}</span></td>
                  <td><span className={`pill ${state === 'Validé' ? 'p-vert' : state === 'À traiter' ? 'p-rouge' : 'p-or'}`}>{state}</span></td>
                  <td><button className="btn mini" onClick={() => { window.location.hash = `#ficheDemande:${demande.code}`; }}>Ouvrir</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="9" className="vide">Aucune demande correspondant aux filtres.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <ModuleForm
          moduleId="demandes"
          initialData={{
            typeDemande: 'Sourcing (B)',
            responsable: userCourant || 'Sourcing',
            responsableData: 'Data',
            statut: 'Nouvelle',
            dateDemande: new Date().toISOString().slice(0, 10),
            source: 'Saisie manuelle',
            canalReception: 'Saisie manuelle',
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}

import React, { useMemo, useState } from 'react';
import Topbar from '../layout/Topbar';
import ModuleForm from '../modules/ModuleForm';
import { useDB } from '../../context/DBContext';
import './SourcingWorkspace.css';

const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const categoryOf = supplier => supplier.categorieBanque || (supplier.workflowSupplierId ? 'Confirmé' : 'Collecté');

export default function SupplierBank() {
  const { db } = useDB();
  const [category, setCategory] = useState('Confirmé');
  const [search, setSearch] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const suppliers = db.fournisseurs || [];
  const counts = {
    Confirmé: suppliers.filter(item => categoryOf(item) === 'Confirmé').length,
    Collecté: suppliers.filter(item => categoryOf(item) === 'Collecté').length,
  };
  const rows = useMemo(() => suppliers.filter(item => {
    if (categoryOf(item) !== category) return false;
    const haystack = norm([
      item.nom, item.produitsFournis, item.hsCode, item.pays, item.ville,
      item.contact, item.whatsapp, item.wechat, item.email, item.detailsProduit,
    ].join(' '));
    return !search || haystack.includes(norm(search));
  }).sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr')), [suppliers, category, search]);

  return (
    <>
      <Topbar titre="Banque fournisseurs" />
      <div className="panneau sourcing-workspace" style={{ display: 'grid', gap: 18 }}>
        <div className="entete-section">
          <div>
            <h2>Banque fournisseurs</h2>
            <p className="muted">Les confirmés arrivent automatiquement de Workflow. Les collectés peuvent être ajoutés ici ou importés depuis votre feuille.</p>
          </div>
          <button className="btn or" onClick={() => setShowCreate(true)}>+ Fournisseur collecté</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Confirmé', 'Collecté'].map(value => (
            <button key={value} className={`btn ${category === value ? 'or' : 'doux'}`} onClick={() => setCategory(value)}>
              Fournisseurs {value.toLowerCase()}s ({counts[value]})
            </button>
          ))}
        </div>

        <div className="filtres">
          <input
            style={{ width: '100%' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par produit, fournisseur, code SH, pays, ville ou contact…"
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Fournisseur</th><th>Produit</th><th>Code SH</th><th>Pays / ville</th><th>Contact</th><th>Prix EXW</th><th>MOQ</th><th>Délai</th><th>Source</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(item => (
                <tr key={item.code}>
                  <td><b>{item.nom}</b></td>
                  <td style={{ maxWidth: 300, whiteSpace: 'normal' }}>{item.produitsFournis || '—'}</td>
                  <td>{item.hsCode || '—'}</td>
                  <td>{[item.pays, item.ville].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={{ maxWidth: 240, whiteSpace: 'normal' }}>{item.contact || item.whatsapp || item.wechat || item.email || '—'}</td>
                  <td>{item.prixExw != null ? `${Number(item.prixExw).toLocaleString('fr-FR')} ${item.devise || 'USD'}` : '—'}</td>
                  <td>{item.moq || '—'}</td>
                  <td>{item.delaiProduction || '—'}</td>
                  <td><span className={`pill ${categoryOf(item) === 'Confirmé' ? 'p-vert' : 'p-or'}`}>{item.sourceBanque || (categoryOf(item) === 'Confirmé' ? 'Workflow' : 'Collecte')}</span></td>
                  <td><button className="btn mini" onClick={() => setEditingCode(item.code)}>Modifier</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="10" className="vide">Aucun fournisseur dans cette catégorie.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {(showCreate || editingCode) && (
        <ModuleForm
          moduleId="fournisseurs"
          recordCode={editingCode || undefined}
          initialData={showCreate ? { categorieBanque: 'Collecté', statut: 'En test', devise: 'USD' } : undefined}
          onClose={() => { setShowCreate(false); setEditingCode(null); }}
        />
      )}
    </>
  );
}

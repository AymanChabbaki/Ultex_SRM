import React, { useMemo, useState } from 'react';
import { ArrowLeft, Building2, Check, ExternalLink, Mail, MapPin, Package, Pencil, Phone, Plus, UserRound } from 'lucide-react';
import Topbar from '../layout/Topbar';
import ModuleForm from '../modules/ModuleForm';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './SourcingWorkspace.css';

const norm = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const categoryOf = supplier => supplier.categorieBanque || (supplier.workflowSupplierId ? 'Confirmé' : 'Collecté');
const unique = values => [...new Set(values.filter(Boolean))];

export default function SupplierProfile({ codeProp }) {
  const { db, updateDB, genCode, audit } = useDB();
  const { userCourant } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('Informations');
  const [showEdit, setShowEdit] = useState(false);

  const context = useMemo(() => {
    const seed = (db.fournisseurs || []).find(item => item.code === codeProp);
    if (!seed) return null;
    const records = (db.fournisseurs || []).filter(item => norm(item.nom) === norm(seed.nom));
    const confirmed = records.filter(item => categoryOf(item) === 'Confirmé');
    const collected = records.filter(item => categoryOf(item) === 'Collecté');
    const demandCodes = unique(records.map(item => item.derniereDemande));
    const sourcings = (db.sourcings || []).filter(item => {
      const names = [item.fournisseur, item.fournisseursConfirmes, item.fournisseursPressentis, ...(item.detailsFournisseurs || []).map(supplier => supplier.nom)];
      return names.some(name => norm(name).includes(norm(seed.nom))) || demandCodes.includes(item.demande);
    });
    sourcings.forEach(item => { if (item.demande && !demandCodes.includes(item.demande)) demandCodes.push(item.demande); });
    const demandes = (db.demandes || []).filter(item => demandCodes.includes(item.code));
    const clientCodes = unique(demandes.map(item => item.client));
    const clients = (db.clients || []).filter(item => clientCodes.includes(item.code));
    const productObjects = [];
    records.forEach(item => String(item.produitsFournis || '').split(/\s*[·;,]\s*/).filter(Boolean).forEach(product => productObjects.push({ nom: product, origine: item.pays, qualite: item.detailsProduit || item.remarque || '', categorie: item.categorieProduit || '' })));
    sourcings.forEach(item => (item.ficheProduits || item.detailsProduits || []).forEach(product => productObjects.push({ nom: product.nomProduit || product.name, origine: product.paysOrigine || product.paysFournisseur, qualite: product.certificats || product.autresCaracteristiques || product.description || '', categorie: product.categorie || '' })));
    const products = [...new Map(productObjects.filter(item => item.nom).map(item => [norm(item.nom), item])).values()];
    const recordCodes = records.map(item => item.code);
    const sourcingCodes = sourcings.map(item => item.code);
    const history = (db.audit || []).filter(item => recordCodes.includes(item.objet) || sourcingCodes.includes(item.objet) || demandCodes.includes(item.objet)).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return { seed, records, confirmed, collected, sourcings, demandes, clients, products, history };
  }, [db, codeProp]);

  if (!context) return <><Topbar titre="Fiche fournisseur" /><div className="source-card source-empty">Fournisseur introuvable.</div></>;
  const { seed, records, confirmed, collected, sourcings, demandes, clients, products, history } = context;
  const isConfirmed = confirmed.length > 0;
  const isCollected = collected.length > 0;
  const sourceLabel = isConfirmed && isCollected ? 'Sourcing + Répertoire client' : isConfirmed ? 'Répertoire client confirmé' : 'Sourcing uniquement';
  const statusLabel = isConfirmed ? 'Actif · fournisseur confirmé' : 'À compléter · non associé au répertoire';
  const primaryClient = clients[0];
  const primaryContact = seed.contact || seed.interlocuteur || 'Contact à compléter';

  const associate = async () => {
    const supplierCode = seed.codeFournisseur || genCode('FRS');
    const nextSuppliers = (db.fournisseurs || []).map(item => item.code === seed.code ? { ...item, categorieBanque: 'Confirmé', statut: 'Qualifié', codeFournisseur: supplierCode, sourceBanque: isCollected ? 'Sourcing + Répertoire' : item.sourceBanque, associeLe: new Date().toISOString(), associePar: userCourant } : item);
    await updateDB({ ...db, fournisseurs: nextSuppliers });
    audit('Banque fournisseurs', 'Association au répertoire', seed.code, 'categorieBanque', categoryOf(seed), 'Confirmé');
    toast(`${seed.nom} associé au répertoire fournisseurs.`);
  };

  const tabs = ['Informations', 'Produits', 'Contacts', 'Demandes sourcing', 'Historique'];
  return (
    <>
      <Topbar titre="Fiche fournisseur" />
      <div className="sourcing-shell supplier-profile-shell">
        <div className="source-page-heading">
          <div><p>Dashboard Fournisseurs / Fiche fournisseur</p><h1>Fiche fournisseur · {isConfirmed ? 'répertoire client confirmé' : 'collecté par le sourcing'}</h1></div>
          <div className="source-heading-actions"><button className="source-secondary-button" onClick={() => { window.location.hash = 'fournisseurs'; }}><ArrowLeft size={16} /> Retour</button><button className="source-primary-button" onClick={() => setShowEdit(true)}><Pencil size={15} /> Modifier la fiche</button></div>
        </div>

        <section className="source-card supplier-hero">
          <div className="supplier-avatar">{String(seed.nom || 'F')[0].toUpperCase()}</div>
          <div className="supplier-hero-main"><h2>{seed.nom || 'Fournisseur sans nom'}</h2><p>{seed.codeFournisseur || (isConfirmed ? seed.code : 'À générer')} · {isConfirmed ? 'Fournisseur associé à un client confirmé' : 'Fournisseur non encore répertorié'}</p><span className={`source-status ${isConfirmed ? 'is-success' : 'is-warning'}`}>{sourceLabel}</span></div>
          <div className="supplier-hero-status"><span className={`source-status ${isConfirmed ? 'is-success' : 'is-warning'}`}>● {statusLabel}</span><small>Dernière mise à jour : {new Date(seed.updatedAt || seed.confirmeLe || seed.ts || Date.now()).toLocaleDateString('fr-FR')}</small></div>
        </section>

        <nav className="source-card supplier-profile-tabs">{tabs.map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>)}</nav>

        {tab === 'Informations' && <div className="supplier-info-grid">
          <section className="source-card supplier-info-card"><h2>Informations société</h2><div className="supplier-definition-grid"><div><span>Nom de société</span><strong>{seed.nom || '—'}</strong></div><div><span>Pays</span><strong>{seed.pays || '—'}</strong></div><div><span>Ville</span><strong>{seed.ville || '—'}</strong></div><div className="wide"><span>Adresse</span><strong>{seed.adresse || '—'}</strong></div><div><span>Catégorie produits</span><strong>{unique(products.map(item => item.categorie).filter(Boolean)).join(' · ') || seed.produitsFournis || '—'}</strong></div><div><span>Site web</span><strong>{seed.siteWeb ? <a href={seed.siteWeb} target="_blank" rel="noreferrer">{seed.siteWeb} <ExternalLink size={12} /></a> : '—'}</strong></div><div><span>Email général</span><strong>{seed.email || '—'}</strong></div><div><span>Statut fournisseur</span><strong>{statusLabel}</strong></div></div></section>
          <section className="source-card supplier-info-card"><h2>Origine et rattachement</h2><div className="supplier-definition-stack"><div><span>Source de la fiche</span><strong>{sourceLabel}</strong></div><div><span>Client confirmé</span><strong>{primaryClient ? `${primaryClient.nom || primaryClient.code} · ${primaryClient.code}` : 'Non associé'}</strong></div><div><span>Code(s) sourcing associé(s)</span><strong>{sourcings.map(item => item.code).join(' · ') || '—'}</strong></div></div><div className="source-directory-note">Le lien est établi automatiquement à partir du fournisseur confirmé et des demandes sourcing.</div></section>
          <section className="source-card supplier-info-card supplier-products-preview"><div className="source-card-title-row"><h2>Produits fournisseurs</h2><button onClick={() => setTab('Produits')}>Voir tous les produits →</button></div><table><thead><tr><th>Catégorie</th><th>Produit / Article</th><th>Origine</th><th>Qualité</th></tr></thead><tbody>{products.slice(0, 4).map((item, index) => <tr key={`${item.nom}-${index}`}><td>{item.categorie || '—'}</td><td>{item.nom}</td><td>{item.origine || seed.pays || '—'}</td><td>{item.qualite || '—'}</td></tr>)}{!products.length && <tr><td colSpan="4">Aucun produit renseigné.</td></tr>}</tbody></table><small>{products.length} produit{products.length > 1 ? 's' : ''} rattaché{products.length > 1 ? 's' : ''}</small></section>
          <section className="source-card supplier-info-card supplier-contact-card"><h2>Contact principal</h2><div className="supplier-contact-head"><span>{primaryContact[0]?.toUpperCase() || 'C'}</span><div><strong>{primaryContact}</strong><small>Commercial export · Principal</small></div></div><div className="supplier-definition-grid"><div><span>Email direct</span><strong>{seed.email || '—'}</strong></div><div><span>Langue</span><strong>{seed.langue || 'Chinois, anglais'}</strong></div><div><span>Téléphone</span><strong>{seed.whatsapp || seed.telephone || '—'}</strong></div><div><span>WeChat</span><strong>{seed.wechat || '—'}</strong></div></div><button className="source-link" onClick={() => setShowEdit(true)}><Plus size={14} /> Ajouter un contact</button></section>
        </div>}

        {tab === 'Produits' && <section className="source-card supplier-tab-content"><h2>Produits fournisseurs</h2><div className="source-table-wrap"><table className="source-table"><thead><tr><th>Produit</th><th>Catégorie</th><th>Origine</th><th>Qualité / spécifications</th></tr></thead><tbody>{products.map((item, index) => <tr key={`${item.nom}-${index}`}><td><Package size={15} /> {item.nom}</td><td>{item.categorie || '—'}</td><td>{item.origine || seed.pays || '—'}</td><td>{item.qualite || '—'}</td></tr>)}</tbody></table></div></section>}
        {tab === 'Contacts' && <section className="source-card supplier-tab-content"><h2>Contacts</h2><div className="supplier-contact-list"><article><UserRound /><div><strong>{primaryContact}</strong><p>{seed.contact || 'Contact principal'}</p></div></article><article><Mail /><div><strong>{seed.email || 'Email à compléter'}</strong><p>Email direct</p></div></article><article><Phone /><div><strong>{seed.whatsapp || seed.telephone || 'Téléphone à compléter'}</strong><p>WhatsApp / téléphone</p></div></article><article><MapPin /><div><strong>{[seed.ville, seed.pays].filter(Boolean).join(', ') || 'Adresse à compléter'}</strong><p>Localisation</p></div></article></div></section>}
        {tab === 'Demandes sourcing' && <section className="source-card supplier-tab-content"><h2>Demandes sourcing associées</h2><div className="source-table-wrap"><table className="source-table"><thead><tr><th>Code sourcing</th><th>Demande</th><th>Client</th><th>Produits</th><th>Statut</th><th></th></tr></thead><tbody>{sourcings.map(item => { const demande = demandes.find(row => row.code === item.demande); const client = clients.find(row => row.code === demande?.client); return <tr key={item.code}><td><strong>{item.code}</strong></td><td>{item.demande || '—'}</td><td>{client?.nom || demande?.client || '—'}</td><td>{item.produits || '—'}</td><td><span className={`source-status ${item.statut === 'Validé' ? 'is-success' : 'is-info'}`}>{item.statut || 'À traiter'}</span></td><td><button className="source-primary-button small" onClick={() => { window.location.hash = `ficheSourcing:${item.code}`; }}>Ouvrir →</button></td></tr>; })}{!sourcings.length && <tr><td colSpan="6">Aucune demande sourcing associée.</td></tr>}</tbody></table></div></section>}
        {tab === 'Historique' && <section className="source-card supplier-tab-content"><h2>Historique complet</h2><div className="source-timeline">{history.map((item, index) => <article key={`${item.ts}-${index}`}><span /><div><strong>{item.date} {item.heure} · {item.utilisateur}</strong><p>{item.action} — {item.champ}: {item.avant} → {item.apres}</p></div></article>)}{!history.length && <p>Aucun historique disponible.</p>}</div></section>}

        <footer className="source-form-footer"><span>Mis à jour par {seed.misAJourPar || seed.par || userCourant || 'Sourcing'}</span><div>{isConfirmed ? <button className="source-secondary-button" onClick={() => setTab('Historique')}>Historique complet</button> : <button className="source-secondary-button" onClick={associate}><Building2 size={15} /> Associer au répertoire</button>}{sourcings[0] ? <button className="source-primary-button" onClick={() => { window.location.hash = `ficheSourcing:${sourcings[0].code}`; }}>Ouvrir sourcing →</button> : !isConfirmed && <button className="source-primary-button" onClick={associate}><Check size={15} /> Créer la fiche →</button>}</div></footer>
      </div>
      {showEdit && <ModuleForm moduleId="fournisseurs" recordCode={seed.code} onClose={() => setShowEdit(false)} />}
    </>
  );
}

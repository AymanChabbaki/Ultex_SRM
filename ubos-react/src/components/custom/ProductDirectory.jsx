import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Topbar from '../layout/Topbar';
import { useDB } from '../../context/DBContext';
import './SupplierProfile360.css';
import './ProductProfile360.css';

const codeDigits = value => String(value || '').replace(/\D/g, '');
const csv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
const matchesProduct = (line, product) => [line.produit, line.produitPermanent, line.produitPermanentCode, line.codeProduit].includes(product.code)
  || (product.designation && String(line.nomProduit || line.designation || '').trim().toLowerCase() === String(product.designation).trim().toLowerCase());

export default function ProductDirectory() {
  const { db } = useDB();
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [chapter, setChapter] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState('');
  const [bought, setBought] = useState('');
  const orders = db.commandes || [];
  const products = useMemo(() => db.produits || [], [db.produits]);
  const sections = useMemo(() => [...new Set(products.map(item => item.sectionHs || item.section || 'Sans section'))].sort(), [products]);
  const chapters = [...new Set(products.filter(item => !section || (item.sectionHs || item.section || 'Sans section') === section).map(item => codeDigits(item.hsCode).slice(0, 2)).filter(Boolean))].sort();
  const positions = [...new Set(products.filter(item => !chapter || codeDigits(item.hsCode).startsWith(chapter)).map(item => codeDigits(item.hsCode).slice(0, 4)).filter(Boolean))].sort();
  const filtered = products.filter(item => {
    const code = codeDigits(item.hsCode);
    const hasPurchase = orders.some(order => (order.lignes || []).some(line => line.produit === item.code || line.produitPermanent === item.code));
    return (!section || (item.sectionHs || item.section || 'Sans section') === section)
      && (!chapter || code.startsWith(chapter)) && (!position || code.startsWith(position))
      && (!status || (item.statutClassement || 'Provisoire') === status)
      && (!bought || (bought === 'yes') === hasPurchase)
      && `${item.code} ${item.designation} ${item.nom} ${item.motsCles} ${code}`.toLowerCase().includes(search.toLowerCase());
  });
  const exportAudience = () => {
    const validated = filtered.filter(product => product.statutClassement === 'Validé');
    if (!validated.length) { window.alert('Aucun produit au classement validé dans cette sélection.'); return; }
    const audience = new Map();
    const add = (product, clientCode, relation, date) => {
      if (!clientCode) return;
      const key = `${clientCode}:${product.code}`;
      const previous = audience.get(key);
      if (!previous || relation === 'Acheté' || (previous.relation !== 'Acheté' && String(date || '') > String(previous.date || ''))) {
        audience.set(key, { product, clientCode, relation, date });
      }
    };
    validated.forEach(product => {
      orders.filter(order => (order.lignes || []).some(line => matchesProduct(line, product))).forEach(order => add(product, order.client, 'Acheté', order.dateConfirmation || order.dateCommande || order.ts));
      (db.demandeLignes || []).filter(line => matchesProduct(line, product)).forEach(line => {
        const demand = (db.demandes || []).find(item => item.code === line.demande);
        if (demand) add(product, demand.client, 'Demandé', demand.dateDemande || demand.ts);
      });
    });
    const rows = [...audience.values()].map(({ product, clientCode, relation, date }) => {
      const client = (db.clients || []).find(item => item.code === clientCode) || {};
      return [clientCode, client.nom, client.ville, client.secteur, client.telephone, client.email, product.code, product.designation, relation, date];
    });
    const header = ['Code client', 'Nom', 'Ville', 'Secteur', 'Téléphone', 'E-mail', 'Code produit', 'Produit', 'Relation', 'Dernière date'];
    const body = [header, ...rows].map(row => row.map(csv).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', body], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'audience-produits-ultex.csv'; link.click(); URL.revokeObjectURL(url);
  };
  return <><Topbar titre="Produits" /><div className="sp-shell"><div className="sp-heading"><div><h1>Référentiel Produits</h1><p>Classement, fournisseurs et historique d’achat des produits permanents.</p></div><div><button className="sp-secondary" onClick={exportAudience}>Exporter l’audience CSV</button><button className="sp-primary" onClick={() => { window.location.hash = 'ficheProduit:nouveau'; }}>+ Créer un produit</button></div></div><section className="sp-card"><div className="sp-directory-filters"><label><Search size={16} /><input placeholder="Rechercher nom, code PRD, mot-clé ou HS…" value={search} onChange={event => setSearch(event.target.value)} /></label><select value={section} onChange={event => { setSection(event.target.value); setChapter(''); setPosition(''); }}><option value="">Toutes les sections</option>{sections.map(value => <option key={value}>{value}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Tous les classements</option><option>Provisoire</option><option>Validé</option></select><select value={bought} onChange={event => setBought(event.target.value)}><option value="">Achetés et non achetés</option><option value="yes">Déjà achetés</option><option value="no">Jamais achetés</option></select></div><div className="sp-directory-grid"><aside><strong>Section</strong>{sections.map(value => <button key={value} className={section === value ? 'active' : ''} onClick={() => { setSection(section === value ? '' : value); setChapter(''); setPosition(''); }}>{value}<span>{products.filter(item => (item.sectionHs || item.section || 'Sans section') === value).length}</span></button>)}{section && <><strong>Chapitre</strong>{chapters.map(value => <button key={value} className={chapter === value ? 'active' : ''} onClick={() => { setChapter(chapter === value ? '' : value); setPosition(''); }}>{value}</button>)}</>}{chapter && <><strong>Position</strong>{positions.map(value => <button key={value} className={position === value ? 'active' : ''} onClick={() => setPosition(position === value ? '' : value)}>{value}</button>)}</>}</aside><div className="sp-table-wrap"><table><thead><tr><th>Produit</th><th>Code national</th><th>Section › chapitre › position</th><th>Clients acheteurs</th><th>Classement</th><th></th></tr></thead><tbody>{filtered.map(product => { const hs = codeDigits(product.hsCode); const orderCodes = orders.filter(order => (order.lignes || []).some(line => line.produit === product.code || line.produitPermanent === product.code)); return <tr key={product.code}><td><strong>{product.designation || product.nom || product.code}</strong><br /><small>{product.code}</small></td><td>{product.hsCode || '—'}</td><td>{product.sectionHs || product.section || '—'} › {hs.slice(0, 2) || '—'} › {hs.slice(0, 4) || '—'}</td><td>{new Set(orderCodes.map(item => item.client)).size}</td><td><span className={`sp-pill ${product.statutClassement === 'Validé' ? 'is-valid' : ''}`}>{product.statutClassement || 'Provisoire'}</span></td><td><a href={`#ficheProduit:${product.code}`}>Ouvrir →</a></td></tr>; })}{!filtered.length && <tr><td colSpan="6">Aucun produit correspondant.</td></tr>}</tbody></table></div></div><small>{filtered.length} produit(s) affiché(s)</small></section></div></>;
}

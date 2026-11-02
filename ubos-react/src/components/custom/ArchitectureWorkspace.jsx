import React, { useMemo, useState } from 'react';
import Topbar from '../layout/Topbar';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import './ArchitectureWorkspace.css';
const sources = [['clients', 'Client', 'ficheClient'], ['fournisseurs', 'Fournisseur de produits', 'ficheFournisseur'], ['partenaires', 'Partenaire logistique', 'fichePartenaire']];

export default function ArchitectureWorkspace() {
  const { db } = useDB();
  const { moduleVisible } = useAuth();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const people = useMemo(() => {
    const result = new Map();
    sources.filter(([collection]) => moduleVisible(collection)).forEach(([collection, roleName, route]) => (db[collection] || []).forEach(record => {
      // Only an explicit shared identity can join records. Names and phone numbers
      // are not sufficient evidence to merge two legal entities.
      const key = record.tiersId || `${collection}:${record.code}`;
      const current = result.get(key) || { key, nom: record.nom || record.raisonSociale || record.code, pays: record.pays || '', ville: record.ville || '', telephone: record.telephone || record.whatsapp || '', roles: [], links: [] };
      current.roles = [...new Set([...current.roles, roleName, ...(record.rolesTiers || [])])];
      current.links.push({ label: roleName, href: `#${route}:${record.code}`, code: record.code });
      result.set(key, current);
    }));
    return [...result.values()];
  }, [db, moduleVisible]);
  const filtered = people.filter(item => (!role || item.roles.includes(role)) && (!location || (location === 'Maroc' ? /^(maroc|morocco|ma)$/i.test(item.pays) : item.pays && !/^(maroc|morocco|ma)$/i.test(item.pays))) && `${item.nom} ${item.telephone} ${item.ville} ${item.links.map(link => link.code).join(' ')}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  const modules = [['demandes', 'Demandes', 'Qualifier les besoins et suivre les échanges'], ['commandes', 'Commandes', 'Retrouver les engagements commerciaux'], ['arrivages', 'Arrivages & LIMEX', 'Préparer et suivre les opérations'], ['paiements', 'Paiements', 'Planifier les échéances et règlements'], ['documents', 'Documents', 'Retrouver les pièces liées aux profils'], ['taches', 'Tâches & décisions', 'Coordonner les responsables et les actions']];
  return <><Topbar titre="Espace CRM" /><div className="architecture-workspace"><header><div><span className="aw-eyebrow">ULTEX · ESPACE DE TRAVAIL</span><h1>Les profils au cœur de vos opérations</h1><p>Retrouvez vos interlocuteurs, vos produits et vos services depuis un espace commun.</p></div><span className="aw-badge">Référentiels & opérations</span></header><div className="aw-pillars"><a href="#espaceCrm" className="active"><span>01 / TIERS</span><h2>Vos relations professionnelles</h2><p>Clients · fournisseurs · partenaires · prestataires</p><strong>{people.length} profils accessibles →</strong></a>{moduleVisible('produits') && <a href="#produits"><span>02 / PRODUITS</span><h2>Produits & spécifications</h2><p>Classement ADII, fournisseurs, offres et caractéristiques.</p><strong>Ouvrir le catalogue →</strong></a>}{moduleVisible('servicesCatalogue') && <a href="#servicesCatalogue"><span>03 / SERVICES</span><h2>Services & prestations</h2><p>Logistique, finance, digital et prestations du quotidien.</p><strong>Ouvrir le catalogue →</strong></a>}</div><section className="aw-directory"><div className="aw-section-heading"><div><h2>Annuaire des profils</h2><p>Chaque rôle ouvre sa fiche métier et les opérations associées.</p></div><span>{filtered.length} résultats</span></div><div className="aw-filters"><input aria-label="Rechercher un tiers" placeholder="Nom, code, téléphone ou ville…" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Rôle" value={role} onChange={event => setRole(event.target.value)}><option value="">Tous les rôles</option>{['Client', 'Fournisseur de produits', 'Partenaire logistique', 'Prestataire de service'].map(item => <option key={item}>{item}</option>)}</select><select aria-label="Localisation" value={location} onChange={event => setLocation(event.target.value)}><option value="">Toutes les localisations</option><option>Maroc</option><option>International</option></select></div><div className="aw-table"><table><thead><tr><th>Identité</th><th>Rôles</th><th>Localisation</th><th>Contact</th><th>Profils liés</th></tr></thead><tbody>{filtered.slice(0, 100).map(item => <tr key={item.key}><td><strong>{item.nom}</strong><small>{item.links.map(link => link.code).join(' · ')}</small></td><td>{item.roles.map(value => <span className="aw-role" key={value}>{value}</span>)}</td><td>{[item.ville, item.pays].filter(Boolean).join(', ') || 'À compléter'}</td><td>{item.telephone || '—'}</td><td>{item.links.map(link => <a key={link.href} href={link.href}>{link.label} ↗</a>)}</td></tr>)}{!filtered.length && <tr><td colSpan="5">Aucun profil correspondant aux filtres.</td></tr>}</tbody></table></div>{filtered.length > 100 && <p>100 premiers résultats affichés. Affinez la recherche pour retrouver un profil.</p>}</section><section><div className="aw-section-heading"><h2>Vos opérations</h2><span>Des actions reliées aux profils</span></div><div className="aw-operations">{modules.filter(([id]) => moduleVisible(id)).map(([id, title, description]) => <a key={id} href={`#${id}`}><h3>{title} ↗</h3><p>{description}</p></a>)}</div></section></div></>;
}

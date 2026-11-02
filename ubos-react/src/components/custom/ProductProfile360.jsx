import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import Topbar from '../layout/Topbar';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { searchAdiiNomenclature } from '../../services/api';
import { categorieDepuisFichier, lireFichierDataUrl } from '../../utils/fileData';
import './SupplierProfile360.css';
import './ProductProfile360.css';

const tabs = ['Identification & classement', 'Technique', 'Photos & vidéos', 'Fournisseurs & offres', 'Douane & réglementation', 'Emballage & logistique', 'Marketing', 'Clients ayant acheté', 'Commandes', 'Demandes', 'Dossiers LIMEX', 'Pièces jointes', 'Historique'];
const fields = {
  'Identification & classement': [['Nom du produit', 'designation'], ['Explication du produit', 'explication', 'textarea'], ['Code national HS (10 chiffres)', 'hsCode', 'readonly'], ['Libellé officiel ADII', 'libelleAdii', 'readonly'], ['Section officielle', 'sectionHs', 'readonly'], ['Chapitre officiel', 'chapitreHs', 'readonly'], ['Position officielle', 'positionHs', 'readonly'], ['Sous-position officielle', 'sousPositionHs', 'readonly'], ['Nom commercial / mots-clés', 'motsCles'], ['Marque / modèle', 'modele'], ['État', 'etatProduit', ['Neuf', 'Occasion']], ['Destination', 'usageAchat', ['Revente', 'Usage propre']], ['Secteurs d’utilisation', 'secteursUtilisation']],
  'Technique': [['Dimensions', 'dimensions'], ['Poids unitaire (kg)', 'poids', 'number'], ['Matière / composition', 'composition'], ['Puissance', 'puissance'], ['Tension', 'tension'], ['Caractéristiques techniques', 'caracteristiques', 'textarea'], ['URL fiche technique', 'ficheTechniqueUrl']],
  'Douane & réglementation': [['DI (%)', 'di', 'number'], ['TVA (%)', 'tva', 'number'], ['Régime à l’import', 'regimeImport'], ['Organisme', 'organisme'], ['Normes', 'normes'], ['Certificats exigés', 'certificatsRequis'], ['Exigences réglementaires', 'remarque', 'textarea']],
  'Emballage & logistique': [['Emballage unitaire', 'emballageUnitaire'], ['Dimensions emballées', 'dimensionsEmballees'], ['Poids emballé (kg)', 'poidsEmballe', 'number'], ['Volume unitaire (m³)', 'cbm', 'number'], ['Unités par carton', 'unitesCarton', 'number'], ['Gerbable', 'gerbable', ['Oui', 'Non']], ['Fragile', 'fragile', ['Oui', 'Non']]],
  'Marketing': [['Catégorie marketing (section ADII)', 'categorieMarketing', 'readonly'], ['Secteurs cibles', 'secteursCibles'], ['Mots-clés publicitaires', 'motsClesMarketing'], ['Visuels publicitaires (URL)', 'visuelsMarketing']],
};
const blankOffer = { fournisseur: '', referenceFournisseur: '', prix: '', devise: 'USD', moq: '', delaiProduction: '', incoterm: 'EXW', lieuIncoterm: '', source: '', date: '', prefere: false };
const digits = value => String(value || '').replace(/\D/g, '');
const uniq = values => [...new Set(values.filter(Boolean))];
const date = value => value ? new Date(value).toLocaleDateString('fr-FR') : '—';
const val = value => value === undefined || value === null || value === '' ? '—' : String(value);

export default function ProductProfile360({ codeProp, supplierCode }) {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { userCourant, estDirection } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState(tabs[0]);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(codeProp === 'nouveau');
  const [offerDraft, setOfferDraft] = useState(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [justification, setJustification] = useState('');
  const [adilQuery, setAdilQuery] = useState('');
  const [adilMatches, setAdilMatches] = useState([]);
  const [adilError, setAdilError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const existing = (db.produits || []).find(item => item.code === codeProp);
  const isNew = codeProp === 'nouveau';
  const product = useMemo(() => existing || (isNew ? { code: '', designation: '', explication: '', statutClassement: 'Provisoire', offresFournisseurs: [], medias: [], fournisseur: supplierCode || '' } : null), [existing, isNew, supplierCode]);
  useEffect(() => {
    if (!editing || tab !== 'Identification & classement' || adilQuery.trim().length < 2) { setAdilMatches([]); setAdilError(''); return; }
    let active = true;
    const timer = setTimeout(() => searchAdiiNomenclature(adilQuery.trim()).then(items => { if (active) { setAdilMatches(items); setAdilError(''); } }).catch(error => { if (active) { setAdilMatches([]); setAdilError(error.message); } }), 300);
    return () => { active = false; clearTimeout(timer); };
  }, [adilQuery, editing, tab]);
  const related = useMemo(() => {
    if (!product) return { commands: [], demands: [], arrivals: [], clients: [], docs: [], history: [] };
    const matches = line => [line.produit, line.produitPermanent, line.produitPermanentCode, line.codeProduit].includes(product.code) || (product.designation && String(line.nomProduit || line.designation || '').trim().toLowerCase() === product.designation.trim().toLowerCase());
    const commands = (db.commandes || []).filter(item => (item.lignes || []).some(matches));
    const demands = (db.demandes || []).filter(item => item.produit === product.code || (db.demandeLignes || []).some(line => line.demande === item.code && matches(line)));
    const arrivals = (db.arrivages || []).filter(item => (item.commandes || []).some(code => commands.some(order => order.code === code)));
    const clients = uniq([...commands.map(item => item.client), ...demands.map(item => item.client)]).map(code => (db.clients || []).find(item => item.code === code)).filter(Boolean);
    const docs = (db.documents || []).filter(item => item.produit === product.code || commands.some(order => order.code === item.commande) || demands.some(row => row.code === item.demande));
    const history = (db.audit || []).filter(item => item.objet === product.code || item.ref === product.code).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
    return { commands, demands, arrivals, clients, docs, history };
  }, [db, product]);
  if (!product) return <><Topbar titre="Fiche produit" /><div className="sp-shell"><section className="sp-card">Produit introuvable. <a href="#produits">Retour au référentiel</a></section></div></>;
  const hs = digits(product.hsCode);
  const path = [product.sectionHs || 'Section à vérifier', product.chapitreHs || hs.slice(0, 2), product.positionHs || hs.slice(0, 4), product.sousPositionHs || hs.slice(0, 6), hs].filter(Boolean).join(' › ');
  const offers = product.offresFournisseurs || [];
  const startEdit = () => { setDraft({ ...product }); setEditing(true); };
  const change = (key, value) => setDraft(current => ({ ...(current || product), [key]: value }));
  const chooseAdii = item => {
    const code = digits(item.code);
    setDraft(current => ({ ...(current || product), hsCode: code, libelleAdii: item.libelle, sectionHs: `${item.section_code} — ${item.section}`, chapitreHs: `${item.chapitre_code} — ${item.chapitre}`, positionHs: code.slice(0, 4), sousPositionHs: code.slice(0, 6), categorieMarketing: item.section, adilVerified: true, adilSource: 'Workflow · nomenclature ADII' }));
    setAdilQuery(''); setAdilMatches([]);
  };
  const save = async () => {
    const form = draft || product;
    if (!String(form.designation || '').trim() || !String(form.explication || '').trim()) { toast('Nom et explication du produit sont obligatoires.'); return; }
    const newHs = digits(form.hsCode);
    if ((!existing || newHs !== digits(existing.hsCode)) && (newHs.length !== 10 || !form.adilVerified)) { toast('Sélectionnez un code national officiel dans la recherche ADII avant d’enregistrer.'); return; }
    if (existing?.statutClassement === 'Validé' && newHs !== digits(existing.hsCode)) {
      if (!estDirection()) { toast('Le classement validé ne peut être modifié que par la Direction.'); return; }
      if (!justification.trim()) { toast('Une justification est requise pour changer un classement validé.'); return; }
    }
    const code = existing?.code || genCode('PRD');
    const now = new Date().toISOString();
    const next = { ...form, code, hsCode: newHs, statutClassement: existing?.statutClassement || 'Provisoire', updatedAt: now, misAJourPar: userCourant, creeLe: existing?.creeLe || now, offresFournisseurs: form.offresFournisseurs || [], medias: form.medias || [] };
    if (supplierCode && !next.offresFournisseurs.some(item => item.fournisseur === supplierCode)) next.offresFournisseurs.push({ ...blankOffer, fournisseur: supplierCode, date: now.slice(0, 10) });
    const supplier = (db.fournisseurs || []).find(item => item.code === supplierCode);
    setBusy(true);
    const ok = await updateDB({ ...db, produits: existing ? db.produits.map(item => item.code === code ? next : item) : [...(db.produits || []), next], fournisseurs: supplier ? (db.fournisseurs || []).map(item => item.code === supplierCode ? { ...item, produitsCodes: uniq([...(item.produitsCodes || []), code]) } : item) : db.fournisseurs });
    setBusy(false);
    if (ok) {
      Object.keys(next).filter(key => JSON.stringify(existing?.[key]) !== JSON.stringify(next[key]) && !['updatedAt', 'misAJourPar'].includes(key)).forEach(key => audit('Profil produit', existing ? 'Modification' : 'Création', code, key, existing?.[key] ?? '', next[key] ?? ''));
      if (existing?.statutClassement === 'Validé' && newHs !== digits(existing.hsCode)) notifier('Direction', `Classement validé modifié pour ${next.designation} : ${existing.hsCode} → ${newHs}. Justification : ${justification}`, `#ficheProduit:${code}`);
      setEditing(false); setJustification(''); toast('Fiche produit enregistrée.'); if (isNew) window.location.hash = `ficheProduit:${code}`;
    }
  };
  const validateClassification = async () => {
    if (!estDirection()) { toast('Validation réservée à la Direction.'); return; }
    if (hs.length !== 10 || !product.adilVerified || !product.libelleAdii || !product.explication) { toast('Sélectionnez un code ADII officiel et complétez l’explication avant validation.'); return; }
    const ok = await updateDB({ ...db, produits: db.produits.map(item => item.code === product.code ? { ...item, statutClassement: 'Validé', validePar: userCourant, valideLe: new Date().toISOString() } : item) });
    if (ok) { audit('Profil produit', 'Classement validé', product.code, 'statutClassement', 'Provisoire', 'Validé'); toast('Classement validé.'); }
  };
  const saveOffer = async () => {
    if (!offerDraft.fournisseur) { toast('Sélectionnez un fournisseur.'); return; }
    const id = offerDraft.id || `${product.code}-offer-${Date.now()}`;
    const nextOffers = offers.map(item => offerDraft.prefere ? { ...item, prefere: false } : item).filter(item => item.id !== id).concat({ ...offerDraft, id, date: offerDraft.date || new Date().toISOString().slice(0, 10) });
    const supplier = (db.fournisseurs || []).find(item => item.code === offerDraft.fournisseur);
    const ok = await updateDB({ ...db, produits: db.produits.map(item => item.code === product.code ? { ...item, offresFournisseurs: nextOffers } : item), fournisseurs: supplier ? db.fournisseurs.map(item => item.code === supplier.code ? { ...item, produitsCodes: uniq([...(item.produitsCodes || []), product.code]) } : item) : db.fournisseurs });
    if (ok) { audit('Profil produit', 'Offre fournisseur', product.code, 'fournisseur', '', supplier?.nom || offerDraft.fournisseur); setOfferDraft(null); toast('Offre enregistrée.'); }
  };
  const addMedia = async () => {
    if (!/^https?:\/\//i.test(mediaUrl)) { toast('Indiquez une URL de photo ou vidéo valide.'); return; }
    const media = [...(product.medias || []), { url: mediaUrl, ajoutLe: new Date().toISOString(), par: userCourant }];
    const ok = await updateDB({ ...db, produits: db.produits.map(item => item.code === product.code ? { ...item, medias: media } : item) });
    if (ok) { audit('Profil produit', 'Visuel ajouté', product.code, 'media', '', mediaUrl); setMediaUrl(''); }
  };
  const uploadMedia = async event => {
    const files = [...(event.target.files || [])]; event.target.value = '';
    if (!files.length || isNew) return;
    if (files.some(file => file.size > 10 * 1024 * 1024)) { toast('Chaque visuel doit être inférieur à 10 Mo.'); return; }
    setUploading(true);
    try {
      const added = await Promise.all(files.map(async file => ({ url: await lireFichierDataUrl(file), nom: file.name, type: file.type, ajoutLe: new Date().toISOString(), par: userCourant })));
      const ok = await updateDB({ ...db, produits: db.produits.map(item => item.code === product.code ? { ...item, medias: [...(item.medias || []), ...added] } : item) });
      if (ok) { audit('Profil produit', 'Visuels ajoutés', product.code, 'medias', '', added.map(item => item.nom).join(', ')); toast(`${added.length} visuel(s) ajouté(s).`); }
    } catch (error) { toast(error.message || 'Ajout des visuels impossible.'); }
    finally { setUploading(false); }
  };
  const uploadDocuments = async event => {
    const files = [...(event.target.files || [])]; event.target.value = '';
    if (!files.length || isNew) return;
    if (files.some(file => file.size > 10 * 1024 * 1024)) { toast('Chaque fichier doit être inférieur à 10 Mo.'); return; }
    setUploading(true);
    try {
      const added = await Promise.all(files.map(async file => ({ code: genCode('DOC'), nom: file.name, type: categorieDepuisFichier(file), typeFichier: file.type || 'Fichier', fichier: await lireFichierDataUrl(file), taille: file.size, produit: product.code, statut: 'Reçu', version: 1, auteur: userCourant, dateAjout: new Date().toISOString(), ts: Date.now() })));
      const ok = await updateDB({ ...db, documents: [...added, ...(db.documents || [])] });
      if (ok) { added.forEach(item => audit('Profil produit', 'Document ajouté', product.code, 'document', '', item.nom)); toast(`${added.length} document(s) ajouté(s).`); }
    } catch (error) { toast(error.message || 'Ajout du document impossible.'); }
    finally { setUploading(false); }
  };
  const table = (heads, rows, empty) => <div className="sp-table-wrap"><table><thead><tr>{heads.map(value => <th key={value}>{value}</th>)}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={heads.length}>{empty}</td></tr>}</tbody></table></div>;

  return <><Topbar titre="Fiche produit" /><div className="sp-shell"><div className="sp-heading"><div><button className="sp-back" onClick={() => { window.location.hash = supplierCode ? `ficheFournisseur:${supplierCode}` : 'produits'; }}><ArrowLeft size={15} /> {supplierCode ? 'Fournisseur' : 'Référentiel Produits'}</button><h1>{product.designation || 'Nouveau produit'}</h1><p>{product.code || 'Code à créer'} · {path}</p></div><div><span className={`sp-pill ${product.statutClassement === 'Validé' ? 'is-valid' : ''}`}>{product.statutClassement || 'Provisoire'}</span><button className="sp-primary" onClick={startEdit}>{isNew ? 'Compléter la fiche' : 'Modifier la fiche'}</button>{product.statutClassement !== 'Validé' && !isNew && estDirection() && <button className="sp-secondary" onClick={validateClassification}>Valider le classement</button>}</div></div><nav className="sp-tabs">{tabs.map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => { setTab(name); setEditing(false); }}>{name}</button>)}</nav>
    {fields[tab] && <section className="sp-card"><div className="sp-title"><h2>{tab}</h2><button onClick={startEdit}>Modifier</button></div>{tab === 'Identification & classement' && <p className="sp-warning">La classification est provisoire jusqu’à validation. Vérifiez les libellés, droits et taxes avec la nomenclature ADII avant utilisation.</p>}<div className="sp-details">{fields[tab].map(([label, key]) => <div className="sp-detail" key={key}><span>{label}</span><strong>{val(product[key])}</strong></div>)}</div></section>}
    {tab === 'Photos & vidéos' && <section className="sp-card"><div className="sp-title"><h2>Photos & vidéos</h2><label className="sp-primary">{uploading ? 'Ajout en cours…' : '+ Téléverser des visuels'}<input type="file" accept="image/*,video/*" multiple hidden disabled={uploading || isNew} onChange={uploadMedia} /></label></div><div className="sp-catalogue">{(product.medias || []).map((item, index) => <article key={`${item.url}-${index}`}><div className="sp-catalogue-image">{item.type?.startsWith('video/') || /\.(mp4|webm)(\?|$)/i.test(item.url) ? <video controls src={item.url} /> : <img src={item.url} alt={product.designation} />}</div><a href={item.url} target="_blank" rel="noreferrer">Ouvrir le visuel</a><small>{date(item.ajoutLe)} · {item.par}</small></article>)}</div><div className="sp-media-add"><input placeholder="URL de la photo ou vidéo" value={mediaUrl} onChange={event => setMediaUrl(event.target.value)} /><button className="sp-primary" disabled={isNew} onClick={addMedia}><Plus size={15} /> Ajouter</button></div></section>}
    {tab === 'Fournisseurs & offres' && <section className="sp-card"><div className="sp-title"><h2>Fournisseurs & offres</h2><button onClick={() => setOfferDraft({ ...blankOffer })} disabled={isNew}><Plus size={15} /> Ajouter une offre</button></div>{table(['Fournisseur', 'Référence', 'Prix', 'MOQ', 'Délai', 'Incoterm', 'Date / source', 'Préféré', ''], offers.map(item => <tr key={item.id || item.fournisseur}><td><a href={`#ficheFournisseur:${item.fournisseur}`}>{(db.fournisseurs || []).find(row => row.code === item.fournisseur)?.nom || item.fournisseur}</a></td><td>{item.referenceFournisseur || '—'}</td><td>{item.prix ? `${item.prix} ${item.devise}` : '—'}</td><td>{item.moq || '—'}</td><td>{item.delaiProduction || '—'}</td><td>{item.incoterm || '—'} {item.lieuIncoterm || ''}</td><td>{date(item.date)} · {item.source || '—'}</td><td>{item.prefere ? 'Oui' : '—'}</td><td><button onClick={() => setOfferDraft({ ...item })}>Modifier</button></td></tr>), 'Aucune offre fournisseur enregistrée.')}</section>}
    {tab === 'Clients ayant acheté' && <section className="sp-card"><h2>Clients ayant acheté ou demandé</h2>{table(['Client', 'Ville', 'Relation', 'Quantité', 'Dernière référence'], related.clients.map(client => { const orders = related.commands.filter(item => item.client === client.code); const demand = related.demands.find(item => item.client === client.code); return <tr key={client.code}><td><a href={`#ficheClient:${client.code}`}>{client.nom || client.code}</a></td><td>{client.ville || '—'}</td><td>{orders.length ? 'Acheté' : 'Demandé'}</td><td>{orders.flatMap(item => item.lignes || []).filter(line => line.produit === product.code).reduce((sum, line) => sum + (Number(line.quantite) || 0), 0)}</td><td>{orders.at(-1)?.referenceMetier || demand?.code || '—'}</td></tr>; }), 'Aucun client lié.')}</section>}
    {tab === 'Commandes' && <section className="sp-card"><h2>Commandes liées</h2>{table(['Commande', 'Client', 'Date', 'Statut'], related.commands.map(item => <tr key={item.code}><td><a href={`#ficheCommande:${item.code}`}>{item.referenceMetier || item.code}</a></td><td>{item.client}</td><td>{date(item.dateConfirmation || item.ts)}</td><td>{item.statut || '—'}</td></tr>), 'Aucune commande liée.')}</section>}
    {tab === 'Demandes' && <section className="sp-card"><h2>Demandes liées</h2>{table(['Demande', 'Client', 'Date', 'Statut'], related.demands.map(item => <tr key={item.code}><td><a href={`#ficheDemande:${item.code}`}>{item.referenceMetier || item.code}</a></td><td>{item.client}</td><td>{date(item.ts)}</td><td>{item.statut || '—'}</td></tr>), 'Aucune demande liée.')}</section>}
    {tab === 'Dossiers LIMEX' && <section className="sp-card"><h2>Dossiers LIMEX / arrivages</h2>{table(['Arrivage', 'Code HS du produit', 'Statut'], related.arrivals.map(item => <tr key={item.code}><td><a href={`#ficheArrivage:${item.code}`}>{item.code}</a></td><td>{product.hsCode || 'À vérifier'}</td><td>{item.statut || '—'}</td></tr>), 'Aucun dossier LIMEX lié.')}</section>}
    {tab === 'Pièces jointes' && <section className="sp-card"><div className="sp-title"><h2>Pièces jointes</h2><label className="sp-primary">{uploading ? 'Ajout en cours…' : '+ Téléverser des fichiers'}<input type="file" multiple hidden disabled={uploading || isNew} onChange={uploadDocuments} /></label></div>{table(['Document', 'Type', 'Lié à', 'Expiration'], related.docs.map(item => <tr key={item.code}><td>{item.fichier ? <a href={item.fichier} download={item.nom}>{item.nom || item.code}</a> : <a href={`#ficheDocument:${item.code}`}>{item.nom || item.code}</a>}</td><td>{item.type || '—'}</td><td>{item.commande || item.demande || item.produit || '—'}</td><td>{date(item.dateExpiration)}</td></tr>), 'Aucun document lié.')}</section>}
    {tab === 'Historique' && <section className="sp-card"><h2>Historique</h2>{table(['Date', 'Utilisateur', 'Action', 'Champ', 'Avant', 'Après'], related.history.map((item, index) => <tr key={`${item.ts}-${index}`}><td>{item.date || date(item.ts)} {item.heure}</td><td>{item.utilisateur || 'Système'}</td><td>{item.action}</td><td>{item.champ}</td><td>{val(item.avant)}</td><td>{val(item.apres)}</td></tr>), 'Aucun changement enregistré.')}</section>}
  </div>
  {editing && <div className="sp-overlay"><div className="sp-dialog"><div className="sp-dialog-head"><h2>{isNew ? 'Nouveau produit' : `Modifier · ${tab}`}</h2><button onClick={() => setEditing(false)}>Fermer</button></div>{tab === 'Identification & classement' && <div className="sp-adii-search"><label>Rechercher dans la nomenclature ADII (code ou libellé)<input value={adilQuery} onChange={event => setAdilQuery(event.target.value)} placeholder="Code 10 chiffres ou mot-clé…" /></label>{adilError && <p className="sp-warning">{adilError}</p>}{adilMatches.length > 0 && <div>{adilMatches.map(item => <button key={item.code} onClick={() => chooseAdii(item)}><strong>{item.code}</strong> · {item.libelle}<small>{item.section} › {item.chapitre}</small></button>)}</div>}</div>}<div className="sp-fields">{(fields[tab] || fields['Identification & classement']).map(([label, key, type]) => <label key={key}>{label}{Array.isArray(type) ? <select value={draft?.[key] ?? product[key] ?? ''} onChange={event => change(key, event.target.value)}><option value="">Sélectionner</option>{type.map(option => <option key={option}>{option}</option>)}</select> : type === 'textarea' ? <textarea rows="4" value={draft?.[key] ?? product[key] ?? ''} onChange={event => change(key, event.target.value)} /> : <input type={type === 'readonly' ? 'text' : type || 'text'} readOnly={type === 'readonly'} value={draft?.[key] ?? product[key] ?? ''} onChange={event => change(key, event.target.value)} />}</label>)}</div>{existing?.statutClassement === 'Validé' && digits(draft?.hsCode) !== hs && <label className="sp-justification">Justification du changement de classement<textarea value={justification} onChange={event => setJustification(event.target.value)} /></label>}<button className="sp-primary" disabled={busy} onClick={save}><Save size={15} /> Enregistrer le produit</button></div></div>}
  {offerDraft && <div className="sp-overlay"><div className="sp-dialog"><div className="sp-dialog-head"><h2>Offre fournisseur</h2><button onClick={() => setOfferDraft(null)}>Fermer</button></div><div className="sp-fields"><label>Fournisseur<select value={offerDraft.fournisseur} onChange={event => setOfferDraft({ ...offerDraft, fournisseur: event.target.value })}><option value="">Sélectionner</option>{(db.fournisseurs || []).filter(item => !['Suspendu', 'Blacklisté'].includes(item.statut)).map(item => <option key={item.code} value={item.code}>{item.nom} · {item.codeFournisseur || item.code}</option>)}</select></label>{[['Référence fournisseur', 'referenceFournisseur'], ['Prix', 'prix', 'number'], ['MOQ', 'moq'], ['Délai de production', 'delaiProduction'], ['Lieu Incoterm', 'lieuIncoterm'], ['Source (proforma / devis)', 'source'], ['Date', 'date', 'date']].map(([label, key, type]) => <label key={key}>{label}<input type={type || 'text'} value={offerDraft[key] ?? ''} onChange={event => setOfferDraft({ ...offerDraft, [key]: event.target.value })} /></label>)}<label>Devise<select value={offerDraft.devise} onChange={event => setOfferDraft({ ...offerDraft, devise: event.target.value })}>{['USD', 'EUR', 'CNY', 'MAD'].map(value => <option key={value}>{value}</option>)}</select></label><label>Incoterm<select value={offerDraft.incoterm} onChange={event => setOfferDraft({ ...offerDraft, incoterm: event.target.value })}>{['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'].map(value => <option key={value}>{value}</option>)}</select></label></div><label className="sp-check"><input type="checkbox" checked={!!offerDraft.prefere} onChange={event => setOfferDraft({ ...offerDraft, prefere: event.target.checked })} /> Fournisseur préféré</label><button className="sp-primary" onClick={saveOffer}>Enregistrer l’offre</button></div></div>}
  </>;
}

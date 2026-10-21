import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Check, ChevronRight, ClipboardList, FileUp, Package, Plus, Save,
  Send, Truck, UploadCloud, X,
} from 'lucide-react';
import Topbar from '../layout/Topbar';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './SourcingWorkspace.css';

const today = () => new Date().toISOString().slice(0, 10);

const emptyProduct = (position = 0) => ({
  localId: `local-${Date.now()}-${position}`,
  nomProduit: '', categorie: '', quantite: '', unite: 'pièces', usage: '', etat: 'Neuf', exigences: '', photo: '',
  matiere: '', dimensions: '', poids: '', typePoids: 'Net', couleursModele: '', certificats: '', emballage: '',
  autresCaracteristiques: '', incoterm: 'EXW', portFob: '', paysFournisseur: '', paysOrigine: '', villeFournisseur: '',
  fournisseurCode: '', prixUnitaire: '', devise: 'USD', moq: '', delaiProduction: '',
});

function mapProduct(product, index) {
  return {
    ...emptyProduct(index),
    ...product,
    localId: product.localId || product.ultexProductId || product.code || `product-${index}`,
    crmLineCode: product.crmLineCode || product.code || '',
    nomProduit: product.nomProduit || product.name || product.designation || '',
    quantite: product.quantite ?? product.quantity ?? '',
    unite: product.unite || 'pièces',
    exigences: product.exigences || product.description || product.designationTechnique || '',
    photo: product.photo || product.productPhotoUrl || '',
    paysOrigine: product.paysOrigine || product.origine || '',
    paysFournisseur: product.paysFournisseur || product.provenance || '',
    villeFournisseur: product.villeFournisseur || product.supplierCity || '',
    prixUnitaire: product.prixUnitaire ?? product.negotiatedExwPrice ?? '',
    devise: product.devise || product.currency || 'USD',
  };
}

function readFiles(files) {
  return Promise.all(Array.from(files || []).map(file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: `${Date.now()}-${file.name}`, nom: file.name, taille: file.size, type: file.type, dataUrl: reader.result, ajouteLe: new Date().toISOString() });
    reader.readAsDataURL(file);
  })));
}

export default function SourcingProfile({ codeProp }) {
  const { db, updateDB, genCode, audit } = useDB();
  const { userCourant } = useAuth();
  const { toast } = useToast();
  const routeCode = codeProp || 'nouveau';

  const context = useMemo(() => {
    const sourcing = routeCode === 'nouveau' ? null : (db.sourcings || []).find(item => item.code === routeCode);
    const fallbackDemandeCode = routeCode.startsWith('demande-') ? routeCode.slice('demande-'.length) : '';
    const demande = (db.demandes || []).find(item => item.code === (sourcing?.demande || fallbackDemandeCode));
    const client = (db.clients || []).find(item => item.code === (sourcing?.client || demande?.client));
    const lines = (db.demandeLignes || []).filter(item => item.demande === demande?.code);
    return { sourcing, demande, client, lines };
  }, [db, routeCode]);

  const [step, setStep] = useState(1);
  const [activeProduct, setActiveProduct] = useState(0);
  const [clientCode, setClientCode] = useState('');
  const [responsable, setResponsable] = useState(userCourant || 'Sourcing');
  const [typeDemande, setTypeDemande] = useState('Sourcing (B)');
  const [status, setStatus] = useState('À traiter');
  const [products, setProducts] = useState([emptyProduct()]);
  const [sampleStatus, setSampleStatus] = useState('Non demandé');
  const [sampleDate, setSampleDate] = useState(today());
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingLink, setTrackingLink] = useState('');
  const [documents, setDocuments] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [exchangeText, setExchangeText] = useState('');
  const [nextAction, setNextAction] = useState('Poursuivre la recherche fournisseurs');
  const [nextDate, setNextDate] = useState('');

  useEffect(() => {
    const { sourcing, demande, client, lines } = context;
    setClientCode(sourcing?.client || demande?.client || client?.code || '');
    setResponsable(sourcing?.responsable || demande?.responsable || userCourant || 'Sourcing');
    setTypeDemande(sourcing?.typeDemande || demande?.typeDemande || 'Sourcing (B)');
    setStatus(sourcing?.statut || 'À traiter');
    const candidates = sourcing?.ficheProduits?.length ? sourcing.ficheProduits
      : sourcing?.detailsProduits?.length ? sourcing.detailsProduits : lines;
    setProducts(candidates?.length ? candidates.map(mapProduct) : [emptyProduct()]);
    setSampleStatus(sourcing?.statutEchantillon || 'Non demandé');
    setSampleDate(sourcing?.dateDemandeEchantillon || today());
    setCarrier(sourcing?.transporteurEchantillon || '');
    setTrackingNumber(sourcing?.numeroTracking || '');
    setTrackingLink(sourcing?.lienTracking || '');
    setDocuments(sourcing?.documentsSourcing || []);
    setExchanges(sourcing?.echangesFournisseurs || []);
    setNextAction(sourcing?.prochaineAction || 'Poursuivre la recherche fournisseurs');
    setNextDate(sourcing?.echeanceAction || '');
    setStep(Math.min(3, Math.max(1, Number(sourcing?.etapeActive || 1))));
    setActiveProduct(0);
  }, [context, userCourant]);

  const client = (db.clients || []).find(item => item.code === clientCode);
  const product = products[activeProduct] || products[0];
  const suppliers = db.fournisseurs || [];

  const updateProduct = (key, value) => setProducts(current => current.map((item, index) => index === activeProduct ? { ...item, [key]: value } : item));
  const selectSupplier = value => {
    const supplier = suppliers.find(item => item.code === value);
    setProducts(current => current.map((item, index) => index === activeProduct ? {
      ...item,
      fournisseurCode: value,
      paysFournisseur: supplier?.pays || item.paysFournisseur,
      paysOrigine: supplier?.pays || item.paysOrigine,
      villeFournisseur: supplier?.ville || item.villeFournisseur,
      prixUnitaire: supplier?.prixExw ?? item.prixUnitaire,
      devise: supplier?.devise || item.devise,
      moq: supplier?.moq || item.moq,
      delaiProduction: supplier?.delaiProduction || item.delaiProduction,
    } : item));
  };

  const addProduct = () => {
    setProducts(current => [...current, emptyProduct(current.length)]);
    setActiveProduct(products.length);
  };

  const removeProduct = index => {
    if (products.length === 1) return toast('Une demande doit contenir au moins un produit.');
    setProducts(current => current.filter((_, currentIndex) => currentIndex !== index));
    setActiveProduct(current => Math.max(0, Math.min(current, products.length - 2)));
  };

  const handleDocuments = async event => {
    const added = await readFiles(event.target.files);
    setDocuments(current => [...current, ...added]);
    event.target.value = '';
  };

  const addExchange = () => {
    if (!exchangeText.trim()) return;
    setExchanges(current => [{ id: `${Date.now()}`, texte: exchangeText.trim(), auteur: userCourant, date: new Date().toISOString() }, ...current]);
    setExchangeText('');
  };

  const validateCurrentStep = () => {
    if (step === 1 && !clientCode) return toast('Sélectionnez le client.'), false;
    if (step === 1 && products.some(item => !String(item.nomProduit || '').trim())) return toast('Renseignez le nom de chaque produit.'), false;
    return true;
  };

  const save = async ({ moveToStep } = {}) => {
    if (!validateCurrentStep()) return null;
    const existingSourcing = context.sourcing;
    const existingDemande = context.demande;
    const sourcingCode = existingSourcing?.code || genCode('SRC');
    const demandeCode = existingDemande?.code || genCode('DMD');
    const now = Date.now();
    const updatedDemande = {
      ...(existingDemande || {}),
      id: existingDemande?.id || demandeCode,
      code: demandeCode,
      referenceMetier: existingDemande?.referenceMetier || sourcingCode,
      client: clientCode,
      dateDemande: existingDemande?.dateDemande || today(),
      dateHeureReception: existingDemande?.dateHeureReception || new Date().toISOString(),
      responsable,
      responsableData: existingDemande?.responsableData || 'Data',
      typeDemande,
      source: existingDemande?.source || 'Saisie manuelle',
      canalReception: existingDemande?.canalReception || 'Saisie manuelle',
      statut: existingDemande?.statut || 'Nouvelle',
      objectifGeneral: products.map(item => item.nomProduit).filter(Boolean).join(' · '),
      ts: existingDemande?.ts || now,
    };

    const existingLines = (db.demandeLignes || []).filter(item => item.demande === demandeCode);
    const nextLines = products.map((item, index) => {
      const previous = existingLines.find(line => line.code === item.crmLineCode) || existingLines[index];
      const lineCode = previous?.code || genCode('DL');
      return {
        ...(previous || {}),
        id: previous?.id || lineCode,
        code: lineCode,
        demande: demandeCode,
        referenceMetier: previous?.referenceMetier || `${sourcingCode}-P${index + 1}`,
        nomProduit: item.nomProduit,
        designationTechnique: item.exigences || item.autresCaracteristiques,
        quantite: item.quantite,
        unite: item.unite,
        paysOrigine: item.paysOrigine,
        paysFournisseur: item.paysFournisseur,
        villeFournisseur: item.villeFournisseur,
        incoterm: item.incoterm,
        prixUnitaire: item.prixUnitaire,
        devise: item.devise,
        photo: item.photo,
        statut: previous?.statut || 'Brouillon',
        ts: previous?.ts || now,
      };
    });
    const savedProducts = products.map((item, index) => ({ ...item, crmLineCode: nextLines[index].code }));
    const selectedSuppliers = savedProducts.map(item => suppliers.find(supplier => supplier.code === item.fournisseurCode)).filter(Boolean);
    const primarySupplier = selectedSuppliers[0];
    const updatedSourcing = {
      ...(existingSourcing || {}),
      id: existingSourcing?.id || sourcingCode,
      code: sourcingCode,
      demande: demandeCode,
      client: clientCode,
      typeDemande,
      responsable,
      source: existingSourcing?.source || 'Saisie CRM',
      statut: status,
      produits: savedProducts.map(item => item.nomProduit).filter(Boolean).join(' · '),
      ficheProduits: savedProducts,
      fournisseur: primarySupplier?.nom || existingSourcing?.fournisseur || '',
      fournisseursPressentis: selectedSuppliers.map(item => item.nom).join(' · '),
      paysFournisseur: primarySupplier?.pays || savedProducts[0]?.paysFournisseur || '',
      prixFOB: savedProducts[0]?.prixUnitaire || existingSourcing?.prixFOB || '',
      devise: savedProducts[0]?.devise || existingSourcing?.devise || 'USD',
      moq: savedProducts[0]?.moq || existingSourcing?.moq || '',
      delai: savedProducts[0]?.delaiProduction || existingSourcing?.delai || '',
      statutEchantillon: sampleStatus,
      dateDemandeEchantillon: sampleDate,
      transporteurEchantillon: carrier,
      numeroTracking: trackingNumber,
      lienTracking: trackingLink,
      documentsSourcing: documents,
      echangesFournisseurs: exchanges,
      prochaineAction: nextAction,
      echeanceAction: nextDate,
      etapeActive: moveToStep || step,
      misAJourPar: userCourant,
      synchroniseLe: existingSourcing?.synchroniseLe || null,
      ts: existingSourcing?.ts || now,
      updatedAt: new Date().toISOString(),
    };

    const nextDemandes = existingDemande
      ? (db.demandes || []).map(item => item.code === demandeCode ? updatedDemande : item)
      : [updatedDemande, ...(db.demandes || [])];
    const retainedLines = (db.demandeLignes || []).filter(item => item.demande !== demandeCode);
    const nextSourcings = existingSourcing
      ? (db.sourcings || []).map(item => item.code === sourcingCode ? updatedSourcing : item)
      : [updatedSourcing, ...(db.sourcings || [])];
    await updateDB({ ...db, demandes: nextDemandes, demandeLignes: [...nextLines, ...retainedLines], sourcings: nextSourcings });
    audit('Sourcing', existingSourcing ? 'Modification fiche sourcing' : 'Création fiche sourcing', sourcingCode, 'étape', step, moveToStep || step, demandeCode);
    toast(`${sourcingCode} enregistré`);
    if (!existingSourcing) window.location.hash = `ficheSourcing:${sourcingCode}`;
    return sourcingCode;
  };

  const next = async () => {
    if (!validateCurrentStep()) return;
    const nextStep = Math.min(3, step + 1);
    await save({ moveToStep: nextStep });
    setStep(nextStep);
  };

  const stepLabels = [
    { id: 1, title: 'Identification', subtitle: 'Client et produits' },
    { id: 2, title: 'Spécifications', subtitle: 'Détails techniques' },
    { id: 3, title: 'Suivi', subtitle: 'Échantillons et échanges' },
  ];

  return (
    <>
      <Topbar titre="Sourcing" />
      <div className="sourcing-shell sourcing-form-shell">
        <div className="source-page-heading">
          <div><h1>Sourcing</h1><p>Demandes de sourcing / {context.sourcing?.code || 'Nouvelle fiche'}</p></div>
          <div className="source-heading-actions"><span className={`source-status ${status === 'Validé' ? 'is-success' : 'is-info'}`}>{status || 'Brouillon'}</span><button className="source-primary-button" onClick={() => save()}><Save size={16} /> Enregistrer</button></div>
        </div>

        <section className="source-card source-form-banner">
          <div className="source-round-icon"><ClipboardList size={22} /></div>
          <div><h2>{step === 1 ? 'Nouvelle fiche sourcing' : step === 2 ? 'Spécifications du produit' : 'Suivi de la demande'}</h2><p>{step === 1 ? 'Complétez les informations du client et des produits.' : step === 2 ? 'Définissez les caractéristiques techniques et les conditions d’achat.' : 'Suivez les échantillons, les documents reçus et les échanges fournisseurs.'}</p></div>
          <span className="source-code-chip">Code sourcing : {context.sourcing?.code || 'généré à l’enregistrement'}</span>
        </section>

        <section className="source-card source-stepper">
          {stepLabels.map((item, index) => <React.Fragment key={item.id}><button className={step === item.id ? 'active' : step > item.id ? 'done' : ''} onClick={() => setStep(item.id)}><span>{step > item.id ? <Check size={16} /> : item.id}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div></button>{index < stepLabels.length - 1 && <i />}</React.Fragment>)}
        </section>

        {step === 1 && (
          <div className="source-form-grid wide-left">
            <section className="source-card source-form-card">
              <div className="source-card-title-row"><div><h2>Identification</h2><p>Informations générales de la demande et des produits.</p></div></div>
              <div className="source-fields three">
                <label><span>Code client *</span><select value={clientCode} onChange={event => setClientCode(event.target.value)}><option value="">Sélectionner un client</option>{(db.clients || []).map(item => <option key={item.code} value={item.code}>{item.code} · {item.nom || 'Sans nom'}</option>)}</select></label>
                <label><span>Nom du client</span><input readOnly value={client?.nom || ''} /></label>
                <label><span>Responsable *</span><input value={responsable} onChange={event => setResponsable(event.target.value)} /></label>
                <label><span>Nom du produit *</span><input value={product.nomProduit} onChange={event => updateProduct('nomProduit', event.target.value)} /></label>
                <label><span>Catégorie</span><input value={product.categorie} onChange={event => updateProduct('categorie', event.target.value)} placeholder="Emballage, machine, textile…" /></label>
                <label><span>Type de demande</span><select value={typeDemande} onChange={event => setTypeDemande(event.target.value)}><option>Sourcing (B)</option><option>Négociation (A2)</option></select></label>
                <label><span>Quantité par produit</span><input value={product.quantite} onChange={event => updateProduct('quantite', event.target.value)} /></label>
                <label><span>Unité</span><input value={product.unite} onChange={event => updateProduct('unite', event.target.value)} /></label>
                <label><span>État recherché</span><select value={product.etat} onChange={event => updateProduct('etat', event.target.value)}><option>Neuf</option><option>Occasion</option><option>Reconditionné</option></select></label>
              </div>
              <label className="source-field-full"><span>Usage du produit</span><input value={product.usage} onChange={event => updateProduct('usage', event.target.value)} /></label>
              <label className="source-field-full"><span>Exigences par produit</span><textarea rows="4" value={product.exigences} onChange={event => updateProduct('exigences', event.target.value)} placeholder="Décrivez les besoins spécifiques à ce produit…" /></label>
              <label className="source-upload-zone"><UploadCloud size={21} /><span>Ajouter une photo ou glisser-déposer</span><small>PNG, JPG jusqu’à 10 Mo</small><input type="file" accept="image/*" onChange={async event => { const [file] = await readFiles(event.target.files); if (file) updateProduct('photo', file.dataUrl); }} /></label>
              {product.photo && <div className="source-photo-preview"><img src={product.photo} alt={product.nomProduit || 'Produit'} /><button onClick={() => updateProduct('photo', '')}><X size={15} /></button></div>}
            </section>
            <aside className="source-side-stack">
              <section className="source-card source-form-card compact"><div className="source-card-title-row"><h2>Produits de la demande</h2><button className="source-soft-button" onClick={addProduct}><Plus size={15} /> Produit</button></div><div className="source-product-list">{products.map((item, index) => <button key={item.localId} className={activeProduct === index ? 'active' : ''} onClick={() => setActiveProduct(index)}><span>{index + 1}</span><div><strong>{item.nomProduit || `Produit ${index + 1}`}</strong><small>{item.quantite || '—'} {item.unite || ''} · {item.etat}</small></div>{products.length > 1 && <i onClick={event => { event.stopPropagation(); removeProduct(index); }}>×</i>}</button>)}</div></section>
              <section className="source-card source-form-card compact"><h2>Aperçu de la progression</h2><div className="source-mini-progress">{stepLabels.map(item => <div key={item.id} className={step >= item.id ? 'done' : ''}><span /><b>{item.title}</b><small>{step === item.id ? 'En cours' : step > item.id ? 'Complété' : 'À venir'}</small></div>)}</div></section>
              <section className="source-advice"><strong>Conseil</strong><p>Les spécifications et le suivi sont enregistrés séparément pour chaque produit de la demande.</p></section>
            </aside>
          </div>
        )}

        {step === 2 && (
          <div className="source-form-grid">
            <section className="source-card source-form-card">
              <div className="source-card-title-row"><div><h2>Détails techniques</h2><p>Les spécifications sont enregistrées séparément pour chaque produit.</p></div><select value={activeProduct} onChange={event => setActiveProduct(Number(event.target.value))}>{products.map((item, index) => <option key={item.localId} value={index}>Produit {index + 1} · {item.nomProduit || 'Sans nom'}</option>)}</select></div>
              <div className="source-fields two">
                <label><span>Matière / composition</span><input value={product.matiere} onChange={event => updateProduct('matiere', event.target.value)} /></label>
                <label><span>Dimensions du produit</span><input value={product.dimensions} onChange={event => updateProduct('dimensions', event.target.value)} /></label>
                <label><span>Poids</span><div className="source-inline-fields"><input value={product.poids} onChange={event => updateProduct('poids', event.target.value)} /><select value={product.typePoids} onChange={event => updateProduct('typePoids', event.target.value)}><option>Net</option><option>Brut</option></select></div></label>
                <label><span>Couleurs et modèle</span><input value={product.couleursModele} onChange={event => updateProduct('couleursModele', event.target.value)} /></label>
                <label><span>Certificats requis</span><input value={product.certificats} onChange={event => updateProduct('certificats', event.target.value)} /></label>
                <label><span>Emballage</span><input value={product.emballage} onChange={event => updateProduct('emballage', event.target.value)} /></label>
              </div>
              <label className="source-field-full"><span>Autres caractéristiques techniques</span><textarea rows="4" value={product.autresCaracteristiques} onChange={event => updateProduct('autresCaracteristiques', event.target.value)} /></label>
              <div className="source-fields three">
                <label><span>Incoterm</span><select value={product.incoterm} onChange={event => updateProduct('incoterm', event.target.value)}>{['EXW', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'].map(value => <option key={value}>{value}</option>)}</select></label>
                <label><span>Port FOB</span><input value={product.portFob} onChange={event => updateProduct('portFob', event.target.value)} /></label>
                <label><span>Ville du fournisseur</span><input value={product.villeFournisseur} onChange={event => updateProduct('villeFournisseur', event.target.value)} /></label>
                <label><span>Prix EXW</span><input type="number" value={product.prixUnitaire} onChange={event => updateProduct('prixUnitaire', event.target.value)} /></label>
                <label><span>Devise</span><select value={product.devise} onChange={event => updateProduct('devise', event.target.value)}>{['USD', 'EUR', 'CNY', 'MAD'].map(value => <option key={value}>{value}</option>)}</select></label>
                <label><span>MOQ</span><input value={product.moq} onChange={event => updateProduct('moq', event.target.value)} /></label>
              </div>
            </section>
            <aside className="source-side-stack">
              <section className="source-card source-form-card compact"><h2>Origine & fournisseur</h2><label><span>Pays du fournisseur</span><input value={product.paysFournisseur} onChange={event => updateProduct('paysFournisseur', event.target.value)} /></label><label><span>Pays d’origine du produit</span><input value={product.paysOrigine} onChange={event => updateProduct('paysOrigine', event.target.value)} /></label></section>
              <section className="source-card source-form-card compact"><h2>Produit concerné</h2><div className="source-selected-product"><span>{activeProduct + 1}</span><div><strong>{product.nomProduit || 'Produit sans nom'}</strong><small>{product.quantite || '—'} {product.unite}</small></div></div><label><span>Fournisseur pressenti</span><select value={product.fournisseurCode} onChange={event => selectSupplier(event.target.value)}><option value="">À identifier</option>{suppliers.map(item => <option key={item.code} value={item.code}>{item.nom} · {item.pays || '—'}</option>)}</select></label><label><span>Délai de production</span><input value={product.delaiProduction} onChange={event => updateProduct('delaiProduction', event.target.value)} /></label></section>
            </aside>
          </div>
        )}

        {step === 3 && (
          <div className="source-follow-grid">
            <section className="source-card source-form-card"><h2>Échantillons</h2><p>Demandez et suivez un échantillon pour chaque produit.</p><label><span>Produit concerné</span><select value={activeProduct} onChange={event => setActiveProduct(Number(event.target.value))}>{products.map((item, index) => <option key={item.localId} value={index}>{item.nomProduit || `Produit ${index + 1}`}</option>)}</select></label><div className="source-fields two"><label><span>Statut de l’échantillon</span><select value={sampleStatus} onChange={event => setSampleStatus(event.target.value)}>{['Non demandé', 'Demandé', 'Expédié', 'Reçu', 'Validé', 'Refusé'].map(value => <option key={value}>{value}</option>)}</select></label><label><span>Date de demande</span><input type="date" value={sampleDate} onChange={event => setSampleDate(event.target.value)} /></label></div></section>
            <section className="source-card source-form-card"><h2>Tracking de l’échantillon</h2><p>Renseignez les informations de transport dès l’expédition.</p><div className="source-fields two"><label><span>Transporteur</span><input value={carrier} onChange={event => setCarrier(event.target.value)} placeholder="DHL, FedEx…" /></label><label><span>Numéro de tracking</span><input value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} /></label></div><label className="source-field-full"><span>Lien de suivi</span><input value={trackingLink} onChange={event => setTrackingLink(event.target.value)} /></label></section>
            <section className="source-card source-form-card"><h2>Documents reçus</h2><p>Sélectionnez les documents reçus et joignez les fichiers.</p><div className="source-document-tags">{documents.map(doc => <span key={doc.id}><FileUp size={14} /> {doc.nom}<button onClick={() => setDocuments(current => current.filter(item => item.id !== doc.id))}>×</button></span>)}</div><label className="source-upload-zone"><UploadCloud size={21} /><span>Joindre un document</span><small>PDF, JPG, PNG, Excel</small><input type="file" multiple onChange={handleDocuments} /></label></section>
            <section className="source-card source-form-card"><div className="source-card-title-row"><div><h2>Échanges avec les fournisseurs</h2><p>Historique des contacts, décisions et prochaines actions.</p></div></div><div className="source-exchange-input"><textarea value={exchangeText} onChange={event => setExchangeText(event.target.value)} placeholder="Ajouter le compte-rendu d’un appel, email ou WhatsApp…" /><button onClick={addExchange}><Send size={16} /> Ajouter</button></div><div className="source-timeline">{exchanges.map(item => <article key={item.id}><span /><div><strong>{new Date(item.date).toLocaleDateString('fr-FR')} · {item.auteur || 'Sourcing'}</strong><p>{item.texte}</p></div></article>)}{!exchanges.length && <p className="source-empty">Aucun échange enregistré.</p>}</div><div className="source-fields two"><label><span>Prochaine action</span><input value={nextAction} onChange={event => setNextAction(event.target.value)} /></label><label><span>Échéance</span><input type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} /></label><label><span>Statut sourcing</span><select value={status} onChange={event => setStatus(event.target.value)}>{['À traiter', 'En cours', 'Recherche', 'Offre reçue', 'Échantillon', 'Recommandé', 'Validé', 'Clôturé'].map(value => <option key={value}>{value}</option>)}</select></label></div></section>
          </div>
        )}

        <footer className="source-form-footer">
          <span>* Champs obligatoires</span>
          <div><button className="source-secondary-button" onClick={() => { if (step > 1) setStep(step - 1); else window.location.hash = 'sourcings'; }}><ArrowLeft size={16} /> Retour</button>{step < 3 ? <button className="source-primary-button" onClick={next}>Suivant <ChevronRight size={16} /></button> : <button className="source-primary-button" onClick={() => save()}><Check size={16} /> Terminer</button>}</div>
        </footer>
      </div>
    </>
  );
}

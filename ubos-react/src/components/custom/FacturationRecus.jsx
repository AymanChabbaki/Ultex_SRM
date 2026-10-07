import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Receipt, Truck, FileSignature, Plus, Trash2, Download, Eye, CheckCircle2 } from 'lucide-react';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import DataTable from '../common/DataTable';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fetchFacturationTemplates, generateFacturationDocument, downloadStoredDocument, openStoredDocument } from '../../services/api';
import { fmtMAD, pillStatut } from '../../utils/format';
import './FacturationRecus.css';

const FAMILIES = [
  { key: 'facture', label: 'Factures', icon: Receipt, hint: 'Partielles ou finales, maritime et aérien' },
  { key: 'recu', label: 'Reçus', icon: FileText, hint: 'Confirmation, sourcing ou négociation' },
  { key: 'livraison', label: 'Bons de livraison', icon: Truck, hint: 'Maritime ou aérien' },
  { key: 'resiliation', label: 'Résiliations', icon: FileSignature, hint: 'Demande client ou contrat de résiliation' },
];

const BANKS = {
  bmce: { bankName: 'BMCE', bankReference: '011793000064210000420497', swift: 'BMCEMAMC' },
  cfg: { bankName: 'Banque CFG', bankReference: '050450007011083735200133', swift: 'CAFGMAMC' },
};

const today = () => new Date().toISOString().slice(0, 10);
const money = value => fmtMAD(Number(value || 0));
const byText = value => String(value || '').toLowerCase();

function defaultForm() {
  return {
    reference: '', clientCode: '', clientName: '', cin: '', ice: '', phone: '', address: '', city: '',
    orderCode: '', requestCode: '', dossierCode: '', paymentCode: '', orderReference: '', quoteReference: '',
    purchaseOrderReference: '', contractReference: '', documentDate: today(), orderDate: today(), paymentDate: today(),
    receptionDate: today(), advanceDates: '', originCountry: '', transportMode: '', product: '', service: '', payerName: '',
    paymentMethod: 'Virement', amount: '', advanceAmount: '', commitmentFee: '', refundDelay: '40 jours ouvrables',
    place: 'Marrakech', storageAddress: '', packaging: '', packages: '', weight: '', dimensions: '', totalAmount: '',
    ...BANKS.cfg,
    lines: [{ reference: '00001', description: '', orderedQuantity: '', deliveredQuantity: '', unite: 'pcs', observations: '' }],
    items: [
      { category: 'operation', label: 'Total importé', amount: '' },
      { category: 'operation', label: 'Transport international', amount: '' },
      { category: 'service', label: 'Frais de service HT', amount: '' },
      { category: 'service', label: 'TVA', amount: '' },
    ],
  };
}

function Field({ label, value, onChange, type = 'text', placeholder, children, required, wide }) {
  return (
    <label className={`fr-field${wide ? ' fr-wide' : ''}`}>
      <span>{label}{required ? ' *' : ''}</span>
      {children || <input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={event => onChange(event.target.value)} />}
    </label>
  );
}

function InvoiceLines({ items, onChange }) {
  const update = (index, key, value) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  return (
    <div className="fr-line-editor fr-wide">
      <div className="fr-line-head"><b>Lignes de facturation</b><button type="button" className="btn mini doux" onClick={() => onChange([...items, { category: 'operation', label: '', amount: '' }])}><Plus size={13} /> Ajouter</button></div>
      {items.map((item, index) => (
        <div className="fr-invoice-line" key={index}>
          <select value={item.category || 'operation'} onChange={event => update(index, 'category', event.target.value)}><option value="operation">Opération</option><option value="service">Prestation</option></select>
          <input value={item.label || ''} placeholder="Libellé" onChange={event => update(index, 'label', event.target.value)} />
          <input type="number" min="0" step="0.01" value={item.amount ?? ''} placeholder="Montant MAD" onChange={event => update(index, 'amount', event.target.value)} />
          <button type="button" className="fr-icon-btn danger" title="Supprimer" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  );
}

function DeliveryLines({ lines, onChange }) {
  const update = (index, key, value) => onChange(lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  return (
    <div className="fr-line-editor fr-wide">
      <div className="fr-line-head"><b>Produits livrés</b><button type="button" className="btn mini doux" onClick={() => onChange([...lines, { reference: String(lines.length + 1).padStart(5, '0'), description: '', orderedQuantity: '', deliveredQuantity: '', unite: 'pcs', observations: '' }])}><Plus size={13} /> Ajouter</button></div>
      <div className="fr-delivery-labels"><span>Réf.</span><span>Description</span><span>Commandée</span><span>Livrée</span><span>Unité</span><span>Observation</span><span></span></div>
      {lines.map((line, index) => (
        <div className="fr-delivery-line" key={index}>
          <input value={line.reference || ''} onChange={event => update(index, 'reference', event.target.value)} />
          <input value={line.description || ''} onChange={event => update(index, 'description', event.target.value)} />
          <input type="number" min="0" step="0.01" value={line.orderedQuantity ?? ''} onChange={event => update(index, 'orderedQuantity', event.target.value)} />
          <input type="number" min="0" step="0.01" value={line.deliveredQuantity ?? ''} onChange={event => update(index, 'deliveredQuantity', event.target.value)} />
          <input value={line.unite || ''} onChange={event => update(index, 'unite', event.target.value)} />
          <input value={line.observations || ''} onChange={event => update(index, 'observations', event.target.value)} />
          <button type="button" className="fr-icon-btn danger" title="Supprimer" onClick={() => onChange(lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  );
}

function Preview({ template, form }) {
  const total = form.totalAmount !== '' ? Number(form.totalAmount || 0) : (form.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return (
    <div className="fr-preview">
      <div className="fr-preview-brand"><b>ULTEx</b><span>{template?.transport ? `FRET ${template.transport.toUpperCase()}` : 'DOCUMENT CLIENT'}</span></div>
      <h3>{template?.label || 'Document'}</h3>
      <div className="fr-preview-meta"><span><b>Référence</b>{form.reference || 'Numérotation automatique'}</span><span><b>Date</b>{form.documentDate || '—'}</span><span><b>Client</b>{form.clientName || '—'} · {form.clientCode || '—'}</span></div>
      {template?.family === 'facture' && <><p><b>Objet :</b> {form.product || '—'} · {form.originCountry || '—'} → Maroc</p><table><thead><tr><th>Libellé</th><th>Montant</th></tr></thead><tbody>{form.items.filter(item => item.label || item.amount).map((item, index) => <tr key={index}><td>{item.label || '—'}</td><td>{money(item.amount)}</td></tr>)}<tr className="fr-total"><td>Total</td><td>{money(total)}</td></tr></tbody></table></>}
      {template?.family === 'recu' && <p>Reçu de <b>{money(form.amount)}</b> pour {form.service || form.product || 'le service sélectionné'}, payé par {form.payerName || form.clientName || '—'} sous forme de {form.paymentMethod || '—'}.</p>}
      {template?.family === 'livraison' && <table><thead><tr><th>Réf.</th><th>Description</th><th>Commandée</th><th>Livrée</th></tr></thead><tbody>{form.lines.map((line, index) => <tr key={index}><td>{line.reference}</td><td>{line.description || '—'}</td><td>{line.orderedQuantity || '—'} {line.unite}</td><td>{line.deliveredQuantity || '—'} {line.unite}</td></tr>)}</tbody></table>}
      {template?.family === 'resiliation' && <p>Résiliation concernant {form.clientName || '—'}, le devis {form.quoteReference || '—'} et le contrat {form.contractReference || '—'}. Avance concernée : {money(form.advanceAmount)}.</p>}
      <small>Le PDF final conserve l’en-tête, les tableaux, les signatures et la mise en page du modèle fourni.</small>
    </div>
  );
}

export default function FacturationRecus() {
  const { db, chargerCollections, hydraterEnregistrements, audit } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [family, setFamily] = useState('facture');
  const [selectedKey, setSelectedKey] = useState('');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([chargerCollections(['clients', 'commandes', 'demandes', 'paiements', 'documents', 'facturationRecus']), fetchFacturationTemplates()])
      .then(([, items]) => { if (active) setTemplates(items); })
      .catch(error => toast(error.message || 'Impossible de charger le module.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [chargerCollections, toast]);

  const selectedTemplate = templates.find(item => item.key === selectedKey);
  const visibleTemplates = templates.filter(item => item.family === family);
  const clients = useMemo(() => [...(db.clients || [])].sort((a, b) => String(a.nom || a.raisonSociale || a.code).localeCompare(String(b.nom || b.raisonSociale || b.code), 'fr')), [db.clients]);
  const commandes = useMemo(() => (db.commandes || []).filter(item => !form.clientCode || item.client === form.clientCode), [db.commandes, form.clientCode]);
  const payments = useMemo(() => (db.paiements || []).filter(item => !form.clientCode || item.client === form.clientCode || (form.dossierCode && item.dossier === form.dossierCode)), [db.paiements, form.clientCode, form.dossierCode]);
  const history = useMemo(() => (db.facturationRecus || []).filter(row => !search || byText(`${row.reference} ${row.libelle} ${row.client} ${row.commande} ${row.auteur}`).includes(byText(search))).sort((a, b) => (b.ts || 0) - (a.ts || 0)), [db.facturationRecus, search]);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  const chooseTemplate = template => {
    setSelectedKey(template.key);
    setForm(previous => ({ ...previous, transportMode: template.transport || previous.transportMode, ...(template.key === 'facture_partielle_maritime' || template.key === 'facture_finale_aerien' ? BANKS.bmce : {}), ...(template.key === 'facture_partielle_aerien' || template.key === 'facture_finale_maritime' ? BANKS.cfg : {}) }));
    setStep(1); setOpen(true);
  };

  const chooseClient = code => {
    const client = clients.find(item => item.code === code) || {};
    setForm(previous => ({ ...previous, clientCode: code, clientName: client.nom || client.raisonSociale || '', cin: client.cin || '', ice: client.ice || '', phone: client.telephone || client.whatsapp || '', address: client.adresse || '', city: client.ville || '', storageAddress: previous.storageAddress || client.adresse || '', orderCode: '', requestCode: '', dossierCode: '', paymentCode: '' }));
  };

  const chooseOrder = code => {
    const order = commandes.find(item => item.code === code) || {};
    const demande = (db.demandes || []).find(item => item.code === order.demande) || {};
    const lines = (order.lignes || []).map((line, index) => ({ reference: line.code || String(index + 1).padStart(5, '0'), description: line.nomProduit || line.designationTechnique || '', orderedQuantity: line.quantite || '', deliveredQuantity: line.quantite || '', unite: line.unite || 'pcs', observations: '' }));
    setForm(previous => ({ ...previous, orderCode: code, orderReference: order.referenceMetier || code, purchaseOrderReference: order.referenceBonCommande || order.referenceMetier || code, requestCode: order.demande || '', dossierCode: order.dossier || demande.dossier || '', quoteReference: order.referenceDevis || order.devisReference || '', contractReference: order.referenceContrat || '', orderDate: order.dateCommande || order.dateConfirmation || previous.orderDate, product: order.objet || demande.objectifGeneral || lines.map(line => line.description).filter(Boolean).join(', '), originCountry: order.paysOrigine || demande.paysOrigine || previous.originCountry, lines: lines.length ? lines : previous.lines }));
  };

  const choosePayment = code => {
    const payment = payments.find(item => item.code === code) || {};
    setForm(previous => ({ ...previous, paymentCode: code, amount: payment.montant || '', paymentDate: payment.date || payment.datePaiement || previous.paymentDate, paymentMethod: payment.mode || payment.modePaiement || previous.paymentMethod }));
  };

  const goNext = () => { if (step === 1 && !form.clientCode) return toast('Sélectionnez un client.'); setStep(current => Math.min(3, current + 1)); };
  const generate = async () => {
    if (!selectedTemplate || !form.clientCode) return;
    setGenerating(true);
    try {
      const payload = { ...form, totalAmount: selectedTemplate.family === 'facture' && form.totalAmount === '' ? form.items.reduce((sum, item) => sum + Number(item.amount || 0), 0) : form.totalAmount };
      const result = await generateFacturationDocument(selectedTemplate.key, payload);
      hydraterEnregistrements('documents', [result.document]); hydraterEnregistrements('facturationRecus', [result.record]);
      audit('Facturation & reçus', 'Génération', result.record.reference, 'modèle', '—', result.record.libelle, result.record.dossier);
      await downloadStoredDocument(result.document.code, result.document.nom);
      toast(`${result.record.reference} généré et enregistré.`);
      setOpen(false); setStep(1); setSelectedKey(''); setForm(defaultForm());
    } catch (error) { toast(error.message || 'Impossible de générer le document.'); }
    finally { setGenerating(false); }
  };

  const contextFields = <div className="fr-form-grid">
    <Field label="Client" required wide><select value={form.clientCode} onChange={event => chooseClient(event.target.value)}><option value="">— Sélectionner —</option>{clients.map(client => <option key={client.code} value={client.code}>{client.code} · {client.nom || client.raisonSociale || 'Sans nom'}</option>)}</select></Field>
    <Field label="Commande liée"><select value={form.orderCode} onChange={event => chooseOrder(event.target.value)}><option value="">— Facultatif —</option>{commandes.map(order => <option key={order.code} value={order.code}>{order.referenceMetier || order.code}</option>)}</select></Field>
    {selectedTemplate?.family === 'recu' && <Field label="Paiement lié"><select value={form.paymentCode} onChange={event => choosePayment(event.target.value)}><option value="">— Facultatif —</option>{payments.map(payment => <option key={payment.code} value={payment.code}>{payment.code} · {money(payment.montant)}</option>)}</select></Field>}
    <Field label="Nom / raison sociale" value={form.clientName} onChange={value => update('clientName', value)} required /><Field label="Code client" value={form.clientCode} onChange={value => update('clientCode', value)} required />
    <Field label="CIN" value={form.cin} onChange={value => update('cin', value)} /><Field label="ICE" value={form.ice} onChange={value => update('ice', value)} /><Field label="Téléphone" value={form.phone} onChange={value => update('phone', value)} /><Field label="Ville" value={form.city} onChange={value => update('city', value)} /><Field label="Adresse" value={form.address} onChange={value => update('address', value)} wide />
  </div>;

  const documentFields = <div className="fr-form-grid">
    <Field label="Référence" value={form.reference} onChange={value => update('reference', value)} placeholder="Vide = automatique" /><Field label="Date du document" type="date" value={form.documentDate} onChange={value => update('documentDate', value)} />
    {selectedTemplate?.family !== 'resiliation' && <Field label="Pays d’origine" value={form.originCountry} onChange={value => update('originCountry', value)} />}
    {selectedTemplate?.family === 'facture' && <><Field label="Objet / produit" value={form.product} onChange={value => update('product', value)} wide />{!selectedTemplate.partial && <Field label="Adresse de stockage" value={form.storageAddress} onChange={value => update('storageAddress', value)} wide />}<InvoiceLines items={form.items} onChange={value => update('items', value)} /><Field label="Total manuel (optionnel)" type="number" value={form.totalAmount} onChange={value => update('totalAmount', value)} placeholder="Calculé depuis les lignes" /><Field label="Banque"><select value={form.bankName === BANKS.bmce.bankName ? 'bmce' : 'cfg'} onChange={event => setForm(previous => ({ ...previous, ...BANKS[event.target.value] }))}><option value="cfg">Banque CFG</option><option value="bmce">BMCE</option></select></Field><Field label="Référence bancaire" value={form.bankReference} onChange={value => update('bankReference', value)} /><Field label="SWIFT" value={form.swift} onChange={value => update('swift', value)} /></>}
    {selectedTemplate?.family === 'recu' && <><Field label="Date du paiement" type="date" value={form.paymentDate} onChange={value => update('paymentDate', value)} /><Field label="Montant reçu — MAD" type="number" value={form.amount} onChange={value => update('amount', value)} required /><Field label="Service" value={form.service} onChange={value => update('service', value)} placeholder="Sourcing, négociation, confirmation…" /><Field label="Produit / objet" value={form.product} onChange={value => update('product', value)} /><Field label="Mode de paiement"><select value={form.paymentMethod} onChange={event => update('paymentMethod', event.target.value)}>{['Virement','Espèces','Chèque','Effet','Carte','Autre'].map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Mode de transport" value={form.transportMode} onChange={value => update('transportMode', value)} />{selectedTemplate.tiers && <Field label="Nom de la personne qui a payé" value={form.payerName} onChange={value => update('payerName', value)} required />}<Field label="Référence devis" value={form.quoteReference} onChange={value => update('quoteReference', value)} /><Field label="Référence contrat" value={form.contractReference} onChange={value => update('contractReference', value)} /></>}
    {selectedTemplate?.family === 'livraison' && <><Field label="Date de commande / dossier" type="date" value={form.orderDate} onChange={value => update('orderDate', value)} /><Field label="Date de réception" type="date" value={form.receptionDate} onChange={value => update('receptionDate', value)} /><Field label="Adresse de stockage" value={form.storageAddress} onChange={value => update('storageAddress', value)} wide /><DeliveryLines lines={form.lines} onChange={value => update('lines', value)} /><Field label="Colisage" value={form.packaging} onChange={value => update('packaging', value)} /><Field label="Nombre / type de colis" value={form.packages} onChange={value => update('packages', value)} /><Field label="Poids" value={form.weight} onChange={value => update('weight', value)} placeholder="ex. 100 KGS" /><Field label="Dimensions / conteneur" value={form.dimensions} onChange={value => update('dimensions', value)} /></>}
    {selectedTemplate?.family === 'resiliation' && <><Field label="Référence commande" value={form.orderReference} onChange={value => update('orderReference', value)} /><Field label="Référence devis" value={form.quoteReference} onChange={value => update('quoteReference', value)} /><Field label="Référence bon de commande" value={form.purchaseOrderReference} onChange={value => update('purchaseOrderReference', value)} /><Field label="Référence contrat" value={form.contractReference} onChange={value => update('contractReference', value)} /><Field label="Date de commande" type="date" value={form.orderDate} onChange={value => update('orderDate', value)} /><Field label="Produit / objet" value={form.product} onChange={value => update('product', value)} wide /><Field label="Pays d’origine" value={form.originCountry} onChange={value => update('originCountry', value)} /><Field label="Mode de transport" value={form.transportMode} onChange={value => update('transportMode', value)} /><Field label="Montant de l’avance — MAD" type="number" value={form.advanceAmount} onChange={value => update('advanceAmount', value)} /><Field label="Date du paiement" type="date" value={form.paymentDate} onChange={value => update('paymentDate', value)} /><Field label="Dates / tranches de l’avance" value={form.advanceDates} onChange={value => update('advanceDates', value)} placeholder="ex. le 01/10/2026 en une tranche" wide />{selectedKey === 'resiliation_contrat' && <><Field label="Frais d’engagement — MAD" type="number" value={form.commitmentFee} onChange={value => update('commitmentFee', value)} /><Field label="Délai de remboursement" value={form.refundDelay} onChange={value => update('refundDelay', value)} /><Field label="Lieu de signature" value={form.place} onChange={value => update('place', value)} /></>}</>}
  </div>;

  if (loading) return <><Topbar titre="Facturation & reçus" /><div className="panneau"><div className="vide">Chargement des modèles…</div></div></>;
  return <div className="fr-page"><Topbar titre="Facturation & reçus" />
    <div className="fr-hero"><div><span className="fr-eyebrow">Documents commerciaux</span><h2>Générer, classer et retrouver chaque document client</h2><p>Les modèles ULTEx fournis sont préremplis depuis le CRM et conservés dans l’historique.</p></div><div className="fr-hero-stats"><span><b>{templates.length}</b> modèles</span><span><b>{db.facturationRecus?.length || 0}</b> documents générés</span></div></div>
    <div className="fr-family-tabs">{FAMILIES.map(item => { const Icon = item.icon; return <button key={item.key} className={family === item.key ? 'active' : ''} onClick={() => setFamily(item.key)}><Icon size={19} /><span><b>{item.label}</b><small>{item.hint}</small></span></button>; })}</div>
    <div className="fr-template-grid">{visibleTemplates.map(template => <button key={template.key} className="fr-template-card" onClick={() => chooseTemplate(template)}><div className="fr-template-icon"><FileText size={24} /></div><span><b>{template.label}</b><small>{template.transport || (template.tiers ? 'Paiement par une autre personne' : 'Modèle ULTEx')}</small></span><Plus size={18} /></button>)}</div>
    <div className="fr-history-title"><div><span className="fr-eyebrow">Historique</span><h3>Documents générés</h3></div><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher une référence, un client…" /></div>
    <DataTable columns={[{ key: 'reference', label: 'Référence', render: value => <b>{value}</b> },{ key: 'libelle', label: 'Document' },{ key: 'client', label: 'Client', render: value => value ? <a href={`#ficheClient:${value}`}>{value}</a> : '—' },{ key: 'commande', label: 'Commande', render: value => value ? <a href={`#ficheCommande:${value}`}>{value}</a> : '—' },{ key: 'montant', label: 'Montant', render: (value, row) => row.famille === 'facture' || row.famille === 'recu' ? money(value) : '—' },{ key: 'statut', label: 'Statut', render: value => pillStatut(value || 'Généré') },{ key: 'auteur', label: 'Créé par' },{ key: 'document', label: 'Fichier', render: (value, row) => <div className="fr-row-actions"><button className="btn mini doux" onClick={() => openStoredDocument(value).catch(error => toast(error.message))}><Eye size={13} /> Voir</button><button className="btn mini" onClick={() => downloadStoredDocument(value, `${row.reference}.pdf`).catch(error => toast(error.message))}><Download size={13} /> Télécharger</button></div> }]} data={history} />
    {open && selectedTemplate && <Modal large title={selectedTemplate.label} onClose={() => !generating && setOpen(false)} footer={<><button className="btn doux" disabled={generating} onClick={() => step > 1 ? setStep(step - 1) : setOpen(false)}>{step > 1 ? 'Précédent' : 'Annuler'}</button><span className="spacer"></span>{step < 3 ? <button className="btn or" onClick={goNext}>Continuer</button> : <button className="btn or" disabled={generating || !peut('ajouter')} onClick={generate}>{generating ? 'Génération…' : 'Générer et télécharger'}</button>}</>}><div className="fr-wizard"><div className="fr-steps">{['Client et liaison', 'Contenu du document', 'Vérification'].map((label, index) => <div key={label} className={step >= index + 1 ? 'active' : ''}><span>{step > index + 1 ? <CheckCircle2 size={16} /> : index + 1}</span>{label}</div>)}</div>{step === 1 && contextFields}{step === 2 && documentFields}{step === 3 && <Preview template={selectedTemplate} form={form} />}</div></Modal>}
  </div>;
}

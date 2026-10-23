import React, { useMemo, useState } from 'react';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { lireFichierDataUrl } from '../../utils/fileData';
import { reservePartnerCode } from '../../services/api';
import {
  PARTNER_ROLES, PARTNER_STATUSES, LCN_STATUSES, argent, mad, day,
  datePlusJours, joursAvant, rolesDuPartenaire,
  factureCalculee, indicateursPartenaire, montantTtcMad, validerAffectations,
} from '../../utils/partnerFinance';
import './Partner360.css';

const IDENTITY = [
  ['nom', 'Raison sociale', 'text', true], ['nomCourt', 'Nom court'],
  ['pays', 'Pays'], ['ville', 'Ville'], ['adresse', 'Adresse'],
  ['ice', 'ICE (15 chiffres)'], ['idFiscal', 'Identifiant fiscal'], ['rc', 'RC'],
  ['patente', 'Patente'], ['agrement', 'Agrément douane'],
  ['siteWeb', 'Site web', 'url'], ['email', 'E-mail', 'email'],
  ['telephone', 'Téléphone'], ['whatsapp', 'WhatsApp'],
  ['contact', 'Interlocuteur principal'], ['contactTel', 'Téléphone contact'],
  ['contactEmail', 'E-mail contact', 'email'], ['notes', 'Notes', 'textarea'],
];
const CONDITIONS = [
  ['dateConvention', 'Date de convention', 'date'],
  ['delaiPaiementJours', 'Délai de paiement (jours)', 'number'],
  ['plafondCredit', 'Plafond de crédit (MAD)', 'number'],
  ['modeReglement', 'Mode de règlement', 'select', ['LCN', 'Virement', 'Chèque', 'Espèces']],
  ['deviseFacturation', 'Devise de facturation', 'select', ['MAD', 'USD', 'EUR', 'CNY']],
  ['freeTimeJours', 'Free time (jours)', 'number'],
  ['tarifSurestaries', 'Tarif surestaries'],
];
const today = () => new Date().toISOString().slice(0, 10);
const inputClass = 'partner-input';
const num = value => Number(value) || 0;

function Champ({ field, value, onChange }) {
  const [key, label, type = 'text', details] = field;
  return <label className="partner-field"><span>{label}{details === true ? ' *' : ''}</span>
    {type === 'textarea' ? <textarea className={inputClass} value={value || ''} onChange={e => onChange(key, e.target.value)} />
      : type === 'select' ? <select className={inputClass} value={value || ''} onChange={e => onChange(key, e.target.value)}>
        <option value="">—</option>{details.map(option => <option key={option}>{option}</option>)}
      </select> : <input className={inputClass} type={type} value={value ?? ''} min={type === 'number' ? 0 : undefined}
        onChange={e => onChange(key, e.target.value)} />}
  </label>;
}

function Fields({ fields, value, onChange }) {
  return <div className="partner-fields">{fields.map(field => <Champ key={field[0]} field={field} value={value[field[0]]} onChange={onChange} />)}</div>;
}

function Table({ columns, rows, empty = 'Aucune donnée.' }) {
  return <div className="partner-table-scroll"><table className="partner-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map((row, index) => <tr key={row.code || index}>{columns.map(([key, , render]) => <td key={key}>{render ? render(row[key], row) : row[key] ?? '—'}</td>)}</tr>)
      : <tr><td colSpan={columns.length} className="partner-empty">{empty}</td></tr>}</tbody></table></div>;
}

function Badge({ children, tone = '' }) { return <span className={`partner-badge ${tone}`}>{children}</span>; }

export default function Partner360({ codeProp = '', arrivalCode = '' }) {
  const { db, updateDB, audit, userCourant } = useDB();
  const { peut, moduleVisible, estDirection } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState('Identité');
  const [partnerDraft, setPartnerDraft] = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(arrivalCode ? {
    partenaireId: codeProp, arrivageId: arrivalCode, numero: '', dateFacture: today(),
    dateEcheance: '', montantHt: '', tva: '', montantTtc: '', devise: 'MAD', montantCotation: '',
  } : null);
  const [lcnDraft, setLcnDraft] = useState(null);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const partenaires = db.partenaires || [];
  const arrivages = db.arrivages || [];
  const factures = db.facturesPartenaire || [];
  const lcns = db.lcnPartenaire || [];
  const settings = (db.partnerSettings || []).find(item => item.code === 'PARTNER-V1') || {};
  const roleOptions = settings.roles?.length ? settings.roles : PARTNER_ROLES;
  const statusOptions = settings.statuses?.length ? settings.statuses : PARTNER_STATUSES;
  const paymentOptions = settings.paymentModes?.length ? settings.paymentModes : ['LCN', 'Virement', 'Chèque', 'Espèces'];
  const currencyOptions = settings.currencies?.length ? settings.currencies : ['MAD', 'USD', 'EUR', 'CNY'];
  const lcnStatusOptions = settings.lcnStatuses?.length ? settings.lcnStatuses : LCN_STATUSES;
  const conditionsFields = CONDITIONS.map(field => field[0] === 'modeReglement' ? [field[0], field[1], 'select', paymentOptions]
    : field[0] === 'deviseFacturation' ? [field[0], field[1], 'select', currencyOptions] : field);
  const partner = partenaires.find(item => item.code === codeProp);
  const filtrés = useMemo(() => partenaires.filter(item => {
    const needle = search.trim().toLocaleLowerCase('fr');
    return (!needle || [item.code, item.nom, item.nomCourt, item.pays, item.ville].some(value => String(value || '').toLocaleLowerCase('fr').includes(needle)))
      && (!roleFilter || rolesDuPartenaire(item).includes(roleFilter))
      && (!statusFilter || item.statut === statusFilter);
  }).sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr')), [partenaires, search, roleFilter, statusFilter]);
  const metrics = partner ? indicateursPartenaire(partner, arrivages, factures, lcns) : null;
  const linkedArrivages = partner ? arrivages.filter(a => (a.intervenants || []).some(i => i.partenaireId === partner.code)) : [];
  const partnerInvoices = partner ? factures.filter(f => f.partenaireId === partner.code) : [];
  const partnerLcns = partner ? lcns.filter(l => l.partenaireId === partner.code) : [];
  const change = setter => (key, value) => setter(current => ({ ...current, [key]: value }));
  const fileChanged = async (event, setter, key) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) return toast('PDF de 10 Mo maximum.');
    setter(current => ({ ...current, [key]: { nom: file.name, data: null } }));
    try { const data = await lireFichierDataUrl(file); setter(current => ({ ...current, [key]: { nom: file.name, data } })); }
    catch { toast('Lecture du fichier impossible.'); }
  };
  const fileLink = file => file?.data ? <a href={file.data} download={file.nom}>{file.nom} ↓</a> : '—';

  const savePartner = async () => {
    const draft = { ...partnerDraft };
    if (!peut(draft.code ? 'modifier' : 'ajouter')) return toast('Permission refusée.');
    if (!draft.nom?.trim() || !draft.roles?.length) return toast('Raison sociale et au moins un rôle requis.');
    if (draft.ice && !/^\d{15}$/.test(draft.ice)) return toast('ICE : exactement 15 chiffres.');
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return toast('E-mail invalide.');
    if (draft.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail)) return toast('E-mail du contact invalide.');
    const existing = Boolean(draft.code);
    if (!existing) {
      try { draft.code = await reservePartnerCode(draft.roles[0]); }
      catch (error) { return toast(error.message || 'Code partenaire indisponible.'); }
    }
    draft.id = draft.code;
    draft.statut ||= 'En test';
    draft.dateCreation ||= new Date().toISOString();
    draft.creePar ||= userCourant;
    draft.compteOuvert = Boolean(draft.compteOuvert);
    setSaving(true);
    const ok = await updateDB({ ...db, partenaires: existing
      ? partenaires.map(p => p.code === draft.code ? draft : p) : [...partenaires, draft] });
    setSaving(false);
    if (!ok) return;
    audit('Partenaires', existing ? 'Modification' : 'Création', draft.code, 'fiche', existing ? partnerDraft.nom : '—', draft.nom);
    setPartnerDraft(null);
    window.location.hash = `fichePartenaire:${draft.code}`;
    toast(`Partenaire ${draft.code} enregistré.`);
  };
  const changeStatus = async status => {
    if (!partner || !peut('modifier')) return;
    const ok = await updateDB({ ...db, partenaires: partenaires.map(p => p.code === partner.code ? { ...p, statut: status } : p) });
    if (ok) { audit('Partenaires', 'Statut', partner.code, 'statut', partner.statut, status); toast(`Statut : ${status}`); }
  };
  const saveInvoice = async () => {
    if (!peut(invoiceDraft.code ? 'modifier' : 'ajouter')) return toast('Permission refusée.');
    const f = { ...invoiceDraft, partenaireId: partner.code };
    if (!f.arrivageId || !linkedArrivages.some(a => a.code === f.arrivageId)) return toast('Choisissez un arrivage lié au partenaire.');
    if (!f.numero?.trim() || !f.dateFacture) return toast('Numéro et date de facture requis.');
    if (factures.some(other => other.partenaireId === partner.code && other.numero === f.numero && other.code !== f.code)) return toast('Ce numéro de facture existe déjà pour ce partenaire.');
    if (num(f.montantHt) < 0 || num(f.tva) < 0 || montantTtcMad(f) <= 0) return toast('Montant TTC invalide.');
    if (f.devise !== 'MAD' && num(f.tauxMad) <= 0) return toast('Renseignez le taux de conversion en MAD.');
    const ecart = factureCalculee(f, lcns).ecart;
    if (ecart > 5 && !f.justificationEcart?.trim()) return toast('Écart supérieur à 5 % : justification obligatoire.');
    f.dateEcheance ||= datePlusJours(f.dateFacture, partner.delaiPaiementJours);
    f.code ||= `FP-${Date.now()}`;
    f.id = f.code;
    setSaving(true);
    const ok = await updateDB({ ...db, facturesPartenaire: invoiceDraft.code
      ? factures.map(item => item.code === f.code ? f : item) : [...factures, f] });
    setSaving(false);
    if (ok) { audit('Factures partenaire', invoiceDraft.code ? 'Modification' : 'Création', f.code, 'partenaire', '—', partner.code); setInvoiceDraft(null); toast('Facture enregistrée.'); }
  };
  const saveLcn = async () => {
    if (!peut(lcnDraft.code ? 'modifier' : 'ajouter')) return toast('Permission refusée.');
    const l = { ...lcnDraft, partenaireId: partner.code, affectations: (lcnDraft.affectations || []).filter(a => num(a.montant) > 0) };
    if (!l.numeroLcn?.trim() || !l.banque?.trim() || !l.dateEmission || !l.dateEcheance || num(l.montant) <= 0) return toast('Complétez la LCN (numéro, banque, dates et montant).');
    if (lcns.some(item => item.partenaireId === partner.code && item.numeroLcn === l.numeroLcn && item.code !== l.code)) return toast('Numéro de LCN déjà utilisé.');
    const error = validerAffectations(l, factures, lcns);
    if (error) return toast(error);
    l.code ||= `LCN-${Date.now()}`;
    l.id = l.code;
    setSaving(true);
    const ok = await updateDB({ ...db, lcnPartenaire: lcnDraft.code
      ? lcns.map(item => item.code === l.code ? l : item) : [...lcns, l] });
    setSaving(false);
    if (ok) { audit('LCN partenaire', lcnDraft.code ? 'Modification' : 'Création', l.code, 'statut', '—', l.statut); setLcnDraft(null); toast('LCN enregistrée.'); }
  };
  const changeLcnStatus = async (lcn, status) => {
    if (!peut('modifier')) return;
    const ok = await updateDB({ ...db, lcnPartenaire: lcns.map(item => item.code === lcn.code ? { ...item, statut: status } : item) });
    if (ok) audit('LCN partenaire', 'Statut', lcn.code, 'statut', lcn.statut, status);
  };
  const newInvoice = () => setInvoiceDraft({ partenaireId: partner.code, arrivageId: '', numero: '', dateFacture: today(),
    dateEcheance: datePlusJours(today(), partner.delaiPaiementJours), montantHt: '', tva: '', montantTtc: '', devise: partner.deviseFacturation || 'MAD', tauxMad: '', montantCotation: '', justificationEcart: '' });
  const newLcn = () => setLcnDraft({ partenaireId: partner.code, numeroLcn: '', banque: 'CFG Bank', montant: '',
    dateEmission: today(), dateEcheance: '', statut: 'Émise', affectations: [] });
  const openSettings = () => setSettingsDraft({
    roles: roleOptions.map(([label, code]) => `${label} | ${code}`).join('\n'),
    statuses: statusOptions.join('\n'), paymentModes: paymentOptions.join('\n'),
    currencies: currencyOptions.join('\n'), lcnStatuses: lcnStatusOptions.join('\n'),
  });
  const saveSettings = async () => {
    const lines = value => String(value || '').split('\n').map(s => s.trim()).filter(Boolean);
    const roles = lines(settingsDraft.roles).map(line => line.split('|').map(s => s.trim()));
    const statuses = lines(settingsDraft.statuses);
    const modes = lines(settingsDraft.paymentModes);
    const currencies = lines(settingsDraft.currencies);
    const lcnStatuses = lines(settingsDraft.lcnStatuses);
    if (roles.some(([label, code]) => !label || !/^[A-Z]{3}$/.test(code || ''))
      || new Set(roles.map(([, code]) => code)).size !== roles.length) return toast('Rôles : un libellé et un code unique de 3 lettres par ligne.');
    if (PARTNER_ROLES.some(([label]) => !roles.some(([candidate]) => candidate === label))) return toast('Conservez les rôles logistiques de base pour les arrivages existants.');
    if (PARTNER_ROLES.some(([label, code]) => roles.find(([candidate]) => candidate === label)?.[1] !== code)) return toast('Les codes des rôles de base doivent rester inchangés.');
    if (partenaires.some(p => rolesDuPartenaire(p).some(role => roleOptions.some(([label]) => label === role) && !roles.some(([label]) => label === role)))) return toast('Un rôle déjà utilisé par une fiche ne peut pas être supprimé.');
    if (PARTNER_STATUSES.some(status => !statuses.includes(status))) return toast('Conservez les statuts de base pour le cycle de vie et les contrôles.');
    if (partenaires.some(p => statusOptions.includes(p.statut) && !statuses.includes(p.statut))) return toast('Un statut déjà utilisé par une fiche ne peut pas être supprimé.');
    if (!modes.length || !currencies.includes('MAD') || LCN_STATUSES.some(status => !lcnStatuses.includes(status))) return toast('Modes, MAD et statuts LCN de base requis.');
    const record = { id: 'PARTNER-V1', code: 'PARTNER-V1', roles, statuses, paymentModes: modes, currencies, lcnStatuses };
    const ok = await updateDB({ ...db, partnerSettings: [record] });
    if (ok) { audit('Partenaires', 'Paramètres modifiés', record.code, 'listes', '—', 'Mis à jour'); setSettingsDraft(null); toast('Listes enregistrées.'); }
  };

  if (!moduleVisible('partenaires')) return <div className="partner-page"><Topbar titre="Partenaires logistiques" /><div className="panneau">Module non autorisé.</div></div>;
  if (!partner) return <div className="partner-page"><Topbar titre="Partenaires logistiques" />
    <div className="partner-heading"><div><h1>Partenaires logistiques</h1><p>Identité, convention, dossiers, factures et LCN au même endroit.</p></div>
      <div className="partner-actions">{estDirection() && <button className="btn doux" onClick={openSettings}>Paramètres des listes</button>}
      {peut('ajouter') && <button className="btn" onClick={() => setPartnerDraft({ nom: '', roles: [], statut: 'En test', compteOuvert: false, deviseFacturation: 'MAD', modeReglement: 'LCN' })}>+ Ajouter</button>}</div></div>
    <div className="panneau partner-filters"><input className={inputClass} placeholder="Rechercher par code, nom ou ville" value={search} onChange={e => setSearch(e.target.value)} />
      <select className={inputClass} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="">Tous les rôles</option>{roleOptions.map(([role]) => <option key={role}>{role}</option>)}</select>
      <select className={inputClass} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Tous les statuts</option>{statusOptions.map(s => <option key={s}>{s}</option>)}</select></div>
    <div className="panneau"><Table rows={filtrés} columns={[
      ['code', 'Code', value => <a href={`#fichePartenaire:${value}`}>{value}</a>],
      ['nom', 'Raison sociale', (v, p) => <a href={`#fichePartenaire:${p.code}`}>{v}</a>],
      ['roles', 'Rôles', (_, p) => rolesDuPartenaire(p).join(' · ') || '—'],
      ['statut', 'Statut', value => <Badge tone={value === 'Suspendu' ? 'danger' : ''}>{value || '—'}</Badge>],
      ['dossiers', 'Dossiers en cours', (_, p) => indicateursPartenaire(p, arrivages, factures, lcns).dossiersEnCours],
      ['encours', 'Encours à payer', (_, p) => mad(indicateursPartenaire(p, arrivages, factures, lcns).encours)],
      ['plafond', 'Plafond utilisé', (_, p) => { const v = indicateursPartenaire(p, arrivages, factures, lcns).plafondUtilise; return v == null ? '—' : `${argent(v)} %`; }],
      ['lcn', 'LCN à échéance', (_, p) => { const next = lcns.filter(l => l.partenaireId === p.code && l.statut === 'Remise' && joursAvant(l.dateEcheance) >= 0).sort((a, b) => a.dateEcheance.localeCompare(b.dateEcheance))[0]; return next?.dateEcheance || '—'; }],
    ]} /></div>{renderPartnerForm()}{renderSettingsForm()}</div>;

  function renderSettingsForm() { return settingsDraft && <Modal large title="Paramètres des listes partenaires" onClose={() => setSettingsDraft(null)}
    footer={<><button className="btn doux" onClick={() => setSettingsDraft(null)}>Annuler</button><button className="btn" onClick={saveSettings}>Enregistrer</button></>}>
    <div className="partner-modal-body"><p>Une valeur par ligne. Les rôles logistiques et statuts de base doivent rester présents afin de préserver les dossiers liés.</p>
      <div className="partner-fields">{[
        ['roles', 'Rôles (libellé | code)'], ['statuses', 'Statuts partenaires'],
        ['paymentModes', 'Modes de règlement'], ['currencies', 'Devises'], ['lcnStatuses', 'Statuts LCN'],
      ].map(([key, label]) => <label className="partner-field" key={key}><span>{label}</span><textarea className={inputClass} rows="6" value={settingsDraft[key]} onChange={e => setSettingsDraft(current => ({ ...current, [key]: e.target.value }))} /></label>)}</div></div></Modal>; }

  function renderPartnerForm() { return partnerDraft && <Modal large title={partnerDraft.code ? `Modifier ${partnerDraft.code}` : 'Ajouter un partenaire'} onClose={() => setPartnerDraft(null)}
    footer={<><button className="btn doux" onClick={() => setPartnerDraft(null)}>Annuler</button><button className="btn" disabled={saving} onClick={savePartner}>Enregistrer</button></>}>
    <div className="partner-modal-body"><h4>Identité</h4><Fields fields={IDENTITY} value={partnerDraft} onChange={change(setPartnerDraft)} />
      <div className="partner-field"><span>Rôles * — le premier détermine le code</span><div className="partner-checks">{roleOptions.map(([role]) => <label key={role}><input type="checkbox" checked={(partnerDraft.roles || []).includes(role)} onChange={e => setPartnerDraft(current => ({ ...current, roles: e.target.checked ? [...(current.roles || []), role] : (current.roles || []).filter(r => r !== role) }))} /> {role}</label>)}</div></div>
      <label className="partner-field"><span>Statut</span><select className={inputClass} value={partnerDraft.statut || 'En test'} onChange={e => setPartnerDraft(current => ({ ...current, statut: e.target.value }))}>{statusOptions.map(s => <option key={s}>{s}</option>)}</select></label>
      <h4>Convention & conditions</h4><label className="partner-field"><input type="checkbox" checked={Boolean(partnerDraft.compteOuvert)} onChange={e => setPartnerDraft(current => ({ ...current, compteOuvert: e.target.checked }))} /> Compte ouvert</label>
      <Fields fields={conditionsFields} value={partnerDraft} onChange={change(setPartnerDraft)} />
      {['fichierConvention', 'fichierCgv'].map((key, i) => <label className="partner-field" key={key}><span>{i ? 'CGV (PDF)' : 'Convention (PDF)'}</span><input type="file" accept="application/pdf" onChange={e => fileChanged(e, setPartnerDraft, key)} />{partnerDraft[key]?.nom}</label>)}</div>
  </Modal>; }

  const tabs = ['Identité', 'Convention & conditions', 'Dossiers en cours', 'Factures partenaire', 'Paiements & LCN'];
  const alerts = [
    metrics.plafondUtilise >= 100 && 'Plafond dépassé : validation de la gérante requise avant tout nouveau dossier.',
    metrics.plafondUtilise >= 80 && metrics.plafondUtilise < 100 && 'Plafond de crédit bientôt atteint.',
    metrics.lcnImpayees > 0 && `${metrics.lcnImpayees} LCN impayée(s) : risque critique sur les marchandises.`,
    metrics.facturesEnRetard > 0 && `${metrics.facturesEnRetard} facture(s) en retard.`,
    metrics.lcnEcheance > 0 && `${metrics.lcnEcheance} LCN remise(s) à échéance dans les 7 jours.`,
  ].filter(Boolean);
  return <div className="partner-page"><Topbar titre={`Partenaire · ${partner.code}`} />
    <div className="partner-heading"><div><a href="#partenaires">← Partenaires</a><h1>{partner.nom}</h1><p>{partner.code} · {rolesDuPartenaire(partner).join(' · ')}</p>
      <Badge tone={['Suspendu', 'Archivé'].includes(partner.statut) ? 'danger' : ''}>{partner.statut}</Badge>{partner.contact && <span className="partner-contact">{partner.contact} · <a href={`tel:${partner.contactTel || partner.telephone}`}>{partner.contactTel || partner.telephone || '—'}</a></span>}</div>
      {peut('modifier') && <div className="partner-actions"><button className="btn doux" onClick={() => setPartnerDraft({ ...partner, roles: rolesDuPartenaire(partner) })}>Modifier</button>
        <button className="btn doux" onClick={() => changeStatus(partner.statut === 'Suspendu' ? 'Actif' : 'Suspendu')}>{partner.statut === 'Suspendu' ? 'Réactiver' : 'Suspendre'}</button>
        <button className="btn doux" onClick={() => changeStatus('Archivé')}>Archiver</button></div>}</div>
    <div className="partner-kpis">{[
      ['Dossiers en cours', metrics.dossiersEnCours], ['Encours à payer', mad(metrics.encours)],
      ['Plafond utilisé', metrics.plafondUtilise == null ? 'Sans plafond' : `${argent(metrics.plafondUtilise)} %`],
      ['LCN à échéance (7 j)', metrics.lcnEcheance], ['Factures en retard', metrics.facturesEnRetard],
      ['Écart moyen facture / cotation', metrics.ecartMoyen == null ? '—' : `${argent(metrics.ecartMoyen)} %`],
    ].map(([label, value]) => <div className="panneau" key={label}><small>{label}</small><strong>{value}</strong>{label === 'Plafond utilisé' && metrics.plafondUtilise != null && <progress max="100" value={Math.min(metrics.plafondUtilise, 100)} />}</div>)}</div>
    {alerts.map((alert, i) => <div className={`partner-alert ${alert.includes('impayée') || alert.includes('dépassé') ? 'danger' : ''}`} key={i}>{alert}</div>)}
    <div className="panneau partner-cycle">{['Prospection', 'En test', 'Actif', 'Préféré'].map((stage, index) => <div key={stage} className={PARTNER_STATUSES.indexOf(partner.statut) >= index && PARTNER_STATUSES.indexOf(partner.statut) <= 3 ? 'done' : ''}>{index + 1}. {stage}</div>)}{partner.statut === 'Suspendu' && <Badge tone="danger">Suspendu</Badge>}</div>
    <nav className="partner-tabs">{tabs.map((label, index) => <button key={label} className={tab === label ? 'selected' : ''} onClick={() => setTab(label)}>{index + 1}. {label}</button>)}</nav>
    {tab === 'Identité' && <div className="panneau partner-details">{IDENTITY.map(([key, label]) => <div key={key}><small>{label}</small><b>{partner[key] || '—'}</b></div>)}<div><small>Rôles</small><b>{rolesDuPartenaire(partner).join(' · ') || '—'}</b></div><div><small>Créé le / par</small><b>{day(partner.dateCreation) || '—'} · {partner.creePar || '—'}</b></div></div>}
    {tab === 'Convention & conditions' && <div className="panneau partner-details"><div><small>Compte ouvert</small><b>{partner.compteOuvert ? 'Oui' : 'Non'}</b></div>{CONDITIONS.map(([key, label]) => <div key={key}><small>{label}</small><b>{partner[key] || '—'}</b></div>)}<div><small>Convention</small><b>{fileLink(partner.fichierConvention)}</b></div><div><small>CGV</small><b>{fileLink(partner.fichierCgv)}</b></div></div>}
    {tab === 'Dossiers en cours' && <div className="panneau"><label className="partner-toggle"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Afficher les clôturés</label>
      <Table rows={linkedArrivages.filter(a => showClosed || !['Clôturé', 'Annulé'].includes(a.statut))} columns={[
        ['code', 'N° dossier', v => <a href={`#ficheArrivage:${v}`}>{v}</a>],
        ['nomClientSource', 'Client'], ['intervenants', 'Rôle', (_, a) => (a.intervenants || []).filter(i => i.partenaireId === partner.code).map(i => i.role).join(' · ')],
        ['statut', 'Étape'], ['dateArriveePort', 'Arrivée au port', (_, a) => a.dateArriveePort || a.dateArriveeReelle || '—'],
        ['freeTime', 'Free time restant', (_, a) => { const d = joursAvant(datePlusJours(a.dateArriveePort || a.dateArriveeReelle, partner.freeTimeJours)); return d == null ? '—' : <Badge tone={d <= 0 ? 'danger' : d <= 3 ? 'warning' : ''}>{d} j</Badge>; }],
        ['facture', 'Montant facturé', (_, a) => mad(partnerInvoices.filter(f => f.arrivageId === a.code).reduce((sum, f) => sum + montantTtcMad(f), 0))],
      ]} /></div>}
    {tab === 'Factures partenaire' && <div className="panneau"><div className="partner-section-head"><h3>Factures partenaire</h3>{peut('ajouter') && <button className="btn" onClick={newInvoice}>+ Facture</button>}</div>
      <Table rows={partnerInvoices} columns={[
        ['numero', 'N°', (_, f) => peut('modifier') ? <button className="partner-link" onClick={() => setInvoiceDraft({ ...f })}>{f.numero}</button> : f.numero],
        ['arrivageId', 'Dossier', v => <a href={`#ficheArrivage:${v}`}>{v}</a>], ['dateFacture', 'Date'], ['dateEcheance', 'Échéance'],
        ['ttc', 'TTC (MAD)', (_, f) => mad(factureCalculee(f, lcns).total)], ['paye', 'Payé', (_, f) => mad(factureCalculee(f, lcns).paye)],
        ['reste', 'Reste', (_, f) => mad(factureCalculee(f, lcns).reste)],
        ['ecart', 'Écart cotation', (_, f) => { const e = factureCalculee(f, lcns).ecart; return e == null ? '—' : <Badge tone={e > 5 ? 'warning' : ''}>{argent(e)} %</Badge>; }],
        ['statut', 'Statut', (_, f) => <Badge tone={factureCalculee(f, lcns).retard ? 'danger' : ''}>{factureCalculee(f, lcns).statut}</Badge>],
        ['fichier', 'PDF', v => fileLink(v)],
      ]} /><p className="partner-total">Total TTC : {mad(partnerInvoices.reduce((sum, f) => sum + montantTtcMad(f), 0))} · Reste : {mad(metrics.encours)}</p></div>}
    {tab === 'Paiements & LCN' && <div className="panneau"><div className="partner-section-head"><h3>Paiements & LCN</h3>{peut('ajouter') && <button className="btn" onClick={newLcn}>+ LCN</button>}</div>
      <p>Engagé en LCN remise : <b>{mad(metrics.engageLcn)}</b></p><div className="partner-schedule">{Object.entries(partnerLcns.filter(l => l.statut === 'Remise' && joursAvant(l.dateEcheance) >= 0)
        .reduce((groups, l) => { const key = `Semaine du ${datePlusJours(l.dateEcheance, -(new Date(`${l.dateEcheance}T12:00:00Z`).getUTCDay() + 6) % 7)}`; (groups[key] ||= []).push(l); return groups; }, {}))
        .map(([week, notes]) => <Badge key={week}>{week} · {mad(notes.reduce((sum, l) => sum + num(l.montant), 0))}</Badge>)}</div>
      <Table rows={partnerLcns} columns={[
        ['numeroLcn', 'N° LCN', (_, l) => peut('modifier') ? <button className="partner-link" onClick={() => setLcnDraft({ ...l })}>{l.numeroLcn}</button> : l.numeroLcn],
        ['banque', 'Banque'], ['montant', 'Montant', v => mad(v)], ['dateEmission', 'Émission'], ['dateEcheance', 'Échéance'],
        ['affectations', 'Factures couvertes', v => (v || []).map(a => partnerInvoices.find(f => f.code === a.factureId)?.numero || a.factureId).join(', ') || '—'],
        ['statut', 'Statut', (_, l) => peut('modifier') ? <select value={l.statut} onChange={e => changeLcnStatus(l, e.target.value)}>{lcnStatusOptions.map(s => <option key={s}>{s}</option>)}</select> : l.statut],
        ['scan', 'Scan', v => fileLink(v)],
      ]} /></div>}
    <p className="partner-soon">Cotations · Litiges · Documents · Contacts multiples · Capacités · Historique · Évaluation · Audit — bientôt</p>
    {renderPartnerForm()}
    {invoiceDraft && <Modal large title={invoiceDraft.code ? 'Modifier facture partenaire' : 'Nouvelle facture partenaire'} onClose={() => setInvoiceDraft(null)}
      footer={<><button className="btn doux" onClick={() => setInvoiceDraft(null)}>Annuler</button><button className="btn" disabled={saving} onClick={saveInvoice}>Enregistrer</button></>}>
      <div className="partner-modal-body"><div className="partner-fields"><label className="partner-field"><span>Arrivage *</span><select className={inputClass} value={invoiceDraft.arrivageId} onChange={e => change(setInvoiceDraft)('arrivageId', e.target.value)}><option value="">—</option>{linkedArrivages.map(a => <option key={a.code} value={a.code}>{a.code} · {a.nomClientSource || ''}</option>)}</select></label>
        {[
          ['numero', 'Numéro *'], ['dateFacture', 'Date facture *', 'date'], ['dateEcheance', 'Échéance', 'date'],
          ['montantHt', 'Montant HT', 'number'], ['tva', 'TVA (montant)', 'number'], ['montantTtc', 'Montant TTC', 'number'],
          ['devise', 'Devise', 'select', currencyOptions], ['montantCotation', 'Cotation prévue (MAD)', 'number'],
        ].map(field => <Champ key={field[0]} field={field} value={invoiceDraft[field[0]]} onChange={(key, value) => setInvoiceDraft(current => ({ ...current, [key]: value,
          ...(key === 'dateFacture' && !current.code ? { dateEcheance: datePlusJours(value, partner.delaiPaiementJours) } : {}),
          ...(['montantHt', 'tva'].includes(key) && !current.montantTtcModifie
            ? { montantTtc: String(num(key === 'montantHt' ? value : current.montantHt) + num(key === 'tva' ? value : current.tva)) } : {}),
          ...(key === 'montantTtc' ? { montantTtcModifie: true } : {}),
        }))} />)}
        {invoiceDraft.devise !== 'MAD' && <Champ field={['tauxMad', `1 ${invoiceDraft.devise} = MAD`, 'number']} value={invoiceDraft.tauxMad} onChange={change(setInvoiceDraft)} />}
        <Champ field={['justificationEcart', 'Justification de l’écart > 5 %', 'textarea']} value={invoiceDraft.justificationEcart} onChange={change(setInvoiceDraft)} />
        <label className="partner-field"><span>Facture PDF</span><input type="file" accept="application/pdf" onChange={e => fileChanged(e, setInvoiceDraft, 'fichier')} />{invoiceDraft.fichier?.nom}</label></div>
        <p>TTC calculé : <b>{mad(montantTtcMad(invoiceDraft))}</b> · Statut : {factureCalculee({ ...invoiceDraft, partenaireId: partner.code }, lcns).statut}</p></div></Modal>}
    {lcnDraft && <Modal large title={lcnDraft.code ? 'Modifier LCN' : 'Nouvelle LCN'} onClose={() => setLcnDraft(null)}
      footer={<><button className="btn doux" onClick={() => setLcnDraft(null)}>Annuler</button><button className="btn" disabled={saving} onClick={saveLcn}>Enregistrer</button></>}>
      <div className="partner-modal-body"><Fields fields={[
        ['numeroLcn', 'Numéro LCN *'], ['banque', 'Banque *'], ['montant', 'Montant (MAD) *', 'number'],
        ['dateEmission', 'Date émission *', 'date'], ['dateEcheance', 'Date échéance *', 'date'], ['dateRemise', 'Date remise', 'date'],
        ['statut', 'Statut', 'select', lcnStatusOptions],
      ]} value={lcnDraft} onChange={change(setLcnDraft)} /><h4>Affectation aux factures ouvertes</h4>
        {partnerInvoices.filter(f => factureCalculee(f, lcns.filter(l => l.code !== lcnDraft.code)).reste > 0.005 || (lcnDraft.affectations || []).some(a => a.factureId === f.code)).map(f => {
          const amount = (lcnDraft.affectations || []).find(a => a.factureId === f.code)?.montant || '';
          return <label className="partner-allocation" key={f.code}><span>{f.numero} · disponible {mad(factureCalculee(f, lcns.filter(l => l.code !== lcnDraft.code)).reste)}</span>
            <input className={inputClass} type="number" min="0" value={amount} onChange={e => setLcnDraft(current => ({ ...current, affectations: [
              ...(current.affectations || []).filter(a => a.factureId !== f.code), { factureId: f.code, montant: e.target.value },
            ] }))} /></label>;
        })}<p>Affecté : <b>{mad((lcnDraft.affectations || []).reduce((sum, a) => sum + num(a.montant), 0))}</b> / {mad(lcnDraft.montant)}</p>
        <label className="partner-field"><span>Scan PDF</span><input type="file" accept="application/pdf" onChange={e => fileChanged(e, setLcnDraft, 'scan')} />{lcnDraft.scan?.nom}</label></div></Modal>}
  </div>;
}

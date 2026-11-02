import React, { useMemo, useState } from 'react';
import { PackagePlus, Plus, Save, Ship, Trash2 } from 'lucide-react';
import Topbar from '../layout/Topbar';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { calculateGroup, chargeable, daysApart, eligible } from '../../utils/groupage';
import { initialiserRevueArrivage, prefillArrivageDepuisCommandes } from '../../utils/arrivageWorkflow';
import './GroupageArrivages.css';

const modes = { air: 'Aérien', lcl: 'Maritime · groupage LCL' };
const natures = ['Générale', 'DGR / batteries', 'Périssable', 'Alimentaire', 'Haute valeur'];
const money = (value, currency = 'MAD') => `${Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`;
const emptyTariff = { mode: 'air', origine: '', destination: '', nature: 'Générale', diviseur: 6000, minimum: 0, prixUnitaire: 0, fraisDepart: 0, fraisCommande: 0, devise: 'MAD', actif: true };
const emptyOrder = { mode: 'air', origine: '', destination: '', datePret: '', poidsKg: '', nature: 'Générale', pret: false, documentsComplets: false, exclu: false, colis: [{ longueur: '', largeur: '', hauteur: '', quantite: 1 }] };

export default function GroupageArrivages() {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { userCourant } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('Propositions');
  const [mode, setMode] = useState('air');
  const [search, setSearch] = useState('');
  const [editingCode, setEditingCode] = useState('');
  const [orderDraft, setOrderDraft] = useState(emptyOrder);
  const [tariffDraft, setTariffDraft] = useState(emptyTariff);
  const [editingTariff, setEditingTariff] = useState('');
  const [windowDays, setWindowDays] = useState(5);
  const [allocation, setAllocation] = useState('prorata');
  const [responsable, setResponsable] = useState(userCourant || '');
  const [depart, setDepart] = useState('');
  const [excluded, setExcluded] = useState([]);
  const [busy, setBusy] = useState(false);

  const existing = useMemo(() => db.groupageCommandes || [], [db.groupageCommandes]);
  const tariffs = db.groupageTarifs || [];
  const groupages = db.groupages || [];
  const groupedCodes = useMemo(() => new Set((db.groupages || []).filter(item => item.statut === 'Validé').flatMap(item => item.commandes || [])), [db.groupages]);
  const attachedCodes = useMemo(() => new Set((db.arrivages || []).flatMap(item => item.commandes || [])), [db.arrivages]);
  const orders = useMemo(() => (db.commandes || []).filter(item => item.statut !== 'Annulée').map(item => {
    const supplement = existing.find(row => row.commande === item.code) || {};
    const client = (db.clients || []).find(row => row.code === item.client);
    return { ...emptyOrder, ...supplement, commande: item.code, reference: item.referenceMetier || item.code, client: client?.nom || item.client || '—', dateCommande: item.dateConfirmation || item.dateCommande || '', colis: supplement.colis || emptyOrder.colis };
  }), [db.commandes, db.clients, existing]);
  const visibleOrders = orders.filter(item => item.mode === mode && `${item.reference} ${item.client} ${item.origine} ${item.destination}`.toLowerCase().includes(search.toLowerCase()));
  const visibleTariffs = tariffs.filter(item => item.mode === mode && item.actif !== false);
  const proposals = useMemo(() => visibleTariffs.map(tariff => {
    const candidates = orders.filter(order => !attachedCodes.has(order.commande) && eligible(order, tariff, groupedCodes));
    const clusters = [];
    candidates.sort((a, b) => a.datePret.localeCompare(b.datePret)).forEach(order => {
      let cluster = clusters.find(items => daysApart(items[0].datePret, order.datePret) <= windowDays);
      if (!cluster) { cluster = []; clusters.push(cluster); }
      cluster.push(order);
    });
    return clusters.filter(items => items.length >= 2).map(items => ({ tariff, items, key: `${tariff.code}:${items[0].datePret}` }));
  }).flat(), [visibleTariffs, orders, groupedCodes, attachedCodes, windowDays]);
  const proposedCodes = new Set(proposals.flatMap(item => item.items.map(order => order.commande)));
  const solos = orders.filter(order => order.mode === mode && !proposedCodes.has(order.commande) && !attachedCodes.has(order.commande) && !groupedCodes.has(order.commande) && visibleTariffs.some(tariff => eligible(order, tariff, groupedCodes)));

  const saveOrder = async () => {
    if (!editingCode) return;
    const record = { ...orderDraft, code: `GCO-${editingCode}`, commande: editingCode, updatedAt: new Date().toISOString() };
    const next = existing.filter(item => item.commande !== editingCode).concat(record);
    setBusy(true);
    const ok = await updateDB({ ...db, groupageCommandes: next });
    setBusy(false);
    if (ok) { audit('Groupage', 'Préparation commande', editingCode, 'groupage', '', `${record.origine} → ${record.destination}`); setEditingCode(''); toast('Commande enregistrée pour le groupage.'); }
  };
  const saveTariff = async () => {
    if (!tariffDraft.origine.trim() || !tariffDraft.destination.trim() || Number(tariffDraft.prixUnitaire) <= 0) { toast('Origine, destination et tarif unitaire sont obligatoires.'); return; }
    const record = { ...tariffDraft, code: editingTariff || genCode('GTA'), updatedAt: new Date().toISOString() };
    setBusy(true);
    const ok = await updateDB({ ...db, groupageTarifs: tariffs.filter(item => item.code !== record.code).concat(record) });
    setBusy(false);
    if (ok) { audit('Groupage', editingTariff ? 'Tarif modifié' : 'Tarif créé', record.code, 'route', '', `${record.origine} → ${record.destination}`); setEditingTariff(''); setTariffDraft(emptyTariff); toast('Tarif enregistré.'); }
  };
  const validate = async proposal => {
    const picked = proposal.items.filter(item => !excluded.includes(item.commande));
    if (picked.length < 2) { toast('Sélectionnez au moins deux commandes compatibles.'); return; }
    if (!responsable.trim() || !depart) { toast('Indiquez le responsable et la date de départ prévue.'); return; }
    if (picked.some(item => groupedCodes.has(item.commande) || attachedCodes.has(item.commande))) { toast('Une commande est déjà rattachée à un arrivage. Actualisez la page.'); return; }
    const calculation = calculateGroup(picked, proposal.tariff, allocation);
    const code = genCode('GRP');
    const arrivalCode = genCode('ARR');
    const now = new Date().toISOString();
    const group = { code, arrivage: arrivalCode, commandes: picked.map(item => item.commande), tarif: proposal.tariff.code, mode, responsable: responsable.trim(), departPrevu: depart, allocation, calcul: calculation, statut: 'Validé', creeLe: now, creePar: userCourant };
    const prefill = prefillArrivageDepuisCommandes(db, group.commandes);
    const arrival = initialiserRevueArrivage({ code: arrivalCode, commandes: group.commandes, groupageCode: code, ...prefill, modeTransport: modes[mode], statut: 'Préparation', dateDepartPrevue: depart, responsableLimex: responsable.trim(), nomInterne: `Groupage ${code} · ${picked.length} commandes`, ts: Date.now() }, userCourant, now);
    setBusy(true);
    const ok = await updateDB({ ...db, groupages: groupages.concat(group), arrivages: (db.arrivages || []).concat(arrival) });
    setBusy(false);
    if (ok) { audit('Groupage', 'Validation', code, 'arrivage', '', arrivalCode); notifier('Imane', `Nouvel arrivage groupé ${arrivalCode} : ${picked.length} commandes à examiner. Lien : #ficheArrivage:${arrivalCode}`, 'Arrivages'); setExcluded([]); setTab('Arrivages'); toast(`Groupage ${code} validé · arrivage ${arrivalCode} créé.`); }
  };
  const cancel = async group => {
    if (!window.confirm(`Annuler le groupage ${group.code} et libérer ses commandes ?`)) return;
    const arrival = (db.arrivages || []).find(item => item.code === group.arrivage);
    if (arrival && !['Préparation', 'Attente documents', 'Annulé'].includes(arrival.statut)) { toast('Cet arrivage a déjà avancé. Annulez-le depuis sa fiche avant de libérer les commandes.'); return; }
    setBusy(true);
    const ok = await updateDB({ ...db, groupages: groupages.map(item => item.code === group.code ? { ...item, statut: 'Annulé', annuleLe: new Date().toISOString(), annulePar: userCourant } : item), arrivages: (db.arrivages || []).map(item => item.code === group.arrivage ? { ...item, statut: 'Annulé', commandes: [] } : item) });
    setBusy(false);
    if (ok) { audit('Groupage', 'Annulation', group.code, 'statut', 'Validé', 'Annulé'); toast('Groupage annulé, commandes libérées.'); }
  };
  const openOrder = item => { setEditingCode(item.commande); setOrderDraft({ ...emptyOrder, ...existing.find(row => row.commande === item.commande), commande: item.commande }); };
  const openTariff = item => { setEditingTariff(item.code); setTariffDraft(item); };
  const field = (label, value, setter, type = 'text') => <label>{label}<input type={type} value={value ?? ''} onChange={event => setter(event.target.value)} /></label>;

  return <><Topbar titre="Groupage arrivages" /><div className="groupage-shell">
    <header className="groupage-heading"><div><h1>Groupage des arrivages</h1><p>Regroupez les commandes prêtes, comparez le coût et créez l’arrivage commun.</p></div><span>{orders.length} commandes · {groupages.filter(item => item.statut === 'Validé').length} groupages actifs</span></header>
    <div className="groupage-mode">{Object.entries(modes).map(([key, label]) => <button key={key} className={mode === key ? 'active' : ''} onClick={() => { setMode(key); setExcluded([]); }}>{label}</button>)}</div>
    <nav className="groupage-tabs">{['Propositions', 'Commandes', 'Tarifs', 'Arrivages', 'Réglages'].map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</nav>
    {tab === 'Propositions' && <div className="groupage-stack"><p className="groupage-help">Une proposition exige deux commandes prêtes, des documents complets, une route et une nature identiques, avec des dates proches de {windowDays} jours maximum.</p>{proposals.map(proposal => { const picked = proposal.items.filter(item => !excluded.includes(item.commande)); const calc = calculateGroup(picked, proposal.tariff, allocation); return <section className="groupage-card" key={proposal.key}><div className="groupage-card-head"><div><h2>{proposal.tariff.origine} → {proposal.tariff.destination}</h2><small>{modes[mode]} · {proposal.tariff.nature} · {picked.length} commandes sélectionnées · {proposal.tariff.code}</small></div><strong>{money(calc.totalAlone - calc.totalGroup, proposal.tariff.devise)} économisés</strong></div><div className="groupage-table-wrap"><table><thead><tr><th></th><th>Commande / client</th><th>Prête le</th><th>Chargeable</th><th>Seule</th><th>Groupée</th></tr></thead><tbody>{proposal.items.map(item => { const index = picked.findIndex(row => row.commande === item.commande); return <tr key={item.commande}><td><input type="checkbox" checked={!excluded.includes(item.commande)} onChange={event => setExcluded(current => event.target.checked ? current.filter(code => code !== item.commande) : [...new Set([...current, item.commande])])} /></td><td><a href={`#ficheCommande:${item.commande}`}>{item.reference}</a><small>{item.client}</small></td><td>{item.datePret}</td><td>{chargeable(item, proposal.tariff.diviseur).toFixed(2)} {mode === 'air' ? 'kg' : 'UP'}</td><td>{index >= 0 ? money(calc.individual[index], proposal.tariff.devise) : '—'}</td><td>{index >= 0 ? money(calc.allocations[index], proposal.tariff.devise) : '—'}</td></tr>; })}</tbody></table></div><div className="groupage-actions">{field('Responsable', responsable, setResponsable)}{field('Départ prévu', depart, setDepart, 'date')}<button disabled={busy || picked.length < 2} onClick={() => validate(proposal)}><Ship size={16} /> Valider et créer l’arrivage</button></div></section>; })}{!proposals.length && <div className="groupage-card groupage-empty">Aucune proposition compatible. Préparez les commandes et ajoutez un tarif pour cette route.</div>}{solos.length > 0 && <section className="groupage-card"><h2>Commandes prêtes, seules sur leur départ</h2><p className="groupage-help">Ces commandes attendent un partenaire compatible dans la fenêtre de dates.</p><div className="groupage-table-wrap"><table><thead><tr><th>Commande</th><th>Client</th><th>Route</th><th>Prête le</th><th>Chargeable</th><th>Minimum restant</th></tr></thead><tbody>{solos.map(order => { const tariff = visibleTariffs.find(item => eligible(order, item, groupedCodes)); const unit = chargeable(order, tariff?.diviseur); return <tr key={order.commande}><td><a href={`#ficheCommande:${order.commande}`}>{order.reference}</a></td><td>{order.client}</td><td>{order.origine} → {order.destination}</td><td>{order.datePret}</td><td>{unit.toFixed(2)} {mode === 'air' ? 'kg' : 'UP'}</td><td>{Math.max(0, Number(tariff?.minimum || 0) - unit).toFixed(2)}</td></tr>; })}</tbody></table></div></section>}</div>}
    {tab === 'Commandes' && <section className="groupage-card"><div className="groupage-card-head"><div><h2>Commandes CRM</h2><small>Les renseignements de groupage complètent chaque commande sans changer sa fiche commerciale.</small></div><input placeholder="Rechercher commande ou client…" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="groupage-table-wrap"><table><thead><tr><th>Commande</th><th>Client</th><th>Route</th><th>Date prête</th><th>Chargeable</th><th>État</th><th></th></tr></thead><tbody>{visibleOrders.map(item => <tr key={item.commande}><td><a href={`#ficheCommande:${item.commande}`}>{item.reference}</a></td><td>{item.client}</td><td>{item.origine && item.destination ? `${item.origine} → ${item.destination}` : 'À compléter'}</td><td>{item.datePret || '—'}</td><td>{chargeable(item).toFixed(2)} {mode === 'air' ? 'kg' : 'UP'}</td><td>{groupedCodes.has(item.commande) || attachedCodes.has(item.commande) ? 'Déjà affectée' : item.pret && item.documentsComplets ? 'Prête' : 'À compléter'}</td><td><button onClick={() => openOrder(item)}>Préparer</button></td></tr>)}{!visibleOrders.length && <tr><td colSpan="7">Aucune commande dans ce mode.</td></tr>}</tbody></table></div></section>}
    {tab === 'Tarifs' && <section className="groupage-card"><div className="groupage-card-head"><div><h2>Tarifs de groupage</h2><small>Enregistrez le tarif réel de chaque route avant de comparer les coûts.</small></div><button onClick={() => { setEditingTariff('nouveau'); setTariffDraft({ ...emptyTariff, mode }); }}><Plus size={15} /> Ajouter un tarif</button></div><div className="groupage-table-wrap"><table><thead><tr><th>Route</th><th>Nature</th><th>Prix / {mode === 'air' ? 'kg' : 'UP'}</th><th>Minimum</th><th>Frais départ</th><th>Par commande</th><th></th></tr></thead><tbody>{tariffs.filter(item => item.mode === mode).map(item => <tr key={item.code}><td>{item.origine} → {item.destination}</td><td>{item.nature}</td><td>{money(item.prixUnitaire, item.devise)}</td><td>{item.minimum}</td><td>{money(item.fraisDepart, item.devise)}</td><td>{money(item.fraisCommande, item.devise)}</td><td><button onClick={() => openTariff(item)}>Modifier</button></td></tr>)}{!tariffs.some(item => item.mode === mode) && <tr><td colSpan="7">Aucun tarif saisi.</td></tr>}</tbody></table></div></section>}
    {tab === 'Arrivages' && <section className="groupage-card"><h2>Groupages validés</h2><div className="groupage-table-wrap"><table><thead><tr><th>Groupage</th><th>Arrivage</th><th>Commandes</th><th>Départ prévu</th><th>Coût groupé</th><th>Statut</th><th></th></tr></thead><tbody>{groupages.filter(item => item.mode === mode).map(item => <tr key={item.code}><td>{item.code}</td><td><a href={`#ficheArrivage:${item.arrivage}`}>{item.arrivage}</a></td><td>{(item.commandes || []).map(code => <a key={code} href={`#ficheCommande:${code}`}>{(db.commandes || []).find(row => row.code === code)?.referenceMetier || code} </a>)}</td><td>{item.departPrevu}</td><td>{money(item.calcul?.totalGroup, tariffs.find(row => row.code === item.tarif)?.devise)}</td><td>{item.statut}</td><td>{item.statut === 'Validé' && <button disabled={busy} onClick={() => cancel(item)}>Annuler</button>}</td></tr>)}{!groupages.some(item => item.mode === mode) && <tr><td colSpan="7">Aucun groupage validé.</td></tr>}</tbody></table></div></section>}
    {tab === 'Réglages' && <section className="groupage-card groupage-settings"><h2>Règles de proposition</h2>{field('Écart maximum entre dates prêtes (jours)', windowDays, value => setWindowDays(Math.max(0, Number(value) || 0)), 'number')}<label>Répartition des frais fixes<select value={allocation} onChange={event => setAllocation(event.target.value)}><option value="prorata">Au prorata de la charge</option><option value="egal">À parts égales</option></select></label><p>Ces réglages concernent la simulation en cours. Chaque groupage validé conserve la méthode utilisée.</p></section>}
  </div>
  {editingCode && <div className="groupage-overlay"><div className="groupage-dialog"><div className="groupage-card-head"><h2>Préparer {orders.find(item => item.commande === editingCode)?.reference}</h2><button onClick={() => setEditingCode('')}>Fermer</button></div><div className="groupage-fields"><label>Mode<select value={orderDraft.mode} onChange={event => setOrderDraft({ ...orderDraft, mode: event.target.value })}>{Object.entries(modes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>{[['Origine', 'origine'], ['Destination', 'destination'], ['Date prête', 'datePret', 'date'], ['Poids réel (kg)', 'poidsKg', 'number']].map(([label, key, type]) => <label key={key}>{label}<input type={type || 'text'} value={orderDraft[key] ?? ''} onChange={event => setOrderDraft({ ...orderDraft, [key]: event.target.value })} /></label>)}<label>Nature<select value={orderDraft.nature} onChange={event => setOrderDraft({ ...orderDraft, nature: event.target.value })}>{natures.map(value => <option key={value}>{value}</option>)}</select></label></div><h3>Colis et dimensions (cm)</h3>{orderDraft.colis.map((box, index) => <div className="groupage-box" key={index}>{[['Longueur', 'longueur'], ['Largeur', 'largeur'], ['Hauteur', 'hauteur'], ['Quantité', 'quantite']].map(([label, key]) => <label key={key}>{label}<input type="number" min="0" value={box[key]} onChange={event => setOrderDraft({ ...orderDraft, colis: orderDraft.colis.map((entry, i) => i === index ? { ...entry, [key]: event.target.value } : entry) })} /></label>)}<button onClick={() => setOrderDraft({ ...orderDraft, colis: orderDraft.colis.filter((_, i) => i !== index) })}><Trash2 size={14} /></button></div>)}<button className="groupage-secondary" onClick={() => setOrderDraft({ ...orderDraft, colis: [...orderDraft.colis, { longueur: '', largeur: '', hauteur: '', quantite: 1 }] })}><PackagePlus size={15} /> Ajouter un colis</button><div className="groupage-checks"><label><input type="checkbox" checked={!!orderDraft.pret} onChange={event => setOrderDraft({ ...orderDraft, pret: event.target.checked })} /> Marchandise prête</label><label><input type="checkbox" checked={!!orderDraft.documentsComplets} onChange={event => setOrderDraft({ ...orderDraft, documentsComplets: event.target.checked })} /> Documents complets</label><label><input type="checkbox" checked={!!orderDraft.exclu} onChange={event => setOrderDraft({ ...orderDraft, exclu: event.target.checked })} /> Exclure du groupage</label></div><button className="groupage-save" disabled={busy} onClick={saveOrder}><Save size={16} /> Enregistrer</button></div></div>}
  {editingTariff && <div className="groupage-overlay"><div className="groupage-dialog"><div className="groupage-card-head"><h2>{editingTariff === 'nouveau' ? 'Nouveau tarif' : 'Modifier le tarif'}</h2><button onClick={() => setEditingTariff('')}>Fermer</button></div><div className="groupage-fields"><label>Mode<select value={tariffDraft.mode} onChange={event => setTariffDraft({ ...tariffDraft, mode: event.target.value })}>{Object.entries(modes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>{[['Origine', 'origine'], ['Destination', 'destination']].map(([label, key]) => <label key={key}>{label}<input value={tariffDraft[key]} onChange={event => setTariffDraft({ ...tariffDraft, [key]: event.target.value })} /></label>)}<label>Nature<select value={tariffDraft.nature} onChange={event => setTariffDraft({ ...tariffDraft, nature: event.target.value })}>{natures.map(value => <option key={value}>{value}</option>)}</select></label>{[['Prix unitaire', 'prixUnitaire'], ['Minimum facturable', 'minimum'], ['Frais de départ', 'fraisDepart'], ['Frais par commande', 'fraisCommande'], ['Diviseur poids volumétrique', 'diviseur']].map(([label, key]) => <label key={key}>{label}<input type="number" min="0" value={tariffDraft[key]} onChange={event => setTariffDraft({ ...tariffDraft, [key]: event.target.value })} /></label>)}<label>Devise<select value={tariffDraft.devise} onChange={event => setTariffDraft({ ...tariffDraft, devise: event.target.value })}>{['MAD', 'USD', 'EUR', 'CNY'].map(value => <option key={value}>{value}</option>)}</select></label><label><input type="checkbox" checked={tariffDraft.actif !== false} onChange={event => setTariffDraft({ ...tariffDraft, actif: event.target.checked })} /> Tarif actif</label></div><button className="groupage-save" disabled={busy} onClick={saveTariff}><Save size={16} /> Enregistrer le tarif</button></div></div>}
  </>;
}

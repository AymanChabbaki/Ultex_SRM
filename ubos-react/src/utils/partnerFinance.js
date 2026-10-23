export const PARTNER_ROLES = [
  ['Forwarder', 'FWD'], ['Agent à l’origine', 'AGO'],
  ['Transitaire / commissionnaire en douane', 'TRS'],
  ['Transporteur national', 'TRN'], ['Magasinage / entrepôt', 'MAG'],
  ['Assureur', 'ASS'],
];
export const PARTNER_STATUSES = ['Prospection', 'En test', 'Actif', 'Préféré', 'Suspendu', 'Archivé'];
export const LCN_STATUSES = ['Émise', 'Remise', 'Encaissée', 'Impayée', 'Reportée', 'Annulée'];
export const PARTNER_ROLES_ACTIVE = ['En test', 'Actif', 'Préféré'];
export const INTERVENANT_ROLES = ['Forwarder', 'Transitaire / commissionnaire en douane', 'Transporteur national', 'Magasinage / entrepôt'];

const num = value => Number(value) || 0;
export const argent = value => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(value));
export const mad = value => `${argent(value)} MAD`;
export const day = value => String(value || '').slice(0, 10);
export const datePlusJours = (date, jours) => {
  if (!date) return '';
  const parsed = new Date(`${day(date)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCDate(parsed.getUTCDate() + num(jours));
  return parsed.toISOString().slice(0, 10);
};
export const joursAvant = date => {
  if (!date) return null;
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(`${day(date)}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
};

export function prochainCodePartenaire(role, partenaires = [], roles = PARTNER_ROLES) {
  const prefix = roles.find(([label]) => label === role)?.[1];
  if (!prefix) throw new Error('Choisissez un rôle valide.');
  const pattern = new RegExp(`^PL-${prefix}-(\\d+)$`);
  const greatest = partenaires.reduce((max, partner) => {
    const match = String(partner.code || '').match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `PL-${prefix}-${String(greatest + 1).padStart(3, '0')}`;
}

export const rolesDuPartenaire = partner => Array.isArray(partner.roles)
  ? partner.roles : partner.type ? [partner.type] : [];

export function partenaireDisponible(partner, role, allPartners = [], allInvoices = [], allLcns = []) {
  if (!PARTNER_ROLES_ACTIVE.includes(partner.statut) || !rolesDuPartenaire(partner).includes(role)) return false;
  const plafond = num(partner.plafondCredit);
  if (!plafond) return true;
  return indicateursPartenaire(partner, [], allInvoices, allLcns).encours < plafond;
}

export function montantTtcMad(facture) {
  const ttc = facture.montantTtc === '' || facture.montantTtc == null
    ? num(facture.montantHt) + num(facture.tva) : num(facture.montantTtc);
  return ttc * (facture.devise && facture.devise !== 'MAD' ? num(facture.tauxMad) : 1);
}

export function factureCalculee(facture, lcns = []) {
  const total = montantTtcMad(facture);
  const affectees = lcns.filter(lcn => lcn.partenaireId === facture.partenaireId);
  const somme = status => affectees.filter(lcn => lcn.statut === status)
    .reduce((sum, lcn) => sum + (lcn.affectations || []).filter(a => a.factureId === facture.code)
      .reduce((inner, a) => inner + num(a.montant), 0), 0);
  const paye = Math.min(total, somme('Encaissée'));
  const reste = Math.max(0, total - paye);
  const couvert = somme('Remise');
  const cotation = num(facture.montantCotation);
  const ecart = cotation > 0 ? (total - cotation) / cotation * 100 : null;
  const retard = reste > 0.005 && joursAvant(facture.dateEcheance) < 0;
  const statut = reste <= 0.005 ? 'Payée'
    : couvert >= reste - 0.005 ? 'Couverte par LCN'
      : paye > 0.005 ? 'Partiellement payée'
        : retard ? 'En retard' : 'À payer';
  return { total, paye, reste, couvert, ecart, statut, retard };
}

export function indicateursPartenaire(partner, arrivages = [], factures = [], lcns = []) {
  const liees = arrivages.filter(a => (a.intervenants || []).some(i => i.partenaireId === partner.code));
  const ouvertes = liees.filter(a => !['Clôturé', 'Annulé'].includes(a.statut));
  const invoices = factures.filter(f => f.partenaireId === partner.code);
  const notes = lcns.filter(l => l.partenaireId === partner.code);
  const calc = invoices.map(f => factureCalculee(f, notes));
  const encours = calc.reduce((sum, f) => sum + f.reste, 0);
  const plafond = num(partner.plafondCredit);
  const ecarts = calc.map(f => f.ecart).filter(value => value != null);
  return {
    dossiersEnCours: ouvertes.length,
    encours,
    plafondUtilise: plafond ? encours / plafond * 100 : null,
    lcnEcheance: notes.filter(l => l.statut === 'Remise' && joursAvant(l.dateEcheance) >= 0 && joursAvant(l.dateEcheance) <= 7).length,
    facturesEnRetard: calc.filter(f => f.retard).length,
    ecartMoyen: ecarts.length ? ecarts.reduce((a, b) => a + b, 0) / ecarts.length : null,
    engageLcn: notes.filter(l => l.statut === 'Remise').reduce((sum, l) => sum + num(l.montant), 0),
    lcnImpayees: notes.filter(l => l.statut === 'Impayée').length,
  };
}

export function validerAffectations(lcn, factures, lcns = []) {
  const allocations = (lcn.affectations || []).filter(a => num(a.montant) > 0);
  const total = allocations.reduce((sum, a) => sum + num(a.montant), 0);
  if (!allocations.length || Math.abs(total - num(lcn.montant)) > 0.01) return 'La somme des affectations doit égaler le montant de la LCN.';
  const ids = new Set();
  for (const allocation of allocations) {
    if (ids.has(allocation.factureId)) return 'Une facture ne peut apparaître qu’une fois dans la même LCN.';
    ids.add(allocation.factureId);
    const facture = factures.find(f => f.code === allocation.factureId && f.partenaireId === lcn.partenaireId);
    if (!facture) return 'La facture sélectionnée ne dépend pas de ce partenaire.';
    const autres = lcns.filter(item => item.code !== lcn.code);
    const disponible = factureCalculee(facture, autres).reste
      - autres.filter(item => item.partenaireId === lcn.partenaireId && item.statut === 'Remise')
        .reduce((sum, item) => sum + (item.affectations || []).filter(a => a.factureId === facture.code)
          .reduce((s, a) => s + num(a.montant), 0), 0);
    if (num(allocation.montant) > disponible + 0.01) return `Affectation supérieure au solde disponible de ${facture.numero}.`;
  }
  return '';
}

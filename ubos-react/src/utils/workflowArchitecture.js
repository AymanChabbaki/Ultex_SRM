const suffixeClient = (code) => String(code || '').trim() || 'SANS-CLIENT';

function prochaineReference(prefixe, clientCode, records) {
  const suffixe = suffixeClient(clientCode);
  const motif = new RegExp(`^${prefixe}(\\d+)-${suffixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const max = (records || []).reduce((n, item) => {
    const match = String(item.referenceMetier || '').match(motif);
    return match ? Math.max(n, Number(match[1])) : n;
  }, 0);
  return `${prefixe}${max + 1}-${suffixe}`;
}

export const prochaineReferenceDemande = (db, clientCode) =>
  prochaineReference('D', clientCode, db.demandes);

export const prochaineReferenceCommande = (db, clientCode) =>
  prochaineReference('C', clientCode, db.commandes);

export function prochaineReferenceProduit(db, demandeCode) {
  const demande = (db.demandes || []).find(d => d.code === demandeCode);
  return prochaineReference('P', demande?.client, db.demandeLignes);
}

export function migrerArchitectureSansDossier(db) {
  if (db._migrationArchitectureSansDossierV1Faite) return false;
  let changed = false;

  const demandesParClient = new Map();
  [...(db.demandes || [])].sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach(d => {
    if (d.referenceMetier) return;
    const list = demandesParClient.get(d.client) || [];
    d.referenceMetier = `D${list.length + 1}-${suffixeClient(d.client)}`;
    list.push(d);
    demandesParClient.set(d.client, list);
    changed = true;
  });

  const produitsParClient = new Map();
  [...(db.demandeLignes || [])].sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach(l => {
    if (l.referenceMetier) return;
    const demande = (db.demandes || []).find(d => d.code === l.demande);
    const client = demande?.client || 'SANS-CLIENT';
    const n = (produitsParClient.get(client) || 0) + 1;
    produitsParClient.set(client, n);
    l.referenceMetier = `P${n}-${suffixeClient(client)}`;
    changed = true;
  });

  const commandesParClient = new Map();
  [...(db.commandes || [])].sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach(c => {
    if (c.referenceMetier) return;
    const n = (commandesParClient.get(c.client) || 0) + 1;
    commandesParClient.set(c.client, n);
    c.referenceMetier = `C${n}-${suffixeClient(c.client)}`;
    c.source_demande_id = c.source_demande_id || c.demande || '';
    changed = true;
  });

  // Preserve legacy dossiers, but transfer their commande membership to
  // arrivages so Dossier is no longer required in the visible workflow.
  (db.arrivages || []).forEach(a => {
    const commandes = new Set(a.commandes || []);
    (a.dossiers || []).forEach(dossierCode => {
      const dossier = (db.dossiers || []).find(d => d.code === dossierCode);
      if (dossier?.commande) commandes.add(dossier.commande);
    });
    const next = [...commandes];
    if (JSON.stringify(next) !== JSON.stringify(a.commandes || [])) {
      a.commandes = next;
      changed = true;
    }
  });

  db._migrationArchitectureSansDossierV1Faite = true;
  return true;
}

export function lignesCommandeDepuisDemande(db, demandeCode) {
  return (db.demandeLignes || [])
    .filter(l => l.demande === demandeCode)
    .map(l => ({ ...l, idTechniqueSource: l.code, code: l.referenceMetier || l.code }));
}

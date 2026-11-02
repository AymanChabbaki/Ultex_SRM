export const chargeable = (order, divisor = 6000) => {
  const actual = Math.max(0, Number(order.poidsKg) || 0);
  const volume = (order.colis || []).reduce((sum, box) => sum + Math.max(0, Number(box.longueur) || 0) * Math.max(0, Number(box.largeur) || 0) * Math.max(0, Number(box.hauteur) || 0) * Math.max(0, Number(box.quantite) || 0), 0);
  return order.mode === 'air'
    ? Math.ceil(Math.max(actual, volume / (Number(divisor) || 6000)) * 2) / 2
    : Math.max(actual / 1000, volume / 1_000_000);
};

export const daysApart = (a, b) => Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000;

export function eligible(order, tariff, groupedCodes = new Set()) {
  return !!order.pret && !!order.documentsComplets && !!order.datePret && !order.exclu
    && !groupedCodes.has(order.commande)
    && order.mode === tariff.mode && order.origine?.trim().toLowerCase() === tariff.origine?.trim().toLowerCase()
    && order.destination?.trim().toLowerCase() === tariff.destination?.trim().toLowerCase()
    && order.nature === tariff.nature && chargeable(order, tariff.diviseur) > 0;
}

export function calculateGroup(orders, tariff, allocation = 'prorata') {
  const units = orders.map(order => chargeable(order, tariff.diviseur));
  const totalUnits = units.reduce((a, b) => a + b, 0);
  const base = Math.max(totalUnits, Number(tariff.minimum) || 0);
  const freight = base * (Number(tariff.prixUnitaire) || 0);
  const fixed = Number(tariff.fraisDepart) || 0;
  const perOrder = Number(tariff.fraisCommande) || 0;
  const individual = units.map(unit => Math.max(unit, Number(tariff.minimum) || 0) * (Number(tariff.prixUnitaire) || 0) + fixed + perOrder);
  const allocations = units.map(unit => {
    const ratio = totalUnits ? unit / totalUnits : 0;
    return freight * ratio + fixed * (allocation === 'egal' ? 1 / orders.length : ratio) + perOrder;
  });
  return { units, totalUnits, base, freight, fixed, individual, allocations,
    totalGroup: allocations.reduce((a, b) => a + b, 0),
    totalAlone: individual.reduce((a, b) => a + b, 0) };
}

export function creationDate(row) {
  return row.dateCreation || row.dateHeureReception || row.dateDemande || row.createdAt || row.dateAjout || row.ts || '';
}
export function formatCreationDate(row) {
  const value = creationDate(row);
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR');
}

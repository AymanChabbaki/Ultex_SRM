import { formatGMTDateTime } from './dataFollowup.js';

export function creationDate(row) {
  return row.dateCreation || row.dateHeureReception || row.dateDemande || row.createdAt || row.dateAjout || row.ts || '';
}
export function formatCreationDate(row) {
  const value = creationDate(row);
  if (!value) return '—';
  return formatGMTDateTime(value) || '—';
}

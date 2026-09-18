export const GROUPES_CODES_CLIENT = [
  { id: 'L', label: 'Codes L' },
  { id: 'A', label: 'Codes A' },
  { id: 'R', label: 'Codes R' },
  { id: '#', label: 'Codes numériques (#)' },
];

export function codeClientAffiche(client) {
  return String(client?.codeClientUltex || client?.code || '').trim();
}

export function groupeCodeClient(client) {
  const code = codeClientAffiche(client).toUpperCase();
  if (code.startsWith('L')) return 'L';
  if (code.startsWith('A')) return 'A';
  if (code.startsWith('R')) return 'R';
  return '#';
}

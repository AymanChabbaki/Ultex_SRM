const API_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'ubos_token';

// Just the JWT string — an auth credential, not a cache of business data.
// Kept in localStorage so a page refresh doesn't force a re-login; every
// request still gets verified server-side against it (server/src/index.js
// authMiddleware), so a stale/expired token is simply rejected with 401
// rather than silently trusted.
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class AuthError extends Error {}

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_URL}/health`);
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
}

export async function fetchDB() {
  const res = await fetch(`${API_URL}/db`, { headers: { ...authHeaders() } });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  if (!res.ok) throw new Error('Erreur lors du chargement de la base PostgreSQL');
  return await res.json();
}

export async function fetchCollectionPage(collection, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const res = await fetch(`${API_URL}/collections/${encodeURIComponent(collection)}?${query}`, {
    headers: { ...authHeaders() }
  });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  if (!res.ok) {
    const error = new Error('Erreur lors du chargement de la liste');
    error.status = res.status;
    throw error;
  }
  return await res.json();
}

export async function fetchAuditPage(page = 1, pageSize = 500) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const res = await fetch(`${API_URL}/audit?${query}`, { headers: { ...authHeaders() } });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  if (!res.ok) throw new Error('Erreur lors du chargement du journal d’audit');
  return await res.json();
}

export async function fetchDataDashboard(date, targetUser = '', fresh = false) {
  const query = new URLSearchParams();
  if (date) query.set('date', date);
  if (targetUser) query.set('user', targetUser);
  if (fresh) query.set('fresh', '1');
  const res = await fetch(`${API_URL}/dashboard/data?${query}`, { headers: { ...authHeaders() } });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  if (!res.ok) throw new Error('Erreur lors du chargement du tableau de bord Data');
  return await res.json();
}

export async function fetchMe() {
  const res = await fetch(`${API_URL}/auth/me`, { headers: { ...authHeaders() } });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  if (!res.ok) throw new Error('Erreur lors de la lecture du profil');
  const data = await res.json();
  return data.user;
}

export async function saveDBSync(dbState) {
  const res = await fetch(`${API_URL}/db/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(dbState)
  });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  if (!res.ok) throw new Error('Erreur lors de la synchronisation avec PostgreSQL');
  return await res.json();
}

export async function saveDBPatch(patch) {
  const res = await fetch(`${API_URL}/db/patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch)
  });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  if (!res.ok) {
    const error = new Error('Erreur lors de la synchronisation avec PostgreSQL');
    error.status = res.status;
    throw error;
  }
  return await res.json();
}

export async function syncPaymentToWorkflow(payload) {
  const res = await fetch(`${API_URL}/workflow/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Échec de la synchronisation du paiement avec Workflow');
  return body;
}

export async function genCodeBackend(pfx) {
  try {
    const res = await fetch(`${API_URL}/genCode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ pfx })
    });
    if (res.ok) {
      const data = await res.json();
      return data.code;
    }
  } catch (e) {}
  return null;
}

export async function loginBackend(identifiant, motDePasse) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant, motDePasse })
  });
  if (res.ok) return await res.json();
  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || 'Identifiants invalides');
}

export async function parsePdfBackend(base64) {
  try {
    const res = await fetch(`${API_URL}/ocr/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ base64 })
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error('⚠️ Erreur lecture PDF backend:', e);
  }
  return null;
}

export async function downloadStoredDocument(code, filename) {
  const res = await fetch(`${API_URL}/documents/${encodeURIComponent(code)}/download`, {
    headers: { ...authHeaders() }
  });
  if (res.status === 401) throw new AuthError('Session invalide ou expirée');
  if (!res.ok) throw new Error('Téléchargement impossible');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = objectUrl;
  link.download = filename || code;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

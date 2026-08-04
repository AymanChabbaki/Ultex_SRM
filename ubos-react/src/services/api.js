const API_URL = import.meta.env.VITE_API_URL || '/api';

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_URL}/health`);
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
}

export async function fetchDB() {
  try {
    const res = await fetch(`${API_URL}/db`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('⚠️ API backend PostgreSQL injoignable, bascule vers le stockage local temporaire:', e);
  }
  return null;
}

export async function saveDBSync(dbState) {
  try {
    const res = await fetch(`${API_URL}/db/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbState)
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error('⚠️ Erreur de synchronisation avec PostgreSQL:', e);
  }
  return null;
}

export async function genCodeBackend(pfx) {
  try {
    const res = await fetch(`${API_URL}/genCode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiant, motDePasse })
    });
    if (res.ok) return await res.json();
    const err = await res.json();
    throw new Error(err.error || 'Identifiants invalides');
  } catch (e) {
    throw e;
  }
}

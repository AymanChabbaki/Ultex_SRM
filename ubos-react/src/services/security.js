const API_URL = import.meta.env.VITE_API_URL || '/api';

import { getToken } from './api';

function authHeaders(elevationToken) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (elevationToken) headers['x-elevation-token'] = elevationToken;
  return headers;
}

async function lireErreur(res) {
  const data = await res.json().catch(() => ({}));
  return data.error || `Erreur (${res.status})`;
}

export async function demanderOtp(action) {
  const res = await fetch(`${API_URL}/security/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ action })
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return await res.json();
}

export async function verifierOtp(code) {
  const res = await fetch(`${API_URL}/security/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ code })
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return await res.json();
}

export async function supprimerEnregistrementSecurise(collection, code, elevationToken) {
  const res = await fetch(`${API_URL}/security/records/${encodeURIComponent(collection)}/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { ...authHeaders(elevationToken) }
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return await res.json();
}

export async function restaurerSecurise(data, elevationToken) {
  const res = await fetch(`${API_URL}/security/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(elevationToken) },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return await res.json();
}

export async function creerUtilisateurSecurise(patch, elevationToken) {
  const res = await fetch(`${API_URL}/security/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(elevationToken) },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return await res.json();
}

export async function modifierUtilisateurSecurise(id, patch, elevationToken) {
  const res = await fetch(`${API_URL}/security/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(elevationToken) },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return await res.json();
}

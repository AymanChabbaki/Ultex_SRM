import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { createRequire } from 'module';
import { lLeadHandler } from './sheetsLLeads.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const REDIS_URL = process.env.REDIS_URL || '';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'));
const JWT_SECRET = process.env.JWT_SECRET || 'ubos_secret_2026';
const ELEVATION_SECRET = process.env.ELEVATION_SECRET || 'ubos_elevation_secret_2026';
// Static shared secret for the ULTEX -> CRM sync endpoint (server-to-server,
// no human session involved) -- separate from JWT_SECRET so rotating one
// never affects the other, and simpler than issuing/refreshing a JWT for a
// backend service that isn't a real CRM user.
const ULTEX_SYNC_API_KEY = process.env.ULTEX_SYNC_API_KEY || 'ubos_ultex_sync_key_2026';
const ULTEX_WORKFLOW_PAYMENT_SYNC_URL = process.env.ULTEX_WORKFLOW_PAYMENT_SYNC_URL || '';
const SECURITY_EMAIL = process.env.SECURITY_EMAIL || 'ultexcompany1@gmail.com';
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ELEVATION_TTL_SECONDS = 15 * 60;
const BCRYPT_HASH_RE = /^\$2[aby]\$/;

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET non défini — utilisation de la valeur par défaut (à définir en production).');
}

// Mail transport for OTP codes — only configured if real SMTP credentials
// are present. Without them, the code is logged server-side instead of
// silently failing, so the flow stays testable before credentials exist.
const mailTransporter = (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    })
  : null;

// Base64 of ubos-react/public/logo.svg, baked in so email sending doesn't
// depend on a filesystem path that may differ across deploy contexts
// (Docker image, dev machine, etc).
const LOGO_SVG_BASE64 = 'PHN2ZyB3aWR0aD0iMTAyIiBoZWlnaHQ9IjI1IiB2aWV3Qm94PSIwIDAgMTAyIDI1IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cGF0aCBkPSJNMjkuMDA2OCAyNC45NDM4QzI3LjUxODcgMjQuOTQzOCAyNi4yNjY4IDI0LjQyNDEgMjUuMzQ1NiAyMy40NzkzQzI0LjUxODggMjIuNjA1MyAyNC4wNDY0IDIxLjQwMDYgMjQuMDQ2NCAyMC4xNzIzVjIuOTA1MjdIMjguNjA1M1YxOS4xMDk0QzI4LjYwNTMgMTkuNTgxOCAyOC43MjM0IDIwLjAwNyAyOC45MzYgMjAuMzM3N0MyOS4wMDY4IDIwLjQzMjEgMjkuMDMwNSAyMC40Nzk0IDI5LjA1NDEgMjAuNTAzQzI5LjQwODQgMjAuOTUxOCAyOS45NzUzIDIxLjE4OCAzMC42MTMxIDIxLjE4OEg0MS4yNDI2VjI0LjkyMDJIMjkuMDA2OFYyNC45NDM4WiIgZmlsbD0iIzAxNTlBMyIvPgo8cGF0aCBkPSJNNTAuMzM2NiAxMi4wNDY5SDQ1Ljc3NzhWMjQuOTQ0SDUwLjMzNjZWMTIuMDQ2OVoiIGZpbGw9IiMwMTU5QTMiLz4KPHBhdGggZD0iTTU3Ljc3NzQgMi45MjkySDM4LjMxMzZWNi42NjEzNEg1Ny43Nzc0VjIuOTI5MloiIGZpbGw9IiNGRkM5MEQiLz4KPHBhdGggZD0iTTc5LjU1NiAyLjkyOTJINjIuMTIzNlY2LjY2MTM0SDc5LjU1NlYyLjkyOTJaIiBmaWxsPSIjRkZDOTBEIi8+CjxwYXRoIGQ9Ik02Ny4wODQgMjQuOTQ0QzY1LjU5NTkgMjQuOTQ0IDY0LjM0NCAyNC40MjQzIDYzLjQyMjggMjMuNDc5NUM2Mi41OTYgMjIuNjA1NSA2Mi4xMjM2IDIxLjQwMDggNjIuMTIzNiAyMC4xNzI1VjEyLjA0NjlINzguOTY1NVYxNS44MjYzSDY2LjY4MjVWMTkuMTA5NkM2Ni42ODI1IDE5LjcyMzcgNjYuODcxNCAyMC4yNDM0IDY3LjIyNTggMjAuNjIxM0M2Ny41ODAxIDIwLjk5OTMgNjguMDc2MSAyMS4yMTE5IDY4LjY5MDMgMjEuMjExOUg3OS4zNjdWMjQuOTQ0SDY3LjA4NFoiIGZpbGw9IiNGRkM5MEQiLz4KPHBhdGggZD0iTTk2LjMyNyAyNC45NDQxTDkyLjU5NDkgMTkuOTYwMUw4OC44NjI3IDI0Ljk0NDFIODMuNzM2OUw5MC4wNDM4IDE2LjUxMTRMODQuMjA5NCA4Ljc2MzY3SDg5LjMzNTFMOTIuNTk0OSAxMy4wODYzTDk1LjgzMDkgOC43NjM2N0gxMDAuOTU3TDk1LjE0NTkgMTYuNTExNEwxMDEuNSAyNC45NDQxSDk2LjMyN1oiIGZpbGw9IiNGRkM5MEQiLz4KPHBhdGggZD0iTTYuMzc3NyAyNC45NDM5QzQuNjc2OTggMjQuOTQzOSAzLjA3MDc1IDI0LjI4MjUgMS44NjYwNyAyMy4wNzc4QzAuNjYxMzkyIDIxLjg3MzIgMCAyMC4yNjY5IDAgMTguNTY2MlYyLjkyOTAySDQuODQyMzNWMTUuNDI0NkgxLjQ2NDUxTDguOTI4NzggMjIuODg4OUwxNi4zOTMxIDE1LjQyNDZIMTMuMDE1MlY1LjEyNTc4SDEwLjEzMzVMMTUuMjU5MiAwTDIwLjM4NSA1LjEyNTc4SDE3LjgzMzlWMTguNTY2MkMxNy44MzM5IDIwLjI2NjkgMTcuMTcyNiAyMS44NzMyIDE1Ljk2NzkgMjMuMDc3OEMxNC43NjMyIDI0LjI4MjUgMTMuMTU3IDI0Ljk0MzkgMTEuNDU2MiAyNC45NDM5SDYuMzc3N1oiIGZpbGw9IiMwMTU5QTMiLz4KPHBhdGggZD0iTTEzLjAxNTQgNS4xMDIwNUgxNS44MDI2QzE1LjM3NzUgNi4zMzAzNSAxNC43NjMzIDguMTk2NDIgMTQuMTQ5MiAxMC40NjRDMTMuNzAwNCAxMi4xMTc1IDEzLjMyMjQgMTMuNzcxIDEyLjk5MTcgMTUuNDAwOVY1LjEwMjA1SDEzLjAxNTRaIiBmaWxsPSIjMDA0NDcyIi8+CjxwYXRoIGQ9Ik00NS43Nzc4IDEyLjA0NjlINDguMDY5TDQ1Ljc3NzggMjQuOTQ0VjEyLjA0NjlaIiBmaWxsPSIjMDA0NDcyIi8+CjxwYXRoIGQ9Ik0yNC4wMjI2IDIuOTI5MkgyNS45MTIzTDI0LjAyMjYgMTkuMTU2OVYyLjkyOTJaIiBmaWxsPSIjMDA0NDcyIi8+Cjwvc3ZnPgo=';

function construireEmailOtp(code, action, demandeur) {
  const chiffres = String(code).split('');
  const sujet = `${code} — Code de sécurité UBOS (${action})`;
  const texte = `Code de vérification : ${code}\nAction demandée : ${action}\nDemandé par : ${demandeur}\nCe code expire dans 5 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#eef1f5;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,20,60,0.08);">
        <tr>
          <td style="background:#ffffff;padding:24px 32px;border-bottom:1px solid #edf1f7;">
            <img src="cid:ubos-logo" alt="ULTEx" width="102" height="25" style="display:block;" />
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <p style="margin:0 0 4px 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#0159A3;font-weight:700;">Code de sécurité</p>
            <h1 style="margin:0 0 18px 0;font-size:20px;color:#0f1e33;">Validation d'une action sensible</h1>
            <p style="margin:0 0 4px 0;font-size:14px;color:#4a5568;">Action demandée</p>
            <p style="margin:0 0 18px 0;font-size:15px;color:#0f1e33;font-weight:600;">${action}</p>
            <p style="margin:0 0 4px 0;font-size:14px;color:#4a5568;">Demandé par</p>
            <p style="margin:0 0 24px 0;font-size:15px;color:#0f1e33;font-weight:600;">${demandeur}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
              <tr>${chiffres.map(c => `<td style="width:16.66%;padding:0 4px;"><div style="background:#f3f6fb;border:1px solid #dbe4f0;border-radius:8px;text-align:center;padding:14px 0;font-size:26px;font-weight:700;color:#0159A3;letter-spacing:.02em;">${c}</div></td>`).join('')}</tr>
            </table>
            <p style="margin:16px 0 0 0;font-size:13px;color:#8a94a6;">Ce code expire dans <strong style="color:#4a5568;">5 minutes</strong> et ne peut être utilisé qu'une seule fois.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fff8e6;border-left:3px solid #FFC90D;border-radius:6px;">
              <tr><td style="padding:12px 14px;font-size:13px;color:#6b5b0d;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — aucune action ne sera effectuée sans ce code.</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px;background:#f7f9fc;border-top:1px solid #edf1f7;">
            <p style="margin:0;font-size:12px;color:#a0aab8;">UBOS — Plateforme interne ULTEx · Notification automatique, ne pas répondre.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { sujet, texte, html };
}

async function envoyerOtpParEmail(code, action, demandeur) {
  const { sujet, texte, html } = construireEmailOtp(code, action, demandeur);
  if (!mailTransporter) {
    console.warn(`⚠️ SMTP non configuré — code OTP (${action}, demandé par ${demandeur}) : ${code}`);
    return;
  }
  try {
    await mailTransporter.sendMail({
      from: `"UBOS — Sécurité ULTEx" <${process.env.SMTP_USER}>`,
      to: SECURITY_EMAIL,
      subject: sujet,
      text: texte,
      html,
      attachments: [{
        filename: 'logo.svg',
        content: LOGO_SVG_BASE64,
        encoding: 'base64',
        cid: 'ubos-logo',
        contentType: 'image/svg+xml'
      }]
    });
  } catch (e) {
    console.error('⚠️ Échec envoi e-mail OTP:', e.message);
    console.warn(`Code OTP (${action}, demandé par ${demandeur}) : ${code}`);
  }
}

function genererCodeOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

let redisClient = null;

async function initialiserRedis() {
  if (!REDIS_URL) {
    console.warn('⚠️ REDIS_URL non défini — cache distribué désactivé.');
    return;
  }
  const client = createClient({ url: REDIS_URL, socket: { reconnectStrategy: retries => Math.min(retries * 100, 3000) } });
  client.on('error', error => console.error('Redis:', error.message));
  try {
    await client.connect();
    redisClient = client;
    await redisClient.setNX('crm:cache:version', '1');
  } catch (error) {
    console.error('⚠️ Redis indisponible — PostgreSQL reste actif sans cache:', error.message);
    redisClient = null;
  }
}

async function cacheVersion() {
  if (!redisClient?.isReady) return null;
  try {
    return await redisClient.get('crm:cache:version') || '1';
  } catch (error) {
    console.error('Redis version:', error.message);
    return null;
  }
}

async function cacheLire(scope) {
  const version = await cacheVersion();
  if (!version) return null;
  try {
    return await redisClient.get(`crm:v${version}:${scope}`);
  } catch (error) {
    console.error('Redis read:', error.message);
    return null;
  }
}

async function cacheEcrire(scope, value, ttlSeconds = 30) {
  const version = await cacheVersion();
  if (!version) return;
  try {
    await redisClient.setEx(`crm:v${version}:${scope}`, ttlSeconds, value);
  } catch (error) {
    console.error('Redis write:', error.message);
  }
}

async function invaliderCache() {
  if (!redisClient?.isReady) return;
  try {
    await redisClient.incr('crm:cache:version');
  } catch (error) {
    console.error('Redis invalidation:', error.message);
  }
}

// One monotonically increasing Redis version invalidates every cached view in
// O(1), including when several backend instances are added behind a balancer.
app.use((req, res, next) => {
  const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const cacheNeutral = req.path.startsWith('/api/auth/')
    || req.path.startsWith('/api/security/otp/')
    || req.path === '/api/ocr/pdf';
  if (mutation && !cacheNeutral) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) void invaliderCache();
    });
  }
  next();
});

const COLLS = [
  "clients", "leads", "fournisseurs", "produits", "dossiers", "sourcings", "etudes",
  "offres", "paiements", "analyses", "transports", "transits", "documents", "taches",
  "rapports", "reclamations", "stockage", "certifs", "transportsNat", "pmtIntl",
  "erreurs", "utilisateurs", "facturesFinales", "avoirsFF", "abandons", "impayes",
  "remboursements", "contacts", "demandes", "commandes", "arrivages", "analysesLimex",
  "bonsLancement", "stocks", "mouvementsStock", "livraisons", "transfertsServices",
  "communicationsDossier", "partenaires", "importJobs", "importFiles", "importModels",
  "importMappings", "importRows", "importErrors", "importHistory", "importDetectedTypes",
  "importExtractedData", "importAttachments", "importRollbacks",
  "controlesLimex", "dossierControlesLimex", "limexDiagnosticOumaima",
  "limexPortesValidation", "limexImportHistory",
  "demandeLignes", "demandeRoutages", "objectifsData",
  "tacheEtapes", "rapportsJournaliers", "journalSecurite",
  "suivisClosing",
  "suivisLimex", "actionsLimex", "instructionsLimex", "documentsComptablesCasa"
];

// Login only needs identity, notifications, sequences and a short audit tail.
// Business collections are fetched by the route that consumes them.
const BOOTSTRAP_COLLECTIONS = [];

const COLLECTION_FILTER_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function collectionCodeExpression() {
  return Prisma.sql`COALESCE(NULLIF(data->>'codeClientUltex', ''), NULLIF(code, ''), id)`;
}

async function creerIndexPerformance() {
  const statements = [
    'CREATE EXTENSION IF NOT EXISTS pg_trgm',
    'CREATE INDEX IF NOT EXISTS collection_items_collection_created_at_idx ON collection_items (collection, "createdAt" DESC)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS collection_items_id_trgm_idx ON collection_items USING gin (id gin_trgm_ops)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS collection_items_code_trgm_idx ON collection_items USING gin (code gin_trgm_ops)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS collection_items_data_trgm_idx ON collection_items USING gin ((data::text) gin_trgm_ops)',
    "CREATE INDEX IF NOT EXISTS collection_items_clients_code_ultex_idx ON collection_items ((data->>'codeClientUltex')) WHERE collection = 'clients'",
    "CREATE INDEX IF NOT EXISTS collection_items_clients_telephone_idx ON collection_items ((data->>'telephone')) WHERE collection = 'clients'",
    "CREATE INDEX IF NOT EXISTS collection_items_contacts_client_idx ON collection_items ((data->>'codeClientAssocie')) WHERE collection = 'contacts'",
    "CREATE INDEX IF NOT EXISTS collection_items_contacts_telephone_idx ON collection_items ((data->>'telephone')) WHERE collection = 'contacts'",
    "CREATE INDEX IF NOT EXISTS collection_items_demandes_client_idx ON collection_items ((data->>'client')) WHERE collection = 'demandes'",
    "CREATE INDEX IF NOT EXISTS collection_items_demandes_ultex_dossier_idx ON collection_items ((data->>'ultexDossierId')) WHERE collection = 'demandes'",
    "CREATE INDEX IF NOT EXISTS collection_items_demande_lignes_demande_idx ON collection_items ((data->>'demande')) WHERE collection = 'demandeLignes'",
    "CREATE INDEX IF NOT EXISTS collection_items_demande_lignes_product_idx ON collection_items ((data->>'ultexProductId')) WHERE collection = 'demandeLignes'",
    "CREATE INDEX IF NOT EXISTS collection_items_documents_ultex_idx ON collection_items ((data->>'ultexDocumentId')) WHERE collection = 'documents'"
  ];
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}

const PFX_ANNEE = ["DOS", "FF", "AV", "REL", "ABD", "IMP", "RMB", "CMD", "DMD", "ARR"];

function codeExisteInDB(code, collectionData) {
  for (const c of Object.keys(collectionData)) {
    if (Array.isArray(collectionData[c])) {
      if (collectionData[c].some(item => item && item.code === code)) return true;
    }
  }
  return false;
}

// Written server-side (not left to the frontend to remember) for every
// route that touches something sensitive — login, OTP, and the elevation-
// gated routes below all have full context here and can't be bypassed by
// a client simply not calling a logging function. Never pass a password
// or OTP code as `resultat`.
async function ecrireJournalSecurite({ action, utilisateur, module, resultat, ip }) {
  const t = new Date();
  const entry = {
    code: `SEC${Date.now()}${Math.floor(Math.random() * 1000)}`,
    date: t.toLocaleDateString('fr-FR'),
    heure: t.toLocaleTimeString('fr-FR'),
    utilisateur: utilisateur || '—',
    action,
    module: module || '—',
    resultat: resultat || '—',
    ip: ip || '—',
    ts: t.getTime()
  };
  try {
    await prisma.collectionItem.create({
      data: { collection: 'journalSecurite', id: entry.code, code: entry.code, data: entry }
    });
  } catch (e) {
    console.error('Journal sécurité error:', e.message);
  }
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: 'PostgreSQL',
    cache: redisClient?.isReady ? 'Redis connected' : 'Redis unavailable',
    timestamp: new Date()
  });
});

// Requires a valid, non-expired JWT (issued by /api/auth/login) on every
// data route — the token was already being issued but never verified,
// so any client could read/write the whole database unauthenticated.
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}

// Second, independent gate on top of authMiddleware — a valid normal
// session is not enough for sensitive routes; a short-lived elevation
// token (issued by /api/security/otp/verify, separate secret) is also
// required. This is the actual enforcement §14 of the spec asks for:
// hiding a button client-side proves nothing, this rejects the request
// server-side regardless of what the UI shows.
function requireElevation(req, res, next) {
  const token = req.headers['x-elevation-token'] || '';
  if (!token) {
    return res.status(403).json({ error: 'Vérification de sécurité requise' });
  }
  try {
    const payload = jwt.verify(token, ELEVATION_SECRET);
    if (!payload.elevated || payload.id !== req.auth.id) {
      return res.status(403).json({ error: 'Session sécurisée invalide' });
    }
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Session sécurisée expirée — vérification requise' });
  }
}

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
  const { identifiant, motDePasse } = req.body;
  if (!identifiant || !motDePasse) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ identifiant }, { code: identifiant }],
        actif: true
      }
    });

    if (!user) {
      await ecrireJournalSecurite({ action: 'Connexion', utilisateur: identifiant, module: 'Sécurité', resultat: 'Échec — identifiant inconnu', ip: req.ip });
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }

    let motDePasseValide = false;
    if (BCRYPT_HASH_RE.test(user.motDePasse)) {
      motDePasseValide = bcrypt.compareSync(motDePasse, user.motDePasse);
    } else if (user.motDePasse === motDePasse) {
      // Ligne héritée (pré-migration) encore en clair : on migre silencieusement vers bcrypt.
      motDePasseValide = true;
      await prisma.user.update({ where: { id: user.id }, data: { motDePasse: bcrypt.hashSync(motDePasse, 10) } });
    }

    if (!motDePasseValide) {
      await ecrireJournalSecurite({ action: 'Connexion', utilisateur: user.nomComplet || identifiant, module: 'Sécurité', resultat: 'Échec — mot de passe incorrect', ip: req.ip });
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }

    await ecrireJournalSecurite({ action: 'Connexion', utilisateur: user.nomComplet || identifiant, module: 'Sécurité', resultat: 'Réussie', ip: req.ip });

    const token = jwt.sign(
      { id: user.id, identifiant: user.identifiant, role: user.role, nomComplet: user.nomComplet },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userPayload = {
      id: user.id,
      code: user.code,
      identifiant: user.identifiant,
      nomComplet: user.nomComplet,
      role: user.role,
      service: user.service,
      modules: user.modulesAutorises?.modules || [],
      services: user.modulesAutorises?.services || [],
      poste: user.modulesAutorises?.poste || '',
      departement: user.modulesAutorises?.departement || '',
      permissions: user.permissions || {},
      actif: user.actif,
      token
    };

    res.json({ user: userPayload, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// Rehydrate the current session from a stored token, without resending the
// password — used on app load to restore who's logged in.
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!user || !user.actif) {
      return res.status(401).json({ error: 'Compte introuvable ou désactivé' });
    }
    res.json({
      user: {
        id: user.id,
        code: user.code,
        identifiant: user.identifiant,
        nomComplet: user.nomComplet,
        role: user.role,
        service: user.service,
        modules: user.modulesAutorises?.modules || [],
        services: user.modulesAutorises?.services || [],
        poste: user.modulesAutorises?.poste || '',
        departement: user.modulesAutorises?.departement || '',
        permissions: user.permissions || {},
        actif: user.actif
      }
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Erreur lors de la lecture du profil' });
  }
});

// Requests a one-time code, emailed only to SECURITY_EMAIL (the Direction
// address) — never to the requester. Only the hash is stored.
app.post('/api/security/otp/request', authMiddleware, async (req, res) => {
  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Action requise' });
  try {
    const code = genererCodeOtp();
    const codeHash = bcrypt.hashSync(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await prisma.otpCode.create({ data: { codeHash, requestedBy: req.auth.id, action, expiresAt } });
    await envoyerOtpParEmail(code, action, req.auth.identifiant || req.auth.nomComplet || req.auth.id);
    await ecrireJournalSecurite({ action: `Demande de code OTP (${action})`, utilisateur: req.auth.nomComplet || req.auth.identifiant, module: 'Sécurité', resultat: 'Code envoyé', ip: req.ip });
    res.json({ status: 'sent', expiresInSeconds: OTP_TTL_MS / 1000 });
  } catch (error) {
    console.error('OTP request error:', error);
    res.status(500).json({ error: "Erreur lors de l'envoi du code de sécurité" });
  }
});

// Verifies the most recent unused code for this user and, on success,
// issues a short-lived elevation token (separate secret from the normal
// session JWT) — the "secure session" the sensitive routes below require.
app.post('/api/security/otp/verify', authMiddleware, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code requis' });
  try {
    const otp = await prisma.otpCode.findFirst({
      where: { requestedBy: req.auth.id, used: false },
      orderBy: { createdAt: 'desc' }
    });
    if (!otp) return res.status(400).json({ error: 'Aucun code en attente — redemandez un code.' });
    if (otp.expiresAt < new Date()) return res.status(400).json({ error: 'Code expiré — redemandez un code.' });
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return res.status(429).json({ error: 'Trop de tentatives — redemandez un code.' });

    const valide = bcrypt.compareSync(String(code), otp.codeHash);
    if (!valide) {
      const attempts = otp.attempts + 1;
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts } });
      await ecrireJournalSecurite({ action: `Vérification code OTP (${otp.action})`, utilisateur: req.auth.nomComplet || req.auth.identifiant, module: 'Sécurité', resultat: `Échec — code incorrect (tentative ${attempts}/${OTP_MAX_ATTEMPTS})`, ip: req.ip });
      return res.status(400).json({ error: 'Code incorrect', tentativesRestantes: OTP_MAX_ATTEMPTS - attempts });
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    const elevationToken = jwt.sign({ id: req.auth.id, elevated: true }, ELEVATION_SECRET, { expiresIn: ELEVATION_TTL_SECONDS });
    await ecrireJournalSecurite({ action: `Vérification code OTP (${otp.action})`, utilisateur: req.auth.nomComplet || req.auth.identifiant, module: 'Sécurité', resultat: 'Réussie — session sécurisée ouverte (15 min)', ip: req.ip });
    res.json({ elevationToken, expiresInSeconds: ELEVATION_TTL_SECONDS });
  } catch (error) {
    console.error('OTP verify error:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification du code' });
  }
});

// Get Full DB Snapshot
app.get('/api/db', authMiddleware, async (req, res) => {
  const startedAt = Date.now();
  try {
    const cached = await cacheLire('snapshot');
    if (cached) {
      res.set('Server-Timing', `redis;dur=${Date.now() - startedAt}`);
      res.set('X-CRM-Cache', 'HIT');
      res.set('X-CRM-Bytes', String(Buffer.byteLength(cached)));
      res.set('Cache-Control', 'private, no-cache');
      return res.type('application/json').send(cached);
    }

    const dbState = { seq: {} };

    // Initialize empty collections
    COLLS.forEach(col => { dbState[col] = []; });

    // These tables are independent. Reading them concurrently removes several
    // network round-trips from every login without changing the snapshot shape.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [sequences, items, users, notifications, auditLogs, collectionCounts, auditCounts7d] = await Promise.all([
      prisma.sequenceCounter.findMany(),
      prisma.collectionItem.findMany({
        where: { collection: { in: BOOTSTRAP_COLLECTIONS } }
      }),
      prisma.user.findMany(),
      prisma.notificationItem.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.collectionItem.groupBy({ by: ['collection'], _count: { _all: true } }),
      prisma.auditLog.groupBy({
        by: ['utilisateur'],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true }
      })
    ]);

    dbState._loadedCollections = [...BOOTSTRAP_COLLECTIONS];
    dbState._counts = Object.fromEntries(collectionCounts.map(row => [row.collection, row._count._all]));
    dbState._metrics = {
      audit7dByUser: Object.fromEntries(auditCounts7d.map(row => [row.utilisateur, row._count._all]))
    };

    sequences.forEach(s => { dbState.seq[s.key] = s.val; });

    items.forEach(item => {
      if (dbState[item.collection]) {
        dbState[item.collection].push({ id: item.id, createdAt: item.createdAt.toISOString(), ...item.data });
      }
    });

    dbState.utilisateurs = users.map(u => ({
      id: u.id,
      code: u.code,
      identifiant: u.identifiant,
      nomComplet: u.nomComplet,
      motDePasse: u.motDePasse,
      role: u.role,
      poste: u.modulesAutorises?.poste || '',
      departement: u.modulesAutorises?.departement || u.service,
      services: u.modulesAutorises?.services || [],
      modules: u.modulesAutorises?.modules || [],
      permissions: u.permissions || {},
      actif: u.actif
    }));

    dbState.notifs = notifications.map(n => ({
      id: n.id,
      code: n.code,
      dest: n.dest,
      de: n.de,
      texte: n.texte,
      module: n.module,
      lu: n.lu,
      ts: Number(n.ts),
      date: n.date
    }));

    dbState.audit = auditLogs.map(a => ({
      id: a.id,
      ts: Number(a.ts),
      date: a.date,
      heure: a.heure,
      utilisateur: a.utilisateur,
      module: a.module,
      action: a.action,
      objet: a.objet,
      champ: a.champ,
      avant: a.avant,
      apres: a.apres,
      dossier: a.dossier
    }));

    const json = JSON.stringify(dbState);
    await cacheEcrire('snapshot', json, 30);
    res.set('Server-Timing', `postgres;dur=${Date.now() - startedAt}`);
    res.set('X-CRM-Cache', 'MISS');
    res.set('X-CRM-Records', String(items.length));
    res.set('X-CRM-Bytes', String(Buffer.byteLength(json)));
    res.set('Cache-Control', 'private, no-cache');
    console.info(`[performance] snapshot PostgreSQL: ${Date.now() - startedAt} ms, ${items.length} enregistrements, ${Buffer.byteLength(json)} octets`);
    res.type('application/json').send(json);
  } catch (error) {
    console.error('Fetch DB error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la base de données PostgreSQL' });
  }
});

// Lightweight collection reads for screens that do not need to materialise
// thousands of rows in React. The full /api/db snapshot remains available for
// legacy fiche/dashboard logic while modules are migrated incrementally.
app.get('/api/collections/:collection', authMiddleware, async (req, res) => {
  const startedAt = Date.now();
  const collection = String(req.params.collection || '');
  if (!COLLS.includes(collection) || collection === 'utilisateurs') {
    return res.status(404).json({ error: 'Collection introuvable' });
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const q = String(req.query.q || '').trim().slice(0, 200);
  const codeGroup = String(req.query.codeGroup || '').toUpperCase();
  const filterKey = String(req.query.filterKey || '');
  const filterValue = String(req.query.filterValue || '').slice(0, 200);
  const scopeHash = crypto.createHash('sha1').update(JSON.stringify({ collection, page, pageSize, q, codeGroup, filterKey, filterValue })).digest('hex');
  const cached = await cacheLire(`collection:${scopeHash}`);
  if (cached) {
    res.set('Server-Timing', `redis;dur=${Date.now() - startedAt}`);
    res.set('X-CRM-Cache', 'HIT');
    res.set('Cache-Control', 'private, no-cache');
    return res.type('application/json').send(cached);
  }
  const where = [Prisma.sql`collection = ${collection}`];

  if (q) {
    const pattern = `%${q}%`;
    where.push(Prisma.sql`(id ILIKE ${pattern} OR COALESCE(code, '') ILIKE ${pattern} OR data::text ILIKE ${pattern})`);
  }

  if (collection === 'clients' && ['L', 'A', 'R', '#'].includes(codeGroup)) {
    const codeExpression = collectionCodeExpression();
    where.push(codeGroup === '#'
      ? Prisma.sql`${codeExpression} !~* '^[LAR]'`
      : Prisma.sql`${codeExpression} ~* ${`^${codeGroup}`}`);
  }

  if (filterValue && COLLECTION_FILTER_KEY_PATTERN.test(filterKey)) {
    where.push(Prisma.sql`data ->> ${filterKey} = ${filterValue}`);
  }

  try {
    const clause = Prisma.join(where, ' AND ');
    const offset = (page - 1) * pageSize;
    const [rows, countRows, groupRows] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`
        SELECT id, code, data, "createdAt"
        FROM collection_items
        WHERE ${clause}
        ORDER BY CASE WHEN data->>'ts' ~ '^[0-9]+$' THEN (data->>'ts')::bigint ELSE 0 END DESC, "createdAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      prisma.$queryRaw(Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM collection_items
        WHERE ${clause}
      `),
      collection === 'clients'
        ? prisma.$queryRaw(Prisma.sql`
            SELECT CASE
              WHEN ${collectionCodeExpression()} ~* '^L' THEN 'L'
              WHEN ${collectionCodeExpression()} ~* '^A' THEN 'A'
              WHEN ${collectionCodeExpression()} ~* '^R' THEN 'R'
              ELSE '#'
            END AS groupe, COUNT(*)::int AS total
            FROM collection_items
            WHERE collection = 'clients'
            GROUP BY 1
          `)
        : Promise.resolve([])
    ]);
    const total = Number(countRows[0]?.total || 0);
    const payload = {
      items: rows.map(item => ({ id: item.id, createdAt: item.createdAt.toISOString(), ...item.data })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      ...(collection === 'clients'
        ? { groupCounts: Object.fromEntries(groupRows.map(row => [row.groupe, Number(row.total || 0)])) }
        : {})
    };
    const json = JSON.stringify(payload);
    await cacheEcrire(`collection:${scopeHash}`, json, 60);
    res.set('Server-Timing', `postgres;dur=${Date.now() - startedAt}`);
    res.set('X-CRM-Cache', 'MISS');
    res.set('Cache-Control', 'private, no-cache');
    res.type('application/json').send(json);
  } catch (error) {
    console.error('Collection page error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la collection' });
  }
});

app.get('/api/audit', authMiddleware, async (req, res) => {
  const startedAt = Date.now();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 100));
  const scope = `audit:${page}:${pageSize}`;
  const cached = await cacheLire(scope);
  if (cached) {
    res.set('Server-Timing', `redis;dur=${Date.now() - startedAt}`);
    res.set('X-CRM-Cache', 'HIT');
    res.set('Cache-Control', 'private, no-cache');
    return res.type('application/json').send(cached);
  }
  try {
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.auditLog.count()
    ]);
    const payload = {
      items: rows.map(a => ({
        id: a.id, ts: Number(a.ts), date: a.date, heure: a.heure,
        utilisateur: a.utilisateur, module: a.module, action: a.action,
        objet: a.objet, champ: a.champ, avant: a.avant, apres: a.apres,
        dossier: a.dossier
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
    const json = JSON.stringify(payload);
    await cacheEcrire(scope, json, 60);
    res.set('Server-Timing', `postgres;dur=${Date.now() - startedAt}`);
    res.set('X-CRM-Cache', 'MISS');
    res.set('Cache-Control', 'private, no-cache');
    res.type('application/json').send(json);
  } catch (error) {
    console.error('Audit page error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement du journal d’audit' });
  }
});

// The Data dashboard used to hydrate five complete CRM collections in the
// browser. This endpoint returns only the agent's actionable slice plus the
// exact counters needed by the screen, so dashboard cost stays stable as the
// CRM grows.
app.get('/api/dashboard/data', authMiddleware, async (req, res) => {
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ''))
    ? String(req.query.date)
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date());
  const requestedUser = String(req.query.user || '').trim().slice(0, 120);
  try {
    const target = await prisma.user.findFirst({
      where: req.auth.role === 'ADMIN' && requestedUser
        ? { OR: [{ identifiant: requestedUser }, { nomComplet: requestedUser }] }
        : { id: req.auth.id }
    });
    if (!target || !target.actif) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const targetName = target.nomComplet || target.identifiant;
    const services = Array.isArray(target.modulesAutorises?.services) ? target.modulesAutorises.services : [];
    const isData = services.includes('Data');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date());
    const yesterdayDate = new Date(`${today}T12:00:00Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    const auditDate = requestedDate.split('-').reverse().join('/');
    const followupStart = '2026-09-18';
    const bypassCache = req.query.fresh === '1';
    const scopeHash = crypto.createHash('sha1').update(JSON.stringify({ target: target.id, requestedDate, today })).digest('hex');
    const cached = bypassCache ? null : await cacheLire(`dashboard-data:${scopeHash}`);
    if (cached) {
      res.set('X-CRM-Cache', 'HIT');
      res.set('Cache-Control', 'private, no-cache');
      return res.type('application/json').send(cached);
    }

    const serviceList = services.length ? Prisma.join(services) : null;
    const clientAssignment = services.length
      ? Prisma.sql`(
          data->>'responsableCommercial' = ${targetName}
          OR data->>'responsableCommercial' IN (${serviceList})
          OR (${isData} AND COALESCE(data->>'responsableCommercial', '') = '' AND (
            data->>'sourceDonnees' IN ('Workflow', 'Google Sheets')
            OR COALESCE(data->>'ultexDossierId', '') <> ''
          ))
        )`
      : Prisma.sql`data->>'responsableCommercial' = ${targetName}`;
    const demandeAssignment = services.length
      ? Prisma.sql`(
          data->>'responsableData' = ${targetName}
          OR data->>'responsableData' IN (${serviceList})
          OR (${isData} AND COALESCE(data->>'responsableData', '') = '')
        )`
      : Prisma.sql`data->>'responsableData' = ${targetName}`;

    const [clientRows, demandeRows, lineRows, taskRows, objectiveRows, auditRows, sourcingRows] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`
        SELECT id, code, data, "createdAt" FROM collection_items
        WHERE collection = 'clients' AND ${clientAssignment} AND (
          data->>'responsableCommercial' = ${targetName}
          OR LEFT(COALESCE(data->>'dateEntreeData', ''), 10) >= ${followupStart}
          OR LEFT(COALESCE(data->>'dateCreation', ''), 10) >= ${followupStart}
          OR LEFT(COALESCE(data->>'datePremierContact', ''), 10) >= ${followupStart}
        )
        ORDER BY "createdAt" DESC
      `),
      prisma.$queryRaw(Prisma.sql`
        SELECT id, code, data, "createdAt" FROM collection_items
        WHERE collection = 'demandes' AND ${demandeAssignment} AND (
          LEFT(COALESCE(data->>'dateHeureReception', data->>'dateDemande', ''), 10) = ${today}
          OR (
            LEFT(COALESCE(data->>'dateHeureReception', data->>'dateDemande', ''), 10) = ${yesterday}
            AND COALESCE(data->>'dataTag', '') = ''
            AND COALESCE(data->>'actionSuivante', '') = ''
            AND COALESCE(data->>'dernierContact', '') = ''
            AND COALESCE(data->>'dernierSuiviData', '') = ''
            AND COALESCE(data->>'statut', 'Nouvelle') IN ('', 'Nouvelle', 'Nouveau', 'À traiter', 'Brouillon')
          )
          OR (COALESCE(data->>'echeanceActionSuivante', '') <> '' AND LEFT(data->>'echeanceActionSuivante', 10) <= ${today})
          OR (
            LEFT(COALESCE(data->>'dateDemande', data->>'dateHeureReception', data->>'dateEntreeData', ''), 10) >= ${followupStart}
            AND data->>'dataTag' IN ('En cours de traitement', 'Pas réponse', 'Réclamation', 'Double codage', 'Num ironné', 'Autre')
            AND COALESCE(data->>'echeanceActionSuivante', '') = ''
          )
          OR code IN (
            SELECT ligne.data->>'demande' FROM collection_items ligne
            WHERE ligne.collection = 'demandeLignes'
              AND ligne.data->>'statut' IN ('Brouillon', 'À compléter')
          )
        )
        ORDER BY "createdAt" DESC
      `),
      prisma.$queryRaw(Prisma.sql`
        SELECT ligne.id, ligne.code, ligne.data, ligne."createdAt"
        FROM collection_items ligne
        JOIN collection_items demande
          ON demande.collection = 'demandes' AND demande.code = ligne.data->>'demande'
        WHERE ligne.collection = 'demandeLignes'
          AND ligne.data->>'statut' IN ('Brouillon', 'À compléter')
          AND demande.data->>'responsableData' = ${targetName}
        ORDER BY ligne."createdAt" DESC
      `),
      prisma.$queryRaw(Prisma.sql`
        SELECT id, code, data, "createdAt" FROM collection_items
        WHERE collection = 'taches'
          AND COALESCE(data->>'statut', '') <> 'Terminée'
          AND (data->>'assigne' = ${targetName}${services.length ? Prisma.sql` OR data->>'assigne' IN (${serviceList})` : Prisma.empty})
          AND COALESCE(data->>'echeance', '') <> ''
          AND LEFT(data->>'echeance', 10) <= ${today}
        ORDER BY "createdAt" DESC
      `),
      prisma.$queryRaw(Prisma.sql`
        SELECT id, code, data, "createdAt" FROM collection_items
        WHERE collection = 'objectifsData'
          AND COALESCE(data->>'dateDebut', '') <= ${requestedDate}
          AND COALESCE(data->>'dateFin', '') >= ${requestedDate}
          AND (COALESCE(data->>'utilisateur', '') = '' OR data->>'utilisateur' = ${targetName})
        ORDER BY "createdAt" DESC
      `),
      prisma.auditLog.findMany({ where: { utilisateur: targetName, date: auditDate }, orderBy: { createdAt: 'desc' } }),
      prisma.$queryRaw(Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM collection_items ligne
        JOIN collection_items demande
          ON demande.collection = 'demandes' AND demande.code = ligne.data->>'demande'
        WHERE ligne.collection = 'demandeLignes'
          AND demande.data->>'responsableData' = ${targetName}
          AND ligne.data->>'statut' IN ('Fournisseur trouvé', 'Prête pour offre', 'Offre envoyée', 'Confirmée')
      `)
    ]);

    const mapRows = rows => rows.map(item => ({ id: item.id, createdAt: item.createdAt.toISOString(), ...item.data }));
    const payload = {
      db: {
        clients: mapRows(clientRows), demandes: mapRows(demandeRows), demandeLignes: mapRows(lineRows),
        taches: mapRows(taskRows), objectifsData: mapRows(objectiveRows),
        audit: auditRows.map(a => ({
          id: a.id, ts: Number(a.ts), date: a.date, heure: a.heure, utilisateur: a.utilisateur,
          module: a.module, action: a.action, objet: a.objet, champ: a.champ,
          avant: a.avant, apres: a.apres, dossier: a.dossier
        }))
      },
      metrics: { sourcings: Number(sourcingRows[0]?.total || 0) },
      generatedAt: new Date().toISOString()
    };
    const json = JSON.stringify(payload);
    await cacheEcrire(`dashboard-data:${scopeHash}`, json, 30);
    res.set('X-CRM-Cache', 'MISS');
    res.set('Cache-Control', 'private, no-cache');
    res.type('application/json').send(json);
  } catch (error) {
    console.error('Data dashboard error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement du tableau de bord Data' });
  }
});

// Shared by the routine sync route and the OTP-gated restore route below —
// same full-state-replacement semantics either way, factored out so
// "restore a backup" isn't a second, divergent implementation to keep in sync.
// purge=true deletes, per collection, every record NOT present in fullState
// (an intentional full-state replace -- correct for /api/security/restore,
// where "restore this backup" means exactly that). purge=false (the default,
// used by the routine /api/db/sync every save goes through) only ever
// creates/updates records present in fullState and never deletes anything --
// critical because the frontend's fullState is just whatever was loaded into
// that browser tab at some point in the past (DBContext.jsx loads the whole
// DB once at login, then every single save -- editing one client, adding one
// notification -- resends that entire in-memory snapshot). With purge=true
// unconditional, any other change made anywhere else since that tab's last
// load (a different tab, a different user, a background job) is invisible
// to this snapshot and gets silently deleted the moment this tab saves
// anything at all -- this was UBOS's actual mass-data-loss bug: no error,
// no audit trail, entire collections of records disappearing.
async function synchroniserEtatComplet(fullState, { purge = false } = {}) {
    // 1. Sync Sequences
    if (fullState.seq) {
      for (const [key, val] of Object.entries(fullState.seq)) {
        await prisma.sequenceCounter.upsert({
          where: { key },
          update: { val: Number(val) },
          create: { key, val: Number(val) }
        });
      }
    }

    // 2. Sync Users in PostgreSQL User table
    if (Array.isArray(fullState.utilisateurs)) {
      for (const u of fullState.utilisateurs) {
        if (u.code || u.identifiant) {
          const existing = await prisma.user.findFirst({
            where: { OR: [{ code: u.code || '' }, { identifiant: u.identifiant || '' }] }
          });

          const motDePasseEntrant = u.motDePasse || (existing ? existing.motDePasse : null);
          const motDePasseFinal = motDePasseEntrant
            ? (BCRYPT_HASH_RE.test(motDePasseEntrant) ? motDePasseEntrant : bcrypt.hashSync(motDePasseEntrant, 10))
            : bcrypt.hashSync('ubos2026', 10);

          const userData = {
            code: u.code || 'USR' + String(Math.floor(Math.random() * 10000)).padStart(6, '0'),
            identifiant: u.identifiant,
            nomComplet: u.nomComplet || u.identifiant,
            motDePasse: motDePasseFinal,
            role: u.departement === 'Direction' || (u.services || []).includes('Direction') ? 'ADMIN' : 'USER',
            service: u.departement || 'Général',
            actif: u.actif !== false,
            modulesAutorises: {
              poste: u.poste || '',
              departement: u.departement || '',
              services: u.services || [],
              modules: u.modules || []
            },
            permissions: u.permissions || {}
          };

          if (existing) {
            await prisma.user.update({
              where: { id: existing.id },
              data: userData
            });
          } else {
            await prisma.user.create({
              data: userData
            });
          }
        }
      }
    }

    // 3. Sync Collections (+ purge records not in fullState, restore-only)
    for (const col of COLLS) {
      if (Array.isArray(fullState[col])) {
        const currentIds = fullState[col].map(item => String(item.id || item.code)).filter(Boolean);

        if (purge) {
          // Only reached from /api/security/restore, where "make the DB
          // match this exact snapshot" is the whole point.
          if (currentIds.length > 0) {
            await prisma.collectionItem.deleteMany({
              where: {
                collection: col,
                id: { notIn: currentIds }
              }
            });
          } else {
            await prisma.collectionItem.deleteMany({
              where: { collection: col }
            });
          }
        }

        for (const item of fullState[col]) {
          const itemId = String(item.id || item.code || Math.random());
          const code = item.code || null;
          const dossier = item.dossier || null;

          await prisma.collectionItem.upsert({
            where: { collection_id: { collection: col, id: itemId } },
            update: { code, dossier, data: item },
            create: { collection: col, id: itemId, code, dossier, data: item }
          });
        }
      }
    }

    // 3. Sync Audit Logs
    if (Array.isArray(fullState.audit)) {
      const recentAudit = fullState.audit.slice(0, 100);
      for (const a of recentAudit) {
        if (a.ts) {
          const existing = await prisma.auditLog.findFirst({
            where: { ts: BigInt(a.ts), utilisateur: a.utilisateur || '—', objet: a.objet || '—' }
          });
          if (!existing) {
            await prisma.auditLog.create({
              data: {
                ts: BigInt(a.ts || Date.now()),
                date: a.date || '',
                heure: a.heure || '',
                utilisateur: a.utilisateur || '—',
                module: a.module || '—',
                action: a.action || '—',
                objet: a.objet || '—',
                champ: a.champ || '—',
                avant: String(a.avant || '—'),
                apres: String(a.apres || '—'),
                dossier: a.dossier || '—'
              }
            });
          }
        }
      }
    }

    // 4. Sync Notifications
    if (Array.isArray(fullState.notifs)) {
      for (const n of fullState.notifs) {
        if (n.code) {
          await prisma.notificationItem.upsert({
            where: { code: n.code },
            update: { lu: Boolean(n.lu) },
            create: {
              code: n.code,
              dest: n.dest || 'Tous',
              de: n.de || '—',
              texte: n.texte || '',
              module: n.module || '',
              lu: Boolean(n.lu),
              ts: BigInt(n.ts || Date.now()),
              date: n.date || ''
            }
          });
        }
      }
    }

}

// Direction security alert — reuses the same NotificationItem table the
// rest of the app already writes to, so it shows up in the normal
// notification center without a parallel delivery mechanism.
async function alerterDirection(texte) {
  try {
    const code = `NTF${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await prisma.notificationItem.create({
      data: { code, dest: 'Direction', de: 'Sécurité', texte, module: 'Sécurité', lu: false, ts: BigInt(Date.now()), date: new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }
    });
  } catch (e) {
    console.error('Alerte Direction error:', e.message);
  }
}

// Routine mutations use a delta rather than resending every CRM row. This is
// intentionally upsert-only: deletion continues through the dedicated,
// permission-checked endpoints and a stale browser can never purge data.
app.post('/api/db/patch', authMiddleware, async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  const collections = payload.collections && typeof payload.collections === 'object'
    ? payload.collections
    : {};
  const unknownCollections = Object.keys(collections).filter(col => !COLLS.includes(col) || col === 'utilisateurs');
  if (unknownCollections.length) {
    return res.status(400).json({ error: `Collections invalides: ${unknownCollections.join(', ')}` });
  }

  const arrays = [payload.utilisateurs, payload.audit, payload.notifs, ...Object.values(collections)]
    .filter(value => value !== undefined);
  if (arrays.some(value => !Array.isArray(value))) {
    return res.status(400).json({ error: 'Le patch doit contenir des listes valides' });
  }
  const recordCount = arrays.reduce((sum, value) => sum + value.length, 0);
  if (recordCount > 2000) {
    return res.status(413).json({ error: 'Patch trop volumineux; utilisez la synchronisation complète' });
  }

  const partialState = {};
  if (payload.seq && typeof payload.seq === 'object' && !Array.isArray(payload.seq)) partialState.seq = payload.seq;
  if (Array.isArray(payload.utilisateurs)) partialState.utilisateurs = payload.utilisateurs;
  if (Array.isArray(payload.audit)) partialState.audit = payload.audit;
  if (Array.isArray(payload.notifs)) partialState.notifs = payload.notifs;
  Object.entries(collections).forEach(([col, items]) => { partialState[col] = items; });

  try {
    await synchroniserEtatComplet(partialState);
    res.json({ status: 'success', records: recordCount });
  } catch (error) {
    console.error('Delta sync error:', error);
    res.status(500).json({ error: 'Erreur lors de la synchronisation avec PostgreSQL' });
  }
});

// Routine save -- every "audit()/notifier()/updateDB()" in the frontend
// goes through this on every single change. Deliberately non-destructive
// (purge defaults to false): the frontend's fullState here is just whatever
// was loaded into this browser tab, possibly hours ago, and must never be
// allowed to delete records it simply doesn't know about yet.
app.post('/api/db/sync', authMiddleware, async (req, res) => {
  const fullState = req.body;
  if (!fullState) return res.status(400).json({ error: 'Données invalides' });
  try {
    await synchroniserEtatComplet(fullState);
    res.json({ status: 'success', message: 'Synchro PostgreSQL réussie' });
  } catch (error) {
    console.error('Batch sync error:', error);
    res.status(500).json({ error: 'Erreur lors de la synchronisation avec PostgreSQL' });
  }
});

// Imported arrival documents are kept outside PostgreSQL. Access always
// passes through JWT authentication and a path-containment check.
app.get('/api/documents/:code/download', authMiddleware, async (req, res) => {
  try {
    const item = await prisma.collectionItem.findFirst({
      where: { collection: 'documents', code: req.params.code }
    });
    const relativePath = item?.data?.storagePath;
    if (!relativePath) return res.status(404).json({ error: 'Fichier introuvable' });

    const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
    const relativeCheck = path.relative(UPLOADS_DIR, absolutePath);
    if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
      return res.status(400).json({ error: 'Chemin de fichier invalide' });
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }
    res.download(absolutePath, item.data.nom || path.basename(absolutePath));
  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ error: 'Erreur lors du téléchargement du document' });
  }
});

// Full backup restore — a genuine full-state overwrite (purge: true), gated
// behind OTP elevation, since restoring a backup can legitimately discard
// everything created since that backup was taken -- that's the intended
// behavior here, unlike the routine /api/db/sync above.
app.post('/api/security/restore', authMiddleware, requireElevation, async (req, res) => {
  const fullState = req.body;
  if (!fullState) return res.status(400).json({ error: 'Données invalides' });
  try {
    await synchroniserEtatComplet(fullState, { purge: true });
    const auteur = req.auth.nomComplet || req.auth.identifiant;
    await ecrireJournalSecurite({ action: 'Restauration complète', utilisateur: auteur, module: 'Sécurité', resultat: 'Réussie', ip: req.ip });
    await alerterDirection(`${auteur} a restauré une sauvegarde complète de la base UBOS.`);
    res.json({ status: 'success', message: 'Restauration effectuée' });
  } catch (error) {
    console.error('Secure restore error:', error);
    await ecrireJournalSecurite({ action: 'Restauration complète', utilisateur: req.auth.nomComplet || req.auth.identifiant, module: 'Sécurité', resultat: `Échec — ${error.message}`, ip: req.ip });
    res.status(500).json({ error: 'Erreur lors de la restauration' });
  }
});

// Removes a Google-Sheets test client together with the records created by
// the same intake flow. It deliberately refuses ordinary/established clients
// and clients that already have a non-Sheets demande.
app.delete('/api/security/sheet-test-clients/:code', authMiddleware, requireElevation, async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!/^L\d+$/.test(code)) return res.status(400).json({ error: 'Seuls les codes test L peuvent être supprimés ici.' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const clientDemandes = await tx.collectionItem.findMany({
        where: { collection: 'demandes', data: { path: ['client'], equals: code } }
      });
      const sheetDemandes = clientDemandes.filter(item =>
        item.data?.sourceSynchronisation === 'Google Sheets' || Boolean(item.data?.sheetLeadId)
      );
      const client = await tx.collectionItem.findFirst({ where: { collection: 'clients', code } });
      const sheetClient = client?.data?.sourceDonnees === 'Google Sheets' && Boolean(client?.data?.sheetLeadId);
      if (client && !sheetClient) throw Object.assign(new Error("Ce code n'a pas été créé par le test Google Sheets."), { status: 409 });
      if (!client && sheetDemandes.length === 0) throw Object.assign(new Error('Aucune donnée de test Google Sheets trouvée pour ce code.'), { status: 404 });
      if (sheetDemandes.length !== clientDemandes.length) {
        throw Object.assign(new Error('Suppression refusée : ce client possède une demande qui ne vient pas du test Google Sheets.'), { status: 409 });
      }

      const demandeCodes = new Set(sheetDemandes.map(item => item.code).filter(Boolean));
      const allLines = demandeCodes.size ? await tx.collectionItem.findMany({ where: { collection: 'demandeLignes' } }) : [];
      const lines = allLines.filter(item => demandeCodes.has(item.data?.demande));
      const contacts = await tx.collectionItem.findMany({
        where: { collection: 'contacts', data: { path: ['codeClientAssocie'], equals: code } }
      });
      const sheetContacts = contacts.filter(item => item.data?.sourceDonnees === 'Google Sheets');
      const documents = await tx.collectionItem.findMany({
        where: { collection: 'documents', data: { path: ['client'], equals: code } }
      });

      const groups = [
        ['demandeLignes', lines],
        ['documents', documents],
        ['demandes', sheetDemandes],
        ['contacts', sheetContacts],
        ['clients', client ? [client] : []],
      ];
      const counts = {};
      for (const [collection, items] of groups) {
        const ids = items.map(item => item.id);
        counts[collection] = ids.length
          ? (await tx.collectionItem.deleteMany({ where: { collection, id: { in: ids } } })).count
          : 0;
      }
      return { counts };
    });

    const auteur = req.auth.nomComplet || req.auth.identifiant;
    const detail = Object.entries(result.counts).map(([name, count]) => `${name}:${count}`).join(', ');
    await ecrireJournalSecurite({ action: 'Suppression code test Google Sheets', utilisateur: auteur, module: 'clients', resultat: `${code} — ${detail}`, ip: req.ip });
    await alerterDirection(`${auteur} a supprimé le code test Google Sheets ${code} et ses données liées.`);
    res.json({ status: 'deleted', code, ...result });
  } catch (error) {
    console.error('Sheet test client delete error:', error);
    const status = error.status || 500;
    res.status(status).json({ error: status < 500 ? error.message : 'Erreur lors de la suppression du code test.' });
  }
});

// Dashboard cleanup is keyed by the demande, not by the displayed client
// code. This matters when an old orphaned test demande still says L6911 but
// that client code now legitimately belongs to somebody else.
app.delete('/api/security/sheet-test-demandes/:demandeCode', authMiddleware, requireElevation, async (req, res) => {
  const demandeCode = String(req.params.demandeCode || '').trim();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const demande = await tx.collectionItem.findFirst({ where: { collection: 'demandes', code: demandeCode } });
      if (!demande) throw Object.assign(new Error('Demande test introuvable.'), { status: 404 });
      const sheetDemande = demande.data?.sourceSynchronisation === 'Google Sheets' || Boolean(demande.data?.sheetLeadId);
      if (!sheetDemande) throw Object.assign(new Error("Cette demande ne vient pas du test Google Sheets."), { status: 409 });

      const clientCode = demande.data?.client || demande.data?.codeClientUltex || '';
      const lines = (await tx.collectionItem.findMany({ where: { collection: 'demandeLignes' } }))
        .filter(item => item.data?.demande === demande.code);
      const demandeDocuments = (await tx.collectionItem.findMany({ where: { collection: 'documents' } }))
        .filter(item => item.data?.demande === demande.code);

      if (lines.length) await tx.collectionItem.deleteMany({ where: { collection: 'demandeLignes', id: { in: lines.map(item => item.id) } } });
      if (demandeDocuments.length) await tx.collectionItem.deleteMany({ where: { collection: 'documents', id: { in: demandeDocuments.map(item => item.id) } } });
      await tx.collectionItem.deleteMany({ where: { collection: 'demandes', id: demande.id } });

      let deletedClient = 0;
      let deletedContacts = 0;
      let deletedClientDocuments = 0;
      if (clientCode) {
        const client = await tx.collectionItem.findFirst({ where: { collection: 'clients', code: clientCode } });
        const remainingDemandes = await tx.collectionItem.findMany({
          where: { collection: 'demandes', data: { path: ['client'], equals: clientCode } }
        });
        const sheetClient = client?.data?.sourceDonnees === 'Google Sheets' && Boolean(client?.data?.sheetLeadId);
        if (client && sheetClient && remainingDemandes.length === 0) {
          const contacts = (await tx.collectionItem.findMany({
            where: { collection: 'contacts', data: { path: ['codeClientAssocie'], equals: clientCode } }
          })).filter(item => item.data?.sourceDonnees === 'Google Sheets');
          const documents = await tx.collectionItem.findMany({
            where: { collection: 'documents', data: { path: ['client'], equals: clientCode } }
          });
          if (contacts.length) deletedContacts = (await tx.collectionItem.deleteMany({ where: { collection: 'contacts', id: { in: contacts.map(item => item.id) } } })).count;
          if (documents.length) deletedClientDocuments = (await tx.collectionItem.deleteMany({ where: { collection: 'documents', id: { in: documents.map(item => item.id) } } })).count;
          deletedClient = (await tx.collectionItem.deleteMany({ where: { collection: 'clients', id: client.id } })).count;
        }
      }
      return { clientCode, counts: {
        demandes: 1, demandeLignes: lines.length,
        documents: demandeDocuments.length + deletedClientDocuments,
        contacts: deletedContacts, clients: deletedClient,
      } };
    });
    const auteur = req.auth.nomComplet || req.auth.identifiant;
    await ecrireJournalSecurite({ action: 'Suppression demande test Google Sheets', utilisateur: auteur, module: 'demandes', resultat: `${demandeCode} — client affiché ${result.clientCode || '—'}`, ip: req.ip });
    await alerterDirection(`${auteur} a supprimé la demande test Google Sheets ${demandeCode}.`);
    res.json({ status: 'deleted', demandeCode, ...result });
  } catch (error) {
    console.error('Sheet test demande delete error:', error);
    const status = error.status || 500;
    res.status(status).json({ error: status < 500 ? error.message : 'Erreur lors de la suppression de la demande test.' });
  }
});

// Deletes one record from any collection — the single choke point every
// module's "Supprimer" button now goes through, gated behind OTP elevation.
app.delete('/api/security/records/:collection/:code', authMiddleware, requireElevation, async (req, res) => {
  const { collection, code } = req.params;
  if (!COLLS.includes(collection)) return res.status(400).json({ error: 'Collection inconnue' });
  try {
    if (collection === 'clients') {
      const client = await prisma.collectionItem.findFirst({ where: { collection: 'clients', code } });
      if (client?.data?.sourceDonnees === 'Google Sheets' && client?.data?.sheetLeadId) {
        return res.status(409).json({ error: 'Utilisez « Supprimer ce code test » pour retirer aussi les demandes et produits liés.' });
      }
    }
    const deleted = await prisma.collectionItem.deleteMany({ where: { collection, code } });
    const auteur = req.auth.nomComplet || req.auth.identifiant;
    await ecrireJournalSecurite({ action: 'Suppression', utilisateur: auteur, module: collection, resultat: `${code} — ${deleted.count} enregistrement(s) supprimé(s)`, ip: req.ip });
    await alerterDirection(`${auteur} a supprimé l'enregistrement ${code} (${collection}).`);
    res.json({ status: 'deleted', count: deleted.count });
  } catch (error) {
    console.error('Secure delete error:', error);
    await ecrireJournalSecurite({ action: 'Suppression', utilisateur: req.auth.nomComplet || req.auth.identifiant, module: collection, resultat: `Échec — ${error.message}`, ip: req.ip });
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

function construireDonneesUtilisateur(u, existing) {
  const motDePasseEntrant = u.motDePasse || (existing ? existing.motDePasse : null);
  const motDePasseFinal = motDePasseEntrant
    ? (BCRYPT_HASH_RE.test(motDePasseEntrant) ? motDePasseEntrant : bcrypt.hashSync(motDePasseEntrant, 10))
    : bcrypt.hashSync('ubos2026', 10);
  return {
    code: u.code || existing?.code || 'USR' + String(Math.floor(Math.random() * 10000)).padStart(6, '0'),
    identifiant: u.identifiant,
    nomComplet: u.nomComplet || u.identifiant,
    motDePasse: motDePasseFinal,
    role: u.departement === 'Direction' || (u.services || []).includes('Direction') ? 'ADMIN' : 'USER',
    service: u.departement || 'Général',
    actif: u.actif !== false,
    modulesAutorises: {
      poste: u.poste || '',
      departement: u.departement || '',
      services: u.services || [],
      modules: u.modules || []
    },
    permissions: u.permissions || {}
  };
}

// Create/update a user account — role, department, services, permissions,
// active status, or an administrative password reset. Gated behind OTP
// elevation: even Direction shouldn't be able to grant itself or someone
// else elevated access on the strength of a normal login alone.
app.post('/api/security/users', authMiddleware, requireElevation, async (req, res) => {
  try {
    const data = construireDonneesUtilisateur(req.body || {}, null);
    const user = await prisma.user.create({ data });
    const auteur = req.auth.nomComplet || req.auth.identifiant;
    await ecrireJournalSecurite({ action: 'Création utilisateur', utilisateur: auteur, module: 'Utilisateurs', resultat: `${user.nomComplet} (${user.code}) — rôle ${user.role}`, ip: req.ip });
    await alerterDirection(`${auteur} a créé le compte ${user.nomComplet}.`);
    res.json({ status: 'created', user: { id: user.id, code: user.code } });
  } catch (error) {
    console.error('Secure user create error:', error);
    await ecrireJournalSecurite({ action: 'Création utilisateur', utilisateur: req.auth.nomComplet || req.auth.identifiant, module: 'Utilisateurs', resultat: `Échec — ${error.message}`, ip: req.ip });
    res.status(500).json({ error: "Erreur lors de la création de l'utilisateur" });
  }
});

app.patch('/api/security/users/:id', authMiddleware, requireElevation, async (req, res) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const merged = { ...existing, ...req.body, code: existing.code };
    const data = construireDonneesUtilisateur(merged, existing);
    const user = await prisma.user.update({ where: { id: existing.id }, data });
    const auteur = req.auth.nomComplet || req.auth.identifiant;
    const changements = [];
    if (existing.role !== data.role) changements.push(`rôle ${existing.role} → ${data.role}`);
    if (existing.actif !== data.actif) changements.push(data.actif ? 'réactivé' : 'désactivé');
    if (req.body && req.body.motDePasse) changements.push('mot de passe réinitialisé');
    await ecrireJournalSecurite({ action: 'Modification utilisateur', utilisateur: auteur, module: 'Utilisateurs', resultat: `${user.nomComplet} (${user.code})${changements.length ? ' — ' + changements.join(', ') : ''}`, ip: req.ip });
    if (changements.length) await alerterDirection(`${auteur} a modifié le compte ${user.nomComplet} (${changements.join(', ')}).`);
    res.json({ status: 'updated', user: { id: user.id, code: user.code } });
  } catch (error) {
    console.error('Secure user update error:', error);
    await ecrireJournalSecurite({ action: 'Modification utilisateur', utilisateur: req.auth.nomComplet || req.auth.identifiant, module: 'Utilisateurs', resultat: `Échec — ${error.message}`, ip: req.ip });
    res.status(500).json({ error: "Erreur lors de la mise à jour de l'utilisateur" });
  }
});

// Generate Code (Atomic PostgreSQL Sequence Counter)
app.post('/api/genCode', authMiddleware, async (req, res) => {
  const { pfx } = req.body;
  if (!pfx) return res.status(400).json({ error: 'Prefix requis' });

  try {
    const annee = new Date().getFullYear();
    const avecAnnee = PFX_ANNEE.includes(pfx);
    const key = avecAnnee ? pfx + annee : pfx;

    let seqRecord = await prisma.sequenceCounter.findUnique({ where: { key } });

    let currentVal = seqRecord ? seqRecord.val : 0;
    let code;

    do {
      currentVal += 1;
      const n = String(currentVal).padStart(6, '0');
      code = avecAnnee ? `${pfx}${annee}-${n}` : `${pfx}${n}`;
    } while (false); // Unique check handled via counter increment

    await prisma.sequenceCounter.upsert({
      where: { key },
      update: { val: currentVal },
      create: { key, val: currentVal }
    });

    res.json({ code, seq: currentVal, key });
  } catch (error) {
    console.error('GenCode error:', error);
    res.status(500).json({ error: 'Erreur génération code PostgreSQL' });
  }
});

// Real PDF Text Extraction & OCR Parsing Endpoint
app.post('/api/ocr/pdf', authMiddleware, async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ error: 'Payload base64 manquant' });

    const cleanBase64 = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
    const buffer = Buffer.from(cleanBase64.trim(), 'base64');

    try {
      const data = await pdfParse(buffer);
      return res.json({
        success: true,
        numPages: data.numpages || 1,
        text: data.text || 'Document PDF scanné sans flux texte. Utilisez le bouton OCR Tesseract.',
        info: data.info || {}
      });
    } catch (pdfErr) {
      console.warn('PDF-parse fallback for scanned PDF:', pdfErr.message);
      return res.json({
        success: true,
        numPages: 1,
        text: 'Document PDF scanné ou image. Lancez l\'OCR Tesseract pour analyser le contenu.',
        info: {},
        isScanned: true
      });
    }
  } catch (error) {
    console.error('PDF parsing error:', error);
    res.status(500).json({ error: 'Erreur lors de la lecture du fichier PDF' });
  }
});

// -----------------------------------------------------------------------
// ULTEX sync — pushes a client contact/request from the ULTEX workflow app
// into this CRM in real time (contact + client + demande + dossier,
// mirroring the CRM's own manual lifecycle: contact reaches out -> becomes
// a client -> files a demande -> becomes a dossier). One-way (ULTEX ->
// CRM); the CRM never writes back.
// -----------------------------------------------------------------------

function ultexSyncAuth(req, res, next) {
  const key = req.headers['x-ultex-sync-key'] || '';
  if (!key || key !== ULTEX_SYNC_API_KEY) {
    return res.status(401).json({ error: 'Clé de synchronisation ULTEX invalide' });
  }
  next();
}

const LIBELLE_DATA_TAG = {
  pas_pret: 'Pas prêt',
  faible_qualite: 'Faible qualité',
  pas_interesse: 'Pas intéressé',
  pas_reponse: 'Pas réponse',
  test: 'Test',
  traite: 'Traité',
  en_cours_de_traitement: 'En cours de traitement',
  double_codage: 'Double codage',
  num_ironne: 'Num ironné',
  reclamation: 'Réclamation',
  Autre: 'Autre',
};

function normaliserDataTag(value) {
  const brut = String(value || '').trim();
  if (!brut) return '';
  return LIBELLE_DATA_TAG[brut] || brut;
}

function versionnerEtatSynchronise(ancien, suivant, auteur) {
  if ((ancien.dataTag || '') === (suivant.dataTag || '')) return;
  const now = new Date();
  suivant.etatVersion = (Number(ancien.etatVersion) || 0) + 1;
  suivant.dateDernierChangementEtat = now.toISOString();
  suivant.historiqueSuivi = [...(ancien.historiqueSuivi || []), {
    id: crypto.randomUUID(), ts: now.getTime(), date: now.toISOString(),
    version: suivant.etatVersion, utilisateur: auteur, action: 'État synchronisé',
    avant: ancien.dataTag || '', etat: suivant.dataTag || '', notes: '',
  }];
}

function dateHeureEcheance(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function dateIsoJour(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback.toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

// Same SequenceCounter mechanism as /api/genCode, but a single atomic
// upsert (increment) instead of read-then-write -- this endpoint can be
// called concurrently for different dossiers, and the read-then-write
// version race-conditions under concurrent calls (two requests could read
// the same counter value before either writes it back).
async function genererCodeAtomique(pfx) {
  const annee = new Date().getFullYear();
  const avecAnnee = PFX_ANNEE.includes(pfx);
  const key = avecAnnee ? pfx + annee : pfx;
  // Imported/restored CRM data can contain IDs ahead of SequenceCounter.
  // Since CollectionItem.id is globally unique (not only per collection),
  // advance atomically until an actually free ID is found instead of
  // letting the following create() fail with Prisma P2002.
  for (let tentative = 0; tentative < 10000; tentative += 1) {
    const seqRecord = await prisma.sequenceCounter.upsert({
      where: { key },
      update: { val: { increment: 1 } },
      create: { key, val: 1 }
    });
    const n = String(seqRecord.val).padStart(6, '0');
    const code = avecAnnee ? `${pfx}${annee}-${n}` : `${pfx}${n}`;
    const existe = await prisma.collectionItem.findUnique({
      where: { id: code },
      select: { id: true }
    });
    if (!existe) return code;
  }
  throw new Error(`Impossible de générer un code ${pfx} libre après 10000 tentatives`);
}

// Finds the CollectionItem in a given collection previously created/updated
// for this ULTEX dossier, keyed by an "ultexDossierId" field stashed inside
// its JSON data -- not part of the CRM's own form schema, but CollectionItem
// data is a free-form JSON blob, so this is a safe, additive way to make
// repeated syncs for the same dossier update the same records instead of
// creating duplicates on every call.
async function trouverParUltexId(collection, ultexDossierId) {
  return prisma.collectionItem.findFirst({
    where: { collection, data: { path: ['ultexDossierId'], equals: ultexDossierId } }
  });
}

// Finds an existing client by IDENTITY, not by dossier: a returning client
// files a new dossier with a new ultexDossierId every time, so matching on
// that (like every other collection here does) created a brand-new
// duplicate "C0000xx" client on every repeat dossier instead of updating
// the one that already existed. codeClientUltex (ULTEX's global per-client
// code, stable across all of that client's dossiers) is the correct match
// key; phone number is the fallback for dossiers synced before that field
// existed, or for a client ULTEX hasn't assigned a code to yet.
async function trouverClientExistant(codeClientUltex, telephone) {
  if (codeClientUltex) {
    const parCode = await prisma.collectionItem.findFirst({
      where: { collection: 'clients', data: { path: ['codeClientUltex'], equals: codeClientUltex } }
    });
    if (parCode) return parCode;
  }
  if (telephone) {
    const parTel = await prisma.collectionItem.findFirst({
      where: { collection: 'clients', data: { path: ['telephone'], equals: telephone } }
    });
    if (parTel) return parTel;
  }
  return null;
}

// Swaps a client record's own code for ULTEX's global one. `code` is the
// Prisma primary key here, so this is a delete + recreate (createdAt
// preserved) rather than an update, plus a repoint of everything that
// referenced the old code. Falls back to a plain data update if the target
// code is somehow already taken, so a sync is never lost over this.
async function adopterCodeUltex(client, nouveauCode, mergedData) {
  const ancienCode = client.code;
  const data = { ...mergedData, id: nouveauCode, code: nouveauCode, codeClientUltex: nouveauCode };
  try {
    return await prisma.$transaction(async (tx) => {
      const cible = await tx.collectionItem.findUnique({
        where: { collection_id: { collection: 'clients', id: nouveauCode } }
      });

      // If the canonical code already exists, merge the obsolete row into
      // it and repoint every CRM record before removing the duplicate.
      if (cible && cible.id !== client.id) {
        const valeursUtiles = Object.fromEntries(
          Object.entries(data).filter(([, value]) => value !== '' && value != null)
        );
        const donneesFusionnees = {
          ...cible.data,
          ...valeursUtiles,
          id: nouveauCode,
          code: nouveauCode,
          codeClientUltex: nouveauCode
        };
        await tx.collectionItem.update({
          where: { collection_id: { collection: 'clients', id: cible.id } },
          data: { data: donneesFusionnees }
        });
        await repointerReferencesClient(tx, [ancienCode], nouveauCode);
        await tx.collectionItem.delete({
          where: { collection_id: { collection: 'clients', id: client.id } }
        });
        return { ...cible, data: donneesFusionnees };
      }

      await tx.collectionItem.delete({
        where: { collection_id: { collection: 'clients', id: client.id } }
      });
      const cree = await tx.collectionItem.create({
        data: {
          collection: 'clients', id: nouveauCode, code: nouveauCode,
          data, createdAt: client.createdAt
        }
      });
      await repointerReferencesClient(tx, [ancienCode], nouveauCode);
      return cree;
    });
  } catch (error) {
    console.error(`Impossible d'adopter le code ULTEX ${nouveauCode} pour ${ancienCode}:`, error);
    return prisma.collectionItem.update({
      where: { collection_id: { collection: 'clients', id: client.id } },
      data: { data: mergedData }
    });
  }
}

async function repointerReferencesClient(tx, anciensCodes, nouveauCode) {
  if (!anciensCodes.length) return;
  for (const champ of ['client', 'codeClientAssocie']) {
    for (const ancienCode of anciensCodes) {
      const lies = await tx.collectionItem.findMany({
        where: { data: { path: [champ], equals: ancienCode } }
      });
      for (const item of lies) {
        await tx.collectionItem.update({
          where: { collection_id: { collection: item.collection, id: item.id } },
          data: { data: { ...item.data, [champ]: nouveauCode } }
        });
      }
    }
  }
}

function telephoneIdentite(value) {
  const valueDigits = String(value || '').replace(/\D/g, '');
  return valueDigits.length >= 9 ? valueDigits.slice(-9) : valueDigits;
}

async function fusionnerDoublonsClientParTelephone(canonicalClient, telephone) {
  const phoneKey = telephoneIdentite(telephone);
  if (!phoneKey) return canonicalClient;

  const allClients = await prisma.collectionItem.findMany({ where: { collection: 'clients' } });
  const duplicates = allClients.filter(item =>
    item.id !== canonicalClient.id && telephoneIdentite(item.data?.telephone) === phoneKey
  );
  if (!duplicates.length) return canonicalClient;

  return prisma.$transaction(async tx => {
    // Canonical non-empty values win; duplicates only fill information that
    // is genuinely missing before their references are repointed.
    const mergedData = { ...canonicalClient.data };
    for (const duplicate of duplicates) {
      for (const [key, value] of Object.entries(duplicate.data || {})) {
        if ((mergedData[key] === undefined || mergedData[key] === null || mergedData[key] === '') && value != null && value !== '') {
          mergedData[key] = value;
        }
      }
    }
    mergedData.id = canonicalClient.code;
    mergedData.code = canonicalClient.code;
    mergedData.codeClientUltex = canonicalClient.code;

    const updated = await tx.collectionItem.update({
      where: { collection_id: { collection: 'clients', id: canonicalClient.id } },
      data: { data: mergedData }
    });
    await repointerReferencesClient(tx, duplicates.map(item => item.code), canonicalClient.code);
    for (const duplicate of duplicates) {
      await tx.collectionItem.delete({
        where: { collection_id: { collection: 'clients', id: duplicate.id } }
      });
    }
    console.log(`Doublons client fusionnés automatiquement vers ${canonicalClient.code}: ${duplicates.map(item => item.code).join(', ')}`);
    return updated;
  });
}

app.post('/api/sync/ultex/dossier', ultexSyncAuth, async (req, res) => {
  const {
    ultexDossierId, referenceCode, nom, telephone, email, ville, dateReception, dataTag, createdManually,
    objectifGeneral, typeProjet, urgence, budgetGlobalEstime, remarque,
    // Global ULTEX client code (e.g. "A201"), shared across all of that
    // client's dossiers -- visible cross-system identifier, not just an
    // internal workflow value. Type de demande (Sourcing/Proforma/
    // Négociation), sens de l'opération (Import/Export/Accompagnement),
    // current pipeline stage + Data->Closing disposition tags, and the
    // product/transport fields for the dossiers collection below.
    codeClientUltex, typeDemande, sensOperation, etape, tagsPipeline,
    produit, quantite, incoterm, paysOrigine, paysProvenance,
    modeTransport, cbm, poids, poidsNet, hsCode, annule, products = [],
    // Only ever sent from a VALIDATED devis (see _validated_devis_totals in
    // crm_sync.py), so null here means "no validated devis right now" --
    // keep whatever was last known rather than blanking the figures while
    // a devis is being revised.
    montantVente, montantAchat
  } = req.body || {};

  if (!ultexDossierId || !nom) {
    return res.status(400).json({ error: 'ultexDossierId et nom requis' });
  }

  try {
    const dateDemandeSource = dateIsoJour(dateReception);
    const dataTagRecu = Object.prototype.hasOwnProperty.call(req.body || {}, 'dataTag');
    const dataTagLisible = normaliserDataTag(dataTag);
    const origineRemarque = `Créé automatiquement depuis ULTEX${referenceCode ? ` (réf. ${referenceCode})` : ''}.`;

    // 1. Client — upsert by IDENTITY (codeClientUltex, falling back to
    // phone), not by ultexDossierId -- see trouverClientExistant above for
    // why. New clients start as "Prospect"; an existing client's
    // segment/pipeline (set manually by sales) is never overwritten, only
    // contact details and "dernier contact". ultexDossierId on the record
    // itself is kept as the FIRST dossier that created this client (never
    // overwritten later) -- purely informational provenance now, not a
    // lookup key, since one client can have many dossiers.
    // New clients use ULTEX's own global client code (e.g. "A201") as their
    // CRM code directly when available, instead of an internal "C000123"
    // counter -- that's the actual cross-system identifier, and generating
    // a second, meaningless one just to display "C000123" in the grid was
    // exactly the "shit code" complaint. Falls back to the internal counter
    // only if ULTEX hasn't assigned this client a code yet.
    let client = await trouverClientExistant(codeClientUltex, telephone);
    if (client) {
      const sourceEstLaPlusRecente = !client.data.dateDerniereDemande || dateDemandeSource >= client.data.dateDerniereDemande;
      const merged = {
        ...client.data,
        nom,
        telephone: telephone || client.data.telephone,
        email: email || client.data.email,
        ville: ville || client.data.ville,
        codeClientUltex: codeClientUltex || client.data.codeClientUltex,
        sourceDonnees: 'Workflow',
        dateDerniereDemande: sourceEstLaPlusRecente ? dateDemandeSource : client.data.dateDerniereDemande,
        ...(dataTagRecu && sourceEstLaPlusRecente ? { dataTag: dataTagLisible } : {})
      };
      versionnerEtatSynchronise(client.data, merged, merged.sourceDonnees);
      if (codeClientUltex && client.code !== codeClientUltex) {
        // ULTEX is authoritative for the cross-system client code. This also
        // repairs legacy cases where the CRM kept an obsolete A-code (not
        // only temporary C000xxx codes) while Workflow had restored the
        // client's original L/R/numeric code.
        client = await adopterCodeUltex(client, codeClientUltex, merged);
      } else {
        client = await prisma.collectionItem.update({
          where: { collection_id: { collection: 'clients', id: client.id } },
          data: { data: merged }
        });
      }
    } else {
      let code = codeClientUltex || await genererCodeAtomique('C');
      const data = {
        ultexDossierId, id: code, code, nom,
        telephone: telephone || '', email: email || '', ville: ville || '',
        codeClientUltex: codeClientUltex || '',
        segment: 'Prospect', nbRelances: 0,
        sourceDonnees: 'Workflow', datePremierContact: dateDemandeSource,
        dateEntreeData: new Date().toISOString().slice(0, 10),
        dateDerniereDemande: dateDemandeSource, dataTag: dataTagLisible,
        remarque: origineRemarque
      };
      try {
        client = await prisma.collectionItem.create({
          data: { collection: 'clients', id: code, code, data }
        });
      } catch (creationError) {
        // Extremely unlikely id collision (codeClientUltex matches some
        // unrelated pre-existing record's id) -- fall back to an internal
        // code rather than fail the whole sync.
        if (creationError.code === 'P2002') {
          code = await genererCodeAtomique('C');
          client = await prisma.collectionItem.create({
            data: { collection: 'clients', id: code, code, data: { ...data, id: code, code } }
          });
        } else {
          throw creationError;
        }
      }
    }

    // A code match alone is not enough: legacy rows may still carry another
    // code for the exact same phone. Merge them during every live sync so a
    // stale A/C-code cannot survive beside the canonical L/R/client code.
    client = await fusionnerDoublonsClientParTelephone(client, telephone);

    // 2. Contact — upsert by CLIENT identity (linked to the client above),
    // not by ultexDossierId -- same duplication bug as the client lookup:
    // ULTEX only ever gives us one phone/email per client, so a second
    // dossier from the same client is the same contact person, not a new
    // one. codeClientAssocie is only ever set here, never cleared, so a
    // sales rep manually re-linking a contact elsewhere is never undone by
    // a later sync.
    let contact = await prisma.collectionItem.findFirst({
      where: { collection: 'contacts', data: { path: ['codeClientAssocie'], equals: client.code } }
    });
    if (!contact && telephone) {
      contact = await prisma.collectionItem.findFirst({
        where: { collection: 'contacts', data: { path: ['telephone'], equals: telephone } }
      });
    }
    if (contact) {
      const merged = {
        ...contact.data,
        nom,
        telephone: telephone || contact.data.telephone,
        whatsapp: telephone || contact.data.whatsapp,
        email: email || contact.data.email,
        codeClientAssocie: contact.data.codeClientAssocie || client.code
      };
      contact = await prisma.collectionItem.update({
        where: { collection_id: { collection: 'contacts', id: contact.id } },
        data: { data: merged }
      });
    } else {
      const code = await genererCodeAtomique('CT');
      const data = {
        ultexDossierId, id: code, code, nom,
        telephone: telephone || '', whatsapp: telephone || '', email: email || '',
        source: 'WhatsApp', statut: 'En échange', codeClientAssocie: client.code,
        remarque: origineRemarque
      };
      contact = await prisma.collectionItem.create({
        data: { collection: 'contacts', id: code, code, data }
      });
    }

    // 3. Demande — upsert by ultexDossierId. demandes.client is a
    // {t:"ref", coll:"clients", cle:"nom"} field -- `cle` is only the
    // display key (see refLabel()/SearchableSelect.jsx), the stored value
    // is always the referenced record's CODE. statut is only ever set on
    // first creation ("Nouvelle") -- once sales starts working it in the
    // CRM, a later sync must never reset their progress.
    let demande = await trouverParUltexId('demandes', ultexDossierId);
    if (demande) {
      const merged = {
        ...demande.data,
        client: client.code,
        codeClientUltex: codeClientUltex || demande.data.codeClientUltex,
        typeDemande: typeDemande || demande.data.typeDemande,
        sensOperation: sensOperation || demande.data.sensOperation,
        etapeUltex: etape || demande.data.etapeUltex,
        ...(dataTagRecu ? { dataTag: dataTagLisible } : {}),
        tagsPipeline: tagsPipeline || demande.data.tagsPipeline,
        // Workflow is authoritative for when this lead really arrived.
        // This repairs historical backfills that were previously stamped
        // with the day the reconciliation command happened to run.
        dateDemande: dateDemandeSource,
        dateHeureReception: dateReception || demande.data.dateHeureReception || dateDemandeSource,
        responsableData: demande.data.responsableData || 'Data',
        sourceSynchronisation: 'Workflow',
        ...(typeof createdManually === 'boolean' ? { createdManually } : {}),
        modeTransport: modeTransport || demande.data.modeTransport,
        montantVente: montantVente != null ? montantVente : demande.data.montantVente,
        montantAchat: montantAchat != null ? montantAchat : demande.data.montantAchat,
        objectifGeneral: objectifGeneral || demande.data.objectifGeneral,
        typeProjet: typeProjet || demande.data.typeProjet,
        urgence: urgence || demande.data.urgence,
        budgetGlobalEstime: budgetGlobalEstime != null ? budgetGlobalEstime : demande.data.budgetGlobalEstime,
        remarqueGenerale: remarque || demande.data.remarqueGenerale
      };
      versionnerEtatSynchronise(demande.data, merged, 'Workflow');
      demande = await prisma.collectionItem.update({
        where: { collection_id: { collection: 'demandes', id: demande.id } },
        data: { data: merged }
      });
    } else {
      const code = await genererCodeAtomique('DMD');
      const data = {
        ultexDossierId, id: code, code, client: client.code,
        codeClientUltex: codeClientUltex || '',
        typeDemande: typeDemande || undefined, sensOperation: sensOperation || undefined,
        etapeUltex: etape || undefined, tagsPipeline: tagsPipeline || undefined,
        modeTransport: modeTransport || undefined,
        montantVente: montantVente != null ? montantVente : undefined,
        montantAchat: montantAchat != null ? montantAchat : undefined,
        dateDemande: dateDemandeSource, dateHeureReception: dateReception || dateDemandeSource,
        source: createdManually ? 'Saisie manuelle' : 'WhatsApp', canalReception: createdManually ? 'Saisie manuelle' : 'WhatsApp', sourceSynchronisation: 'Workflow',
        createdManually: createdManually === true,
        responsableData: 'Data', dataTag: dataTagLisible,
        objectifGeneral: objectifGeneral || '—', typeProjet: typeProjet || undefined,
        urgence: urgence || 'Normale',
        budgetGlobalEstime: budgetGlobalEstime != null ? budgetGlobalEstime : undefined,
        statut: 'Nouvelle', remarqueGenerale: remarque || origineRemarque
      };
      demande = await prisma.collectionItem.create({
        data: { collection: 'demandes', id: code, code, data }
      });
    }

    // 4. Product lines — CRM dossiers were retired: the Workflow lead's
    // product information belongs directly under its demande. Each line is
    // keyed by the immutable Workflow Product.id, so later syncs update the
    // same row without duplicating products or resetting CRM-owned progress.
    const syncedLines = [];
    const incomingProductIds = new Set();
    for (const [index, productData] of products.entries()) {
      if (!productData || !productData.ultexProductId) continue;
      incomingProductIds.add(productData.ultexProductId);

      // Permanent product bank: one entry per HS code + normalized product
      // designation. The same tariff family stays visibly grouped without
      // collapsing distinct products that legitimately share an HS code.
      const normalizedHs = String(productData.hsCodeUltex || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      const normalizedName = String(productData.nomProduit || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const bankKey = normalizedHs
        ? `${normalizedHs}|${normalizedName || productData.ultexProductId}`
        : `SANS_HS|${productData.ultexProductId}`;
      let bankProduct = await prisma.collectionItem.findFirst({
        where: { collection: 'produits', data: { path: ['bankKey'], equals: bankKey } }
      });
      if (!bankProduct && normalizedHs) {
        const sameHsProducts = await prisma.collectionItem.findMany({
          where: { collection: 'produits', data: { path: ['hsCode'], equals: normalizedHs } }
        });
        bankProduct = sameHsProducts.find(item => String(item.data?.designation || '')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normalizedName);
      }

      const quantityNumber = Number(productData.quantite) || 0;
      const unitCbm = quantityNumber > 0 && Number(productData.cbmTotal) > 0
        ? Number(productData.cbmTotal) / quantityNumber : undefined;
      const unitWeight = quantityNumber > 0 && Number(productData.poidsBrutTotal) > 0
        ? Number(productData.poidsBrutTotal) / quantityNumber : undefined;
      const bankFields = {
        bankKey,
        designation: productData.nomProduit || 'Produit sans désignation',
        hsCode: normalizedHs || '',
        groupeHs: normalizedHs || 'Sans HS Code',
        cbm: unitCbm,
        poids: unitWeight,
        remarque: productData.description || productData.designationTechnique || '',
      };
      if (bankProduct) {
        const previousDemandes = Array.isArray(bankProduct.data.sourceDemandes) ? bankProduct.data.sourceDemandes : [];
        const previousProductIds = Array.isArray(bankProduct.data.ultexProductIds) ? bankProduct.data.ultexProductIds : [];
        const sourceDemandes = Array.from(new Set([...previousDemandes, demande.code]));
        const ultexProductIds = Array.from(new Set([...previousProductIds, productData.ultexProductId]));
        bankProduct = await prisma.collectionItem.update({
          where: { collection_id: { collection: 'produits', id: bankProduct.id } },
          data: { data: { ...bankProduct.data, ...bankFields, sourceDemandes, ultexProductIds } }
        });
      } else {
        const bankCode = await genererCodeAtomique('PRD');
        const data = {
          ...bankFields,
          id: bankCode,
          code: bankCode,
          sourceDemandes: [demande.code],
          ultexProductIds: [productData.ultexProductId],
          ts: Date.now(),
        };
        bankProduct = await prisma.collectionItem.create({
          data: { collection: 'produits', id: bankCode, code: bankCode, data }
        });
      }

      let line = await prisma.collectionItem.findFirst({
        where: {
          collection: 'demandeLignes',
          data: { path: ['ultexProductId'], equals: productData.ultexProductId }
        }
      });
      const syncedFields = Object.fromEntries(
        Object.entries(productData).filter(([, value]) => value !== undefined && value !== null && value !== '')
      );
      syncedFields.produitBanqueId = bankProduct.code;
      if (line) {
        line = await prisma.collectionItem.update({
          where: { collection_id: { collection: 'demandeLignes', id: line.id } },
          data: {
            data: {
              ...line.data,
              ...syncedFields,
              demande: demande.code,
              ultexDossierId,
              referenceMetier: line.data.referenceMetier || `P${index + 1}-${client.code}`,
            }
          }
        });
      } else {
        const code = await genererCodeAtomique('DL');
        const data = {
          ...syncedFields,
          ultexDossierId,
          id: code,
          code,
          demande: demande.code,
          referenceMetier: `P${index + 1}-${client.code}`,
          statut: 'Brouillon',
          ts: Date.now(),
        };
        line = await prisma.collectionItem.create({
          data: { collection: 'demandeLignes', id: code, code, data }
        });
      }
      syncedLines.push(line.code);
    }

    // Remove only stale lines previously created by Workflow. CRM-only lines
    // added manually have no ultexProductId and are deliberately preserved.
    const previousSyncedLines = await prisma.collectionItem.findMany({
      where: {
        collection: 'demandeLignes',
        data: { path: ['ultexDossierId'], equals: ultexDossierId }
      }
    });
    for (const line of previousSyncedLines) {
      const productId = line.data?.ultexProductId;
      if (productId && !incomingProductIds.has(productId)) {
        await prisma.collectionItem.delete({
          where: { collection_id: { collection: 'demandeLignes', id: line.id } }
        });
      }
    }

    res.json({
      status: 'ok',
      client: { code: client.code },
      contact: { code: contact.code },
      demande: { code: demande.code },
      lignes: syncedLines.map(code => ({ code }))
    });
  } catch (error) {
    console.error('ULTEX sync error:', error);
    res.status(500).json({ error: 'Erreur de synchronisation ULTEX' });
  }
});

// Google Sheets -> CRM lead intake. The companion Apps Script assigns a
// permanent CRM_SYNC_ID to each row, so sorting or moving rows never creates
// duplicate clients/demandes. It uses the same server-to-server key as the
// Workflow sync and feeds the exact same Data dashboard.
//
// lead-l is the L-code intake used by the two Google Forms/landing-page
// sheets (see sheetsLLeads.js): a new lead becomes a CRM client identified
// by its own L-code (L6913, L6914, ...), continuing the shared L-series
// after the last reserved code L6912. A Postgres advisory
// lock serializes allocation across BOTH sheets so they can never race for
// the same number, and the sync is idempotent on sheetLeadId so an Apps
// Script retry never creates a duplicate lead.
app.post('/api/sync/sheets/lead-l', ultexSyncAuth, lLeadHandler(prisma));

app.post('/api/sync/sheets/lead', ultexSyncAuth, async (req, res) => {
  const {
    sheetLeadId, codeClientUltex, nom, telephone, email, ville,
    dateReception, objectifGeneral, typeDemande, sensOperation,
    urgence, budgetGlobalEstime, remarque, responsableData,
    dataTag, echeanceCode, actionSuivante, source,
  } = req.body || {};

  if (!sheetLeadId || !nom) {
    return res.status(400).json({ error: 'sheetLeadId et nom requis' });
  }

  try {
    const dateDemandeSource = dateIsoJour(dateReception);
    const dataTagLisible = normaliserDataTag(dataTag);
    const origineRemarque = `Créé automatiquement depuis Google Sheets (${sheetLeadId}).`;

    let client = await trouverClientExistant(codeClientUltex, telephone);
    if (client) {
      const sourceEstLaPlusRecente = !client.data.dateDerniereDemande || dateDemandeSource >= client.data.dateDerniereDemande;
      const merged = {
        ...client.data,
        nom,
        telephone: telephone || client.data.telephone,
        email: email || client.data.email,
        ville: ville || client.data.ville,
        codeClientUltex: codeClientUltex || client.data.codeClientUltex,
        sourceDonnees: 'Google Sheets',
        dateDerniereDemande: sourceEstLaPlusRecente ? dateDemandeSource : client.data.dateDerniereDemande,
        ...(dataTag !== undefined && sourceEstLaPlusRecente ? { dataTag: dataTagLisible } : {}),
        ...(echeanceCode ? { echeanceCode: dateHeureEcheance(echeanceCode) } : {}),
        ...(actionSuivante ? { actionSuivante } : {}),
      };
      versionnerEtatSynchronise(client.data, merged, merged.sourceDonnees);
      if (codeClientUltex && client.code !== codeClientUltex) {
        client = await adopterCodeUltex(client, codeClientUltex, merged);
      } else {
        client = await prisma.collectionItem.update({
          where: { collection_id: { collection: 'clients', id: client.id } },
          data: { data: merged },
        });
      }
    } else {
      let code = codeClientUltex || await genererCodeAtomique('C');
      const data = {
        id: code, code, nom, telephone: telephone || '', email: email || '', ville: ville || '',
        codeClientUltex: codeClientUltex || '', segment: 'Prospect', nbRelances: 0,
        sourceDonnees: 'Google Sheets', datePremierContact: dateDemandeSource,
        dateEntreeData: new Date().toISOString().slice(0, 10),
        dateDerniereDemande: dateDemandeSource, dataTag: dataTagLisible,
        echeanceCode: echeanceCode ? dateHeureEcheance(echeanceCode) : '',
        actionSuivante: actionSuivante || '', remarque: remarque || origineRemarque,
      };
      try {
        client = await prisma.collectionItem.create({ data: { collection: 'clients', id: code, code, data } });
      } catch (creationError) {
        if (creationError.code !== 'P2002') throw creationError;
        code = await genererCodeAtomique('C');
        client = await prisma.collectionItem.create({
          data: { collection: 'clients', id: code, code, data: { ...data, id: code, code } },
        });
      }
    }
    client = await fusionnerDoublonsClientParTelephone(client, telephone);

    let contact = await prisma.collectionItem.findFirst({
      where: { collection: 'contacts', data: { path: ['codeClientAssocie'], equals: client.code } },
    });
    if (!contact && telephone) {
      contact = await prisma.collectionItem.findFirst({
        where: { collection: 'contacts', data: { path: ['telephone'], equals: telephone } },
      });
    }
    if (contact) {
      contact = await prisma.collectionItem.update({
        where: { collection_id: { collection: 'contacts', id: contact.id } },
        data: { data: {
          ...contact.data, nom,
          telephone: telephone || contact.data.telephone,
          whatsapp: telephone || contact.data.whatsapp,
          email: email || contact.data.email,
          codeClientAssocie: client.code,
          source: source || contact.data.source || 'Google',
        } },
      });
    } else {
      const code = await genererCodeAtomique('CT');
      contact = await prisma.collectionItem.create({
        data: { collection: 'contacts', id: code, code, data: {
          id: code, code, nom, telephone: telephone || '', whatsapp: telephone || '', email: email || '',
          source: source || 'Google', statut: 'En échange', codeClientAssocie: client.code,
          remarque: remarque || origineRemarque,
        } },
      });
    }

    let demande = await prisma.collectionItem.findFirst({
      where: { collection: 'demandes', data: { path: ['sheetLeadId'], equals: sheetLeadId } },
    });
    if (demande) {
      demande = await prisma.collectionItem.update({
        where: { collection_id: { collection: 'demandes', id: demande.id } },
        data: { data: {
          ...demande.data,
          client: client.code,
          codeClientUltex: codeClientUltex || demande.data.codeClientUltex,
          dateDemande: demande.data.dateDemande || dateDemandeSource,
          dateHeureReception: demande.data.dateHeureReception || dateReception || dateDemandeSource,
          source: source || demande.data.source || 'Google',
          sourceSynchronisation: 'Google Sheets',
          responsableData: responsableData || demande.data.responsableData || 'Data',
          objectifGeneral: objectifGeneral || demande.data.objectifGeneral,
          typeDemande: typeDemande || demande.data.typeDemande,
          sensOperation: sensOperation || demande.data.sensOperation,
          urgence: urgence || demande.data.urgence,
          budgetGlobalEstime: budgetGlobalEstime != null ? Number(budgetGlobalEstime) : demande.data.budgetGlobalEstime,
          remarqueGenerale: remarque || demande.data.remarqueGenerale,
          dataTag: dataTag !== undefined ? dataTagLisible : demande.data.dataTag,
          echeanceActionSuivante: echeanceCode ? dateHeureEcheance(echeanceCode) : demande.data.echeanceActionSuivante,
          actionSuivante: actionSuivante || demande.data.actionSuivante,
        } },
      });
    } else {
      const code = await genererCodeAtomique('DMD');
      const data = {
        sheetLeadId, id: code, code, client: client.code,
        codeClientUltex: codeClientUltex || '', dateDemande: dateDemandeSource,
        dateHeureReception: dateReception || dateDemandeSource,
        source: source || 'Google', canalReception: source || 'Google',
        sourceSynchronisation: 'Google Sheets', responsableData: responsableData || 'Data',
        objectifGeneral: objectifGeneral || '—', typeDemande: typeDemande || undefined,
        sensOperation: sensOperation || undefined, urgence: urgence || 'Normale',
        budgetGlobalEstime: budgetGlobalEstime != null && budgetGlobalEstime !== '' ? Number(budgetGlobalEstime) : undefined,
        remarqueGenerale: remarque || origineRemarque, statut: 'Nouvelle', dataTag: dataTagLisible,
        echeanceActionSuivante: echeanceCode ? dateHeureEcheance(echeanceCode) : '',
        actionSuivante: actionSuivante || '',
      };
      demande = await prisma.collectionItem.create({ data: { collection: 'demandes', id: code, code, data } });
    }

    res.json({ status: 'ok', client: { code: client.code }, contact: { code: contact.code }, demande: { code: demande.code } });
  } catch (error) {
    console.error('Google Sheets lead sync error:', error);
    res.status(500).json({ error: 'Erreur de synchronisation Google Sheets' });
  }
});

// Authenticated CRM user -> server-to-server Workflow Reliquat synchronization.
// The browser never receives the shared synchronization secret.
app.post('/api/workflow/payment', authMiddleware, async (req, res) => {
  if (!ULTEX_WORKFLOW_PAYMENT_SYNC_URL) {
    return res.status(503).json({ error: 'ULTEX_WORKFLOW_PAYMENT_SYNC_URL non configurée' });
  }
  try {
    const response = await fetch(ULTEX_WORKFLOW_PAYMENT_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ULTEX-SYNC-KEY': ULTEX_SYNC_API_KEY,
      },
      body: JSON.stringify(req.body || {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: body.detail || body.error || 'Synchronisation Workflow refusée' });
    return res.json(body);
  } catch (error) {
    console.error('Workflow payment sync error:', error);
    return res.status(502).json({ error: 'Workflow inaccessible pour la synchronisation du paiement' });
  }
});

// A dossier deleted in ULTEX. Its CRM copy is marked "Annulé" rather than
// deleted: sales may have attached documents, written remarks or advanced
// its étape here, and an ULTEX-side delete must not destroy that silently.
// The demande is closed off too, so neither keeps showing up as live work.
app.post('/api/sync/ultex/dossier/supprime', ultexSyncAuth, async (req, res) => {
  const { ultexDossierId, raison } = req.body || {};
  if (!ultexDossierId) {
    return res.status(400).json({ error: 'ultexDossierId requis' });
  }

  try {
    const note = raison || 'Dossier supprimé dans ULTEX.';
    const marques = [];

    const dossierItem = await trouverParUltexId('dossiers', ultexDossierId);
    if (dossierItem) {
      await prisma.collectionItem.update({
        where: { collection_id: { collection: 'dossiers', id: dossierItem.id } },
        data: {
          data: {
            ...dossierItem.data,
            statut: 'Annulé',
            remarque: [dossierItem.data.remarque, note].filter(Boolean).join(' — ')
          }
        }
      });
      marques.push(dossierItem.code);
    }

    const demande = await trouverParUltexId('demandes', ultexDossierId);
    if (demande) {
      await prisma.collectionItem.update({
        where: { collection_id: { collection: 'demandes', id: demande.id } },
        data: {
          data: {
            ...demande.data,
            statut: 'Clôturée',
            remarqueGenerale: [demande.data.remarqueGenerale, note].filter(Boolean).join(' — ')
          }
        }
      });
      marques.push(demande.code);
    }

    res.json({ status: 'ok', marques });
  } catch (error) {
    console.error('ULTEX deletion sync error:', error);
    res.status(500).json({ error: 'Erreur de synchronisation de la suppression' });
  }
});

// ULTEX's own document_type values -> the closest CATEGORIES_DOCUMENT
// option (see constants.js). None of them have an exact "Devis" category,
// so those fall back to "Autre" -- the real ULTEX type is still kept in
// the record's commentaire for staff visibility.
const CATEGORIE_PAR_DOCUMENT_TYPE_ULTEX = {
  bc_pdf: 'Bon de commande',
  cps_pdf: 'Contrat',
  reliquat_pdf: 'Reliquat',
};

// Every devis flavour (devis_pdf, devis_maritime_pdf, devis_air_pdf,
// devis_road_pdf, and the devis_proposition_<id>_<mode> ones) maps to the
// same "Devis" category rather than being matched exhaustively.
function categorieDocumentUltex(documentType) {
  if (!documentType) return 'Autre';
  if (CATEGORIE_PAR_DOCUMENT_TYPE_ULTEX[documentType]) {
    return CATEGORIE_PAR_DOCUMENT_TYPE_ULTEX[documentType];
  }
  if (documentType.startsWith('devis')) return 'Devis';
  return 'Autre';
}

// mimeType -> the closest TYPES_FICHIER_DOCUMENT option (see constants.js).
const TYPE_FICHIER_PAR_MIME = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/csv': 'CSV',
  'text/plain': 'TXT',
  'application/zip': 'ZIP',
};

async function trouverParUltexDocumentId(ultexDocumentId) {
  return prisma.collectionItem.findFirst({
    where: { collection: 'documents', data: { path: ['ultexDocumentId'], equals: ultexDocumentId } }
  });
}

// Documents ULTEX actually stores (proforma invoices, photos, generated
// devis/BC/CPS PDFs...) -- pushed into the CRM's own "documents" collection
// so a client's "Documents liés" tab reflects what's really in the ULTEX
// workflow, not just documents someone manually attached in the CRM.
// One-way, upserted by ultexDocumentId. Resolves the CRM client via
// codeClientUltex and, if the document is scoped to a Workflow dossier, the
// CRM demande created for that same ultexDossierId. CRM dossiers are legacy
// and must never be recreated or exposed by new synchronization data.
app.post('/api/sync/ultex/document', ultexSyncAuth, async (req, res) => {
  const { ultexDocumentId, codeClientUltex, clientNom, ultexDossierId, nom, documentType, mimeType, url } = req.body || {};

  if (!ultexDocumentId || !url) {
    return res.status(400).json({ error: 'ultexDocumentId et url requis' });
  }

  try {
    const client = codeClientUltex
      ? await prisma.collectionItem.findFirst({
          where: { collection: 'clients', data: { path: ['codeClientUltex'], equals: codeClientUltex } }
        })
      : null;
    const demande = ultexDossierId ? await trouverParUltexId('demandes', ultexDossierId) : null;
    const categorie = categorieDocumentUltex(documentType);
    const typeFichier = TYPE_FICHIER_PAR_MIME[mimeType] || 'Lien externe';
    const commentaire = `Synchronisé automatiquement depuis ULTEX${documentType ? ` (type : ${documentType})` : ''}.`;

    let doc = await trouverParUltexDocumentId(ultexDocumentId);
    if (doc) {
      const { dossier: _legacyDossier, ...existingData } = doc.data || {};
      const merged = {
        ...existingData,
        nom: nom || doc.data.nom,
        type: categorie,
        typeFichier,
        url,
        client: client ? client.code : existingData.client,
        demande: demande ? demande.code : existingData.demande,
      };
      doc = await prisma.collectionItem.update({
        where: { collection_id: { collection: 'documents', id: doc.id } },
        data: { data: merged }
      });
    } else {
      const code = await genererCodeAtomique('DOC');
      const data = {
        ultexDocumentId, id: code, code,
        nom: nom || clientNom || 'Document ULTEX',
        type: categorie,
        typeFichier,
        url,
        client: client ? client.code : undefined,
        demande: demande ? demande.code : undefined,
        version: 1, statut: 'Reçu',
        commentaire
      };
      doc = await prisma.collectionItem.create({
        data: { collection: 'documents', id: code, code, data }
      });
    }

    res.json({ status: 'ok', document: { code: doc.code } });
  } catch (error) {
    console.error('ULTEX document sync error:', error);
    res.status(500).json({ error: 'Erreur de synchronisation du document ULTEX' });
  }
});

// Start Server
app.listen(PORT, async () => {
  console.log(`🚀 Serveur UBOS PostgreSQL prêt sur http://localhost:${PORT}`);
  try {
    await prisma.$connect();
    console.log('✅ Connexion PostgreSQL établie.');
    await initialiserRedis();
    if (redisClient?.isReady) console.log('✅ Cache Redis connecté.');
    await creerIndexPerformance();
    console.log('✅ Index de performance CRM vérifiés.');
  } catch (e) {
    console.error('⚠️ Attention: Connexion à la base PostgreSQL non disponible pour le moment:', e.message);
  }
});

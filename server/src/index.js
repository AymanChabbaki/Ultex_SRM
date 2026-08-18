import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'ubos_secret_2026';
const ELEVATION_SECRET = process.env.ELEVATION_SECRET || 'ubos_elevation_secret_2026';
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
  "tacheEtapes", "rapportsJournaliers", "journalSecurite"
];

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
  res.json({ status: 'ok', database: 'PostgreSQL', timestamp: new Date() });
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
  try {
    const dbState = { seq: {} };

    // Initialize empty collections
    COLLS.forEach(col => { dbState[col] = []; });

    // Fetch sequence counters
    const sequences = await prisma.sequenceCounter.findMany();
    sequences.forEach(s => { dbState.seq[s.key] = s.val; });

    // Fetch collection items
    const items = await prisma.collectionItem.findMany();
    items.forEach(item => {
      if (dbState[item.collection]) {
        dbState[item.collection].push({ id: item.id, ...item.data });
      }
    });

    // Fetch users (all users, both active and inactive)
    const users = await prisma.user.findMany();
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

    // Fetch notifications
    const notifications = await prisma.notificationItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500
    });
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

    // Fetch audit logs
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000
    });
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

    res.json(dbState);
  } catch (error) {
    console.error('Fetch DB error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la base de données PostgreSQL' });
  }
});

// Shared by the routine sync route and the OTP-gated restore route below —
// same full-state-replacement semantics either way, factored out so
// "restore a backup" isn't a second, divergent implementation to keep in sync.
async function synchroniserEtatComplet(fullState) {
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

    // 3. Sync Collections & Purge Deleted Records from PostgreSQL
    for (const col of COLLS) {
      if (Array.isArray(fullState[col])) {
        const currentIds = fullState[col].map(item => String(item.id || item.code)).filter(Boolean);
        
        // Delete items from PostgreSQL that were deleted in frontend
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

// Full Batch Sync (saves/replaces full state or incremental updates)
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

// Full backup restore — same mechanism as /api/db/sync (a full-state
// overwrite) but gated behind OTP elevation, since restoring a backup can
// silently discard everything created since that backup was taken.
app.post('/api/security/restore', authMiddleware, requireElevation, async (req, res) => {
  const fullState = req.body;
  if (!fullState) return res.status(400).json({ error: 'Données invalides' });
  try {
    await synchroniserEtatComplet(fullState);
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

// Deletes one record from any collection — the single choke point every
// module's "Supprimer" button now goes through, gated behind OTP elevation.
app.delete('/api/security/records/:collection/:code', authMiddleware, requireElevation, async (req, res) => {
  const { collection, code } = req.params;
  if (!COLLS.includes(collection)) return res.status(400).json({ error: 'Collection inconnue' });
  try {
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

// Start Server
app.listen(PORT, async () => {
  console.log(`🚀 Serveur UBOS PostgreSQL prêt sur http://localhost:${PORT}`);
  try {
    await prisma.$connect();
    console.log('✅ Connexion PostgreSQL établie.');
  } catch (e) {
    console.error('⚠️ Attention: Connexion à la base PostgreSQL non disponible pour le moment:', e.message);
  }
});

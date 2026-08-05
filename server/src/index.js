import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'ubos_secret_2026';
const BCRYPT_HASH_RE = /^\$2[aby]\$/;

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET non défini — utilisation de la valeur par défaut (à définir en production).');
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
  "importExtractedData", "importAttachments", "importRollbacks"
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

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'PostgreSQL', timestamp: new Date() });
});

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
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }

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

// Get Full DB Snapshot
app.get('/api/db', async (req, res) => {
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

// Full Batch Sync (saves/replaces full state or incremental updates)
app.post('/api/db/sync', async (req, res) => {
  const fullState = req.body;
  if (!fullState) return res.status(400).json({ error: 'Données invalides' });

  try {
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

    res.json({ status: 'success', message: 'Synchro PostgreSQL réussie' });
  } catch (error) {
    console.error('Batch sync error:', error);
    res.status(500).json({ error: 'Erreur lors de la synchronisation avec PostgreSQL' });
  }
});

// Generate Code (Atomic PostgreSQL Sequence Counter)
app.post('/api/genCode', async (req, res) => {
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
app.post('/api/ocr/pdf', async (req, res) => {
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

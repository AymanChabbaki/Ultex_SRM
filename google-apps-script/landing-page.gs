// Reçoit les leads envoyés directement par le site (landing page) et les
// ajoute à cette feuille. Déployé séparément en Web App (Déployer >
// Nouveau déploiement > Application Web) -- l'URL de ce déploiement est
// celle configurée côté site, indépendante de tout ce qui suit.
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    new Date().toLocaleString('fr-FR', {
      timeZone: 'Africa/Casablanca'
    }),
    data.nom || '',
    data.produit || '',
    data.pays || '',
    data.whatsapp || '',
    data.visitorId || '',
    data.visitorIdStatus || '',
    data.submittedAt || '',
    data.formLanguage || ''
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ULTEX — Synchronisation CRM (codes L) — Feuille "Landing page"
 *
 * Les lignes arrivent via doPost(e) ci-dessous (déployé en Web App), appelé
 * directement par le site. appendRow() ignore complètement les en-têtes de
 * la ligne 1 -- il écrit toujours dans CET ordre de colonnes fixe :
 *   1. Horodatage local fr-FR (Africa/Casablanca) — PAS un format ISO
 *   2. nom            5. whatsapp          8. submittedAt (ISO, la vraie
 *   3. produit        6. visitorId            source de date à utiliser)
 *   4. pays           7. visitorIdStatus   9. formLanguage
 * LEAD_COLUMN_INDEX ci-dessous encode cet ordre -- si vous changez l'ordre
 * des valeurs dans appendRow(), mettez à jour LEAD_COLUMN_INDEX en même
 * temps, sous peine de resynchroniser les mauvaises colonnes en silence.
 *
 * Cette feuille n'est PAS liée à un Google Form. Google ne déclenche ni
 * onFormSubmit ni onEdit pour des lignes ajoutées par appendRow() depuis un
 * script (seule une modification humaine dans l'interface Sheets déclenche
 * onEdit). La synchronisation utilise donc UNIQUEMENT une vérification
 * périodique (toutes les 5 minutes) qui balaie la feuille à la recherche de
 * nouvelles lignes non encore envoyées au CRM.
 *
 * INSTALLATION (à faire une seule fois) :
 *   1. Ouvrez cette feuille Google Sheets.
 *   2. Extensions > Apps Script — gardez doPost(e) tel quel, ajoutez le
 *      reste de ce fichier à la suite.
 *   3. Paramètres du projet (⚙️) > Propriétés du script > Ajouter :
 *        CRM_BASE_URL      = https://crm.ultex.ma
 *        CRM_SYNC_API_KEY  = <la clé ULTEX_SYNC_API_KEY du serveur CRM>
 *   4. Sélectionnez la fonction "setup" dans le menu déroulant, ▶ Exécuter,
 *      autorisez le script. "setup" ajoute les colonnes de suivi et
 *      installe le déclencheur périodique.
 *   5. Pour synchroniser tout de suite sans attendre le déclencheur (test) :
 *      sélectionnez "periodicSweep" dans le menu déroulant, ▶ Exécuter.
 *
 * Même garantie d'unicité que l'autre feuille : chaque ligne reçoit un
 * identifiant permanent (CRM_SYNC_ID) AVANT tout appel réseau, et les deux
 * feuilles partagent la MÊME séquence de codes L côté CRM (verrou
 * PostgreSQL côté serveur) -- elles ne peuvent donc jamais se voler un
 * numéro l'une à l'autre.
 */

// 0-indexé, dans l'ordre EXACT où doPost(e) les écrit via appendRow().
const LEAD_COLUMN_INDEX = {
  horodatageLocal: 0, nom: 1, produit: 2, pays: 3, whatsapp: 4,
  visitorId: 5, visitorIdStatus: 6, submittedAt: 7, formLanguage: 8,
};
const LEAD_COLUMN_COUNT = 9;
const TRACKING_HEADERS = ['CRM_SYNC_ID', 'CRM_CODE_L', 'CRM_SYNC_STATUT', 'CRM_SYNC_ERREUR', 'CRM_SYNC_DATE'];
const MAX_ROWS_PER_RUN = 200;
const SHEET_FORMAT_TAG = 'landing_page';

// ── Setup (run once from the Apps Script editor) ────────────────────────────

function setup() {
  requireCredentials_();
  ensureLeadColumnHeaders_();
  ensureTrackingColumns_();
  installTriggers_();
  SpreadsheetApp.getActive().toast('Synchronisation CRM configurée — codes L activés.');
}

// Labels row 1 for doPost's 9 fixed columns -- ONLY where that exact cell is
// currently blank, never overwriting existing text. Purely documentation for
// humans reading the sheet; the sync itself always reads by fixed position
// (LEAD_COLUMN_INDEX), never by this label text.
function ensureLeadColumnHeaders_() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const labels = ['Horodatage local (fr-FR)', 'nom', 'produit', 'pays', 'whatsapp',
    'visitorId', 'visitorIdStatus', 'submittedAt', 'formLanguage'];
  const range = sheet.getRange(1, 1, 1, LEAD_COLUMN_COUNT);
  const current = range.getValues()[0];
  const next = current.map((cell, i) => (String(cell || '').trim() ? cell : labels[i]));
  range.setValues([next]);
}

function requireCredentials_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CRM_BASE_URL') || !props.getProperty('CRM_SYNC_API_KEY')) {
    throw new Error(
      "Configurez d'abord CRM_BASE_URL et CRM_SYNC_API_KEY : Extensions > Apps Script > " +
      'Paramètres du projet (⚙️) > Propriétés du script.'
    );
  }
}

function ensureTrackingColumns_() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = TRACKING_HEADERS.filter(h => headers.indexOf(h) === -1);
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
}

function installTriggers_() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'periodicSweep')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('periodicSweep').timeBased().everyMinutes(5).create();
}

// ── Entry point ──────────────────────────────────────────────────────────

function periodicSweep() {
  processUnsyncedRows_();
}

// ── Core sync loop ───────────────────────────────────────────────────────

function processUnsyncedRows_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // another run is already in progress
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // Tracking columns are looked up by NAME (we own and create them, right
    // after doPost's fixed 9 lead columns) -- but the lead's own data is read
    // by FIXED POSITION (LEAD_COLUMN_INDEX), matching appendRow()'s order
    // exactly. appendRow() never touches row 1, so trusting header text for
    // those columns is what silently broke the sync: nothing in row 1 was
    // actually named "submitted_at" / "browser_id".
    const lastCol = Math.max(sheet.getLastColumn(), LEAD_COLUMN_COUNT);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const colIndex = {};
    headers.forEach((h, i) => { colIndex[h] = i; });

    const missingTracking = TRACKING_HEADERS.filter(h => colIndex[h] === undefined);
    if (missingTracking.length > 0) {
      ensureTrackingColumns_();
      return processUnsyncedRows_(); // headers changed — re-read them
    }

    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const statutCol = colIndex['CRM_SYNC_STATUT'];
    let processed = 0;
    const startedAt = Date.now();

    for (let i = 0; i < values.length && processed < MAX_ROWS_PER_RUN; i++) {
      if (Date.now() - startedAt > 5 * 60 * 1000) break; // stay under the 6-min execution limit
      const row = values[i];
      const statut = row[statutCol];
      if (statut === 'Synchronisé') continue;
      if (!String(row[LEAD_COLUMN_INDEX.nom] || '').trim()) continue; // blank row

      const sheetRow = i + 2;
      syncOneRow_(sheet, sheetRow, colIndex, row);
      processed++;
    }
  } finally {
    lock.releaseLock();
  }
}

function syncOneRow_(sheet, sheetRow, colIndex, row) {
  // Assigned and written FIRST, before any network call: if the request
  // below fails partway or the script times out, the retry reuses this
  // exact id, and the CRM's own idempotency check (on sheetLeadId) returns
  // the same lead instead of creating a second one.
  let syncId = row[colIndex['CRM_SYNC_ID']];
  if (!syncId) {
    syncId = Utilities.getUuid();
    sheet.getRange(sheetRow, colIndex['CRM_SYNC_ID'] + 1).setValue(syncId);
  }

  // submittedAt (col 8, client-side ISO timestamp) is the reliable source;
  // the locale string in col 1 ("10/09/2026 14:23:05", fr-FR) is a fallback
  // only -- JS date-parsing of that format is ambiguous (day/month order)
  // and must never silently produce the wrong date.
  const dateReception = toIsoWithOffset_(row[LEAD_COLUMN_INDEX.submittedAt])
    || toIsoWithOffset_(row[LEAD_COLUMN_INDEX.horodatageLocal]);
  if (!dateReception) {
    writeError_(sheet, sheetRow, colIndex, 'Aucune date exploitable (submittedAt et horodatage local vides/illisibles).');
    return;
  }

  const payload = {
    sheetLeadId: syncId,
    nom: String(row[LEAD_COLUMN_INDEX.nom] || ''),
    telephone: String(row[LEAD_COLUMN_INDEX.whatsapp] || ''),
    dateReception: dateReception,
    produit: String(row[LEAD_COLUMN_INDEX.produit] || ''),
    pays: String(row[LEAD_COLUMN_INDEX.pays] || ''),
    browserId: String(row[LEAD_COLUMN_INDEX.visitorId] || ''),
    sheetFormat: SHEET_FORMAT_TAG,
  };

  callCrm_(payload, sheet, sheetRow, colIndex);
}

// ── Shared helpers (identical in both scripts) ──────────────────────────────

function callCrm_(payload, sheet, sheetRow, colIndex) {
  const props = PropertiesService.getScriptProperties();
  const baseUrl = (props.getProperty('CRM_BASE_URL') || '').replace(/\/+$/, '');
  const apiKey = props.getProperty('CRM_SYNC_API_KEY');

  try {
    const response = UrlFetchApp.fetch(baseUrl + '/api/sync/sheets/lead-l', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-ultex-sync-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const status = response.getResponseCode();
    const body = safeJsonParse_(response.getContentText());

    if (status >= 200 && status < 300 && body && body.status === 'ok') {
      sheet.getRange(sheetRow, colIndex['CRM_CODE_L'] + 1).setValue(body.client && body.client.code || '');
      sheet.getRange(sheetRow, colIndex['CRM_SYNC_STATUT'] + 1).setValue('Synchronisé');
      sheet.getRange(sheetRow, colIndex['CRM_SYNC_ERREUR'] + 1).setValue('');
      sheet.getRange(sheetRow, colIndex['CRM_SYNC_DATE'] + 1).setValue(new Date());
    } else {
      const message = (body && body.error) || ('HTTP ' + status);
      writeError_(sheet, sheetRow, colIndex, message);
    }
  } catch (err) {
    writeError_(sheet, sheetRow, colIndex, String(err));
  }
}

function writeError_(sheet, sheetRow, colIndex, message) {
  sheet.getRange(sheetRow, colIndex['CRM_SYNC_STATUT'] + 1).setValue('Erreur');
  sheet.getRange(sheetRow, colIndex['CRM_SYNC_ERREUR'] + 1).setValue(message);
  sheet.getRange(sheetRow, colIndex['CRM_SYNC_DATE'] + 1).setValue(new Date());
}

function safeJsonParse_(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

// Converts a Sheets Date cell (or a plain string already containing a date,
// e.g. an ISO timestamp appended by the landing page's own backend) into
// strict ISO-8601 WITH an explicit UTC offset -- the CRM rejects a bare
// "2026-07-30 00:24:16" because it's ambiguous across timezones.
function toIsoWithOffset_(cellValue) {
  if (!cellValue) return null;
  const date = (cellValue instanceof Date) ? cellValue : new Date(cellValue);
  if (isNaN(date.getTime())) return null;
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return Utilities.formatDate(date, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

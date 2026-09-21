/**
 * ULTEX — Synchronisation CRM (codes L) — Feuille "Landing page"
 * Colonnes attendues (en-têtes de la ligne 1) :
 *   submitted_at | nom | produit | pays | whatsapp | browser_id
 *
 * Cette feuille n'est PAS liée à un Google Form — les lignes sont ajoutées
 * directement par le site (landing page) via l'API Sheets. Google ne
 * déclenche donc ni onFormSubmit ni onEdit pour ces lignes (seule une
 * modification humaine dans l'interface Sheets déclenche onEdit). La
 * synchronisation utilise donc UNIQUEMENT une vérification périodique
 * (toutes les 5 minutes) qui balaie la feuille à la recherche de nouvelles
 * lignes non encore envoyées au CRM.
 *
 * INSTALLATION (à faire une seule fois) :
 *   1. Ouvrez cette feuille Google Sheets.
 *   2. Extensions > Apps Script.
 *   3. Supprimez le contenu par défaut, collez tout ce fichier.
 *   4. Paramètres du projet (⚙️) > Propriétés du script > Ajouter :
 *        CRM_BASE_URL      = https://crm.ultex.ma
 *        CRM_SYNC_API_KEY  = <la clé ULTEX_SYNC_API_KEY du serveur CRM>
 *   5. Sélectionnez la fonction "setup" dans le menu déroulant, ▶ Exécuter,
 *      autorisez le script. "setup" ajoute les colonnes de suivi et
 *      installe le déclencheur périodique.
 *
 * Même garantie d'unicité que l'autre feuille : chaque ligne reçoit un
 * identifiant permanent (CRM_SYNC_ID) AVANT tout appel réseau, et les deux
 * feuilles partagent la MÊME séquence de codes L côté CRM (verrou
 * PostgreSQL côté serveur) -- elles ne peuvent donc jamais se voler un
 * numéro l'une à l'autre.
 */

const TRACKING_HEADERS = ['CRM_SYNC_ID', 'CRM_CODE_L', 'CRM_SYNC_STATUT', 'CRM_SYNC_ERREUR', 'CRM_SYNC_DATE'];
const MAX_ROWS_PER_RUN = 200;
const SHEET_FORMAT_TAG = 'landing_page';

// ── Setup (run once from the Apps Script editor) ────────────────────────────

function setup() {
  requireCredentials_();
  ensureTrackingColumns_();
  installTriggers_();
  SpreadsheetApp.getActive().toast('Synchronisation CRM configurée — codes L activés.');
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

    const lastCol = sheet.getLastColumn();
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
      if (!String(row[colIndex['nom']] || '').trim()) continue; // blank row

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

  const dateReception = toIsoWithOffset_(row[colIndex['submitted_at']]);
  if (!dateReception) {
    writeError_(sheet, sheetRow, colIndex, 'submitted_at manquant ou illisible.');
    return;
  }

  const payload = {
    sheetLeadId: syncId,
    nom: String(row[colIndex['nom']] || ''),
    telephone: String(row[colIndex['whatsapp']] || ''),
    dateReception: dateReception,
    produit: String(row[colIndex['produit']] || ''),
    pays: String(row[colIndex['pays']] || ''),
    browserId: String(row[colIndex['browser_id']] || ''),
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

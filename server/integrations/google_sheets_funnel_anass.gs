/**
 * ULTEX — FUNNEL ANASS : feuille des leads Meta (Facebook / Instagram Lead Ads) -> CRM.
 *
 * Colonnes lues (en-têtes de l'export Meta, dans n'importe quel ordre) :
 *   id, created_time, campaign_name, form_name, platform, votre_projet_concerne_?,
 *   qu’est-ce_que_vous_voulez_importer/exporter_?, quantité_de_votre_marchandises,
 *   nombres_de_machines, nous_travaillons_uniquement_sur_des_opérations…,
 *   quand_voulez-vous_lancer_l’opération_?, où_en_êtes-vous_aujourd’hui_?,
 *   décrivez_votre_produit_en_une_phrase, full_name, phone_number, city
 * Le script ajoute à droite 4 colonnes techniques (CRM_SYNC_ID, CRM_CLIENT_CODE,
 * CRM_DEMANDE_CODE, CRM_SYNC_STATUS) : ne pas les supprimer.
 *
 * Installation (une seule fois, dans ce Google Sheet) :
 *  1. Extensions > Apps Script : remplacez tout le contenu par ce fichier, enregistrez.
 *  2. Paramètres du projet (roue dentée) > Propriétés du script > ajoutez
 *       CRM_SYNC_API_KEY = (la même clé que les autres feuilles funnel)
 *  3. Rechargez le Google Sheet : menu « ULTEX CRM » > « Installer la synchronisation »
 *     (acceptez les autorisations Google).
 * Ensuite chaque nouvelle ligne Meta part au CRM en moins d'une minute, avec la source
 * « funnel anass » ; le code client (L…) et la demande (DMD…) s'écrivent sur la ligne.
 */
const ULTEX_ANASS = Object.freeze({
  format: 'funnel_anass',
  endpoint: 'https://crm.ultex.ma/api/sync/sheets/lead-l',
  headerRow: 1,
  maxRowsPerScan: 25,
});

/* Columns, found by the start of their (normalized) Meta header. */
const COL = Object.freeze({
  id: 'id',
  date: 'created_time',
  campagne: 'campaign_name',
  formulaire: 'form_name',
  plateforme: 'platform',
  projet: 'votre_projet_concerne',
  quoi: 'qu_est_ce_que_vous_voulez',
  quantite: 'quantite_de_votre',
  machines: 'nombres_de_machines',
  budget: 'nous_travaillons_uniquement',
  quand: 'quand_voulez_vous_lancer',
  etape: 'ou_en_etes_vous',
  description: 'decrivez_votre_produit',
  nom: 'full_name',
  telephone: 'phone_number',
  ville: 'city',
});
const TECH = ['CRM_SYNC_ID', 'CRM_CLIENT_CODE', 'CRM_DEMANDE_CODE', 'CRM_SYNC_STATUS'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('ULTEX CRM')
    .addItem('Installer la synchronisation', 'installerSynchronisationULTEX')
    .addItem('Tester / synchroniser la ligne active', 'synchroniserLigneActive')
    .addSeparator()
    .addItem('Envoyer les nouveaux leads maintenant', 'scannerNouveauxLeads')
    .addItem('Renvoyer les lignes en erreur', 'renvoyerErreurs')
    .addItem('Arrêter la synchronisation', 'arreterSynchronisationULTEX')
    .addToUi();
}

function installerSynchronisationULTEX() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Ouvrez ce script depuis le Google Sheet du funnel anass (Extensions > Apps Script).');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('CRM_SPREADSHEET_ID', book.getId());
  const sheet = targetSheet_();
  props.setProperty('CRM_SHEET_ID', String(sheet.getSheetId()));
  verifierConnexion_();
  withLock_(() => ensureTechnicalColumns_(sheet));
  arreterSynchronisationULTEX();
  // Meta writes rows through the API: no edit trigger fires, so a 1-minute scan picks them up.
  ScriptApp.newTrigger('scannerNouveauxLeads').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('scannerNouveauxLeads').forSpreadsheet(book).onChange().create();
  book.toast('Synchronisation installée : les leads partent au CRM avec la source « funnel anass ».', 'ULTEX CRM', 8);
  scannerNouveauxLeads();
}

function arreterSynchronisationULTEX() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'scannerNouveauxLeads')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function verifierConnexion_() {
  const key = apiKey_();
  const response = UrlFetchApp.fetch(endpoint_(), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-ULTEX-SYNC-KEY': key }, payload: '{}',
  });
  let body = {};
  try { body = JSON.parse(response.getContentText()); } catch (ignored) {}
  // An empty lead is refused as invalid: that proves the key is accepted.
  if (response.getResponseCode() !== 400 || body.code !== 'INVALID_SHEET_LEAD') {
    throw new Error('Connexion CRM échouée (HTTP ' + response.getResponseCode() + ') : vérifiez CRM_SYNC_API_KEY.');
  }
}

/** Sends every row not sent yet (or that failed temporarily). */
function scannerNouveauxLeads() {
  const sheet = targetSheet_();
  const snapshot = withLock_(() => {
    ensureTechnicalColumns_(sheet);
    const count = Math.max(0, sheet.getLastRow() - ANASS_HEADER_ROW_());
    return {
      map: headerMap_(sheet),
      display: count ? sheet.getRange(ANASS_HEADER_ROW_() + 1, 1, count, sheet.getLastColumn()).getDisplayValues() : [],
      raw: count ? sheet.getRange(ANASS_HEADER_ROW_() + 1, 1, count, sheet.getLastColumn()).getValues() : [],
    };
  });
  const statusCol = snapshot.map.crm_sync_status;
  const started = Date.now();
  let sent = 0;
  snapshot.display.forEach((values, index) => {
    if (sent >= ULTEX_ANASS.maxRowsPerScan || Date.now() - started > 240000) return;
    const status = String(values[statusCol - 1] || '');
    if (/^OK\b/.test(status) || /^IGNOR/.test(status) || /^ERREUR VALIDATION\b/.test(status)) return;
    const rowNumber = ANASS_HEADER_ROW_() + 1 + index;
    sendRow_(sheet, rowNumber, snapshot.map, values, snapshot.raw[index]);
    sent += 1;
  });
}

function synchroniserLigneActive() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getSheetId() !== targetSheet_().getSheetId()) throw new Error('Cette feuille n’est pas la feuille des leads.');
  const row = SpreadsheetApp.getActiveRange().getRow();
  if (row <= ANASS_HEADER_ROW_()) throw new Error('Sélectionnez une ligne de lead.');
  withLock_(() => ensureTechnicalColumns_(sheet));
  const map = headerMap_(sheet);
  const range = sheet.getRange(row, 1, 1, sheet.getLastColumn());
  sendRow_(sheet, row, map, range.getDisplayValues()[0], range.getValues()[0]);
}

/** Clears the error statuses so the next scan sends those rows again. */
function renvoyerErreurs() {
  const sheet = targetSheet_();
  withLock_(() => {
    const map = headerMap_(sheet);
    const count = sheet.getLastRow() - ANASS_HEADER_ROW_();
    if (count <= 0 || !map.crm_sync_status) return;
    const range = sheet.getRange(ANASS_HEADER_ROW_() + 1, map.crm_sync_status, count, 1);
    range.setValues(range.getValues().map(([s]) => [/^ERREUR\b/.test(String(s)) ? '' : s]));
  });
  scannerNouveauxLeads();
}

function sendRow_(sheet, rowNumber, map, values, raw) {
  const statusCell = sheet.getRange(rowNumber, map.crm_sync_status);
  const get = key => {
    const col = findColumn_(map, COL[key]);
    return col ? String(values[col - 1] || '').trim() : '';
  };
  try {
    const nom = get('nom');
    const telephone = normalizePhone_(get('telephone'));
    if (!nom && !telephone) return; // empty line
    if (/test lead|dummy data/i.test(nom)) { statusCell.setValue('IGNORÉ — lead de test Meta'); return; }
    if (!nom || !telephone) throw new Error('Nom ou téléphone manquant.');

    let id = String(values[map.crm_sync_id - 1] || '');
    if (!id) {
      id = get('id') ? `meta:${get('id')}` : `gs:${sheet.getParent().getId()}:${sheet.getSheetId()}:${Utilities.getUuid()}`;
      sheet.getRange(rowNumber, map.crm_sync_id).setValue(id);
    }
    const dateCol = findColumn_(map, COL.date);
    const projet = /^les deux$/i.test(human_(get('projet'))) ? 'Import et export' : human_(get('projet'));
    const quoi = human_(get('quoi'));
    const produit = get('description') || [quoi, projet && `(${projet})`].filter(Boolean).join(' ') || 'Projet import / export (formulaire Meta)';
    const etape = [human_(get('etape')), get('quand') && `Lancement : ${human_(get('quand'))}`, get('ville') && `Ville : ${get('ville')}`]
      .filter(Boolean).join(' · ');
    const payload = {
      sheetLeadId: id,
      sheetFormat: ULTEX_ANASS.format,
      dateReception: isoDate_(dateCol ? raw[dateCol - 1] : '', get('date')),
      nom,
      telephone,
      pays: 'Maroc',
      produit,
      volumeImportation: human_(get('quantite') || get('machines')) + (get('machines') && !get('quantite') ? ' machine(s)' : ''),
      budget: human_(get('budget')),
      projectStage: [projet && `Projet : ${projet}`, quoi && `Type : ${quoi}`, etape].filter(Boolean).join(' · '),
      campaignName: get('campagne'),
      formName: get('formulaire'),
      platform: { fb: 'Facebook', ig: 'Instagram' }[get('plateforme').toLowerCase()] || get('plateforme'),
    };
    const response = UrlFetchApp.fetch(endpoint_(), {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-ULTEX-SYNC-KEY': apiKey_() }, payload: JSON.stringify(payload),
    });
    const code = response.getResponseCode();
    let body = {};
    try { body = JSON.parse(response.getContentText() || '{}'); } catch (ignored) {}
    if (code < 200 || code >= 300) {
      const retry = body.retryable === true || code === 408 || code === 429 || code >= 500;
      statusCell.setValue(`${retry ? 'ERREUR TEMPORAIRE' : 'ERREUR VALIDATION'} — ${String(body.error || `HTTP ${code}`).slice(0, 300)}`);
      return;
    }
    sheet.getRange(rowNumber, map.crm_client_code).setValue(body.client.code);
    sheet.getRange(rowNumber, map.crm_demande_code).setValue(body.demande.code);
    statusCell.setValue(`OK — ${body.client.code} — ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')}`);
  } catch (error) {
    statusCell.setValue(`ERREUR VALIDATION — ${String(error.message || error).slice(0, 300)}`);
  }
}

/* ───────── helpers ───────── */

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('CRM_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Lancez d’abord « Installer la synchronisation » depuis le Google Sheet.');
  return book;
}

/** The tab holding the Meta columns (the saved one, else the first tab with full_name + phone_number). */
function targetSheet_() {
  const book = spreadsheet_();
  const saved = PropertiesService.getScriptProperties().getProperty('CRM_SHEET_ID');
  const sheets = book.getSheets();
  const byId = saved ? sheets.find(s => String(s.getSheetId()) === saved) : null;
  if (byId) return byId;
  const found = sheets.find(s => { const m = headerMap_(s); return findColumn_(m, COL.nom) && findColumn_(m, COL.telephone); });
  if (!found) throw new Error('Aucun onglet avec les colonnes full_name et phone_number.');
  return found;
}

function endpoint_() { return PropertiesService.getScriptProperties().getProperty('CRM_SYNC_URL') || ULTEX_ANASS.endpoint; }
function apiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('CRM_SYNC_API_KEY');
  if (!key) throw new Error('Ajoutez CRM_SYNC_API_KEY dans les propriétés du script.');
  return key;
}
function ANASS_HEADER_ROW_() { return ULTEX_ANASS.headerRow; }
function normalizeHeader_(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function headerMap_(sheet) { const out = {}; if (!sheet.getLastColumn()) return out; sheet.getRange(ANASS_HEADER_ROW_(), 1, 1, sheet.getLastColumn()).getDisplayValues()[0].forEach((v, i) => { const k = normalizeHeader_(v); if (k && !out[k]) out[k] = i + 1; }); return out; }
/** Exact header first (so "id" never matches "ad_id"), else the first header starting with it. */
function findColumn_(map, start) { if (map[start]) return map[start]; const key = Object.keys(map).find(k => k.startsWith(start)); return key ? map[key] : 0; }
function ensureTechnicalColumns_(sheet) { TECH.forEach(name => { if (!headerMap_(sheet)[normalizeHeader_(name)]) sheet.getRange(ANASS_HEADER_ROW_(), sheet.getLastColumn() + 1).setValue(name); }); }
/** Meta answers come as "le_plus_vite_possible_(moins_d’un_mois)": readable text. */
function human_(value) { const t = String(value || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
function normalizePhone_(value) { let p = String(value || '').replace(/^p:/i, '').replace(/\D/g, ''); if (p.startsWith('00')) p = p.slice(2); if (/^0[67]\d{8}$/.test(p)) p = `212${p.slice(1)}`; if (/^[67]\d{8}$/.test(p)) p = `212${p}`; return p; }
function isoDate_(raw, text) {
  if (raw instanceof Date && !isNaN(raw)) return raw.toISOString();
  const d = new Date(String(text || raw || '').trim());
  if (isNaN(d)) throw new Error('created_time invalide.');
  return d.toISOString();
}
function withLock_(callback) { const lock = LockService.getScriptLock(); lock.waitLock(20000); try { return callback(); } finally { lock.releaseLock(); } }

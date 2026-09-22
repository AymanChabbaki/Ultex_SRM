/**
 * ULTEX — Sheet "submitted_at / nom / produit / ..." -> CRM.
 * Paste this entire file into Extensions > Apps Script for the SECOND sheet.
 */
const ULTEX_L_CONFIG = Object.freeze({
  format: 'landing_page', defaultSheetName: '',
  endpoint: 'https://crm.ultex.ma/api/sync/sheets/lead-l', headerRow: 1,
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('ULTEX CRM')
    .addItem('Autoriser la connexion CRM', 'autoriserConnexionCRM')
    .addItem('Installer la synchronisation', 'installerSynchronisationULTEX')
    .addItem('Tester / synchroniser la ligne active', 'synchroniserLigneActive')
    .addItem('Importer les lignes sélectionnées', 'importerSelection')
    .addSeparator().addItem('Vérifier les nouveaux leads maintenant', 'scannerNouveauxLeads').addToUi();
}

function installerSynchronisationULTEX() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CRM_SHEET_NAME')) props.setProperty('CRM_SHEET_NAME', SpreadsheetApp.getActiveSheet().getName());
  if (!props.getProperty('CRM_SYNC_URL')) props.setProperty('CRM_SYNC_URL', ULTEX_L_CONFIG.endpoint);
  if (!props.getProperty('CRM_HEADER_ROW')) props.setProperty('CRM_HEADER_ROW', String(ULTEX_L_CONFIG.headerRow));
  autoriserConnexionCRM();
  const sheet = targetSheet_(); ensureTechnicalColumns_(sheet);
  const map = headerMap_(sheet); const statusCol = requiredColumn_(map, 'crm_sync_status');
  if (sheet.getLastRow() > headerRow_()) {
    const range = sheet.getRange(headerRow_() + 1, statusCol, sheet.getLastRow() - headerRow_(), 1);
    range.setValues(range.getValues().map(([status]) => [status || 'HISTORIQUE — non importé']));
  }
  deleteOwnTriggers_(); const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('modifierLeadULTEX').forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger('nouveauLeadFormulaireULTEX').forSpreadsheet(spreadsheet).onFormSubmit().create();
  ScriptApp.newTrigger('scannerNouveauxLeads').timeBased().everyMinutes(1).create();
  SpreadsheetApp.getActive().toast(
    'Synchronisation installée. Les nouvelles lignes recevront leur code L automatiquement.',
    'ULTEX CRM',
    8
  );
}

function autoriserConnexionCRM() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('CRM_SYNC_URL') || ULTEX_L_CONFIG.endpoint;
  // Forces the external_request OAuth consent while a human is present,
  // before the background triggers need UrlFetchApp.
  UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  SpreadsheetApp.getActive().toast('Autorisation de connexion CRM accordée.', 'ULTEX CRM', 5);
}

function modifierLeadULTEX(event) { if (!event || !event.range) return; const sheet = event.range.getSheet(); if (!isTargetSheet_(sheet) || event.range.getRow() <= headerRow_()) return; const tech = firstTechnicalColumn_(sheet); if (tech && event.range.getColumn() >= tech) return; withLock_(() => syncRows_(sheet, event.range.getRow(), event.range.getNumRows(), false)); }
function nouveauLeadFormulaireULTEX(event) { if (!event || !event.range || !isTargetSheet_(event.range.getSheet())) return; withLock_(() => syncRows_(event.range.getSheet(), event.range.getRow(), event.range.getNumRows(), false)); }
function scannerNouveauxLeads() { const sheet = targetSheet_(); withLock_(() => { ensureTechnicalColumns_(sheet); const map = headerMap_(sheet); const first = headerRow_() + 1; const count = Math.max(0, sheet.getLastRow() - headerRow_()); if (!count) return; const statuses = sheet.getRange(first, requiredColumn_(map, 'crm_sync_status'), count, 1).getDisplayValues(); statuses.forEach(([status], i) => { if (!status || /^ERREUR\b/.test(status)) syncRows_(sheet, first + i, 1, false); }); }); }
function synchroniserLigneActive() { const sheet = SpreadsheetApp.getActiveSheet(); if (!isTargetSheet_(sheet)) throw new Error('Cette feuille n’est pas la feuille configurée.'); withLock_(() => syncRows_(sheet, SpreadsheetApp.getActiveRange().getRow(), 1, true)); }
function importerSelection() { const range = SpreadsheetApp.getActiveRange(); const sheet = range.getSheet(); if (!isTargetSheet_(sheet)) throw new Error('Cette feuille n’est pas la feuille configurée.'); const start = Math.max(range.getRow(), headerRow_() + 1); const count = Math.max(0, range.getLastRow() - start + 1); if (count) withLock_(() => syncRows_(sheet, start, count, true)); }
function syncRows_(sheet, startRow, count, force) { ensureTechnicalColumns_(sheet); const map = headerMap_(sheet); const last = Math.min(sheet.getLastRow(), startRow + count - 1); for (let row = Math.max(startRow, headerRow_() + 1); row <= last; row += 1) syncRow_(sheet, row, map, force); }

function syncRow_(sheet, rowNumber, map, force) {
  const display = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const raw = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const get = name => { const col = map[normalizeHeader_(name)]; return col ? display[col - 1] : ''; };
  const getRaw = name => { const col = map[normalizeHeader_(name)]; return col ? raw[col - 1] : ''; };
  const statusCell = sheet.getRange(rowNumber, requiredColumn_(map, 'crm_sync_status'));
  if (!force && (/^OK\b/.test(String(statusCell.getValue())) || /^HISTORIQUE\b/.test(String(statusCell.getValue())))) return;
  if (![getRaw('submitted_at') || get('submitted_at'), get('nom'), get('whatsapp'), get('produit')].every(Boolean)) return;
  let id = get('CRM_SYNC_ID');
  if (!id) { id = `gs:${SpreadsheetApp.getActive().getId()}:${sheet.getSheetId()}:${Utilities.getUuid()}`; sheet.getRange(rowNumber, requiredColumn_(map, 'crm_sync_id')).setValue(id); SpreadsheetApp.flush(); }
  postLead_(sheet, rowNumber, map, {
    sheetLeadId: id, sheetFormat: ULTEX_L_CONFIG.format,
    dateReception: isoDate_(getRaw('submitted_at') || get('submitted_at')),
    nom: get('nom'), produit: get('produit'), pays: get('pays'),
    telephone: normalizePhone_(get('whatsapp')), browserId: get('browser_id'),
  }, statusCell);
}

function postLead_(sheet, row, map, payload, statusCell) {
  try {
    const props = PropertiesService.getScriptProperties(); const key = props.getProperty('CRM_SYNC_API_KEY');
    if (!key) throw new Error('Ajoutez CRM_SYNC_API_KEY dans les propriétés du script.');
    const response = UrlFetchApp.fetch(props.getProperty('CRM_SYNC_URL') || ULTEX_L_CONFIG.endpoint, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'X-ULTEX-SYNC-KEY': key }, payload: JSON.stringify(payload) });
    const body = JSON.parse(response.getContentText() || '{}');
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error(body.error || `Erreur HTTP ${response.getResponseCode()}`);
    sheet.getRange(row, requiredColumn_(map, 'crm_client_code')).setValue(body.client.code);
    sheet.getRange(row, requiredColumn_(map, 'crm_demande_code')).setValue(body.demande.code);
    statusCell.setValue(`OK — ${body.client.code} — ${timestamp_()}`);
  } catch (error) { statusCell.setValue(`ERREUR — ${String(error.message || error).slice(0, 300)}`); }
}

function targetSheet_() { const name = PropertiesService.getScriptProperties().getProperty('CRM_SHEET_NAME') || ULTEX_L_CONFIG.defaultSheetName; return name ? SpreadsheetApp.getActive().getSheetByName(name) : SpreadsheetApp.getActiveSheet(); }
function isTargetSheet_(sheet) { const target = targetSheet_(); return Boolean(target && sheet.getSheetId() === target.getSheetId()); }
function headerRow_() { return Number(PropertiesService.getScriptProperties().getProperty('CRM_HEADER_ROW') || ULTEX_L_CONFIG.headerRow); }
function normalizeHeader_(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function headerMap_(sheet) { const out = {}; sheet.getRange(headerRow_(), 1, 1, sheet.getLastColumn()).getDisplayValues()[0].forEach((v, i) => { if (v) out[normalizeHeader_(v)] = i + 1; }); return out; }
function requiredColumn_(map, name) { const col = map[normalizeHeader_(name)]; if (!col) throw new Error(`Colonne absente : ${name}`); return col; }
function ensureTechnicalColumns_(sheet) { const wanted = ['CRM_SYNC_ID', 'CRM_CLIENT_CODE', 'CRM_DEMANDE_CODE', 'CRM_SYNC_STATUS']; let map = headerMap_(sheet); wanted.forEach(name => { if (!map[normalizeHeader_(name)]) sheet.getRange(headerRow_(), sheet.getLastColumn() + 1).setValue(name); map = headerMap_(sheet); }); }
function firstTechnicalColumn_(sheet) { return headerMap_(sheet).crm_sync_id || 0; }
function normalizePhone_(value) { let p = String(value || '').replace(/\D/g, ''); if (p.startsWith('00')) p = p.slice(2); if (/^0[67]\d{8}$/.test(p)) p = `212${p.slice(1)}`; if (/^[67]\d{8}$/.test(p)) p = `212${p}`; return p; }
function isoDate_(value) { if (value instanceof Date && !isNaN(value)) return value.toISOString(); let date; if (typeof value === 'number') { const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : (value - 25569) * 86400000; date = new Date(ms); } else date = new Date(String(value || '').trim()); if (isNaN(date)) throw new Error('submitted_at invalide.'); return date.toISOString(); }
function timestamp_() { return Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function withLock_(callback) { const lock = LockService.getDocumentLock(); lock.waitLock(20000); try { return callback(); } finally { lock.releaseLock(); } }
function deleteOwnTriggers_() { const own = ['modifierLeadULTEX', 'nouveauLeadFormulaireULTEX', 'scannerNouveauxLeads']; ScriptApp.getProjectTriggers().forEach(t => { if (own.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); }); }

/**
 * ULTEX — Sheet "Date et Heure / Nom Complet / ..." -> CRM.
 * Paste this entire file into Extensions > Apps Script for the FIRST sheet.
 */
const ULTEX_L_CONFIG = Object.freeze({
  format: 'formulaire_import',
  spreadsheetId: '1q3Q3V7XdrbFEv7GN_Ek30kI_iQIBKkBksa_Zhsx1NT0',
  defaultSheetName: '',
  endpoint: 'https://crm.ultex.ma/api/sync/sheets/lead-l',
  headerRow: 1,
  maxRowsPerScan: 25,
});

/**
 * Public web-app endpoint used by the website form.
 * It only records the lead in the Sheet; the installed scanner sends it to
 * the CRM asynchronously, so the visitor does not wait for the CRM request.
 */
function doPost(e) {
  let backup = null;
  const receivedAt = new Date().toISOString();
  const raw = e?.postData?.contents || '';
  const receipt = Utilities.getUuid();
  // Save the incoming body before attempting the spreadsheet write.
  try {
    backup = backupFolder_().createFile(receipt + '.json',
      JSON.stringify({ receipt, receivedAt, raw }), MimeType.PLAIN_TEXT);
  } catch (error) {
    console.error('BACKUP_FAILED ' + String(error.message || error));
  }
  try {
    const data = parseSubmission_(raw, e?.parameter);
    if (!data.submissionId) data.submissionId = receipt;
    withLock_(() => writeSubmission_(data, receivedAt));
    if (backup) backup.setDescription('SAVED');
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', crmSync: 'queued' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    console.error('LEAD_SAVE_FAILED receipt=' + receipt + ' backup=' + Boolean(backup)
      + ' reason=' + String(error.message || error));
    // An unsuccessful write must be visible as a failed doPost execution.
    throw error;
  }
}

function parseSubmission_(raw, parameters) {
  let data;
  try { data = JSON.parse(raw); } catch (error) {
    if (parameters?.payload) data = JSON.parse(parameters.payload);
    else throw new Error('Requête JSON invalide ou vide.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Formulaire invalide.');
  return data;
}

function writeSubmission_(data, receivedAt) {
    const contact = data.contact && typeof data.contact === 'object' ? data.contact : data;
    const sheet = targetSheet_();
    const businessHeaders = [
      'Date et Heure', 'Nom Complet', 'Société', 'Email', 'Téléphone',
      "Volume d'importation", 'Fournisseur Fiable ?',
      'Frustration Actuelle', 'Produit à Importer',
    ];
    ensureColumns_(sheet, businessHeaders);
    ensureTechnicalColumns_(sheet);
    const submissionId = String(data.submissionId || '');
    if (submissionId && !/^[a-f0-9-]{36}$/i.test(submissionId)) throw new Error('Identifiant invalide.');
    if (!String(contact.nom || '').trim() || !String(contact.telephone || '').trim() || !String(data.produit || '').trim()) {
      throw new Error('Nom, téléphone et produit requis.');
    }
    if (submissionId && savedSubmission_(sheet, submissionId)) {
      return;
    }
    const map = headerMap_(sheet);
    const row = Array(sheet.getLastColumn()).fill('');
    const put = (header, value) => { row[requiredColumn_(map, header) - 1] = value == null ? '' : value; };
    put('Date et Heure', new Date(receivedAt));
    put('Nom Complet', contact.nom);
    put('Société', contact.societe);
    put('Email', contact.email);
    put('Téléphone', contact.telephone);
    put("Volume d'importation", data.volume);
    put('Fournisseur Fiable ?', data.fournisseur);
    put('Frustration Actuelle', data.frustration);
    put('Produit à Importer', data.produit);
    if (submissionId) put('CRM_SYNC_ID', 'landing:' + submissionId);
    const rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();

    console.log('LEAD_SAVED spreadsheet=' + sheet.getParent().getId() + ' tab=' + sheet.getName() + ' gid=' + sheet.getSheetId() + ' row=' + rowNumber);
}

function backupFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('CRM_BACKUP_FOLDER_ID');
  if (!id) throw new Error('Exécutez preparerReceptionULTEX une fois pour activer la sauvegarde.');
  return DriveApp.getFolderById(id);
}

function arreterSynchronisationULTEX() {
  deleteOwnTriggers_();
  console.log('Déclencheurs CRM arrêtés. Annulez les exécutions encore en cours dans Exécutions avant de relancer la préparation.');
}

function preparerReceptionULTEX() {
  withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('CRM_BACKUP_FOLDER_ID')) {
      const folder = DriveApp.createFolder('ULTEX - sauvegarde reception leads');
      props.setProperty('CRM_BACKUP_FOLDER_ID', folder.getId());
    }
    backupFolder_().getName();
    const sheet = targetSheet_();
    ensureColumns_(sheet, ['Date et Heure', 'Nom Complet', 'Société', 'Email', 'Téléphone',
      "Volume d'importation", 'Fournisseur Fiable ?', 'Frustration Actuelle', 'Produit à Importer']);
    ensureTechnicalColumns_(sheet);
  });
  diagnostiquerReceptionULTEX();
}

function diagnostiquerReceptionULTEX() {
  const book = spreadsheet_();
  console.log('Classeur cible : ' + book.getId());
  book.getSheets().forEach(sheet => console.log('Onglet : ' + sheet.getName()
    + ' | gid=' + sheet.getSheetId() + ' | lignes=' + sheet.getLastRow()
    + ' | colonnes=' + sheet.getLastColumn()));
  const target = targetSheet_();
  console.log('Destination des leads : ' + target.getName() + ' | gid=' + target.getSheetId());
  console.log('Sauvegarde Drive : ' + (PropertiesService.getScriptProperties().getProperty('CRM_BACKUP_FOLDER_ID') || 'NON CONFIGURÉE'));
}

function restaurerSauvegardesReception() {
  const files = backupFolder_().getFiles();
  const started = Date.now();
  let restored = 0;
  let failed = 0;
  while (files.hasNext() && restored + failed < 25 && Date.now() - started < 240000) {
    const file = files.next();
    if (file.getDescription() === 'SAVED') continue;
    try {
      const record = JSON.parse(file.getBlob().getDataAsString());
      const data = parseSubmission_(record.raw, null);
      if (!data.submissionId) data.submissionId = record.receipt;
      withLock_(() => writeSubmission_(data, record.receivedAt));
      file.setDescription('SAVED');
      restored++;
    } catch (error) {
      failed++;
      console.error('RESTORE_FAILED file=' + file.getId() + ' reason=' + String(error.message || error));
    }
  }
  console.log('Restaurés : ' + restored + ' | erreurs : ' + failed);
}

// The landing page can verify a saved receipt across origins without exposing contact details.
function doGet(e) {
  const id = String(e?.parameter?.submissionId || '');
  const callback = String(e?.parameter?.callback || '');
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^ultexReceipt_[a-f0-9]+$/.test(callback)) {
    return ContentService.createTextOutput('Invalid receipt request');
  }
  let saved = false;
  try { saved = savedSubmission_(targetSheet_(), id); } catch (error) { console.error(String(error)); }
  return ContentService.createTextOutput(callback + '(' + JSON.stringify({ saved }) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function savedSubmission_(sheet, id) {
  const col = headerMap_(sheet).crm_sync_id;
  const count = sheet.getLastRow() - headerRow_();
  if (!col || count <= 0) return false;
  return Boolean(sheet.getRange(headerRow_() + 1, col, count, 1)
    .createTextFinder('landing:' + id).matchEntireCell(true).findNext());
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('ULTEX CRM')
    .addItem('Autoriser la connexion CRM', 'autoriserConnexionCRM')
    .addItem('Installer la synchronisation', 'installerSynchronisationULTEX')
    .addItem('Tester / synchroniser la ligne active', 'synchroniserLigneActive')
    .addItem('Importer les lignes sélectionnées', 'importerSelection')
    .addSeparator()
    .addItem('Vérifier les nouveaux leads maintenant', 'scannerNouveauxLeads')
    .addItem('Récupérer les leads non synchronisés', 'recupererLeadsNonSynchronises')
    .addToUi();
}

function installerSynchronisationULTEX() {
  preparerReceptionULTEX();
  const props = PropertiesService.getScriptProperties();
  const sheet = targetSheet_();
  props.setProperty('CRM_SHEET_NAME', sheet.getName());
  props.setProperty('CRM_SHEET_ID', String(sheet.getSheetId()));
  if (!props.getProperty('CRM_SYNC_URL')) props.setProperty('CRM_SYNC_URL', ULTEX_L_CONFIG.endpoint);
  if (!props.getProperty('CRM_HEADER_ROW')) props.setProperty('CRM_HEADER_ROW', String(ULTEX_L_CONFIG.headerRow));
  autoriserConnexionCRM();
  ensureTechnicalColumns_(sheet);

  deleteOwnTriggers_();
  const spreadsheet = spreadsheet_();
  ScriptApp.newTrigger('modifierLeadULTEX').forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger('nouveauLeadFormulaireULTEX').forSpreadsheet(spreadsheet).onFormSubmit().create();
  // Required when rows are written by an API/script: Google does not fire
  // edit/form triggers for those writes.
  ScriptApp.newTrigger('scannerNouveauxLeads').timeBased().everyMinutes(1).create();
  spreadsheet_().toast(
    'Synchronisation installée. Les nouvelles lignes recevront leur code L automatiquement.',
    'ULTEX CRM',
    8
  );
}

function autoriserConnexionCRM() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('CRM_SYNC_URL') || ULTEX_L_CONFIG.endpoint;
  const key = props.getProperty('CRM_SYNC_API_KEY');
  if (!key) throw new Error('Ajoutez CRM_SYNC_API_KEY dans les propriétés du script.');
  const response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-ULTEX-SYNC-KEY': key }, payload: '{}',
  });
  let body = {};
  try { body = JSON.parse(response.getContentText()); } catch (ignored) {}
  if (response.getResponseCode() !== 400 || body.code !== 'INVALID_SHEET_LEAD') {
    throw new Error('Connexion CRM échouée : HTTP ' + response.getResponseCode());
  }
  spreadsheet_().toast('Connexion CRM vérifiée.', 'ULTEX CRM', 5);
}

function modifierLeadULTEX(event) {
  if (!event || !event.range) return;
  const sheet = event.range.getSheet();
  if (!isTargetSheet_(sheet) || event.range.getRow() <= headerRow_()) return;
  const technicalStart = firstTechnicalColumn_(sheet);
  if (technicalStart && event.range.getColumn() >= technicalStart) return;
  syncRows_(sheet, event.range.getRow(), event.range.getNumRows(), false);
}

function nouveauLeadFormulaireULTEX(event) {
  if (!event || !event.range || !isTargetSheet_(event.range.getSheet())) return;
  syncRows_(event.range.getSheet(), event.range.getRow(), event.range.getNumRows(), false);
}

function scannerNouveauxLeads() {
  const sheet = targetSheet_();
  const snapshot = withLock_(() => {
    ensureTechnicalColumns_(sheet);
    const map = headerMap_(sheet);
    const count = Math.max(0, sheet.getLastRow() - headerRow_());
    return { map, rows: count ? sheet.getRange(headerRow_() + 1, 1, count, sheet.getLastColumn()).getDisplayValues() : [] };
  });
  const { map, rows } = snapshot;
  const statusCol = requiredColumn_(map, 'crm_sync_status');
  let processed = 0;
  const started = Date.now();
  rows.forEach((values, index) => {
    const status = values[statusCol - 1];
    const hasLead = ['Nom Complet', 'Téléphone', 'Produit à Importer']
      .some(name => String(values[requiredColumn_(map, name) - 1] || '').trim());
    if (!hasLead || processed >= ULTEX_L_CONFIG.maxRowsPerScan || Date.now() - started > 240000) return;
    if (!status || /^ERREUR TEMPORAIRE\b/.test(status)) {
      syncRows_(sheet, headerRow_() + 1 + index, 1, false);
      processed += 1;
    }
  });
}

function synchroniserLigneActive() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!isTargetSheet_(sheet)) throw new Error('Cette feuille n’est pas la feuille configurée.');
  syncRows_(sheet, SpreadsheetApp.getActiveRange().getRow(), 1, true);
}

function importerSelection() {
  const range = SpreadsheetApp.getActiveRange();
  const sheet = range.getSheet();
  if (!isTargetSheet_(sheet)) throw new Error('Cette feuille n’est pas la feuille configurée.');
  const start = Math.max(range.getRow(), headerRow_() + 1);
  const count = Math.max(0, range.getLastRow() - start + 1);
  if (count) syncRows_(sheet, start, count, true);
}

function syncRows_(sheet, startRow, count, force) {
  withLock_(() => ensureTechnicalColumns_(sheet));
  const map = headerMap_(sheet);
  const last = Math.min(sheet.getLastRow(), startRow + count - 1);
  for (let row = Math.max(startRow, headerRow_() + 1); row <= last; row += 1) {
    try { syncRow_(sheet, row, map, force); }
    catch (error) {
      sheet.getRange(row, requiredColumn_(map, 'crm_sync_status'))
        .setValue('ERREUR VALIDATION — ' + String(error.message || error).slice(0, 300));
    }
  }
}

function syncRow_(sheet, rowNumber, map, force) {
  const prepared = withLock_(() => {
  const display = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const raw = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const get = name => {
    const col = map[normalizeHeader_(name)];
    return col ? display[col - 1] : '';
  };
  const getRaw = name => {
    const col = map[normalizeHeader_(name)];
    return col ? raw[col - 1] : '';
  };
  const statusCell = sheet.getRange(rowNumber, requiredColumn_(map, 'crm_sync_status'));
  if (!force && /^OK\b/.test(String(statusCell.getValue()))) return;
  if (!force && /^HISTORIQUE\b/.test(String(statusCell.getValue()))) return;
  if (![getRaw('Date et Heure') || get('Date et Heure'), get('Nom Complet'), get('Téléphone'), get('Produit à Importer')].every(Boolean)) throw new Error('Date, nom, téléphone ou produit manquant.');

  let id = get('CRM_SYNC_ID');
  if (!id) {
    id = `gs:${sheet.getParent().getId()}:${sheet.getSheetId()}:${Utilities.getUuid()}`;
    sheet.getRange(rowNumber, requiredColumn_(map, 'crm_sync_id')).setValue(id);
    SpreadsheetApp.flush();
  }
  const payload = {
    sheetLeadId: id,
    sheetFormat: ULTEX_L_CONFIG.format,
    dateReception: isoDate_(getRaw('Date et Heure') || get('Date et Heure')),
    nom: get('Nom Complet'),
    societe: get('Société'),
    email: get('Email'),
    telephone: normalizePhone_(get('Téléphone')),
    volumeImportation: get("Volume d'importation"),
    fournisseurFiable: get('Fournisseur Fiable ?'),
    frustrationActuelle: get('Frustration Actuelle'),
    produit: get('Produit à Importer'),
  };
  return { payload, statusCell };
  });
  if (prepared) postLead_(sheet, rowNumber, map, prepared.payload, prepared.statusCell);
}

function postLead_(sheet, row, map, payload, statusCell) {
  try {
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('CRM_SYNC_API_KEY');
    if (!key) throw new Error('Ajoutez CRM_SYNC_API_KEY dans les propriétés du script.');
    const response = UrlFetchApp.fetch(props.getProperty('CRM_SYNC_URL') || ULTEX_L_CONFIG.endpoint, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-ULTEX-SYNC-KEY': key }, payload: JSON.stringify(payload),
    });
    const body = JSON.parse(response.getContentText() || '{}');
    const responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      const retryable = body.retryable === true || responseCode === 408 || responseCode === 429 || responseCode >= 500;
      const prefix = retryable ? 'ERREUR TEMPORAIRE' : 'ERREUR VALIDATION';
      if (/^OK\b/.test(String(statusCell.getValue()))) return;
      statusCell.setValue(`${prefix} — ${String(body.error || `Erreur HTTP ${responseCode}`).slice(0, 300)}`);
      return;
    }
    sheet.getRange(row, requiredColumn_(map, 'crm_client_code')).setValue(body.client.code);
    sheet.getRange(row, requiredColumn_(map, 'crm_demande_code')).setValue(body.demande.code);
    statusCell.setValue(`OK — ${body.client.code} — ${timestamp_()}`);
  } catch (error) {
    if (/^OK\b/.test(String(statusCell.getValue()))) return;
    statusCell.setValue(`ERREUR TEMPORAIRE — ${String(error.message || error).slice(0, 300)}`);
  }
}

function spreadsheet_() {
  return SpreadsheetApp.openById(ULTEX_L_CONFIG.spreadsheetId);
}

function targetSheet_() {
  const book = spreadsheet_();
  const props = PropertiesService.getScriptProperties();
  const sheets = book.getSheets();
  const savedId = props.getProperty('CRM_SHEET_ID');
  let sheet = savedId ? sheets.find(item => String(item.getSheetId()) === savedId) : null;
  if (!sheet) {
    const name = props.getProperty('CRM_SHEET_NAME') || ULTEX_L_CONFIG.defaultSheetName;
    if (name) sheet = book.getSheetByName(name);
  }
  if (!sheet) sheet = sheets.find(item => item.getSheetId() === 0);
  if (!sheet) {
    const matches = sheets.filter(item => {
      const map = headerMap_(item);
      return ['Date et Heure', 'Nom Complet', 'Téléphone', 'Produit à Importer']
        .every(name => map[normalizeHeader_(name)]);
    });
    if (matches.length !== 1) {
      throw new Error('Configurez CRM_SHEET_NAME avec le nom exact de l’onglet des leads. Onglets disponibles : '
        + sheets.map(item => item.getName()).join(', '));
    }
    sheet = matches[0];
  }
  props.setProperty('CRM_SHEET_ID', String(sheet.getSheetId()));
  props.setProperty('CRM_SHEET_NAME', sheet.getName());
  return sheet;
}

function recupererLeadsNonSynchronises() {
  withLock_(() => {
    const sheet = targetSheet_();
    ensureTechnicalColumns_(sheet);
    const map = headerMap_(sheet);
    const count = sheet.getLastRow() - headerRow_();
    if (count <= 0) return;
    const col = requiredColumn_(map, 'crm_sync_status');
    const range = sheet.getRange(headerRow_() + 1, col, count, 1);
    const statuses = range.getValues().map(([status]) => [
      /^OK\b/.test(String(status)) ? status : ''
    ]);
    range.setValues(statuses);
  });
  scannerNouveauxLeads();
}

function isTargetSheet_(sheet) { const target = targetSheet_(); return Boolean(sheet && sheet.getParent().getId() === target.getParent().getId() && sheet.getSheetId() === target.getSheetId()); }
function headerRow_() { return Number(PropertiesService.getScriptProperties().getProperty('CRM_HEADER_ROW') || ULTEX_L_CONFIG.headerRow); }
function normalizeHeader_(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function headerMap_(sheet) { if (!sheet) throw new Error('Onglet des leads introuvable.'); const out = {}; if (!sheet.getLastColumn()) return out; sheet.getRange(headerRow_(), 1, 1, sheet.getLastColumn()).getDisplayValues()[0].forEach((v, i) => { if (v) out[normalizeHeader_(v)] = i + 1; }); return out; }
function requiredColumn_(map, name) { const col = map[normalizeHeader_(name)]; if (!col) throw new Error(`Colonne absente : ${name}`); return col; }
function ensureColumns_(sheet, wanted) { let map = headerMap_(sheet); wanted.forEach(name => { if (!map[normalizeHeader_(name)]) sheet.getRange(headerRow_(), sheet.getLastColumn() + 1).setValue(name); map = headerMap_(sheet); }); }
function ensureTechnicalColumns_(sheet) { ensureColumns_(sheet, ['CRM_SYNC_ID', 'CRM_CLIENT_CODE', 'CRM_DEMANDE_CODE', 'CRM_SYNC_STATUS']); }
function firstTechnicalColumn_(sheet) { const map = headerMap_(sheet); return map.crm_sync_id || 0; }
function normalizePhone_(value) { let p = String(value || '').replace(/\D/g, ''); if (p.startsWith('00')) p = p.slice(2); if (/^0[67]\d{8}$/.test(p)) p = `212${p.slice(1)}`; if (/^[67]\d{8}$/.test(p)) p = `212${p}`; return p; }
function isoDate_(value) { if (value instanceof Date && !isNaN(value)) return value.toISOString(); const text = String(value || '').trim(); const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); const date = m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)) : new Date(text); if (isNaN(date)) throw new Error('Date et Heure invalide.'); return date.toISOString(); }
function timestamp_() { return Utilities.formatDate(new Date(), spreadsheet_().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function withLock_(callback) { const lock = LockService.getScriptLock(); lock.waitLock(20000); try { return callback(); } finally { lock.releaseLock(); } }
function deleteOwnTriggers_() { const own = ['modifierLeadULTEX', 'nouveauLeadFormulaireULTEX', 'scannerNouveauxLeads']; ScriptApp.getProjectTriggers().forEach(t => { if (own.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); }); }

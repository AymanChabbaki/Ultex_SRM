/**
 * ULTEX — Meta export leads -> CRM V2.
 * One bound Apps Script handles both tabs:
 *   - Formulaire export
 *   - Formulaire export (v4)
 */
const ULTEX_EXPORT_V2 = Object.freeze({
  endpoint: 'https://crm.ultex.ma/api-v2/sync/sheets/meta-export-v2',
  healthUrl: 'https://crm.ultex.ma/api-v2/health',
  sheetNames: ['Formulaire export', 'Formulaire export (v4)'],
  headerRow: 1,
  maxRowsPerScan: 40,
});

const ULTEX_EXPORT_FIELDS = Object.freeze({
  leadId: ['id'],
  createdTime: ['created_time'],
  adId: ['ad_id'],
  adName: ['ad_name'],
  adsetId: ['adset_id'],
  adsetName: ['adset_name'],
  campaignId: ['campaign_id'],
  campaignName: ['campaign_name'],
  formId: ['form_id'],
  formName: ['form_name'],
  organic: ['is_organic'],
  platform: ['platform'],
  volume: ["quel_est_votre_volume_d'exportation_actuel_?"],
  exportExperience: ['واش_عندك_لونصا_(onssa)_واش_ديجا_صدرتي؟'],
  partners: [
    'avez-vous_déjà_des_partenaires_(fournisseurs_ou_acheteurs)_fiables_?',
    'هل_لديك_بالفعل_شركاء_(موردين_أو_مشترين)_موثوقون؟',
  ],
  frustration: [
    "quelle_est_votre_plus_grande_frustration_logistique_aujourd'hui_?",
    'ما_هي_أكبر_مشكلة_(أو_عائق)_لوجستية_تواجهك_اليوم؟',
  ],
  product: [
    'quel_type_de_produit_souhaitez-vous_importer_ou_exporter_?',
    'ما_نوع_المنتج_الذي_ترغب_في_استيراده_أو_تصديره؟',
  ],
  email: ['email'],
  phone: ['phone_number', 'رقم_الهاتف'],
  fullName: ['full_name'],
  leadStatus: ['lead_status'],
  priority: ['Priority'],
});

const ULTEX_EXPORT_TECHNICAL = Object.freeze([
  'CRM_SYNC_ID', 'CRM_CLIENT_CODE', 'CRM_DEMANDE_CODE', 'CRM_SYNC_STATUS', 'CRM_SYNCED_AT',
]);

function onOpen() {
  SpreadsheetApp.getUi().createMenu('ULTEX CRM V2')
    .addItem('1. Autoriser la connexion', 'autoriserConnexionCRMV2')
    .addItem('2. Installer la synchronisation', 'installerSynchronisationExportV2')
    .addSeparator()
    .addItem('Synchroniser la sélection', 'synchroniserSelectionExportV2')
    .addItem('Importer tout l’historique', 'importerHistoriqueExportV2')
    .addItem('Vérifier les nouveaux leads maintenant', 'scannerNouveauxLeadsExportV2')
    .addToUi();
}

function autoriserConnexionCRMV2() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('CRM_V2_SYNC_URL') || ULTEX_EXPORT_V2.healthUrl;
  UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  SpreadsheetApp.getActive().toast('Connexion externe autorisée.', 'ULTEX CRM V2', 5);
}

function installerSynchronisationExportV2() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CRM_V2_SYNC_URL')) props.setProperty('CRM_V2_SYNC_URL', ULTEX_EXPORT_V2.endpoint);
  if (!props.getProperty('CRM_SYNC_API_KEY')) {
    throw new Error('Ajoutez CRM_SYNC_API_KEY dans Paramètres du projet > Propriétés du script.');
  }

  const sheets = targetSheets_();
  if (!sheets.length) throw new Error('Aucune des deux feuilles attendues n’existe.');
  sheets.forEach(sheet => {
    ensureTechnicalColumns_(sheet);
    markExistingRowsAsHistory_(sheet);
  });

  deleteOwnTriggers_();
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('modifierLeadExportV2').forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger('nouveauLeadExportV2').forSpreadsheet(spreadsheet).onFormSubmit().create();
  // Meta/connector writes do not fire edit or form-submit triggers.
  ScriptApp.newTrigger('scannerNouveauxLeadsExportV2').timeBased().everyMinutes(1).create();
  SpreadsheetApp.getActive().toast(
    'Synchronisation V2 installée. Les nouveaux leads recevront un code E.',
    'ULTEX CRM V2',
    8
  );
}

function modifierLeadExportV2(event) {
  if (!event || !event.range || !isTargetSheet_(event.range.getSheet())) return;
  if (event.range.getRow() <= ULTEX_EXPORT_V2.headerRow) return;
  withLock_(() => syncRows_(event.range.getSheet(), event.range.getRow(), event.range.getNumRows(), false));
}

function nouveauLeadExportV2(event) {
  if (!event || !event.range || !isTargetSheet_(event.range.getSheet())) return;
  withLock_(() => syncRows_(event.range.getSheet(), event.range.getRow(), event.range.getNumRows(), false));
}

function scannerNouveauxLeadsExportV2() {
  withLock_(() => {
    let remaining = ULTEX_EXPORT_V2.maxRowsPerScan;
    targetSheets_().forEach(sheet => {
      if (remaining <= 0) return;
      ensureTechnicalColumns_(sheet);
      const map = headerMap_(sheet);
      const statusCol = requiredTechnicalColumn_(map, 'CRM_SYNC_STATUS');
      const count = Math.max(0, sheet.getLastRow() - ULTEX_EXPORT_V2.headerRow);
      if (!count) return;
      const statuses = sheet.getRange(ULTEX_EXPORT_V2.headerRow + 1, statusCol, count, 1).getDisplayValues();
      for (let index = 0; index < statuses.length && remaining > 0; index += 1) {
        const status = String(statuses[index][0] || '');
        if (!status || /^ERREUR TEMPORAIRE\b/.test(status)) {
          syncRows_(sheet, ULTEX_EXPORT_V2.headerRow + 1 + index, 1, false);
          remaining -= 1;
        }
      }
    });
  });
}

function synchroniserSelectionExportV2() {
  const range = SpreadsheetApp.getActiveRange();
  const sheet = range.getSheet();
  if (!isTargetSheet_(sheet)) throw new Error('Sélectionnez des lignes dans Formulaire export ou Formulaire export (v4).');
  const start = Math.max(range.getRow(), ULTEX_EXPORT_V2.headerRow + 1);
  const count = Math.max(0, range.getLastRow() - start + 1);
  if (count) withLock_(() => syncRows_(sheet, start, count, true));
}

function importerHistoriqueExportV2() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'Importer l’historique',
    'Toutes les lignes HISTORIQUE des deux feuilles seront mises en file. Les IDs Meta déjà importés ne seront pas dupliqués. Continuer ?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  withLock_(() => {
    targetSheets_().forEach(sheet => {
      ensureTechnicalColumns_(sheet);
      const map = headerMap_(sheet);
      const statusCol = requiredTechnicalColumn_(map, 'CRM_SYNC_STATUS');
      const count = Math.max(0, sheet.getLastRow() - ULTEX_EXPORT_V2.headerRow);
      if (!count) return;
      const range = sheet.getRange(ULTEX_EXPORT_V2.headerRow + 1, statusCol, count, 1);
      const statuses = range.getValues().map(([value]) => [String(value || '').startsWith('HISTORIQUE') ? '' : value]);
      range.setValues(statuses);
    });
  });
  scannerNouveauxLeadsExportV2();
  SpreadsheetApp.getActive().toast('Historique mis en file. Le traitement continue automatiquement.', 'ULTEX CRM V2', 8);
}

function syncRows_(sheet, startRow, count, force) {
  ensureTechnicalColumns_(sheet);
  const map = headerMap_(sheet);
  const last = Math.min(sheet.getLastRow(), startRow + count - 1);
  for (let row = Math.max(startRow, ULTEX_EXPORT_V2.headerRow + 1); row <= last; row += 1) {
    syncRow_(sheet, row, map, force);
  }
}

function syncRow_(sheet, rowNumber, map, force) {
  const width = sheet.getLastColumn();
  const display = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  const raw = sheet.getRange(rowNumber, 1, 1, width).getValues()[0];
  const statusCell = sheet.getRange(rowNumber, requiredTechnicalColumn_(map, 'CRM_SYNC_STATUS'));
  const oldStatus = String(statusCell.getValue() || '');
  if (!force && /^(OK|IGNORÉ|REJET|CONFLIT|HISTORIQUE)\b/.test(oldStatus)) return;

  const value = field => fieldValue_(ULTEX_EXPORT_FIELDS[field], display, map);
  const rawValue = field => fieldValue_(ULTEX_EXPORT_FIELDS[field], raw, map);
  const leadId = value('leadId');
  if (!leadId) return;
  const required = [rawValue('createdTime') || value('createdTime'), value('fullName'), value('phone'), value('product')];
  if (!required.every(Boolean)) {
    statusCell.setValue('REJET — created_time, full_name, téléphone et produit sont requis');
    return;
  }

  const payload = {
    sheetName: sheet.getName(),
    sheetRow: rowNumber,
    leadId,
    createdTime: isoDate_(rawValue('createdTime') || value('createdTime')),
    adId: value('adId'), adName: value('adName'),
    adsetId: value('adsetId'), adsetName: value('adsetName'),
    campaignId: value('campaignId'), campaignName: value('campaignName'),
    formId: value('formId'), formName: value('formName'),
    organic: value('organic'), platform: value('platform'),
    volume: value('volume'), exportExperience: value('exportExperience'),
    partners: value('partners'), frustration: value('frustration'), product: value('product'),
    email: value('email'), phone: value('phone'), fullName: value('fullName'),
    leadStatus: value('leadStatus'), priority: value('priority'),
  };

  sheet.getRange(rowNumber, requiredTechnicalColumn_(map, 'CRM_SYNC_ID')).setValue(`meta-export:${leadId}`);
  postLead_(sheet, rowNumber, map, payload, statusCell);
}

function postLead_(sheet, row, map, payload, statusCell) {
  try {
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('CRM_SYNC_API_KEY');
    if (!key) throw new Error('Ajoutez CRM_SYNC_API_KEY dans les propriétés du script.');
    const response = UrlFetchApp.fetch(props.getProperty('CRM_V2_SYNC_URL') || ULTEX_EXPORT_V2.endpoint, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { 'X-ULTEX-SYNC-KEY': key },
      payload: JSON.stringify(payload),
    });
    const code = response.getResponseCode();
    let body = {};
    try { body = JSON.parse(response.getContentText() || '{}'); } catch (ignored) {}
    if (code < 200 || code >= 300) {
      const prefix = code === 409 ? 'CONFLIT' : code >= 500 ? 'ERREUR TEMPORAIRE' : 'REJET';
      statusCell.setValue(`${prefix} — ${String(body.error || `HTTP ${code}`).slice(0, 300)}`);
      return;
    }
    if (body.status === 'ignored') {
      statusCell.setValue(`IGNORÉ — ${body.reason || 'lead test'}`);
      return;
    }
    sheet.getRange(row, requiredTechnicalColumn_(map, 'CRM_CLIENT_CODE')).setValue(body.client.code);
    sheet.getRange(row, requiredTechnicalColumn_(map, 'CRM_DEMANDE_CODE')).setValue(body.demande.code);
    sheet.getRange(row, requiredTechnicalColumn_(map, 'CRM_SYNCED_AT')).setValue(timestamp_());
    statusCell.setValue(`OK — ${body.client.code} — ${body.demande.code}`);
  } catch (error) {
    statusCell.setValue(`ERREUR TEMPORAIRE — ${String(error.message || error).slice(0, 300)}`);
  }
}

function targetSheets_() {
  const spreadsheet = SpreadsheetApp.getActive();
  return ULTEX_EXPORT_V2.sheetNames.map(name => spreadsheet.getSheetByName(name)).filter(Boolean);
}

function isTargetSheet_(sheet) {
  return Boolean(sheet && ULTEX_EXPORT_V2.sheetNames.includes(sheet.getName()));
}

function canonicalHeader_(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_'’()\-?؟]+/g, '');
}

function headerMap_(sheet) {
  const map = {};
  sheet.getRange(ULTEX_EXPORT_V2.headerRow, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getDisplayValues()[0]
    .forEach((header, index) => {
      const key = canonicalHeader_(header);
      if (key) map[key] = index + 1;
    });
  return map;
}

function fieldValue_(aliases, row, map) {
  for (const alias of aliases || []) {
    const column = map[canonicalHeader_(alias)];
    if (column) return row[column - 1] == null ? '' : String(row[column - 1]).trim();
  }
  return '';
}

function requiredTechnicalColumn_(map, name) {
  const column = map[canonicalHeader_(name)];
  if (!column) throw new Error(`Colonne technique absente : ${name}`);
  return column;
}

function ensureTechnicalColumns_(sheet) {
  let map = headerMap_(sheet);
  ULTEX_EXPORT_TECHNICAL.forEach(name => {
    if (!map[canonicalHeader_(name)]) {
      sheet.getRange(ULTEX_EXPORT_V2.headerRow, sheet.getLastColumn() + 1).setValue(name);
      map = headerMap_(sheet);
    }
  });
}

function markExistingRowsAsHistory_(sheet) {
  const map = headerMap_(sheet);
  const statusCol = requiredTechnicalColumn_(map, 'CRM_SYNC_STATUS');
  const leadIdCol = map[canonicalHeader_('id')];
  const count = Math.max(0, sheet.getLastRow() - ULTEX_EXPORT_V2.headerRow);
  if (!count || !leadIdCol) return;
  const ids = sheet.getRange(ULTEX_EXPORT_V2.headerRow + 1, leadIdCol, count, 1).getDisplayValues();
  const range = sheet.getRange(ULTEX_EXPORT_V2.headerRow + 1, statusCol, count, 1);
  const statuses = range.getValues().map(([status], index) => [status || (ids[index][0] ? 'HISTORIQUE — non importé' : '')]);
  range.setValues(statuses);
}

function isoDate_(value) {
  if (value instanceof Date && !isNaN(value)) return value.toISOString();
  let text = String(value || '').trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  let date = new Date(text);
  if (isNaN(date)) {
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
  }
  if (isNaN(date)) throw new Error('created_time invalide');
  return date.toISOString();
}

function timestamp_() {
  return Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function withLock_(callback) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function deleteOwnTriggers_() {
  const handlers = ['modifierLeadExportV2', 'nouveauLeadExportV2', 'scannerNouveauxLeadsExportV2'];
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
}

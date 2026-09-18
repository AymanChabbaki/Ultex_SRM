/**
 * ULTEX Google Sheets -> CRM Data synchronization.
 *
 * Script properties required:
 *   CRM_SYNC_URL     https://crm.ultex.ma/api/sync/sheets/lead
 *   CRM_SYNC_API_KEY same value as ULTEX_SYNC_API_KEY on the CRM server
 * Optional:
 *   CRM_SHEET_NAME   sheet to watch (default: Leads)
 *   CRM_HEADER_ROW   header row number (default: 1)
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ULTEX CRM')
    .addItem('Synchroniser la ligne active', 'synchroniserLigneActive')
    .addItem("Synchroniser les leads d'aujourd'hui", 'synchroniserLeadsAujourdhui')
    .addSeparator()
    .addItem('Installer la synchronisation automatique', 'installerSynchronisationCrm')
    .addToUi();
}

function installerSynchronisationCrm() {
  var spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) { return trigger.getHandlerFunction() === 'onEditCrm'; })
    .forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('onEditCrm').forSpreadsheet(spreadsheet).onEdit().create();
  SpreadsheetApp.getUi().alert('Synchronisation CRM automatique installée.');
}

function onEditCrm(event) {
  if (!event || !event.range) return;
  var config = lireConfiguration_();
  var sheet = event.range.getSheet();
  if (sheet.getName() !== config.sheetName || event.range.getRow() <= config.headerRow) return;
  synchroniserLigne_(sheet, event.range.getRow(), config);
}

function synchroniserLigneActive() {
  var config = lireConfiguration_();
  var sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== config.sheetName) {
    throw new Error('Ouvrez la feuille « ' + config.sheetName + ' ».');
  }
  synchroniserLigne_(sheet, sheet.getActiveRange().getRow(), config);
}

function synchroniserLeadsAujourdhui() {
  var config = lireConfiguration_();
  var sheet = SpreadsheetApp.getActive().getSheetByName(config.sheetName);
  if (!sheet) throw new Error('Feuille introuvable : ' + config.sheetName);
  var headers = lireEntetes_(sheet, config.headerRow);
  var dateColumn = trouverColonne_(headers, ['date de reception', 'date reception', 'date', 'recu le']);
  if (!dateColumn) throw new Error('Ajoutez une colonne « Date de réception » pour synchroniser uniquement les leads du jour.');
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var count = 0;
  for (var row = config.headerRow + 1; row <= sheet.getLastRow(); row += 1) {
    if (dateColumn) {
      var rowDate = formaterDate_(sheet.getRange(row, dateColumn).getValue());
      if (rowDate !== today) continue;
    }
    if (synchroniserLigne_(sheet, row, config, headers)) count += 1;
  }
  SpreadsheetApp.getUi().alert(count + " lead(s) d'aujourd'hui synchronisé(s)." );
}

function synchroniserLigne_(sheet, row, config, existingHeaders) {
  if (row <= config.headerRow) return false;
  var headers = existingHeaders || lireEntetes_(sheet, config.headerRow);
  var idColumn = assurerColonne_(sheet, headers, 'CRM_SYNC_ID', config.headerRow);
  headers = lireEntetes_(sheet, config.headerRow);
  var statusColumn = assurerColonne_(sheet, headers, 'CRM_SYNC_STATUS', config.headerRow);
  headers = lireEntetes_(sheet, config.headerRow);
  var values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

  var nom = lireValeur_(values, headers, ['nom du client', 'nom client', 'client', 'nom', 'raison sociale']);
  if (!String(nom || '').trim()) return false;

  var syncId = values[idColumn - 1];
  if (!syncId) {
    syncId = Utilities.getUuid();
    sheet.getRange(row, idColumn).setValue(syncId);
  }

  var payload = {
    sheetLeadId: String(syncId),
    codeClientUltex: lireValeur_(values, headers, ['code client', 'code client ultex', 'code']),
    nom: nom,
    telephone: lireValeur_(values, headers, ['telephone', 'tel', 'contact', 'whatsapp']),
    email: lireValeur_(values, headers, ['email', 'e-mail']),
    ville: lireValeur_(values, headers, ['ville']),
    dateReception: formaterDateHeure_(lireValeur_(values, headers, ['date de reception', 'date reception', 'date', 'recu le'])) || new Date().toISOString(),
    objectifGeneral: lireValeur_(values, headers, ['besoin', 'produit', 'objet', 'objectif general', 'demande']),
    typeDemande: lireValeur_(values, headers, ['type de demande', 'type demande']),
    sensOperation: lireValeur_(values, headers, ['sens operation', 'operation', 'type operation']),
    urgence: lireValeur_(values, headers, ['urgence', 'priorite']),
    budgetGlobalEstime: nombreOuVide_(lireValeur_(values, headers, ['budget', 'budget estime', 'budget global estime'])),
    remarque: lireValeur_(values, headers, ['remarque', 'notes', 'observation']),
    responsableData: lireValeur_(values, headers, ['responsable data', 'assigne a', 'responsable']) || 'Data',
    dataTag: lireValeur_(values, headers, ['data tag', 'tag data', 'statut data']),
    echeanceCode: formaterDate_(lireValeur_(values, headers, ['echeance code', 'date traitement', 'a traiter le', 'echeance'])),
    actionSuivante: lireValeur_(values, headers, ['action suivante', 'prochaine action']),
    source: lireValeur_(values, headers, ['source', 'origine']) || 'Google',
  };

  try {
    var response = UrlFetchApp.fetch(config.url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-ULTEX-SYNC-KEY': config.apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var ok = response.getResponseCode() >= 200 && response.getResponseCode() < 300;
    sheet.getRange(row, statusColumn).setValue(
      (ok ? 'OK ' : 'ERREUR ') + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
    );
    if (!ok) throw new Error('CRM HTTP ' + response.getResponseCode() + ' : ' + response.getContentText());
    return true;
  } catch (error) {
    sheet.getRange(row, statusColumn).setValue('ERREUR : ' + error.message);
    throw error;
  }
}

function lireConfiguration_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('CRM_SYNC_URL');
  var apiKey = props.getProperty('CRM_SYNC_API_KEY');
  if (!url || !apiKey) throw new Error('Configurez CRM_SYNC_URL et CRM_SYNC_API_KEY dans les propriétés du script.');
  return {
    url: url,
    apiKey: apiKey,
    sheetName: props.getProperty('CRM_SHEET_NAME') || 'Leads',
    headerRow: Number(props.getProperty('CRM_HEADER_ROW') || 1),
  };
}

function normaliser_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function lireEntetes_(sheet, headerRow) {
  return sheet.getRange(headerRow, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(normaliser_);
}

function trouverColonne_(headers, aliases) {
  var normalizedAliases = aliases.map(normaliser_);
  var index = headers.findIndex(function(header) { return normalizedAliases.indexOf(header) >= 0; });
  return index >= 0 ? index + 1 : 0;
}

function assurerColonne_(sheet, headers, label, headerRow) {
  var existing = trouverColonne_(headers, [label]);
  if (existing) return existing;
  var column = sheet.getLastColumn() + 1;
  sheet.getRange(headerRow, column).setValue(label);
  return column;
}

function lireValeur_(values, headers, aliases) {
  var column = trouverColonne_(headers, aliases);
  return column ? values[column - 1] : '';
}

function formaterDate_(value) {
  if (!value) return '';
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value).slice(0, 10);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formaterDateHeure_(value) {
  if (!value) return '';
  var date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function nombreOuVide_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var number = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return isNaN(number) ? null : number;
}

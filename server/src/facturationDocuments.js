import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, '..', 'templates', 'facturation-recus');

export const FACTURATION_TEMPLATES = {
  resiliation_demande: {
    label: 'Résiliation — demande du client', family: 'resiliation', template: 'resiliation_demande.docx', prefix: 'RESDEM', transport: null,
  },
  resiliation_contrat: {
    label: 'Résiliation — contrat', family: 'resiliation', template: 'resiliation_contrat.docx', prefix: 'RESCON', transport: null,
  },
  recu_sn_tiers: {
    label: 'Reçu sourcing / négociation — autre payeur', family: 'recu', template: 'recu_sn_tiers.docx', prefix: 'IMRPS/N', transport: null, tiers: true,
  },
  recu_confirmation_tiers: {
    label: 'Reçu confirmation — autre payeur', family: 'recu', template: 'recu_confirmation_tiers.docx', prefix: 'IMRPM/A', transport: null, tiers: true,
  },
  recu_sn: {
    label: 'Reçu sourcing / négociation', family: 'recu', template: 'recu_sn.docx', prefix: 'IMRPS/N', transport: null,
  },
  recu_confirmation: {
    label: 'Reçu confirmation', family: 'recu', template: 'recu_confirmation.docx', prefix: 'IMRPM/A', transport: null,
  },
  bon_livraison_maritime: {
    label: 'Bon de livraison maritime', family: 'livraison', template: 'bon_livraison_maritime.docx', prefix: 'IMBLM', transport: 'Maritime',
  },
  bon_livraison_aerien: {
    label: 'Bon de livraison aérien', family: 'livraison', template: 'bon_livraison_aerien.docx', prefix: 'IMBLA', transport: 'Aérien',
  },
  facture_partielle_maritime: {
    label: 'Facture partielle maritime', family: 'facture', template: 'facture_partielle_maritime.docx', prefix: 'IMFM', transport: 'Maritime', partial: true,
  },
  facture_partielle_aerien: {
    label: 'Facture partielle aérienne', family: 'facture', template: 'facture_partielle_aerien.docx', prefix: 'IMFA', transport: 'Aérien', partial: true,
  },
  facture_finale_maritime: {
    label: 'Facture finale maritime', family: 'facture', template: 'facture_finale_maritime.docx', prefix: 'IMFM', transport: 'Maritime', partial: false,
  },
  facture_finale_aerien: {
    label: 'Facture finale aérienne', family: 'facture', template: 'facture_finale_aerien.docx', prefix: 'IMFA', transport: 'Aérien', partial: false,
  },
};

const XML_ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function decodeXml(value = '') {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, match => XML_ENTITY[match] || match);
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalize(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function elementText(xml = '') {
  return decodeXml([...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => match[1]).join(''));
}

function textNodes(value) {
  const lines = String(value ?? '').replace(/\r/g, '').split('\n');
  return lines.map((line, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join('');
}

function replaceElementText(xml, value) {
  let first = true;
  return xml.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, () => {
    if (!first) return '<w:t></w:t>';
    first = false;
    return textNodes(value);
  });
}

function replaceParagraph(xml, matcher, value, { all = false } = {}) {
  let replaced = 0;
  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, paragraph => {
    if (!all && replaced) return paragraph;
    const current = normalize(elementText(paragraph));
    if (!matcher(current)) return paragraph;
    replaced += 1;
    return replaceElementText(paragraph, value);
  });
}

function replaceByPrefix(xml, prefix, value, options) {
  const wanted = normalize(prefix);
  return replaceParagraph(xml, text => text.startsWith(wanted), value, options);
}

function replaceByContains(xml, fragment, value, options) {
  const wanted = normalize(fragment);
  return replaceParagraph(xml, text => text.includes(wanted), value, options);
}

function forceParagraphTextColor(xml, matcher, color) {
  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, paragraph => {
    if (!matcher(normalize(elementText(paragraph)))) return paragraph;
    return paragraph.replace(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/g, properties => {
      if (/<w:color(?:\s[^>]*)?\/>/.test(properties)) {
        return properties.replace(/<w:color(?:\s[^>]*)?\/>/g, `<w:color w:val="${color}"/>`);
      }
      return properties.replace('</w:rPr>', `<w:color w:val="${color}"/></w:rPr>`);
    });
  });
}

function mapTable(xml, tableIndex, transform) {
  let index = -1;
  return xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g, table => {
    index += 1;
    return index === tableIndex ? transform(table) : table;
  });
}

function splitRows(tableXml) {
  return [...tableXml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map(match => match[0]);
}

function replaceRows(tableXml, rows) {
  const matches = [...tableXml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)];
  if (!matches.length) return tableXml;
  const first = matches[0];
  const last = matches[matches.length - 1];
  return `${tableXml.slice(0, first.index)}${rows.join('')}${tableXml.slice(last.index + last[0].length)}`;
}

function replaceCell(rowXml, cellIndex, value) {
  let index = -1;
  return rowXml.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, cell => {
    index += 1;
    return index === cellIndex ? replaceElementText(cell, value) : cell;
  });
}

function fillRow(rowXml, values) {
  return values.reduce((xml, value, index) => replaceCell(xml, index, value), rowXml);
}

function cellParagraphs(cellXml) {
  return [...cellXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(match => match[0]);
}

function replaceCellParagraphs(rowXml, cellIndex, paragraphs) {
  let index = -1;
  return rowXml.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, cell => {
    index += 1;
    if (index !== cellIndex) return cell;
    const opening = cell.match(/^<w:tc(?:\s[^>]*)?>/)?.[0] || '<w:tc>';
    const properties = cell.match(/<w:tcPr(?:\s[^>]*)?>[\s\S]*?<\/w:tcPr>/)?.[0] || '';
    return `${opening}${properties}${paragraphs.join('')}</w:tc>`;
  });
}

function paragraphPrototype(paragraphs, preferredIndex = 0) {
  const populated = paragraphs.filter(paragraph => normalize(elementText(paragraph)));
  return populated[preferredIndex] || populated[0] || paragraphs[preferredIndex] || paragraphs[0]
    || '<w:p><w:r><w:t></w:t></w:r></w:p>';
}

/** Keep the template's grouped invoice row: one underlined group heading and
 * aligned multiline values in the REF / LIBELLE / Valeur columns. */
function fillInvoiceGroupRow(rowXml, heading, items, startReference) {
  const cells = [...rowXml.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map(match => match[0]);
  if (cells.length < 3) return rowXml;

  const refParagraphs = cellParagraphs(cells[0]);
  const labelParagraphs = cellParagraphs(cells[1]);
  const valueParagraphs = cellParagraphs(cells[2]);
  const refPrototype = paragraphPrototype(refParagraphs);
  const headingPrototype = paragraphPrototype(labelParagraphs);
  const labelPrototype = paragraphPrototype(labelParagraphs, 1);
  const valuePrototype = paragraphPrototype(valueParagraphs);
  const safeItems = items.length ? items : [{ label: '', amount: '' }];

  const refs = [
    replaceElementText(refPrototype, ''),
    ...safeItems.map((_, index) => replaceElementText(refPrototype, items.length ? startReference + index : '')),
  ];
  const labels = [
    replaceElementText(headingPrototype, heading),
    ...safeItems.map(item => replaceElementText(labelPrototype, item.label || '')),
  ];
  const values = [
    replaceElementText(valuePrototype, ''),
    ...safeItems.map(item => replaceElementText(valuePrototype, item.label || Number(item.amount) ? formatMoney(item.amount) : '')),
  ];

  let next = rowXml.replace(/<w:trHeight(?:\s[^>]*)?\/>/g, '');
  next = replaceCellParagraphs(next, 0, refs);
  next = replaceCellParagraphs(next, 1, labels);
  next = replaceCellParagraphs(next, 2, values);
  return next;
}

function formatDate(value) {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatMoney(value) {
  const amount = Number(String(value ?? 0).replace(/\s/g, '').replace(',', '.'));
  return `${Number.isFinite(amount) ? amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, ' ') : '0,00'} MAD`;
}

function quantity(line, key) {
  const amount = line?.[key] ?? line?.quantite ?? '';
  return [amount, line?.unite || ''].filter(value => value !== '' && value !== null && value !== undefined).join(' ');
}

function fillIdentityTable(xml, data) {
  return mapTable(xml, 0, table => {
    const rows = splitRows(table);
    if (!rows.length) return table;
    const cells = [...rows[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map(match => match[0]);
    if (cells.length < 2) return table;
    const paragraphs = cellParagraphs(cells[1]);
    const prototype = index => paragraphs[index] || paragraphPrototype(paragraphs, Math.min(index, 1));
    const body = [
      replaceElementText(prototype(0), 'À '),
      replaceElementText(prototype(1), `Nom du Client : ${data.clientName || ''}`),
      replaceElementText(prototype(2), ''),
      replaceElementText(prototype(3), `CIN : ${data.cin || ''}`),
      replaceElementText(prototype(4), `Adresse : ${[data.address, data.city].filter(Boolean).join(', ')}`),
      replaceElementText(prototype(5), `Code Client : ${data.clientCode || ''}`),
      replaceElementText(prototype(6), `Contact : ${data.phone || ''}`),
    ];
    rows[0] = replaceCellParagraphs(rows[0], 1, body);
    return replaceRows(table, rows);
  });
}

function fillDeliveryIdentityTable(xml, data) {
  return mapTable(xml, 0, table => {
    const rows = splitRows(table);
    if (!rows.length) return table;
    const cells = [...rows[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map(match => match[0]);
    if (cells.length < 2) return table;
    const paragraphs = cellParagraphs(cells[1]);
    const prototype = index => paragraphs[index] || paragraphPrototype(paragraphs, Math.min(index, 1));
    const body = [
      replaceElementText(prototype(0), 'A :'),
      replaceElementText(prototype(1), data.clientName || ''),
      replaceElementText(prototype(2), `Code client : ${data.clientCode || ''}`),
      replaceElementText(prototype(3), `Adresse : ${[data.address, data.city].filter(Boolean).join(', ')}`),
      replaceElementText(prototype(4), `CIN : ${data.cin || ''}`),
      replaceElementText(prototype(5), `Téléphone : ${data.phone || ''}`),
    ];
    rows[0] = replaceCellParagraphs(rows[0], 1, body);
    return replaceRows(table, rows);
  });
}

function fillReceipt(xml, data, definition) {
  xml = fillIdentityTable(xml, data);
  xml = replaceByPrefix(xml, 'Reçu de paiement N°', `Reçu de paiement N° : ${data.reference || ''}`);
  xml = forceParagraphTextColor(xml, text => text.startsWith(normalize('Reçu de paiement N°')), '000000');
  const isConfirmation = definition.prefix === 'IMRPM/A';
  const paymentText = isConfirmation
    ? `La société ULTEx reconnaît avoir reçu le ${formatDate(data.paymentDate)}, la somme de ${formatMoney(data.amount)} de la part du client ${data.clientName || ''} correspondant au service d’importation ${data.product || data.service || ''} en provenance de ${data.originCountry || ''} vers le Maroc par transport ${data.transportMode || ''}, comme il est défini au devis N° ${data.quoteReference || ''} et le contrat de prestation de services N° ${data.contractReference || ''}.`
    : `La société ULTEx reconnaît avoir reçu le ${formatDate(data.paymentDate)}, la somme de ${formatMoney(data.amount)} de la part du client ${data.clientName || ''} correspondant au service ${data.service || 'sourcing / négociation'} pour l’importation en provenance de ${data.originCountry || ''} vers le Maroc.`;
  xml = replaceByPrefix(xml, 'La société ULTEx reconnaît', paymentText);
  if (definition.tiers) {
    xml = replaceByPrefix(xml, 'Le client', `Le client ${data.clientName || ''} déclare avoir ordonné à ${data.payerName || ''} d’effectuer le présent virement, qui est lié à sa commande traitée avec la société ULTEx.`);
  }
  xml = replaceByPrefix(xml, 'Le paiement a été reçu', `Le paiement a été reçu sous la forme de ${data.paymentMethod || ''}.`);
  return xml;
}

function fillCancellationRequest(xml, data) {
  xml = replaceByPrefix(xml, 'Objet :', "Objet : Annulation de commande et remboursement de l'avance");
  xml = replaceByPrefix(xml, 'Cher ULTEx', 'Cher ULTEx,');
  xml = replaceByPrefix(xml, 'Je vous écris', `Je vous écris pour vous informer de ma décision d'annuler ma commande, référencée N° ${data.orderReference || ''}, relative au devis N° ${data.quoteReference || ''}, au bon de commande N° ${data.purchaseOrderReference || ''} et au contrat de prestation de service N° ${data.contractReference || ''}, passée le ${formatDate(data.orderDate)}, pour importer ${data.product || 'la marchandise'} en provenance de ${data.originCountry || ''} vers le Maroc par transport ${data.transportMode || ''}.`);
  xml = replaceByPrefix(xml, 'Je vous prie également', `Je vous prie également de bien vouloir procéder au remboursement de l'avance que j'ai versée pour cette commande. Le montant de l'avance, soit ${formatMoney(data.advanceAmount)}, a été réglé ${data.advanceDates || ''}. Je vous serais reconnaissant de bien vouloir effectuer le remboursement dans les plus brefs délais, conformément à vos politiques en matière de remboursement.`);
  xml = replaceParagraph(xml, text => /^le \d{1,2}\//.test(text), `Le ${formatDate(data.documentDate)}`);
  xml = replaceByContains(xml, 'CIN :', `CIN : ${data.cin || ''}`);
  xml = replaceParagraph(xml, text => text.startsWith('tel'), `TEL : ${data.phone || ''}`);
  xml = replaceParagraph(xml, text => text === normalize(data.sampleClientName || 'Mohamed AIT BOUHMID') || text.includes('mohamed ait bouhmid'), data.clientName || '');
  return xml;
}

function fillCancellationContract(xml, data) {
  xml = replaceByPrefix(xml, 'Le client', `${data.clientName || ''}, habitant à ${data.address || ''} et titulaire de la CIN ${data.cin || ''}, ci-après dénommé « le Client ».`);
  xml = replaceByPrefix(xml, 'Attendu que', `Attendu que ${data.clientName || ''} a pris l'initiative de résilier le contrat de prestation de service conclu avec la société ULTEx en raison des circonstances spécifiées dans sa demande d’annulation.`);
  xml = replaceByPrefix(xml, 'N°IMCPSM', `N° ${data.contractReference || ''} relatif au devis N° ${data.quoteReference || ''}, conclu entre la société ULTEx et le Client ${data.clientName || ''}.`);
  xml = replaceParagraph(xml, text => text.startsWith('client') && text.includes('*'), '');
  xml = replaceParagraph(xml, text => text.startsWith('suite à l') && text.includes('résiliation'), `Suite à l'initiative de résiliation du Client ${data.clientName || ''}, et à la réception de ladite demande par la société ULTEx, le contrat de prestation de service N° ${data.contractReference || ''} est résilié de plein droit.`);
  xml = replaceByPrefix(xml, 'Conformément à la demande', `Conformément à la demande de résiliation, la société ULTEx s'engage à rembourser au Client ${data.clientName || ''} le montant d’avance de ${formatMoney(data.advanceAmount)}, payé le ${formatDate(data.paymentDate)}, moins ${formatMoney(data.commitmentFee)} correspondant aux frais d’engagement.`);
  xml = replaceParagraph(xml, text => text.includes('délai de remboursement'), `(Le délai de remboursement est de ${data.refundDelay || '40 jours ouvrables'})`);
  xml = replaceByPrefix(xml, 'Fait à', `Fait à ${data.place || 'Marrakech'}, le ${formatDate(data.documentDate)}.`);
  return xml;
}

function fillDelivery(xml, data) {
  xml = fillDeliveryIdentityTable(xml, data);
  xml = replaceByPrefix(xml, 'Bon de livraison N°', `Bon de livraison N° ${data.reference || ''}`);
  xml = replaceByPrefix(xml, 'Votre commande de', `Votre commande du : ${formatDate(data.orderDate)}`);
  xml = replaceByPrefix(xml, 'Votre dossier de', `Votre dossier du : ${formatDate(data.orderDate)}`);
  xml = replaceByPrefix(xml, 'Adresse de stockage', `Adresse de stockage : ${data.storageAddress || data.address || ''}`);
  xml = replaceByPrefix(xml, 'Date de réception', `Date de réception : ${formatDate(data.receptionDate)}                       Colisage :`);

  xml = mapTable(xml, 1, table => {
    const rows = splitRows(table);
    if (rows.length < 2) return table;
    const header = rows[0];
    const prototypes = rows.slice(1);
    const prototype = prototypes.reduce((best, row) => elementText(row).length > elementText(best || '').length ? row : best, prototypes[0]);
    const lines = (data.lines || []).length ? data.lines : [{}];
    const body = lines.map((line, index) => fillRow(prototype, [
      line.reference || String(index + 1).padStart(5, '0'),
      line.description || line.nomProduit || '',
      quantity(line, 'orderedQuantity'),
      quantity(line, 'deliveredQuantity'),
      line.observations || '',
    ]));
    return replaceRows(table, [header, ...body]);
  });

  xml = mapTable(xml, 2, table => {
    const rows = splitRows(table);
    if (rows[1]) rows[1] = fillRow(rows[1], [data.packages || '', data.weight || '', data.dimensions || '***']);
    return replaceRows(table, rows);
  });
  return xml;
}

function fillInvoice(xml, data, definition) {
  const title = definition.partial ? 'FACTURE PARTIELLE' : 'FACTURE';
  xml = replaceParagraph(xml, text => text.startsWith('facture') && text.includes('no'), `${title} No : ${data.reference || ''}`, { all: true });
  xml = replaceByPrefix(xml, 'CLIENT N°', `CLIENT N° : ${data.clientCode || ''}`, { all: true });
  xml = replaceByPrefix(xml, 'Nom du client', `Nom du client : ${data.clientName || ''}`, { all: true });
  xml = replaceByPrefix(xml, 'CIN', `CIN : ${data.cin || ''}`, { all: true });
  xml = replaceByPrefix(xml, 'ICE', `ICE : ${data.ice || ''}`, { all: true });
  xml = replaceByPrefix(xml, 'Contact', `Contact : ${data.phone || ''}`, { all: true });
  xml = replaceByPrefix(xml, 'DATE', `DATE : ${formatDate(data.documentDate)}`, { all: true });
  const qualifier = definition.partial ? 'Facture partielle' : 'Facture';
  xml = replaceByPrefix(xml, 'OBJET', `OBJET : ${qualifier} d’importation ${data.product || data.object || ''} en provenance de ${data.originCountry || ''} vers le Maroc par transport ${String(definition.transport || '').toLowerCase()}.`);
  if (!definition.partial) xml = replaceByPrefix(xml, 'Adresse de stockage', `Adresse de stockage donnée par le client : ${data.storageAddress || data.address || ''}`);
  if (data.bankName) xml = replaceByPrefix(xml, 'Banque', `Banque : ${data.bankName}`);
  if (data.bankReference) xml = replaceByPrefix(xml, 'Référence bancaire', `Référence bancaire : ${data.bankReference}`);
  if (data.swift) xml = replaceByPrefix(xml, 'BIC-Adresse SWIFT', `BIC-Adresse SWIFT : ${data.swift}`);

  const items = (data.items || []).filter(item => item && (item.label || Number(item.amount)));
  const operation = items.filter(item => item.category !== 'service');
  const service = items.filter(item => item.category === 'service');
  const total = data.totalAmount !== undefined && data.totalAmount !== ''
    ? Number(data.totalAmount)
    : items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  xml = mapTable(xml, 0, table => {
    const rows = splitRows(table);
    if (rows.length < 4) return table;
    const operationRow = fillInvoiceGroupRow(rows[1], 'Acompte', operation, 1);
    const serviceRow = fillInvoiceGroupRow(rows[2], 'Prestation de service', service, operation.length + 1);
    const totalRow = fillRow(rows[3], ['Total en MAD', formatMoney(total)]);
    return replaceRows(table, [rows[0], operationRow, serviceRow, totalRow]);
  });
  return xml;
}

function fillDocumentXml(xml, key, data) {
  const definition = FACTURATION_TEMPLATES[key];
  if (definition.family === 'recu') return fillReceipt(xml, data, definition);
  if (definition.family === 'livraison') return fillDelivery(xml, data, definition);
  if (definition.family === 'facture') return fillInvoice(xml, data, definition);
  if (key === 'resiliation_demande') return fillCancellationRequest(xml, data);
  if (key === 'resiliation_contrat') return fillCancellationContract(xml, data);
  return xml;
}

export function publicTemplateDefinitions() {
  return Object.entries(FACTURATION_TEMPLATES).map(([key, value]) => ({ key, ...value, template: undefined }));
}

export async function generateFacturationDocx(templateKey, input = {}) {
  const definition = FACTURATION_TEMPLATES[templateKey];
  if (!definition) throw new Error('Modèle de document inconnu');
  const templatePath = path.join(TEMPLATE_DIR, definition.template);
  const template = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(template);
  const documentPart = zip.file('word/document.xml');
  if (!documentPart) throw new Error('Modèle Word invalide');
  const originalXml = await documentPart.async('string');
  const nextXml = fillDocumentXml(originalXml, templateKey, input);
  zip.file('word/document.xml', nextXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function convertDocxToPdf(docxBuffer) {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ubos-facturation-'));
  const inputPath = path.join(temporaryDirectory, 'document.docx');
  const outputPath = path.join(temporaryDirectory, 'document.pdf');
  const executable = process.env.LIBREOFFICE_BIN || 'soffice';

  try {
    await fs.writeFile(inputPath, docxBuffer);
    await new Promise((resolve, reject) => {
      const child = spawn(executable, [
        '--headless',
        '--nologo',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        '--convert-to', 'pdf',
        '--outdir', temporaryDirectory,
        inputPath,
      ], {
        env: {
          ...process.env,
          HOME: temporaryDirectory,
          TMPDIR: temporaryDirectory,
          SAL_USE_VCLPLUGIN: 'svp',
        },
        windowsHide: true,
      });
      let output = '';
      let errors = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('La conversion PDF a dépassé le délai autorisé'));
      }, 90_000);
      child.stdout.on('data', chunk => { output += chunk.toString(); });
      child.stderr.on('data', chunk => { errors += chunk.toString(); });
      child.once('error', error => {
        clearTimeout(timer);
        reject(new Error(`Convertisseur PDF indisponible: ${error.message}`));
      });
      child.once('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Échec de la conversion PDF (${code}): ${errors || output || 'erreur inconnue'}`));
      });
    });
    const pdfBuffer = await fs.readFile(outputPath).catch(() => {
      throw new Error('LibreOffice n’a créé aucun fichier PDF');
    });
    if (!pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('Le convertisseur n’a pas produit un PDF valide');
    }
    return pdfBuffer;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

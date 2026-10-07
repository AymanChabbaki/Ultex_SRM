import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { FACTURATION_TEMPLATES, generateFacturationDocx } from '../src/facturationDocuments.js';

const outDir = process.argv[2] || path.resolve('.tmp', 'facturation-generated');
await fs.mkdir(outDir, { recursive: true });

const sample = {
  reference: 'TEST-FACT-2026', clientCode: 'L7001', clientName: 'Client Démonstration', cin: 'AB123456', ice: '001122334455667',
  phone: '+212 600-000000', address: '10 Avenue Exemple, Casablanca', city: 'Casablanca', documentDate: '2026-10-07',
  orderDate: '2026-09-18', paymentDate: '2026-09-20', receptionDate: '2026-10-05', orderReference: 'CMD-2026-001',
  quoteReference: 'IMDM9000-1026', purchaseOrderReference: 'IMBCM9000-1026', contractReference: 'IMCPSM9000-1026',
  product: 'Machines de conditionnement', service: 'Sourcing et négociation', payerName: 'Mandataire Démonstration', paymentMethod: 'Virement',
  originCountry: 'Chine', transportMode: 'Maritime', amount: 12500, advanceAmount: 90000, commitmentFee: 5000,
  advanceDates: 'le 20/09/2026 en une tranche', refundDelay: '40 jours ouvrables', place: 'Marrakech', storageAddress: 'Zone industrielle, Casablanca',
  packaging: '3 palettes', packages: '3 palettes', weight: '1 250 KGS', dimensions: 'Conteneur 20 pieds',
  bankName: 'Banque CFG', bankReference: '050450007011083735200133', swift: 'CAFGMAMC', totalAmount: 143700,
  lines: [
    { reference: '00001', description: 'Machine de conditionnement', orderedQuantity: 2, deliveredQuantity: 2, unite: 'pcs', observations: 'Conforme' },
    { reference: '00002', description: 'Jeu de pièces de rechange', orderedQuantity: 1, deliveredQuantity: 1, unite: 'lot', observations: '' },
  ],
  items: [
    { category: 'operation', label: 'Total importé', amount: 100000 },
    { category: 'operation', label: 'Transport international', amount: 25000 },
    { category: 'operation', label: 'Droits d’import et TVA', amount: 15000 },
    { category: 'service', label: 'Frais de service HT', amount: 3000 },
    { category: 'service', label: 'TVA', amount: 700 },
  ],
};

for (const key of Object.keys(FACTURATION_TEMPLATES)) {
  const buffer = await generateFacturationDocx(key, sample);
  const file = path.join(outDir, `${key}.docx`);
  await fs.writeFile(file, buffer);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => match[1]).join(' ')
    .replace(/&(amp|lt|gt|quot|apos);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[entity] || entity));
  if (!text.includes('Client Démonstration')) throw new Error(`${key}: client non injecté`);
  if (!text.includes('TEST-FACT-2026') && !key.startsWith('resiliation_')) throw new Error(`${key}: référence non injectée`);
  const forbidden = ['Mohamed AIT BOUHMID', 'Abdelhamid AKHOUZINE', 'NEXIMALL SARL', 'IMDM7684-0426', 'IMBCM0498-0426', '142 733', '240 220'];
  const leftover = forbidden.find(value => text.includes(value));
  if (leftover) throw new Error(`${key}: donnée exemple encore présente (${leftover})`);
  if (/\*{3,}/.test(text)) throw new Error(`${key}: placeholder non remplacé`);

  if (FACTURATION_TEMPLATES[key].family === 'facture') {
    const table = xml.match(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/)?.[0] || '';
    const rowCount = [...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].length;
    const expectedRows = 1 + sample.items.length + 1;
    if (rowCount !== expectedRows) throw new Error(`${key}: ${rowCount} lignes au lieu de ${expectedRows}`);
  }

  const source = await JSZip.loadAsync(await fs.readFile(path.resolve('templates', 'facturation-recus', FACTURATION_TEMPLATES[key].template)));
  for (const part of Object.keys(source.files)) {
    if (part === 'word/document.xml' || source.files[part].dir) continue;
    const [before, after] = await Promise.all([source.file(part).async('nodebuffer'), zip.file(part).async('nodebuffer')]);
    if (!before.equals(after)) throw new Error(`${key}: partie preserve-only modifiée (${part})`);
  }
  console.log(`${key}: ${buffer.length} bytes — OK`);
}

const { chromium } = require('playwright');
const path = require('path');
const SHOT_DIR = 'C:/Users/ULTEXG~1/AppData/Local/Temp/claude/c--Users-ultex-gm-Desktop-Ultex-SRM/8e909f7c-5cac-4f81-8c82-cbbf6f5d2339/scratchpad';

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text()); });

  await page.goto('http://localhost:5173');
  await page.waitForSelector('#logId', { timeout: 15000 });
  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1000);

  // 1. Create a client
  await page.evaluate(() => { window.location.hash = 'clients'; });
  await page.waitForTimeout(400);
  await page.click('button:has-text("+ Ajouter")');
  await page.waitForTimeout(300);
  await page.fill('.modale input >> nth=0', 'Client QA Test');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(500);

  // 2. Create a dossier
  await page.evaluate(() => { window.location.hash = 'dossiers'; });
  await page.waitForTimeout(400);
  await page.click('button:has-text("+ Ajouter")');
  await page.waitForTimeout(300);
  // pick client ref select (first select in modal), fill produit text field
  const selects = page.locator('.modale select');
  await selects.nth(0).selectOption({ index: 1 });
  await page.fill('.modale input[id="f_produit"]', 'Produit QA Test');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(600);

  // Find the created dossier's code by opening the dossiers list and clicking its fiche link
  await page.evaluate(() => { window.location.hash = 'dossiers'; });
  await page.waitForTimeout(400);
  const dossierLink = page.locator('table a:has-text("DOS")').first();
  const dossierHref = await dossierLink.getAttribute('href');
  console.log('Created dossier link:', dossierHref);
  await page.evaluate((h) => { window.location.hash = h.replace('#',''); }, dossierHref);
  await page.waitForTimeout(600);
  await shot(page, 'p5-01-fiche-dossier-empty-sections.png');

  // 3. Use "+ Ajouter" on Paiements section
  const paiementsHeader = page.locator('h4:has-text("Paiements")').first();
  await paiementsHeader.locator('button:has-text("+ Ajouter")').click();
  await page.waitForTimeout(400);
  await page.selectOption('.modale select#f_nature', { index: 1 }).catch(()=>{});
  await page.fill('.modale input#f_montant', '5000');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(600);
  await shot(page, 'p5-02-fiche-dossier-paiement-added.png');

  console.log('=== ERRORS SO FAR ===');
  console.log(errors.length ? JSON.stringify(errors, null, 2) : 'NONE');

  await browser.close();
})().catch(e => { console.error('SCRIPT FAILED', e); process.exit(1); });

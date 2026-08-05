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
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text().slice(0, 150)); });

  await page.goto('http://localhost:5173');
  await page.waitForSelector('#logId', { timeout: 15000 });
  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1000);

  // ---- Setup: client + dossier (fresh browser session = fresh localStorage) ----
  await page.evaluate(() => { window.location.hash = 'clients'; });
  await page.waitForTimeout(400);
  await page.click('button:has-text("+ Ajouter")');
  await page.waitForTimeout(300);
  await page.fill('.modale input >> nth=0', 'Client QA Test');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(500);

  await page.evaluate(() => { window.location.hash = 'dossiers'; });
  await page.waitForTimeout(400);
  await page.click('button:has-text("+ Ajouter")');
  await page.waitForTimeout(300);
  await page.locator('.modale select').nth(0).selectOption({ index: 1 });
  await page.fill('.modale input#f_produit', 'Produit QA Test');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(500);

  // ---- FicheDossier: create a Facture Finale via "+ Ajouter" in Factures Finales section ----
  await page.evaluate(() => { window.location.hash = 'dossiers'; });
  await page.waitForTimeout(400);
  await page.click('table a:has-text("DOS")');
  await page.waitForTimeout(600);
  const facturesHeader = page.locator('h4:has-text("Factures Finales")').first();
  await facturesHeader.locator('button:has-text("+ Ajouter")').click();
  await page.waitForTimeout(800); // creerFactureDepuisDossier navigates to #ficheFF:...
  await shot(page, 'p6-01-fiche-ff-created.png');
  console.log('URL after creating FF:', await page.evaluate(() => window.location.hash));

  // ---- FicheFF: add a line, validate, check coherence ----
  const ajouterLigneBtn = page.locator('button:has-text("+ Ajouter une ligne")');
  if (await ajouterLigneBtn.count()) {
    await ajouterLigneBtn.click();
    await page.waitForTimeout(400);
    await page.fill('.modale input#f_designation', 'Ligne QA test');
    await page.fill('.modale input#f_prixUnitaire', '1200');
    await page.click('.modale button:has-text("Enregistrer")');
    await page.waitForTimeout(500);
  }
  await page.click('button:has-text("Vérifier la cohérence")');
  await page.waitForTimeout(400);
  await shot(page, 'p6-02-ff-coherence-modal.png');
  await page.click('.modale button:has-text("Fermer")');
  await page.waitForTimeout(300);

  const validerBtn = page.locator('button:has-text("Valider")');
  page.once('dialog', d => d.accept());
  if (await validerBtn.count()) {
    await validerBtn.click();
    await page.waitForTimeout(500);
  }
  await shot(page, 'p6-03-ff-validated.png');

  // ---- FicheArrivage: create one, add dossier to groupage, add frais ----
  await page.evaluate(() => { window.location.hash = 'arrivages'; });
  await page.waitForTimeout(400);
  await page.click('button:has-text("+ Ajouter")');
  await page.waitForTimeout(300);
  await page.fill('.modale input#f_nomInterne', 'Arrivage QA Test');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(500);
  await page.click('table a[href*="ficheArrivage"]');
  await page.waitForTimeout(500);

  await page.click('button:has-text("+ Ajouter Dossier")');
  await page.waitForTimeout(300);
  await page.selectOption('.modale select', { index: 1 });
  await page.click('.modale button:has-text("Ajouter")');
  await page.waitForTimeout(400);

  await page.click('button:has-text("+ Ajouter Frais")');
  await page.waitForTimeout(300);
  await page.selectOption('.modale select#f_typeFrais', { index: 1 });
  await page.fill('.modale input#f_montant', '300');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(500);
  await shot(page, 'p6-04-fiche-arrivage-groupage-frais.png');

  console.log('=== ERRORS ===');
  console.log(errors.length ? JSON.stringify([...new Set(errors)], null, 2) : 'NONE');

  await browser.close();
})().catch(e => { console.error('SCRIPT FAILED', e); process.exit(1); });

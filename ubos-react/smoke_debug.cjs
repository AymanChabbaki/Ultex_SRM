const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message, '\n', e.stack));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE:', msg.text()); });

  await page.goto('http://localhost:5173');
  await page.waitForSelector('#logId', { timeout: 15000 });
  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1000);

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

  await page.evaluate(() => { window.location.hash = 'dossiers'; });
  await page.waitForTimeout(400);
  await page.click('table a:has-text("DOS")');
  await page.waitForTimeout(600);

  const facturesHeader = page.locator('h4:has-text("Factures Finales")').first();
  await facturesHeader.locator('button:has-text("+ Ajouter")').click();
  await page.waitForTimeout(1500);

  console.log('URL:', await page.evaluate(() => window.location.hash));
  console.log('Body length:', (await page.locator('body').innerText()).length);

  await browser.close();
})().catch(e => { console.error('SCRIPT FAILED', e); process.exit(1); });

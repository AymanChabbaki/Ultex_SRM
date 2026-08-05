const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  let errors = [];
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text().slice(0, 80)); });

  const checkpoint = async (label) => {
    await page.waitForTimeout(200);
    console.log(`[${label}] errors so far: ${errors.length}`);
    errors = [];
  };

  await page.goto('http://localhost:5173');
  await page.waitForSelector('#logId', { timeout: 15000 });
  await checkpoint('page loaded (login screen)');

  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1000);
  await checkpoint('after login (dashboard)');

  await page.evaluate(() => { window.location.hash = 'clients'; });
  await checkpoint('clients list');

  await page.evaluate(() => { window.location.hash = 'dossiers'; });
  await checkpoint('dossiers list');

  await page.click('button:has-text("+ Ajouter")');
  await page.waitForTimeout(300);
  await checkpoint('dossier add form opened');

  await browser.close();
})().catch(e => { console.error('SCRIPT FAILED', e); process.exit(1); });

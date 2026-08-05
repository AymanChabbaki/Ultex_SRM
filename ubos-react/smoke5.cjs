const { chromium } = require('playwright');
const path = require('path');
const SHOT_DIR = 'C:/Users/ULTEXG~1/AppData/Local/Temp/claude/c--Users-ultex-gm-Desktop-Ultex-SRM/8e909f7c-5cac-4f81-8c82-cbbf6f5d2339/scratchpad';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text()); });

  await page.goto('http://localhost:5173');
  await page.waitForSelector('#logId', { timeout: 15000 });
  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1000);

  await page.evaluate(() => { window.location.hash = 'rechercheGlobale'; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p4-recherche-globale.png') });

  // Fiche demande check
  await page.evaluate(() => { window.location.hash = 'ficheDemande:XXX'; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p4-fiche-demande.png') });

  await browser.close();
  console.log('=== ERRORS ===');
  console.log(errors.length ? JSON.stringify(errors, null, 2) : 'NONE');
})().catch(e => { console.error('SCRIPT FAILED', e); process.exit(1); });

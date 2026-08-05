const { chromium } = require('playwright');
const path = require('path');

const SHOT_DIR = 'C:/Users/ULTEXG~1/AppData/Local/Temp/claude/c--Users-ultex-gm-Desktop-Ultex-SRM/8e909f7c-5cac-4f81-8c82-cbbf6f5d2339/scratchpad';

async function login(page, id, pwd) {
  await page.fill('#logId', id);
  await page.fill('#logMdp', pwd);
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text()); });

  await page.goto('http://localhost:5173');
  await page.waitForSelector('#logId', { timeout: 15000 });
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-01-login.png') });

  await login(page, 'oumaima', 'ubos2026');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-02-dashboard.png'), fullPage: true });

  // Navigate to a GenericModule listing (clients)
  await page.evaluate(() => { window.location.hash = 'clients'; });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-03-clients-list.png'), fullPage: true });

  // Open the add form modal
  const addBtn = page.locator('button:has-text("+ Ajouter")').first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOT_DIR, 'p2-04-modal.png') });
    await page.keyboard.press('Escape').catch(() => {});
    const closeBtn = page.locator('.modale header button').first();
    if (await closeBtn.count()) await closeBtn.click();
  }

  // Go to dossiers list then open first fiche if any exist, else just show dossiers list
  await page.evaluate(() => { window.location.hash = 'dossiers'; });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-05-dossiers-list.png'), fullPage: true });

  await browser.close();
  console.log('=== CONSOLE/PAGE ERRORS ===');
  console.log(errors.length ? JSON.stringify(errors, null, 2) : 'NONE');
})().catch(e => { console.error('SCRIPT FAILED', e); process.exit(1); });

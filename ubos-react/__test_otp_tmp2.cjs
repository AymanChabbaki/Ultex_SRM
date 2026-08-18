const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs = await page.locator('input').all();
  await inputs[0].fill('ouiam');
  await inputs[1].fill('ubos2026');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(2500);
  await page.goto('http://localhost:5173/#utilisateurs');
  await page.waitForTimeout(1200);
  const rows = await page.locator('table tbody tr').count();
  console.log('rows:', rows);
  const buttons = await page.locator('table tbody button').allTextContents();
  console.log('buttons:', JSON.stringify(buttons));
  await browser.close();
})();

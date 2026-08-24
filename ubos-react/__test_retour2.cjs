const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext().then(c => c.newPage());
  await page.goto('http://localhost:5173');
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs = await page.locator('input').all();
  await inputs[0].fill('yasser');
  await inputs[1].fill('ubos2026');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.location.hash = '#mesTaches'; });
  await page.waitForTimeout(1200);
  const cartes = await page.locator('.kanban-carte a').all();
  if (cartes.length < 2) { console.log('not enough remaining tasks to test'); await browser.close(); return; }
  await cartes[0].click();
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Fait")').click();
  await page.waitForTimeout(2500);
  console.log('done, no crash');
  await browser.close();
})();

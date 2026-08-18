const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs = await page.locator('input').all();
  await inputs[0].fill('oumaima');
  await inputs[1].fill('ubos2026');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(2500);
  console.log('body text after login attempt:', (await page.locator('body').textContent()).slice(0,300));
  await page.goto('http://localhost:5173/#mesTaches');
  await page.waitForTimeout(1200);
  console.log('mesTaches body text:', (await page.locator('body').textContent()).slice(0,500));
  await browser.close();
})();

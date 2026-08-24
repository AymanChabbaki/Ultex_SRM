const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext().then(c => c.newPage());
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('http://localhost:5173');
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs = await page.locator('input').all();
  await inputs[0].fill('yasser');
  await inputs[1].fill('ubos2026');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.location.hash = '#mesTaches'; });
  await page.waitForTimeout(1200);
  const body = await page.locator('body').textContent();
  console.log('Yasser Mes Taches body snippet:', body.slice(0, 600));
  console.log('Console errors:', JSON.stringify(consoleErrors));
  await browser.close();
})();

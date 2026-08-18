const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('http://localhost:5173');
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs = await page.locator('input').all();
  await inputs[0].fill('test_otp_direction');
  await inputs[1].fill('TestOtp2026!');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(2000);

  await page.goto('http://localhost:5173/#utilisateurs');
  await page.waitForTimeout(1000);

  await page.locator('button:has-text("Désactiver")').first().click();
  await page.waitForTimeout(800);
  await page.locator('button:has-text("Envoyer le code")').click();
  await page.waitForTimeout(2000);
  await page.waitForTimeout(300);
  console.log('MARKER_REQUEST_SENT');
  await browser.close();
})();

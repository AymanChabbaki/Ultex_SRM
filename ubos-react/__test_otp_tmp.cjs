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
  await page.waitForTimeout(2500);
  console.log('URL after login:', page.url());

  await page.goto('http://localhost:5173/#utilisateurs');
  await page.waitForTimeout(1200);
  const rows = await page.locator('table tbody tr').count();
  console.log('user rows:', rows);

  const hasDesactiver = await page.locator('button:has-text("Désactiver")').first().count();
  console.log('Désactiver buttons found:', hasDesactiver);

  if (hasDesactiver > 0) {
    await page.locator('button:has-text("Désactiver")').first().click();
    await page.waitForTimeout(1200);
    console.log('OTP modal visible:', await page.locator('text=Vérification de sécurité').count());

    await page.locator('button:has-text("Envoyer le code")').click();
    await page.waitForTimeout(2000);
    console.log('Step2 code input visible:', await page.locator('text=Code reçu').count());

    // wrong code
    await page.locator('input[placeholder="000000"]').fill('000000');
    await page.locator('button:has-text("Vérifier")').click();
    await page.waitForTimeout(1500);
    console.log('Error after wrong code:', await page.locator('.vide').first().textContent().catch(() => '(none)'));
  }

  console.log('Console errors:', JSON.stringify(consoleErrors.slice(0, 20)));
  await browser.close();
})();

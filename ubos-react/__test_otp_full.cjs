const { chromium } = require('playwright');
const fs = require('fs');

function lastOtpCode(logPath) {
  const content = fs.readFileSync(logPath, 'utf8');
  const matches = [...content.matchAll(/\[TEMP TEST ONLY — REMOVE\] (\d{6})/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

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

  const rows = await page.locator('table tbody tr').count();
  console.log('rows before:', rows);

  await page.locator('button:has-text("Désactiver")').first().click();
  await page.waitForTimeout(800);
  await page.locator('button:has-text("Envoyer le code")').click();
  await page.waitForTimeout(2000);

  const code = lastOtpCode('c:/Users/ultex gm/Desktop/Ultex_SRM/server/server_dev.log');
  console.log('Captured code:', code);

  await page.locator('input[placeholder="000000"]').fill(code);
  await page.locator('button:has-text("Vérifier")').click();
  await page.waitForTimeout(2000);
  console.log('Modal gone (success):', (await page.locator('text=Vérification de sécurité').count()) === 0);

  const bodyTxt1 = await page.locator('body').textContent();
  console.log('Toast mentions désactivé:', bodyTxt1.includes('désactivé'));

  // Now check the "Réactiver" button appears for the same row (elevation should NOT re-prompt for a second gated action)
  await page.waitForTimeout(500);
  const reactiverBtn = page.locator('button:has-text("Réactiver")').first();
  console.log('Réactiver button now present:', await reactiverBtn.count());

  if (await reactiverBtn.count() > 0) {
    await reactiverBtn.click();
    await page.waitForTimeout(1000);
    const modalReappeared = await page.locator('text=Vérification de sécurité').count();
    console.log('OTP modal re-appeared for 2nd action within window (should be 0):', modalReappeared);
    await page.waitForTimeout(1000);
    const bodyTxt2 = await page.locator('body').textContent();
    console.log('Toast mentions réactivé:', bodyTxt2.includes('réactivé'));
  }

  console.log('Console errors:', JSON.stringify(consoleErrors.slice(0, 20)));
  await browser.close();
})();

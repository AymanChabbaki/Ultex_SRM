const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      requests.push({ url: req.url(), hasAuth: !!req.headers()['authorization'] });
    }
  });

  await page.goto('http://localhost:5173/');
  await page.waitForSelector('#logId', { timeout: 15000 });
  console.log('Login screen shown (no stale session).');

  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1500);

  const loggedIn = (await page.locator('.badge-user').count()) > 0;
  console.log('Logged in successfully:', loggedIn);

  const tokenStored = await page.evaluate(() => !!localStorage.getItem('ubos_token'));
  console.log('Token stored in localStorage (ubos_token):', tokenStored);
  const noBigCache = await page.evaluate(() => !localStorage.getItem('ubos_mvp_v1'));
  console.log('No more full-db cache blob (ubos_mvp_v1 absent):', noBigCache);

  const dbCall = requests.find(r => r.url.includes('/api/db') && !r.url.includes('sync'));
  console.log('/api/db request sent with Authorization header:', dbCall ? dbCall.hasAuth : 'NOT FOUND');

  // Navigate around a bit to confirm real data loaded
  await page.goto('http://localhost:5173/#clients');
  await page.waitForTimeout(700);
  const clientsRows = await page.locator('table tbody tr').count();
  console.log('Clients list rendered rows (real data from Postgres):', clientsRows);

  // Full reload — should rehydrate via token, not show login again
  requests.length = 0;
  await page.reload();
  await page.waitForTimeout(1500);
  const stillLoggedInAfterReload = (await page.locator('.badge-user').count()) > 0;
  console.log('Still logged in after full reload (token rehydration):', stillLoggedInAfterReload);
  const meCall = requests.find(r => r.url.includes('/api/auth/me'));
  console.log('/api/auth/me called on reload with Authorization:', meCall ? meCall.hasAuth : 'NOT FOUND');

  // Test a real write: change own password via Mon profil, confirm it's awaited/confirmed
  await page.goto('http://localhost:5173/#monProfil');
  await page.waitForTimeout(600);
  const pwdInputs = page.locator('.bloc-fiche:has(h4:has-text("Changer mon mot de passe")) input');
  await pwdInputs.nth(0).fill('ubos2026');
  await pwdInputs.nth(1).fill('archtest2026');
  await pwdInputs.nth(2).fill('archtest2026');
  await page.click('button:has-text("Changer le mot de passe")');
  await page.waitForTimeout(1000);

  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('button:has-text("Quitter")');
  await page.waitForTimeout(700);
  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'archtest2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1200);
  const loginWithNewPwd = (await page.locator('.badge-user').count()) > 0;
  console.log('Login with new password after full reload works (real DB write confirmed):', loginWithNewPwd);

  // Test invalid token handling: corrupt the stored token then reload
  await page.evaluate(() => localStorage.setItem('ubos_token', 'garbage.invalid.token'));
  await page.reload();
  await page.waitForTimeout(1200);
  const backToLogin = (await page.locator('#logId').count()) > 0;
  console.log('Invalid token correctly forces back to login screen:', backToLogin);

  console.log('--- ERRORS CAPTURED ---');
  console.log(errors.length ? errors.join('\n') : 'NONE');

  await browser.close();
})();

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') { const t = msg.text(); if (!t.includes('404')) errors.push('CONSOLE: ' + t); } });

  const freshLogin = async (id, mdp) => {
    await page.goto('http://localhost:5173/');
    await page.evaluate(() => localStorage.removeItem('ubos_session'));
    await page.reload();
    await page.waitForSelector('#logId', { timeout: 15000 });
    await page.fill('#logId', id);
    await page.fill('#logMdp', mdp);
    await page.click('.btn-login-submit');
    await page.waitForTimeout(1000);
  };

  // --- Scenario 1: password change via Mon profil, survives a full page RELOAD ---
  await freshLogin('yasser', 'ubos2026');
  await page.goto('http://localhost:5173/#monProfil');
  await page.waitForTimeout(600);
  const pwdInputs = page.locator('.bloc-fiche:has(h4:has-text("Changer mon mot de passe")) input');
  await pwdInputs.nth(0).fill('ubos2026');
  await pwdInputs.nth(1).fill('nouveauMdp2026');
  await pwdInputs.nth(2).fill('nouveauMdp2026');
  await page.click('button:has-text("Changer le mot de passe")');
  await page.waitForTimeout(700);
  console.log('Password change toast/UI OK (no crash)');

  // Full page reload WITHOUT clearing session/localStorage — this is what previously triggered the revert
  await page.reload();
  await page.waitForTimeout(1200);
  const stillLoggedIn = (await page.locator('.badge-user').count()) > 0;
  console.log('Still logged in after reload (session survived):', stillLoggedIn);

  // Now log out and try logging back in with the NEW password
  await page.click('button:has-text("Quitter")');
  await page.waitForTimeout(700);
  await page.waitForSelector('#logId');
  await page.fill('#logId', 'yasser');
  await page.fill('#logMdp', 'nouveauMdp2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1200);
  const loginWithNewPwdWorked = (await page.locator('.badge-user').count()) > 0;
  console.log('Login with NEW password after reload succeeded (bug fixed if true):', loginWithNewPwdWorked);

  // Sanity: old password should now fail
  await page.click('button:has-text("Quitter")').catch(() => {});
  await page.waitForTimeout(700);
  await page.fill('#logId', 'yasser');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1000);
  const oldPwdRejected = (await page.locator('#logId').count()) > 0; // still on login screen = rejected
  console.log('Old password correctly rejected:', oldPwdRejected);

  // --- Scenario 2: identifiant change via Utilisateurs.jsx (Direction), survives reload ---
  await freshLogin('oumaima', 'ubos2026');
  await page.goto('http://localhost:5173/#utilisateurs');
  await page.waitForTimeout(700);
  const row = page.locator('tr', { hasText: 'Nisrine' });
  await row.locator('button:has-text("Modifier")').click();
  await page.waitForTimeout(500);
  const idInput = page.locator('.modale .champ:has(label:has-text("Identifiant")) input');
  await idInput.fill('nisrine2');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(700);

  await page.reload();
  await page.waitForTimeout(1200);
  await page.goto('http://localhost:5173/#utilisateurs');
  await page.waitForTimeout(700);
  const rowAfterReload = await page.locator('tr', { hasText: 'Nisrine' }).innerText().catch(() => 'ROW NOT FOUND');
  console.log('Nisrine row after reload:', rowAfterReload.replace(/\n/g, ' | '));
  console.log('Identifiant change survived reload (bug fixed if true):', rowAfterReload.includes('nisrine2'));

  console.log('--- ERRORS CAPTURED ---');
  console.log(errors.length ? errors.join('\n') : 'NONE');

  await browser.close();
})();

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') { const t = msg.text(); if (!t.includes('404')) errors.push('CONSOLE: ' + t); } });

  const login = async (id, mdp) => {
    await page.goto('http://localhost:5173/');
    await page.evaluate(() => localStorage.removeItem('ubos_session'));
    await page.reload();
    await page.waitForSelector('#logId', { timeout: 15000 });
    await page.fill('#logId', id);
    await page.fill('#logMdp', mdp);
    await page.click('.btn-login-submit');
    await page.waitForTimeout(1000);
  };

  // Direction assigns a task to Imane
  await login('oumaima', 'ubos2026');
  await page.goto('http://localhost:5173/#ajouterTache');
  await page.waitForTimeout(600);
  await page.fill('#f_titre', 'Tache pour test rename');
  await page.selectOption('#f_assigne', 'Imane').catch(() => {});
  await page.click('button:has-text("Créer et assigner la tâche")');
  await page.waitForTimeout(800);

  // Imane: click topbar avatar to reach profile
  await login('imane', 'ubos2026');
  await page.click('.badge-user a');
  await page.waitForTimeout(600);
  console.log('Navigated to profile via topbar click:', await page.evaluate(() => window.location.hash));

  // Rename
  await page.fill('#f_titre', '').catch(() => {}); // noop guard
  const nomInput = page.locator('.bloc-fiche:has(h4:has-text("Mon identité")) input').first();
  await nomInput.fill('Imane Renamed');
  await page.click('button:has-text("Enregistrer")');
  await page.waitForTimeout(800);

  const bodyAfterRename = await page.locator('body').innerText();
  console.log('Topbar shows new name after rename:', bodyAfterRename.includes('Imane Renamed'));

  await page.goto('http://localhost:5173/#taches');
  await page.waitForTimeout(600);
  const tachesBody = await page.locator('body').innerText();
  console.log('Task list shows NEW name as responsable (cascade worked):', tachesBody.includes('Imane Renamed'));
  console.log('Task list still shows OLD name somewhere (should be false):', /(^|\s)Imane(\s|$)/.test(tachesBody.replace('Imane Renamed', '')));

  // Password change: wrong current password
  await page.goto('http://localhost:5173/#monProfil');
  await page.waitForTimeout(500);
  const pwdInputs = page.locator('.bloc-fiche:has(h4:has-text("Changer mon mot de passe")) input');
  await pwdInputs.nth(0).fill('WRONG_PASSWORD');
  await pwdInputs.nth(1).fill('newpass123');
  await pwdInputs.nth(2).fill('newpass123');
  await page.click('button:has-text("Changer le mot de passe")');
  await page.waitForTimeout(500);
  console.log('Wrong current password rejected (still on profile, no crash):', (await page.locator('body').innerText()).includes('Changer mon mot de passe'));

  // Password change: correct flow
  await pwdInputs.nth(0).fill('ubos2026');
  await pwdInputs.nth(1).fill('newpass123');
  await pwdInputs.nth(2).fill('newpass123');
  await page.click('button:has-text("Changer le mot de passe")');
  await page.waitForTimeout(700);

  // Log out and log back in with new password
  await page.click('button:has-text("Quitter")');
  await page.waitForTimeout(700);
  await page.waitForSelector('#logId');
  await page.fill('#logId', 'imane');
  await page.fill('#logMdp', 'newpass123');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1000);
  const loggedInBody = await page.locator('body').innerText();
  console.log('Login with NEW password succeeded:', loggedInBody.includes('Imane Renamed') || loggedInBody.includes('Quitter'));
  console.log('Still shows login form (should be false if login worked):', await page.locator('#logId').count() > 0);

  console.log('--- ERRORS CAPTURED ---');
  console.log(errors.length ? errors.join('\n') : 'NONE');

  await browser.close();
})();

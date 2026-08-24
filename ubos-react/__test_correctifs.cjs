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
  await inputs[0].fill('zoubida');
  await inputs[1].fill('ubos2026');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(3000);

  await page.evaluate(() => { window.location.hash = '#maJourneeClosing'; });
  await page.waitForTimeout(1200);

  const testCode = 'DUP' + Date.now().toString().slice(-6);

  // TEST 1: add new code
  await page.locator('button:has-text("Ajouter un code")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill(testCode);
  await page.locator('.modale button:has-text("Ajouter")').click();
  await page.waitForTimeout(1500);
  console.log('TEST1 - created, on fiche:', (await page.locator('body').textContent()).includes(testCode));

  await page.evaluate(() => { window.location.hash = '#maJourneeClosing'; });
  await page.waitForTimeout(1000);

  // TEST 2: re-add same code -> duplicate detected
  await page.locator('button:has-text("Ajouter un code")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill(testCode);
  await page.locator('.modale button:has-text("Ajouter")').click();
  await page.waitForTimeout(1000);
  const modalTxt = await page.locator('.modale').textContent();
  console.log('TEST2 - duplicate detected:', modalTxt.includes('existe déjà'));
  console.log('TEST2 - 3 choices shown:', modalTxt.includes('Ouvrir le client') && modalTxt.includes('nouveau dossier') && modalTxt.includes('Annuler'));

  // TEST 3/4: add new dossier for same client
  await page.locator('.modale button:has-text("Ajouter un nouveau dossier")').click();
  await page.waitForTimeout(1500);
  const ficheDossier2 = await page.locator('body').textContent();
  console.log('TEST3/4 - new dossier code -D02 created:', ficheDossier2.includes(`${testCode}-D02`));

  // Go to client fiche, should show 2 dossiers
  await page.evaluate((c) => { window.location.hash = `#ficheClientClosing:${c}`; }, testCode);
  await page.waitForTimeout(1200);
  const bodyClient = await page.locator('body').textContent();
  console.log('Client fiche shows 2 dossiers:', bodyClient.includes('2 dossier'));

  // TEST 5/6: Modifier with duplicate check
  await page.evaluate((c) => { window.location.hash = `#ficheSuiviClosing:${c}`; }, ''); // placeholder, will navigate below properly
  // open first dossier from client page
  await page.evaluate((c) => { window.location.hash = `#ficheClientClosing:${c}`; }, testCode);
  await page.waitForTimeout(1000);
  await page.locator('table tbody tr').first().locator('a:has-text("Ouvrir")').click();
  await page.waitForTimeout(1200);

  await page.locator('button:has-text("Modifier")').click();
  await page.waitForTimeout(500);
  // try to set codeClient to the existing conflict scenario: itself unchanged should be fine; test setting to itself first (no-op), then a genuine conflict test:
  console.log('TEST5 - Modifier modal opened:', (await page.locator('.modale').textContent()).includes('Code client'));
  await page.locator('.modale').getByRole('button', { name: 'Annuler' }).click();
  await page.waitForTimeout(500);

  // TEST 7/8: Retards KPI clickable
  await page.evaluate(() => { window.location.hash = '#maJourneeClosing'; });
  await page.waitForTimeout(1200);
  await page.locator('.stats > div').nth(4).click();
  await page.waitForTimeout(800);
  console.log('TEST7 - filter panel shown with Retirer button:', (await page.locator('body').textContent()).includes('Retirer le filtre'));
  await page.locator('button:has-text("Retirer le filtre")').click();
  await page.waitForTimeout(500);
  console.log('TEST7b - filter cleared:', !(await page.locator('body').textContent()).includes('Retirer le filtre'));

  // TEST 9: search
  await page.evaluate(() => { window.location.hash = '#monPortefeuilleClosing'; });
  await page.waitForTimeout(1200);
  await page.locator('input[type=search]').fill(testCode.slice(0, 5));
  await page.waitForTimeout(600);
  console.log('TEST9 - partial search finds code:', (await page.locator('body').textContent()).includes(testCode));

  // TEST À qualifier screen
  await page.evaluate(() => { window.location.hash = '#aQualifierClosing'; });
  await page.waitForTimeout(1200);
  const bodyAQ = await page.locator('body').textContent();
  console.log('A-qualifier page loads:', bodyAQ.includes('À qualifier') || bodyAQ.includes('Rien à qualifier'));

  console.log('Console errors:', JSON.stringify(consoleErrors.slice(0, 30)));
  await browser.close();
})();

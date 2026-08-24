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
  await inputs[0].fill('imane');
  await inputs[1].fill('ubos2026');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(3500);

  await page.evaluate(() => { window.location.hash = '#maJourneeImane'; });
  await page.waitForTimeout(1200);

  const testCode = 'I' + Date.now().toString().slice(-6);
  await page.locator('button:has-text("+ Instruction LIMEX")').click();
  await page.waitForTimeout(500);
  await page.locator('.modale input').first().fill(testCode);
  // check Yasser as destinataire
  await page.locator('.modale label:has-text("Yasser") input[type=checkbox]').check();
  await page.locator('.modale textarea').fill('demander baisse prix fournisseur,\nrécupérer Proforma,\nconfirmer délai production');
  await page.locator('.modale button:has-text("Découper en actions")').click();
  await page.waitForTimeout(800);
  const propBody = await page.locator('.modale').textContent();
  console.log('Propositions shown:', propBody.includes('baisse prix') || propBody.includes('Proforma'));
  const propInputs = await page.locator('.modale input[type=text], .modale input:not([type])').all();
  console.log('Number of proposal text inputs:', propInputs.length);
  // assign responsable on each proposal select
  const propSelects = await page.locator('.modale select').all();
  for (const sel of propSelects) { await sel.selectOption({ label: 'Yasser' }).catch(() => {}); }
  await page.locator('.modale button:has-text("Envoyer aux exécutants")').click();
  await page.waitForTimeout(1500);
  console.log('Envoi errors so far:', JSON.stringify(consoleErrors));

  // Now check Yasser sees the task
  await page.evaluate(() => { window.location.hash = '#'; });
  await page.locator('a:has-text("Quitter")').click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.goto('http://localhost:5173');
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs2 = await page.locator('input').all();
  await inputs2[0].fill('yasser');
  await inputs2[1].fill('ubos2026');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.location.hash = '#mesTaches'; });
  await page.waitForTimeout(1200);
  const bodyYasser = await page.locator('body').textContent();
  console.log('Yasser sees a LIMEX task:', bodyYasser.includes(testCode));

  console.log('Final console errors:', JSON.stringify(consoleErrors.slice(0, 20)));
  await browser.close();
})();

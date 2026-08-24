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

  const testCode = 'C' + Date.now().toString().slice(-6);
  await page.locator('button:has-text("Ajouter un code")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill(testCode);
  await page.locator('.modale button:has-text("Ajouter")').click();
  await page.waitForTimeout(1500);
  console.log('Suivi created:', (await page.locator('body').textContent()).includes(testCode));

  await page.locator('button:has-text("Ajouter une action")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill('Test action normale');
  const selects = await page.locator('.modale select').all();
  await selects[0].selectOption({ index: 1 });
  await page.locator('.modale button:has-text("Enregistrer")').click();
  await page.waitForTimeout(1500);
  console.log('Action added:', (await page.locator('body').textContent()).includes('Test action normale'));

  console.log('Console errors:', JSON.stringify(consoleErrors));
  await browser.close();
})();

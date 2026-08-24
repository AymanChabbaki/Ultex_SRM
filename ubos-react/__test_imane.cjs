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
  await page.waitForTimeout(3000);

  // Force a fresh reload so fetchMe() picks up the migration that just ran
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(3000);

  const sidebarLinks = await page.locator('#nav a .nav-text').allTextContents();
  console.log('Sidebar links:', JSON.stringify(sidebarLinks));
  console.log('Has 4 Imane pages:', ['Ma journée', 'Suivi LIMEX', 'Études & Calcul', 'Paiements & Échéances'].every(x => sidebarLinks.includes(x)));
  console.log('Fused pages hidden:', !sidebarLinks.includes("Mon programme aujourd'hui") && !sidebarLinks.includes('Mes objectifs'));

  await page.evaluate(() => { window.location.hash = '#maJourneeImane'; });
  await page.waitForTimeout(1200);

  const testCode = 'T' + Date.now().toString().slice(-6);
  await page.locator('button:has-text("Ajouter un code")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill(testCode);
  await page.locator('.modale button:has-text("Ajouter")').click();
  await page.waitForTimeout(1500);
  console.log('TEST1 - suivi created:', (await page.locator('body').textContent()).includes(testCode));

  await page.evaluate(() => { window.location.hash = '#maJourneeImane'; });
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Ajouter un code")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill(testCode);
  await page.locator('.modale button:has-text("Ajouter")').click();
  await page.waitForTimeout(1000);
  console.log('TEST2 - duplicate detected:', (await page.locator('.modale').textContent()).includes('existe déjà'));
  await page.locator('.modale a:has-text("Ouvrir le suivi")').click();
  await page.waitForTimeout(1200);

  await page.locator('button:has-text("Ajouter une action")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill('Confirmer le délai de production');
  const selects = await page.locator('.modale select').all();
  await selects[0].selectOption({ index: 1 });
  await page.locator('.modale button:has-text("Enregistrer")').click();
  await page.waitForTimeout(1200);
  console.log('TEST3 - action added:', (await page.locator('body').textContent()).includes('Confirmer le délai de production'));

  await page.evaluate(() => { window.location.hash = '#etudesCalcul'; });
  await page.waitForTimeout(1000);
  console.log('Etudes & Calcul loads:', (await page.locator('body').textContent()).includes('À calculer'));

  await page.evaluate(() => { window.location.hash = '#paiementsEcheances'; });
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Ajouter un paiement")').click();
  await page.waitForTimeout(500);
  const modalTxt = await page.locator('.modale').textContent();
  console.log('Paiement form has key fields:', modalTxt.includes('Bénéficiaire') && modalTxt.includes('Devise'));

  console.log('Console errors:', JSON.stringify(consoleErrors.slice(0, 20)));
  await browser.close();
})();

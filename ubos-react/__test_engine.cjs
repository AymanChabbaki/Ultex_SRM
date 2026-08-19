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

  // Add a fresh code
  await page.evaluate(() => { window.location.hash = '#maJourneeClosing'; });
  await page.waitForTimeout(1200);
  const testCode = 'ENG' + Date.now().toString().slice(-6);
  await page.locator('button:has-text("Ajouter un code")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill(testCode);
  await page.locator('.modale button:has-text("Ajouter")').click();
  await page.waitForTimeout(1500);
  console.log('1. Fiche shows code + ancienneté:', (await page.locator('body').textContent()).includes(testCode) && (await page.locator('body').textContent()).includes('jour(s)'));

  // Quick status one-click transition
  await page.locator('button:has-text("Devis envoyé")').click();
  await page.waitForTimeout(1000);
  console.log('2. Quick status transition applied:', (await page.locator('.pill').allTextContents()).includes('Devis envoyé'));

  // Confier a Mansouri using centralized helper
  await page.locator('button:has-text("👤 Mansouri")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale button:has-text("Confier à Mansouri")').click();
  await page.waitForTimeout(1200);
  console.log('3. Responsable now Mansouri:', (await page.locator('body').textContent()).includes('Mansouri'));

  // Check Coordination Mansouri page shows it under "Chez Mansouri"
  await page.evaluate(() => { window.location.hash = '#coordinationMansouri'; });
  await page.waitForTimeout(1200);
  const bodyMansouri = await page.locator('body').textContent();
  console.log('4. Coordination Mansouri shows 4 sections:', ['À transmettre à Mansouri', 'Chez Mansouri', 'Retour Mansouri reçu', 'Retour en retard'].every(s => bodyMansouri.includes(s)));
  console.log('5. Code visible under Chez Mansouri:', bodyMansouri.includes(testCode));

  // Mon Programme (should now include the closing item since she has suivis)
  await page.evaluate(() => { window.location.hash = '#monProgramme'; });
  await page.waitForTimeout(1200);
  const bodyProgramme = await page.locator('body').textContent();
  console.log('6. Programme grouped into 3 blocs:', ['Préparation & Relances', 'Contrôle des devis', 'Coordination Mansouri'].every(s => bodyProgramme.includes(s)));

  // Mes objectifs shows Closing block
  await page.evaluate(() => { window.location.hash = '#mesObjectifs'; });
  await page.waitForTimeout(1200);
  console.log('7. Mes objectifs shows Closing KPIs:', (await page.locator('body').textContent()).includes('Codes traités'));

  // Mon portefeuille "Sans prochaine action" filter
  await page.evaluate(() => { window.location.hash = '#monPortefeuilleClosing'; });
  await page.waitForTimeout(1200);
  console.log('8. Portefeuille has "Sans prochaine action" filter:', (await page.locator('button:has-text("Sans prochaine action")').count()) > 0);

  // Mes tâches simplified quick create
  await page.evaluate(() => { window.location.hash = '#mesTaches'; });
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("Nouvelle tâche")').click();
  await page.waitForTimeout(400);
  const modalBody = await page.locator('.modale').textContent();
  console.log('9. Simplified task form (no Type de tâche field):', !modalBody.includes('Type de tâche') && modalBody.includes('Action à faire') && modalBody.includes('Quand'));

  console.log('Console errors:', JSON.stringify(consoleErrors.slice(0, 20)));
  await browser.close();
})();

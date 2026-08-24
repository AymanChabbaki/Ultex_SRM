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

  // 1. Sidebar should show only the 4 Closing pages + mesTaches (kept), not the fused-away ones
  const sidebarLinks = await page.locator('#nav a .nav-text').allTextContents();
  console.log('Sidebar links:', JSON.stringify(sidebarLinks));
  const doitContenir = ['Ma journée', 'Devis à contrôler', 'Coordination Mansouri', 'Mon portefeuille Closing', 'Mes tâches'];
  const neDoitPasContenir = ['Mon programme aujourd\'hui', 'Mes objectifs', 'Mon rapport du jour', 'Mon agenda', 'Suivis Closing'];
  console.log('1. Has all 4 Closing pages + Mes tâches:', doitContenir.every(x => sidebarLinks.includes(x)));
  console.log('2. Fused pages hidden:', neDoitPasContenir.every(x => !sidebarLinks.includes(x)));

  // 3. Ma Journee shows new counters + recommendation block
  await page.evaluate(() => { window.location.hash = '#maJourneeClosing'; });
  await page.waitForTimeout(1200);
  const bodyMJ = await page.locator('body').textContent();
  console.log('3. New counters present:', ['À faire aujourd\'hui', 'Attente Mansouri'].every(s => bodyMJ.includes(s)));
  console.log('4. Discreet summary present:', bodyMJ.includes('client(s) contacté(s)'));

  // 5. Devis a controler tabs
  await page.evaluate(() => { window.location.hash = '#devisAControler'; });
  await page.waitForTimeout(1000);
  const bodyDevis = await page.locator('body').textContent();
  console.log('5. Devis tabs present:', ['Nouveaux', 'Urgents', 'Retournés'].every(s => bodyDevis.includes(s)));

  // 6. Coordination Mansouri new sections
  await page.evaluate(() => { window.location.hash = '#coordinationMansouri'; });
  await page.waitForTimeout(1000);
  const bodyMans = await page.locator('body').textContent();
  console.log('6. Mansouri sections present:', ['À transmettre', 'Attente Mansouri', 'Retour reçu', 'En retard'].every(s => bodyMans.includes(s)));

  // 7. Portefeuille has search + new filters
  await page.evaluate(() => { window.location.hash = '#monPortefeuilleClosing'; });
  await page.waitForTimeout(1000);
  console.log('7. Search input present:', (await page.locator('input[type=search]').count()) > 0);
  const bodyPortef = await page.locator('body').textContent();
  console.log('8. New filter set present:', ['Attente client', 'Attente Mansouri', 'Urgents', 'Confirmés'].every(s => bodyPortef.includes(s)));

  // 9. Confirm hidden pages still reachable directly (functionality preserved, just unlinked)
  await page.evaluate(() => { window.location.hash = '#monRapportJournalier'; });
  await page.waitForTimeout(1000);
  const bodyRapport = await page.locator('body').textContent();
  console.log('9. Rapport page still reachable directly and has Closing data:', bodyRapport.includes('Coordination Closing'));

  console.log('Console errors:', JSON.stringify(consoleErrors.slice(0, 20)));
  await browser.close();
})();

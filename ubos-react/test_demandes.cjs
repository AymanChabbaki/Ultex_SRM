const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

  await page.goto('http://localhost:5173/');
  await page.waitForSelector('#logId', { timeout: 15000 });
  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForSelector('.topbar, header', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  console.log('--- Logged in, navigating to Demandes ---');
  await page.goto('http://localhost:5173/#demandes');
  await page.waitForTimeout(800);

  // Create a new demande
  const addBtn = page.locator('button:has-text("Ajouter")').first();
  await addBtn.click();
  await page.waitForTimeout(500);

  // Fill client via SearchableSelect
  await page.click('#f_client');
  await page.waitForTimeout(300);
  const firstOption = page.locator('.ref-select-option').first();
  if (await firstOption.count()) await firstOption.click();

  await page.fill('#f_objectifGeneral', 'Test objet demande auto');
  await page.fill('#f_budgetGlobalEstime', '15000');
  await page.selectOption('#f_canalReception', 'WhatsApp').catch(()=>{});
  await page.selectOption('#f_typeProjet', 'Nouveau produit').catch(()=>{});
  await page.fill('#f_villeDestination', 'Casablanca');

  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(1000);

  const hashAfterCreate = await page.evaluate(() => window.location.hash);
  console.log('Hash after create (module list, no auto-nav expected):', hashAfterCreate);

  // Go to the demandes list and open the newest one (should be first row)
  await page.goto('http://localhost:5173/#demandes');
  await page.waitForTimeout(600);
  const ficheLink = page.locator('table tbody tr').first().locator('a:has-text("Fiche")');
  await ficheLink.click();
  await page.waitForTimeout(800);

  const demandeHash = await page.evaluate(() => window.location.hash);
  console.log('On demande fiche:', demandeHash);

  // Check header rendered real values (bug fix check)
  const bodyText1 = await page.locator('.kv').first().innerText();
  console.log('KV header snippet:', bodyText1.slice(0, 300).replace(/\n/g, ' | '));

  // Add a product
  await page.click('button:has-text("+ Ajouter un produit")');
  await page.waitForTimeout(1000);
  const ligneHash = await page.evaluate(() => window.location.hash);
  console.log('On ligne page:', ligneHash);

  // Fill Identification tab
  await page.fill('#f_nomProduit', 'Chargeur solaire 20W');
  await page.fill('#f_description', 'Chargeur solaire portable pour test.');

  // Switch to Quantité tab
  await page.click('.onglet:has-text("Quantité")');
  await page.waitForTimeout(300);
  await page.fill('#f_quantite', '1000');
  await page.fill('#f_piecesParCarton', '50');
  await page.fill('#f_poidsBrutCarton', '12');
  await page.fill('#f_cbmCarton', '0.08');

  // Switch to Fournisseur tab
  await page.click('.onglet:has-text("Fournisseur & offre")');
  await page.waitForTimeout(300);
  await page.selectOption('#f_statutFournisseur', 'Fournisseur connu').catch(()=>{});

  // Switch to Prix tab
  await page.click('.onglet:has-text("Prix & conditions")');
  await page.waitForTimeout(300);
  await page.fill('#f_prixUnitaire', '3.5');
  await page.selectOption('#f_devise', 'USD').catch(()=>{});

  // Switch to Logistique tab, fill pays origine
  await page.click('.onglet:has-text("Origine & logistique")');
  await page.waitForTimeout(300);
  await page.fill('#f_paysOrigine', 'Chine');

  // Save
  await page.click('button:has-text("Enregistrer"):not(:has-text("ajouter"))');
  await page.waitForTimeout(1000);

  // Check auto-calc happened - reload tab to Quantité and check nbCartons/poidsBrutTotal/cbmTotal
  await page.click('.onglet:has-text("Quantité")');
  await page.waitForTimeout(300);
  const nbCartons = await page.inputValue('#f_nbCartons');
  const poidsBrutTotal = await page.inputValue('#f_poidsBrutTotal');
  const cbmTotal = await page.inputValue('#f_cbmTotal');
  console.log('Auto-calc results -> nbCartons:', nbCartons, 'poidsBrutTotal:', poidsBrutTotal, 'cbmTotal:', cbmTotal);

  // Go back to demande
  await page.click('button:has-text("Retour à la demande")');
  await page.waitForTimeout(1000);

  const backHash = await page.evaluate(() => window.location.hash);
  console.log('Back on:', backHash);

  const rowText = await page.locator('table tbody tr').first().innerText();
  console.log('Synthesis row:', rowText.replace(/\n/g, ' | '));

  // Click "Envoyer au Calcul"
  await page.click('button:has-text("Envoyer au Calcul")');
  await page.waitForTimeout(1000);

  // Check indicators updated (enCalcul should be 1)
  const stats = await page.locator('.stats').innerText();
  console.log('Stats after envoyer au calcul:', stats.replace(/\n/g, ' | '));

  // Check Historique tab
  await page.click('.onglet:has-text("Historique")');
  await page.waitForTimeout(500);
  const histRows = await page.locator('table tbody tr').count();
  console.log('Historique rows count:', histRows);

  // Check notifications
  await page.goto('http://localhost:5173/#notifications');
  await page.waitForTimeout(600);
  const notifText = await page.locator('body').innerText();
  console.log('Contains "chiffrer" in notifications page:', notifText.includes('chiffrer'));

  // Check taches
  await page.goto('http://localhost:5173/#taches');
  await page.waitForTimeout(600);
  const tachesText = await page.locator('body').innerText();
  console.log('Contains "Chiffrage" in taches page:', tachesText.includes('Chiffrage'));

  console.log('--- ERRORS CAPTURED ---');
  console.log(errors.length ? errors.join('\n') : 'NONE');

  await browser.close();
})();

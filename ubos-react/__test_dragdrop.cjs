const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs = await page.locator('input').all();
  await inputs[0].fill('test_otp_direction');
  await inputs[1].fill('TestOtp2026!');
  await page.locator('button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")').first().click();
  await page.waitForTimeout(2000);

  await page.goto('http://localhost:5173/#mesTaches');
  await page.waitForTimeout(1000);
  // Create a task to drag
  await page.locator('button:has-text("Nouvelle tâche")').click();
  await page.waitForTimeout(400);
  await page.locator('.modale input').first().fill('DragTest ' + Date.now());
  await page.locator('.modale button:has-text("Créer")').click();
  await page.waitForTimeout(1200);

  const card = page.locator('.kanban-colonne').first().locator('.kanban-carte').first();
  const targetCol = page.locator('.kanban-colonne').nth(1); // "En cours"
  console.log('card count in col0 before:', await page.locator('.kanban-colonne').first().locator('.kanban-carte').count());
  console.log('card count in col1 before:', await targetCol.locator('.kanban-carte').count());

  await card.dragTo(targetCol);
  await page.waitForTimeout(1500);

  console.log('card count in col0 after:', await page.locator('.kanban-colonne').first().locator('.kanban-carte').count());
  console.log('card count in col1 after:', await targetCol.locator('.kanban-carte').count());
  const bodyTxt = await page.locator('body').textContent();
  console.log('toast mentions déplacée:', bodyTxt.includes('déplacée'));

  await browser.close();
})();

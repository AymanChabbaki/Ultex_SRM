const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

  const login = async (id, mdp) => {
    await page.goto('http://localhost:5173/');
    await page.waitForSelector('#logId', { timeout: 15000 });
    await page.fill('#logId', id);
    await page.fill('#logMdp', mdp);
    await page.click('.btn-login-submit');
    await page.waitForTimeout(1000);
  };

  // ================= Part A: Ouiam (Data) =================
  await login('ouiam', 'ubos2026');

  await page.goto('http://localhost:5173/#clients');
  await page.waitForTimeout(600);

  const creerClient = async (nom) => {
    await page.click('button:has-text("Ajouter")');
    await page.waitForTimeout(400);
    await page.fill('#f_nom', nom);
    await page.selectOption('#f_responsableCommercial', 'Ouiam').catch(async () => {
      // fallback in case options render differently
      await page.selectOption('#f_responsableCommercial', { label: 'Ouiam' }).catch(() => {});
    });
    await page.click('.modale button:has-text("Enregistrer")');
    await page.waitForTimeout(700);
  };

  await creerClient('Client Test Un');
  await creerClient('Client Test Deux');

  await page.goto('http://localhost:5173/#clients');
  await page.waitForTimeout(500);
  const rows = page.locator('table tbody tr');
  const rowCount = await rows.count();
  console.log('Clients list row count:', rowCount);

  // Open "Client Test Deux" (should be first row, most recent) and mark it "Prêt pour Demande"
  await rows.first().locator('td.code a').click();
  await page.waitForTimeout(600);
  await page.click('button:has-text("11. Suivi Data")');
  await page.waitForTimeout(400);
  await page.selectOption('.champ select', { label: 'Prêt pour Demande' }).catch(async () => {
    const sel = page.locator('.bloc-fiche select').first();
    await sel.selectOption('Prêt pour Demande');
  });
  await page.waitForTimeout(600);

  // Go back to clients list, open "Client Test Un", mark as contacted today
  await page.goto('http://localhost:5173/#clients');
  await page.waitForTimeout(500);
  await page.locator('table tbody tr').nth(1).locator('td.code a').click();
  await page.waitForTimeout(600);
  await page.click('button:has-text("11. Suivi Data")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Marquer comme contacté aujourd\'hui")');
  await page.waitForTimeout(700);
  const suiviText = await page.locator('.bloc-fiche:has(h4:has-text("Suivi Data"))').innerText();
  console.log('Suivi Data tab after marking contacted:', suiviText.replace(/\n/g, ' | ').slice(0, 500));

  // Dashboard Data
  await page.goto('http://localhost:5173/#tableauBordData');
  await page.waitForTimeout(700);
  const dashText = await page.locator('body').innerText();
  console.log('--- Dashboard Data (Ouiam) snapshot ---');
  console.log('Contains "par défaut" objective banner:', dashText.includes('aucun objectif configuré'));
  console.log('Contains "Clients contactés" progress line:', dashText.includes('Clients contactés'));

  const alertesBloc = await page.locator('.panneau').filter({ hasText: 'jamais contactés' }).innerText().catch(() => 'NOT FOUND');
  console.log('Alertes mentioning "jamais contactés":', alertesBloc.slice(0, 200).replace(/\n/g, ' | '));

  const pipelineRow = await page.locator('table').filter({ hasText: 'Prospect' }).first().innerText().catch(() => 'NOT FOUND');
  console.log('Pipeline table snippet:', pipelineRow.replace(/\n/g, ' | ').slice(0, 300));

  await page.click('button:has-text("Organiser ma journée")');
  await page.waitForTimeout(400);
  const resumeText = await page.locator('.panneau').filter({ hasText: 'Bonjour' }).innerText().catch(() => 'NOT FOUND');
  console.log('Resume text:', resumeText.replace(/\n/g, ' | '));

  // Agenda
  await page.goto('http://localhost:5173/#monAgenda');
  await page.waitForTimeout(600);
  const agendaText = await page.locator('body').innerText();
  console.log('Agenda contains "Relance client":', agendaText.includes('Relance client'));

  // ================= Part B: Oumaima (Direction) =================
  await login('oumaima', 'ubos2026');

  await page.goto('http://localhost:5173/#objectifsData');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Ajouter")');
  await page.waitForTimeout(400);
  await page.fill('#f_label', 'Objectif Test Aout');
  await page.fill('#f_dateDebut', '2026-08-01');
  await page.fill('#f_dateFin', '2026-08-31');
  await page.fill('#f_demandesParJour', '5');
  await page.fill('#f_clientsContactesParJour', '25');
  await page.fill('#f_relancesParJour', '15');
  await page.fill('#f_nouveauxClientsParJour', '6');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(700);

  await page.goto('http://localhost:5173/#performance');
  await page.waitForTimeout(700);
  const perfText = await page.locator('table').first().innerText();
  console.log('Performance table contains "Objectif du jour atteint":', perfText.includes('Objectif du jour atteint'));
  console.log('Performance table contains "Tableau de bord Data" button label region check...');
  const ouiamRow = await page.locator('tr').filter({ hasText: 'Ouiam' }).innerText().catch(() => 'NOT FOUND');
  console.log('Ouiam row in Performance:', ouiamRow.replace(/\n/g, ' | ').slice(0, 400));

  await page.locator('tr').filter({ hasText: 'Ouiam' }).locator('button:has-text("Tableau de bord Data")').click();
  await page.waitForTimeout(700);
  const adminDashText = await page.locator('body').innerText();
  console.log('Admin view title contains Ouiam:', adminDashText.includes('Ouiam'));
  console.log('Admin view objective banner now shows configured label:', adminDashText.includes('Objectif Test Aout'));

  console.log('--- ERRORS CAPTURED ---');
  console.log(errors.length ? errors.join('\n') : 'NONE');

  await browser.close();
})();

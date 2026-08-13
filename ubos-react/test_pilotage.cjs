const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

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

  const proofFile = path.join(__dirname, 'proof.txt');
  fs.writeFileSync(proofFile, 'preuve de test');

  // ============ Direction: create a task via AjouterTache ============
  await login('oumaima', 'ubos2026');
  await page.goto('http://localhost:5173/#ajouterTache');
  await page.waitForTimeout(600);
  await page.fill('#f_titre', 'Vérifier les cotations transport du dossier 8074');
  await page.selectOption('#f_assigne', { label: 'Imane' }).catch(async () => {
    await page.selectOption('#f_assigne', 'Imane').catch(() => {});
  });
  await page.waitForTimeout(300);
  const chargeText = await page.locator('.vide').first().innerText().catch(() => '');
  console.log('Charge display on AjouterTache:', chargeText.replace(/\n/g, ' '));

  const ajd = new Date().toISOString().slice(0, 10);
  await page.fill('#f_echeance', ajd);
  await page.selectOption('#f_priorite', 'Urgente').catch(() => {});
  await page.selectOption('#f_preuveObligatoire', 'Oui').catch(() => {});
  await page.selectOption('#f_validateur', { label: 'Oumaima' }).catch(async () => {
    await page.selectOption('#f_validateur', 'Oumaima').catch(() => {});
  });
  await page.click('button:has-text("Créer et assigner la tâche")');
  await page.waitForTimeout(800);
  const hashApresCreation = await page.evaluate(() => window.location.hash);
  console.log('Hash after task creation:', hashApresCreation);
  const codeTache = hashApresCreation.split(':')[1];

  // ============ Imane: programme du jour + accusé de réception + étapes + terminer ============
  await login('imane', 'ubos2026');
  await page.goto('http://localhost:5173/#monProgramme');
  await page.waitForTimeout(600);
  const progText = await page.locator('body').innerText();
  console.log('Programme du jour contains task title:', progText.includes('cotations transport'));

  await page.goto(`http://localhost:5173/#ficheTache:${codeTache}`);
  await page.waitForTimeout(600);
  console.log('Has "Tâche ajoutée par la Direction" banner:', (await page.locator('body').innerText()).includes('Tâche ajoutée par la Direction'));
  await page.click('button:has-text("J\'ai pris connaissance")');
  await page.waitForTimeout(500);
  const apresAccuse = await page.locator('body').innerText();
  console.log('Banner gone after accusé de réception:', !apresAccuse.includes('J\'ai pris connaissance'));

  // Add a mandatory étape
  await page.click('button:has-text("+ Ajouter une étape")');
  await page.waitForTimeout(400);
  await page.fill('.modale #f_libelle', 'Vérifier prix fournisseur');
  await page.selectOption('.modale #f_obligatoire', 'Oui');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(600);

  // Try to terminate without completing the étape
  await page.click('button:has-text("Terminer la tâche")');
  await page.waitForTimeout(500);
  const modaleOuverte = await page.locator('.modale:has-text("Terminer la tâche")').count();
  console.log('Terminer modal blocked (should be 0 - modal not opened):', modaleOuverte);

  // Complete the étape
  await page.click('table:has-text("Vérifier prix fournisseur") button:has-text("Éditer")').catch(async () => {
    await page.locator('button:has-text("Éditer")').first().click();
  });
  await page.waitForTimeout(400);
  await page.selectOption('.modale #f_statut', 'Terminée');
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(600);

  // Now terminate for real
  await page.click('button:has-text("Terminer la tâche")');
  await page.waitForTimeout(500);
  await page.fill('.modale #f_resultatObtenu', 'Cotations vérifiées, recommandation transporteur A');
  const fileInput = page.locator('.modale input[type=file]');
  await fileInput.setInputFiles(proofFile);
  await page.waitForTimeout(300);
  await page.click('.modale button:has-text("Enregistrer")');
  await page.waitForTimeout(700);
  const statutApresTerminer = await page.locator('.outils .pill').first().innerText().catch(() => '');
  console.log('Statut after Terminer:', statutApresTerminer);

  // ============ Oumaima: validate + check dashboard + notifications ============
  await login('oumaima', 'ubos2026');
  await page.goto('http://localhost:5173/#dashboard');
  await page.waitForTimeout(700);
  const dashHtml = await page.locator('body').innerText();
  console.log('Dashboard shows unread notif breakdown marker:', dashHtml.includes('🔔'));

  await page.goto(`http://localhost:5173/#ficheTache:${codeTache}`);
  await page.waitForTimeout(600);
  const enAttenteValidation = (await page.locator('body').innerText()).includes('En attente de votre validation');
  console.log('Task pending validation panel visible to Oumaima:', enAttenteValidation);
  await page.click('button:has-text("Valider")');
  await page.waitForTimeout(600);
  const statutFinal = await page.locator('.outils .pill').first().innerText().catch(() => '');
  console.log('Statut after Valider:', statutFinal);

  // Notifications page: filters + rich content + Ouvrir link
  await page.goto('http://localhost:5173/#notifications');
  await page.waitForTimeout(700);
  const notifBody = await page.locator('body').innerText();
  console.log('Notifications contain "Créé par" (rich content):', notifBody.includes('Créé par'));
  console.log('Notifications contain "Priorité :"', notifBody.includes('Priorité :'));
  await page.selectOption('select', 'taches').catch(() => {});
  await page.waitForTimeout(400);
  const nbOuvrirButtons = await page.locator('a.btn.mini.doux:has-text("Ouvrir")').count();
  console.log('Number of "Ouvrir" links after Tâches filter:', nbOuvrirButtons);

  // Direction pages
  await page.goto('http://localhost:5173/#pilotageEquipe');
  await page.waitForTimeout(600);
  console.log('Pilotage équipe has Imane row:', (await page.locator('body').innerText()).includes('Imane'));

  await page.goto('http://localhost:5173/#quiFaitQuoi');
  await page.waitForTimeout(600);
  console.log('Qui fait quoi loaded:', (await page.locator('body').innerText()).includes('Charge par collaborateur'));

  // Kanban + objectifs + rapport for Imane (admin view)
  await page.goto(`http://localhost:5173/#mesTaches:imane`);
  await page.waitForTimeout(600);
  console.log('Kanban columns rendered:', (await page.locator('.kanban-colonne').count()));

  await page.goto(`http://localhost:5173/#mesObjectifs:imane`);
  await page.waitForTimeout(600);
  console.log('Objectifs page loaded (no crash):', (await page.locator('body').innerText()).length > 0);

  await page.goto(`http://localhost:5173/#monRapportJournalier:imane`);
  await page.waitForTimeout(600);
  const rapportText = await page.locator('body').innerText();
  console.log('Rapport journalier prefilled tasks terminees > 0:', /Tâches terminées/.test(rapportText));
  await page.click('button:has-text("Déposer mon rapport journalier"), button:has-text("Mettre à jour mon rapport")').catch(() => {});
  await page.waitForTimeout(500);

  console.log('--- ERRORS CAPTURED ---');
  console.log(errors.length ? errors.join('\n') : 'NONE');

  fs.unlinkSync(proofFile);
  await browser.close();
})();

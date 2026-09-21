import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const user = {code:'TEST',identifiant:'test',nomComplet:'Test Data',departement:'Direction',services:['Data','Direction'],actif:true};
  let db = { seq:{}, utilisateurs:[user], clients:[
    {code:'L1',nom:'Alpha',dateCreation:'2026-09-21',sourceDonnees:'Workflow',segment:'Prospect'},
    {code:'L2',nom:'Beta',dateCreation:'2026-09-20',sourceDonnees:'Workflow',segment:'Prospect'},
  ], demandes:[], audit:[], notifs:[], documents:[] };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/db/sync')) { db = route.request().postDataJSON(); return route.fulfill({json:{status:'success'}}); }
    return route.fulfill({json:url.pathname.endsWith('/auth/me') ? {user} : url.pathname.endsWith('/health') ? {status:'ok'} : db});
  });
  await page.addInitScript(() => localStorage.setItem('ubos_token','test-only'));
  await page.goto(server.resolvedUrls.local[0] + '#clients');
  await page.getByRole('link',{name:'L1',exact:true}).waitFor();
  await page.getByRole('searchbox',{name:'Filtrer Nom',exact:true}).fill('Beta');
  assert.equal(await page.getByRole('link',{name:'L1',exact:true}).count(),0);
  await page.getByRole('searchbox',{name:'Filtrer Nom',exact:true}).fill('');
  await page.getByRole('button',{name:'Trier par Nom',exact:true}).click();
  await page.getByRole('button',{name:'Trier par Nom',exact:true}).click();
  assert.equal(await page.locator('tbody tr').first().locator('td').first().innerText(),'L2');
  await page.getByRole('link',{name:'L1',exact:true}).click();
  await page.getByRole('heading',{name:'Profil Client 360°',exact:true}).waitFor();
  await page.getByRole('button',{name:'Modifier',exact:true}).click();
  await page.locator('#voile').click({position:{x:2,y:2}});
  assert.equal(await page.locator('#modale').count(),1);
  await page.getByRole('button',{name:'Fermer',exact:true}).click();
  await page.getByRole('button',{name:'Darf / Fichiers',exact:true}).click();
  await page.getByPlaceholder('Message reçu ou notes du client…').fill('Note de test conservée');
  await page.getByRole('button',{name:'Enregistrer la note',exact:true}).click();
  await page.getByRole('cell',{name:'Note de test conservée',exact:true}).waitFor();
  await page.getByRole('button',{name:'11. Suivi Data',exact:true}).click();
  await page.locator('select').filter({has:page.locator('option[value="Pas réponse"]')}).selectOption('Pas réponse');
  await page.getByRole('cell',{name:'V1',exact:true}).waitFor();
  assert.equal(await page.locator('input[type="datetime-local"]').count(),2);
  assert.deepEqual(errors,[]);
  console.log('PASS: column filtering/sorting, modal backdrop, client notes/history, V1 state and hourly deadlines.');
} finally {
  await browser.close(); await server.close();
}

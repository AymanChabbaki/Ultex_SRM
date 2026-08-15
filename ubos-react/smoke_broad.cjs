const { chromium } = require('playwright');

const ROUTES_DIRECTION = [
  'dashboard', 'tableauBordData', 'monProgramme', 'mesTaches', 'mesObjectifs', 'monRapportJournalier',
  'monAgenda', 'notifications', 'pilotageEquipe', 'quiFaitQuoi', 'ajouterTache', 'rapportDirection',
  'risquesClients', 'performance', 'importCentre', 'objectifsData', 'rapports', 'erreurs', 'utilisateurs',
  'auditGlobal', 'clients', 'contacts', 'demandes', 'commandes', 'dossiers', 'offres', 'reclamations',
  'sourcings', 'etudes', 'dashboardLimex', 'arrivages', 'rapportLimexDirection', 'analyses', 'transports',
  'transits', 'certifs', 'transportsNat', 'paiements', 'pmtIntl', 'facturation', 'fournisseurs',
  'partenaires', 'produits', 'stockage', 'documents', 'messagerie', 'taches', 'leads', 'rechercheGlobale',
  'tacheEtapes'
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errorsByRoute = {};
  let currentRoute = 'login';
  page.on('pageerror', e => { (errorsByRoute[currentRoute] = errorsByRoute[currentRoute] || []).push('PAGEERROR: ' + e.message); });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('404') || t.includes('Failed to load resource')) return; // expected, backend offline
      (errorsByRoute[currentRoute] = errorsByRoute[currentRoute] || []).push('CONSOLE: ' + t);
    }
  });

  await page.goto('http://localhost:5173/');
  await page.waitForSelector('#logId', { timeout: 15000 });
  await page.fill('#logId', 'oumaima');
  await page.fill('#logMdp', 'ubos2026');
  await page.click('.btn-login-submit');
  await page.waitForTimeout(1200);

  for (const route of ROUTES_DIRECTION) {
    currentRoute = route;
    await page.goto(`http://localhost:5173/#${route}`);
    await page.waitForTimeout(450);
  }

  console.log('=== Errors by route (Direction) ===');
  for (const [route, errs] of Object.entries(errorsByRoute)) {
    console.log(`${route}: ${errs.length} error(s)`);
    errs.slice(0, 3).forEach(e => console.log('   ' + e.slice(0, 200)));
  }
  if (!Object.keys(errorsByRoute).length) console.log('No errors on any route.');

  await browser.close();
})();

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errorsByCtx = {};
  let ctx = 'login';
  page.on('pageerror', e => { (errorsByCtx[ctx] = errorsByCtx[ctx] || []).push('PAGEERROR: ' + e.message); });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('404') || t.includes('Failed to load resource')) return;
      (errorsByCtx[ctx] = errorsByCtx[ctx] || []).push('CONSOLE: ' + t);
    }
  });

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

  const users = ['ouiam', 'imane', 'yasser', 'mansouri', 'zoubida', 'nisrine', 'mohammed'];
  const routes = ['dashboard', 'monAgenda', 'notifications', 'monProgramme', 'mesTaches', 'mesObjectifs', 'monRapportJournalier'];

  for (const u of users) {
    await login(u, 'ubos2026');
    for (const r of routes) {
      ctx = `${u}#${r}`;
      await page.goto(`http://localhost:5173/#${r}`);
      await page.waitForTimeout(400);
    }
  }

  // Direction: open real fiche pages with actual codes
  await login('oumaima', 'ubos2026');
  ctx = 'find-codes';
  const clientCode = await page.evaluate(async () => {
    const r = await fetch('/api/db').catch(() => null);
    return null;
  }).catch(() => null);

  // Navigate generic lists and click first row's fiche link where present
  const listRoutes = ['clients', 'demandes', 'dossiers', 'commandes', 'arrivages', 'taches', 'documents'];
  for (const lr of listRoutes) {
    ctx = `list-${lr}`;
    await page.goto(`http://localhost:5173/#${lr}`);
    await page.waitForTimeout(500);
    const link = page.locator('table tbody tr').first().locator('td.code a').first();
    const count = await link.count();
    if (count) {
      const href = await link.getAttribute('href');
      ctx = `fiche-from-${lr} (${href})`;
      await link.click();
      await page.waitForTimeout(600);
    } else {
      ctx = `list-${lr}-empty`;
    }
  }

  console.log('=== Errors by context ===');
  let any = false;
  for (const [c, errs] of Object.entries(errorsByCtx)) {
    any = true;
    console.log(`${c}: ${errs.length} error(s)`);
    errs.slice(0, 3).forEach(e => console.log('   ' + e.slice(0, 250)));
  }
  if (!any) console.log('No errors across any role/route/fiche.');

  await browser.close();
})();

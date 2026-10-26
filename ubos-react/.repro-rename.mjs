import { chromium } from 'playwright';
import { createServer } from 'vite';

const NEW_CODE = process.argv[2] || '9700';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true });
const log = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => log.push(`PAGEERROR ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') log.push(`CONSOLE.error ${m.text().slice(0, 300)}`); });
  const user = { code: 'TEST', identifiant: 'test', nomComplet: 'Test Data', departement: 'Direction', services: ['Data', 'Direction'], actif: true };
  const clients = [
    { id: 'L1', code: 'L1', codeClientUltex: 'L1', nom: 'Alpha', segment: 'Prospect', ts: 1 },
    { id: '9650', code: '9650', codeClientUltex: '9650', nom: 'Numeric existing', segment: 'Prospect', ts: 2 },
  ];
  const db = { seq: {}, utilisateurs: [user], clients, demandes: [{ id: 'D1', code: 'D1', client: 'L1', statut: 'Nouvelle', ts: 1 }], audit: [], notifs: [], documents: [], _loadedCollections: ['utilisateurs', 'clients', 'demandes'] };
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (req.method() !== 'GET') log.push(`API ${req.method()} ${p} ${String(req.postData() || '').slice(0, 160)}`);
    if (p.includes('/clients/') && p.endsWith('/code')) {
      const code = JSON.parse(req.postData()).code;
      return route.fulfill({ json: { client: { ...clients[0], id: code, code, codeClientUltex: code } } });
    }
    if (p.endsWith('/db/patch') || p.endsWith('/db/sync')) return route.fulfill({ json: { status: 'success' } });
    if (p.includes('/collections/')) {
      const all = db[p.split('/collections/')[1]] || [];
      return route.fulfill({ json: { items: all, page: 1, pageSize: 500, total: all.length, totalPages: 1, groupCounts: {} } });
    }
    if (p.endsWith('/auth/me')) return route.fulfill({ json: { user } });
    if (p.endsWith('/health')) return route.fulfill({ json: { status: 'ok' } });
    if (p.endsWith('/api/db')) return route.fulfill({ json: db });
    return route.fulfill({ json: { items: [], total: 0, totalPages: 1 } });
  });
  await page.addInitScript(() => localStorage.setItem('ubos_token', 'test-only'));
  await page.goto(server.resolvedUrls.local[0] + '#ficheClient:L1');
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await page.waitForTimeout(600);
  const field = page.locator('#f_codeClientUltex');
  log.push(`code field present: ${await field.count()} value=${await field.inputValue().catch(() => '?')}`);
  await field.fill(NEW_CODE);
  for (let i = 0; i < 12; i++) {
    const next = page.getByRole('button', { name: 'Suivant →' });
    if (!(await next.count())) break;
    await next.click(); await page.waitForTimeout(150);
  }
  const btn = page.getByRole('button', { name: 'Enregistrer', exact: true });
  log.push(`Enregistrer count=${await btn.count()} enabled=${await btn.isEnabled().catch(() => '?')}`);
  log.push(`--- CLICK Enregistrer (code -> ${NEW_CODE})`);
  await btn.click({ timeout: 5000 }).catch(e => log.push(`CLICK FAILED ${e.message.split('\n')[0]}`));
  const toasts = [];
  for (let i = 0; i < 12; i++) { const t = (await page.locator('.toast').allInnerTexts()).filter(Boolean); toasts.push(...t); await page.waitForTimeout(250); }
  log.push(`toasts: ${JSON.stringify([...new Set(toasts)])}`, `modal still open: ${(await page.locator('.voile.on').count()) > 0}`, `hash: ${await page.evaluate(() => location.hash)}`);
} catch (e) {
  log.push(`SCRIPT ERROR ${e.message}`);
} finally {
  console.log(log.join('\n'));
  await browser.close();
  await server.close();
}

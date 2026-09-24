export const FIRST_AUTOMATIC_NUMERIC_CLIENT_CODE = 9600;
const COUNTER_KEY = 'CLIENT_NUMERIC';

export function nextNumericClientNumber(codes, counterValue = 0, minimum = FIRST_AUTOMATIC_NUMERIC_CLIENT_CODE) {
  let highest = Number(minimum) - 1;
  for (const value of codes || []) {
    const code = String(value || '').trim();
    if (/^\d+$/.test(code)) highest = Math.max(highest, Number(code));
  }
  return Math.max(Number(minimum), highest + 1, Number(counterValue || 0) + 1);
}

export async function reserveNextNumericClientCode(prisma) {
  return prisma.$transaction(async tx => {
    // One allocator shared by every server process. The counter also reserves
    // a number before the browser persists its client, preventing two open
    // CRM sessions from receiving the same code.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9600, 2026)`;
    const clients = await tx.collectionItem.findMany({
      where: { collection: 'clients' },
      select: { id: true, code: true, data: true },
    });
    const codes = clients.flatMap(client => [
      client.id,
      client.code,
      client.data?.codeClientUltex,
    ]);
    const current = await tx.sequenceCounter.findUnique({ where: { key: COUNTER_KEY } });
    let number = nextNumericClientNumber(codes, current?.val || 0);

    for (let attempt = 0; attempt < 10000; attempt += 1, number += 1) {
      const code = String(number);
      const used = await tx.collectionItem.findFirst({
        where: { OR: [{ id: code }, { code }] },
        select: { id: true },
      });
      if (used) continue;
      await tx.sequenceCounter.upsert({
        where: { key: COUNTER_KEY },
        create: { key: COUNTER_KEY, val: number },
        update: { val: number },
      });
      return code;
    }
    throw new Error('Aucun code client numérique disponible');
  }, { maxWait: 15000, timeout: 30000 });
}

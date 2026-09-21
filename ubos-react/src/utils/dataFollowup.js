export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${localDay(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function deadlineDue(value, now = new Date()) {
  return !!value && new Date(value).getTime() <= now.getTime();
}

export function recordFollowup(client, patch, { actor, notes = '', action = 'Modification', now = new Date() } = {}) {
  const stateChanged = ['dataTag', 'etapePipeline', 'segment'].some(key => key in patch && patch[key] !== client[key]);
  const version = (Number(client.etatVersion) || 0) + (stateChanged ? 1 : 0);
  const entry = {
    id: globalThis.crypto.randomUUID(), ts: now.getTime(), date: now.toISOString(),
    utilisateur: actor, action, notes,
    avant: client.dataTag || client.etapePipeline || client.segment || '',
    etat: patch.dataTag ?? client.dataTag ?? patch.etapePipeline ?? client.etapePipeline ?? '',
    etape: patch.etapePipeline ?? client.etapePipeline ?? '', version,
    echeance: patch.echeanceCode ?? client.echeanceCode ?? '',
  };
  return {
    ...client, ...patch, etatVersion: version,
    ...(stateChanged ? { dateDernierChangementEtat: now.toISOString() } : {}),
    historiqueSuivi: [...(client.historiqueSuivi || []), entry],
  };
}

const normalize = value => String(value || '').trim().toLowerCase();

export function demandeIdentifiers(demande) {
  return [
    demande?.code,
    demande?.id,
    demande?.referenceMetier,
    demande?.source_demande_id,
    demande?.referenceWorkflow,
    demande?.ultexDossierId,
  ].map(normalize).filter(Boolean);
}

export function findDemandeByIdentifier(demandes, identifier) {
  const expected = normalize(identifier);
  if (!expected) return null;
  return (demandes || []).find(demande => demandeIdentifiers(demande).includes(expected)) || null;
}

export function canonicalDemandeCode(demande, fallback = '') {
  return String(demande?.code || demande?.id || fallback || '').trim();
}

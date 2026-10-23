const JOURNEY_STEPS = [
  'Data / Premier contact',
  'Sourcing / Négociation',
  'Calcul',
  'Validation',
  'Closing',
];

const normalize = value => String(value || '').trim().toLowerCase();

const timestamp = item => {
  const raw = item?.updatedAt || item?.dateHeureReception || item?.dateDemande || item?.dateCreation || item?.ts || 0;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const demandReference = demande => demande?.referenceMetier || demande?.referenceCode || demande?.code || '—';

const isTerminalDemand = demande => ['clôturée', 'non confirmée', 'reportée'].includes(normalize(demande?.statut));

const matchesClient = (item, clientCode) => {
  const target = normalize(clientCode);
  return [item?.client, item?.codeClient, item?.codeClientUltex]
    .some(value => normalize(value) === target);
};

const chooseActiveDemand = (demandes, clientCode) => {
  const related = demandes.filter(item => matchesClient(item, clientCode));
  const open = related.filter(item => !isTerminalDemand(item));
  return [...(open.length ? open : related)].sort((a, b) => timestamp(b) - timestamp(a))[0] || null;
};

const hasAny = (values, candidates) => {
  const normalized = values.map(normalize);
  return candidates.some(candidate => normalized.includes(normalize(candidate)));
};

export const buildClientJourney = (db = {}, clientCode = '') => {
  const demande = chooseActiveDemand(db.demandes || [], clientCode);
  if (!demande) {
    return {
      demande: null,
      reference: null,
      currentStep: 1,
      complete: false,
      steps: JOURNEY_STEPS.map((label, index) => ({ label, state: index === 0 ? 'active' : 'pending' })),
    };
  }

  const lines = (db.demandeLignes || []).filter(line => line.demande === demande.code);
  const sourceRecords = (db.sourcings || []).filter(item =>
    item.demande === demande.code || item.demandeCode === demande.code || matchesClient(item, clientCode)
  );
  const closingRecords = (db.suivisClosing || [])
    .filter(item => matchesClient(item, clientCode))
    .sort((a, b) => timestamp(b) - timestamp(a));
  const closing = closingRecords[0] || null;

  const demandStatus = normalize(demande.statut);
  const lineStatuses = lines.map(line => line.statut);
  const closingStatus = normalize(closing?.statutPipeline);
  const sourcingTag = normalize(demande.sourcingTag);
  const calculTag = normalize(demande.calculTag);
  const closingTag = normalize(demande.closingTag);

  const sourcingStarted = Boolean(
    sourceRecords.length || sourcingTag ||
    ['sourcing', 'négociation'].some(value => normalize(demande.typeDemande).includes(normalize(value))) ||
    hasAny([demande.statut, ...lineStatuses], ['En sourcing', 'Fournisseur trouvé', 'En étude technique', 'En calcul', 'Calcul terminé', 'Prête pour offre', 'Offre envoyée', 'En Closing', 'Confirmée'])
  );

  const calculationStarted = Boolean(
    ['attente_validation', 'devis_genere', 'override_manuel'].includes(calculTag) ||
    hasAny([demande.statut, ...lineStatuses], ['En calcul', 'Calcul terminé', 'Prête pour offre', 'Offre envoyée', 'En Closing', 'Confirmée']) ||
    ['calcul demandé', 'calcul en cours', 'devis en cours', 'devis à contrôler', 'devis validé', 'devis envoyé', 'négociation', 'accord', 'confirmation', 'avance reçue'].includes(closingStatus)
  );

  const validationStarted = Boolean(
    ['attente_validation', 'devis_genere'].includes(calculTag) ||
    hasAny([demande.statut, ...lineStatuses], ['Calcul terminé', 'Prête pour offre', 'Offre envoyée', 'En Closing', 'Confirmée']) ||
    ['devis à contrôler', 'devis validé', 'devis envoyé', 'négociation', 'accord', 'confirmation', 'avance reçue'].includes(closingStatus)
  );

  const closingStarted = Boolean(
    closingTag || demande.closingEtat || demande.closingStatus ||
    ['en closing', 'partiellement confirmée', 'confirmée', 'clôturée'].includes(demandStatus) ||
    ['devis envoyé', 'négociation', 'accord', 'confirmation', 'avance reçue'].includes(closingStatus)
  );

  const complete = Boolean(
    ['converti', 'cloture', 'clôturé'].includes(closingTag) ||
    ['confirmée', 'clôturée'].includes(demandStatus) ||
    ['confirmation', 'avance reçue'].includes(closingStatus)
  );

  let currentStep = 1;
  if (sourcingStarted) currentStep = 2;
  if (calculationStarted) currentStep = 3;
  if (validationStarted) currentStep = 4;
  if (closingStarted) currentStep = 5;

  return {
    demande,
    reference: demandReference(demande),
    currentStep,
    complete,
    steps: JOURNEY_STEPS.map((label, index) => {
      const step = index + 1;
      const state = complete || step < currentStep ? 'done' : (step === currentStep ? 'active' : 'pending');
      return { label, state };
    }),
  };
};


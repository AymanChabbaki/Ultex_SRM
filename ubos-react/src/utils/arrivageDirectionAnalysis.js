const joinValues = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].join(', ');

const firstValue = (...values) => values.find(value => value !== undefined && value !== null && String(value).trim() !== '') || '';

const documentNames = documents => (documents || []).map(document => `${document.nom || ''} ${document.type || ''}`.toLocaleLowerCase('fr'));

const hasDocument = (documents, words) => {
  const names = documentNames(documents);
  return names.some(name => words.some(word => name.includes(word)));
};

const formatNumber = (value, suffix = '') => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `${numeric.toLocaleString('fr-FR')} ${suffix}`.trim() : '';
};

const docItem = (id, label, words) => ({ id, label, expectedDocument: true, read: context => (
  hasDocument(context.documents, words) ? 'Document reçu' : ''
) });

export const LIMEX_DIRECTION_STATUSES = [
  'Non vérifié', 'Conforme', 'À vérifier', 'À corriger', 'Manquant', 'À recevoir', 'Bloquant', 'N/A',
];

export const LIMEX_DIRECTION_SECTIONS = [
  {
    id: 'general', title: 'Informations générales',
    items: [
      { id: 'commandes', label: 'Commandes rattachées', read: c => c.commandReferences },
      { id: 'clients', label: 'Clients concernés', read: c => c.clientNames },
      { id: 'produits', label: 'Produits concernés', read: c => c.productNames },
      { id: 'operation', label: "Type d'opération", read: c => firstValue(c.arrivage.type, 'Import') },
      { id: 'mode', label: 'Mode de transport', read: c => c.modeTransport },
      { id: 'origine', label: "Pays d'origine", read: c => c.origin },
      { id: 'destination', label: 'Destination', read: c => c.destination },
      { id: 'eta', label: 'Date cible / ETA', read: c => c.eta },
    ],
  },
  {
    id: 'technique', title: 'Documents techniques produit',
    items: [
      { id: 'designation', label: 'Désignation détaillée', read: c => c.productDescriptions },
      { id: 'reference', label: 'Références / modèles', read: c => c.productReferences },
      { id: 'usage', label: 'Usage du produit', read: c => c.productUsage },
      { id: 'matiere', label: 'Matière / composition', read: c => c.productMaterials },
      { id: 'dimensions', label: 'Dimensions et emballage', read: c => c.productDimensions },
      docItem('fiche-technique', 'Fiche technique', ['fiche technique', 'technical data', 'datasheet']),
      docItem('photos', 'Photos du produit', ['photo', 'image', 'catalogue']),
    ],
  },
  {
    id: 'fournisseur', title: 'Fournisseur',
    items: [
      { id: 'identite', label: 'Identité du fournisseur', read: c => c.supplierNames },
      { id: 'coordonnees', label: 'Coordonnées complètes', read: c => c.supplierContacts },
      { id: 'pays', label: 'Pays / ville fournisseur', read: c => c.supplierLocations },
      { id: 'fabricant', label: 'Fabricant réel confirmé', read: c => c.manufacturers },
      { id: 'fiabilite', label: 'Vérification / fiabilité fournisseur', read: c => c.supplierReliability },
      { id: 'disponibilite', label: 'Disponibilité déclarée', read: c => c.availability },
    ],
  },
  {
    id: 'commercial', title: 'Proforma et documents commerciaux',
    items: [
      docItem('proforma', 'Proforma reçue', ['proforma', 'pi-']),
      { id: 'description', label: 'Description des produits', read: c => c.productDescriptions },
      { id: 'quantites-prix', label: 'Quantités et prix', read: c => c.quantitiesAndPrices },
      { id: 'incoterm', label: 'Incoterm indiqué', read: c => c.incoterms },
      { id: 'provenance', label: 'Origine et provenance', read: c => joinValues([c.origin, c.provenance]) },
      { id: 'shipping', label: 'Frais de shipping', read: c => c.shippingCosts },
      docItem('packing-list', 'Packing List', ['packing list', 'packing', 'pl-']),
      docItem('facture-commerciale', 'Facture commerciale', ['commercial invoice', 'facture commerciale']),
    ],
  },
  {
    id: 'origine-valeur', title: 'Origine, Incoterm et valeur',
    items: [
      { id: 'origine', label: "Pays d'origine", read: c => c.origin },
      { id: 'provenance', label: 'Pays / ville de provenance', read: c => c.provenance },
      { id: 'incoterm', label: 'Incoterm négocié', read: c => c.incoterms },
      { id: 'valeur', label: 'Valeur marchandise', read: c => c.goodsValue },
      { id: 'devise', label: 'Devise et conversion', read: c => c.currencies },
      { id: 'transport-inclus', label: 'Transport inclus dans le prix', read: c => c.shippingCosts },
      docItem('origine-doc', "Certificat d'origine", ['certificat origine', "certificat d'origine", 'certificate of origin']),
    ],
  },
  {
    id: 'douane', title: 'Position tarifaire et réglementation',
    items: [
      { id: 'hs', label: 'HS Code proposé', read: c => c.hsCodes },
      { id: 'droits', label: 'Droits et taxes estimés', read: c => c.customsTaxes },
      { id: 'normes', label: 'Normes applicables', read: c => c.regulations },
      { id: 'certificats', label: 'Certificats requis', read: c => c.certifications },
      { id: 'autorisations', label: 'Autorisations / licences', read: c => c.authorizations },
      { id: 'laboratoire', label: 'Contrôle laboratoire', read: c => c.laboratory },
      { id: 'restriction', label: "Restrictions à l'importation", read: c => c.restrictions },
    ],
  },
  {
    id: 'paiements', title: 'Paiements et banque',
    items: [
      { id: 'conditions', label: 'Conditions de paiement fournisseur', read: c => c.paymentTerms },
      { id: 'avance', label: 'Avance fournisseur', read: c => c.advancePayments },
      { id: 'reliquat', label: 'Reliquat fournisseur', read: c => c.balancePayments },
      { id: 'beneficiaire', label: 'Bénéficiaire du paiement', read: c => c.paymentBeneficiaries },
      { id: 'banque', label: 'Coordonnées bancaires', read: c => c.bankDetails },
      docItem('preuve-paiement', 'Preuve / reçu de paiement', ['swift', 'reçu', 'recu', 'preuve paiement', 'payment receipt']),
    ],
  },
  {
    id: 'production', title: 'Production et disponibilité',
    items: [
      { id: 'stock', label: 'Stock disponible', read: c => c.availability },
      { id: 'delai', label: 'Délai de production', read: c => c.productionLeadTime },
      { id: 'debut', label: 'Date de lancement production', read: c => c.productionStart },
      { id: 'fin', label: 'Date de fin prévisionnelle', read: c => c.productionEnd },
      { id: 'inspection', label: 'Inspection / contrôle qualité', read: c => c.inspection },
      { id: 'echantillon', label: 'Échantillon validé', read: c => c.samples },
    ],
  },
  {
    id: 'transport', title: 'Transport',
    items: [
      { id: 'mode', label: 'Mode de transport confirmé', read: c => c.modeTransport },
      { id: 'cotation', label: 'Offre / cotation transport', read: c => c.transportOffer },
      { id: 'transporteur', label: 'Transporteur / compagnie', read: c => c.carriers },
      { id: 'enlevement', label: "Adresse d'enlèvement", read: c => c.pickup },
      { id: 'poids-volume', label: 'Poids et volume', read: c => c.weightVolume },
      { id: 'reservation', label: 'Réservation transport', read: c => c.booking },
      { id: 'assurance', label: 'Assurance transport', read: c => c.insurance },
    ],
  },
  {
    id: 'chargement', title: 'Chargement et expédition',
    items: [
      { id: 'emballage', label: 'Emballage final', read: c => c.productDimensions },
      { id: 'colis', label: 'Nombre de colis / cartons', read: c => c.packages },
      { id: 'conteneur', label: 'Conteneur / équipement', read: c => c.container },
      { id: 'plomb', label: 'N° de plomb', read: c => c.seal },
      { id: 'etd', label: 'Date de départ prévue (ETD)', read: c => c.etd },
      docItem('bl-draft', 'BL / AWB draft', ['bl draft', 'draft bl', 'awb draft']),
    ],
  },
  {
    id: 'transit', title: 'Transit et arrivée',
    items: [
      { id: 'tracking', label: 'N° de suivi', read: c => c.tracking },
      { id: 'eta', label: 'ETA prévue / actualisée', read: c => c.eta },
      { id: 'bl-maitre', label: 'BL maître / AWB', read: c => joinValues([c.masterBl, c.awb]) },
      { id: 'bl-house', label: 'BL house', read: c => c.houseBl },
      { id: 'agent', label: 'Agent destination', read: c => c.destinationAgent },
      { id: 'port', label: "Port / aéroport d'arrivée", read: c => c.destination },
    ],
  },
  {
    id: 'declaration', title: 'Déclaration douanière',
    items: [
      docItem('facture-finale', 'Facture commerciale définitive', ['commercial invoice', 'facture commerciale']),
      docItem('packing-final', 'Packing List définitive', ['packing list', 'packing']),
      docItem('certificat-origine', "Certificat d'origine", ['certificat origine', "certificat d'origine", 'certificate of origin']),
      { id: 'hs-final', label: 'HS Code final', read: c => c.hsCodes },
      { id: 'valeur-douane', label: 'Valeur en douane', read: c => c.goodsValue },
      docItem('dum', 'DUM / déclaration', ['dum', 'déclaration douanière', 'declaration douaniere']),
      docItem('bad', 'BAD / mainlevée', ['bad', 'mainlevée', 'mainlevee']),
    ],
  },
  {
    id: 'livraison', title: 'Stockage et livraison',
    items: [
      { id: 'sortie', label: 'Date de sortie prévue', read: c => c.releaseDate },
      { id: 'stockage', label: 'Stockage / magasinage', read: c => c.storage },
      { id: 'transport-local', label: 'Transport national', read: c => c.localTransport },
      { id: 'adresse', label: 'Adresse de livraison', read: c => c.deliveryAddress },
      { id: 'date', label: 'Date de livraison cible', read: c => c.deliveryDate },
      { id: 'reception', label: 'Preuve de réception client', read: c => c.deliveryProof },
    ],
  },
  {
    id: 'risques', title: 'Risques et clôture',
    items: [
      { id: 'risque', label: 'Niveau de risque global', read: c => c.riskLevel },
      { id: 'blocages', label: 'Points bloquants', read: c => c.blockingPoints },
      { id: 'frais', label: 'Frais additionnels identifiés', read: c => c.additionalCosts },
      { id: 'engagements', label: 'Engagements client / fournisseur', read: c => c.commitments },
      { id: 'litiges', label: 'Litiges ou réserves', read: c => c.disputes },
      { id: 'recommandation', label: 'Recommandation finale Direction', read: c => c.recommendation },
    ],
  },
];

export function buildDirectionAnalysisContext(db, arrivage) {
  const commandes = (db.commandes || []).filter(item => (arrivage.commandes || []).includes(item.code));
  const lines = commandes.flatMap(commande => (commande.lignes || []).map(line => ({ ...line, commande })));
  const clients = [...new Set(commandes.map(commande => commande.client).filter(Boolean))]
    .map(code => (db.clients || []).find(client => client.code === code) || { code, nom: code });
  const supplierCodes = [...new Set(lines.map(line => line.fournisseur).filter(Boolean))];
  const suppliers = supplierCodes.map(code => (db.fournisseurs || []).find(item => item.code === code) || { code, nom: code });
  const commandCodes = new Set(commandes.map(item => item.code));
  const documents = (db.documents || []).filter(document => document.arrivage === arrivage.code || commandCodes.has(document.commande));
  const payments = (db.paiements || []).filter(payment => commandCodes.has(payment.commande) || (commandes.some(c => c.paiement === payment.code)));

  const field = key => joinValues(lines.map(line => line[key]));
  const supplierField = key => joinValues(suppliers.map(item => item[key]));
  const commandField = key => joinValues(commandes.map(item => item[key]));
  const productNames = joinValues(lines.map(line => firstValue(line.nomProduit, line.produit, line.designationExacte)));
  const productDescriptions = joinValues(lines.map(line => firstValue(line.designationTechnique, line.description, line.nomProduit)));
  const quantitiesAndPrices = joinValues(lines.map(line => {
    const quantity = firstValue(line.quantite, line.quantity);
    const price = firstValue(line.prixUnitaire, line.prixFOB, line.prix, line.unitPrice);
    const currency = firstValue(line.devise, line.currency, 'USD');
    return [quantity ? `${quantity} ${line.unite || ''}`.trim() : '', price ? `${price} ${currency}` : ''].filter(Boolean).join(' · ');
  }));
  const totalWeight = lines.reduce((sum, line) => sum + Number(line.poidsBrutTotal || line.poids || 0), 0);
  const totalCbm = lines.reduce((sum, line) => sum + Number(line.cbmTotal || line.cbm || 0), 0);
  const paid = payments.filter(item => ['Payé', 'Confirmé', 'Autorisé'].includes(item.statut));

  return {
    arrivage, commandes, lines, clients, suppliers, documents, payments,
    commandReferences: joinValues(commandes.map(item => firstValue(item.referenceMetier, item.code))),
    clientNames: joinValues(clients.map(item => firstValue(item.nom, item.code))),
    productNames: productNames || arrivage.produitSource || '',
    productDescriptions: productDescriptions || arrivage.produitSource || '',
    quantitiesAndPrices,
    productReferences: joinValues(lines.map(line => firstValue(line.referenceMetier, line.reference, line.modele, line.sku))),
    productUsage: field('usage'),
    productMaterials: joinValues(lines.map(line => firstValue(line.matiere, line.composition))),
    productDimensions: joinValues(lines.map(line => firstValue(line.dimensions, line.dimensionCarton, line.emballage))),
    supplierNames: joinValues(suppliers.map(item => firstValue(item.nom, item.raisonSociale, item.code))),
    supplierContacts: joinValues(suppliers.map(item => [item.contact, item.telephone, item.email].filter(Boolean).join(' · '))),
    supplierLocations: joinValues(suppliers.map(item => [item.ville, item.pays].filter(Boolean).join(', '))),
    manufacturers: joinValues(lines.map(line => firstValue(line.fabricantReel, line.fabricant))),
    supplierReliability: supplierField('statutValidation'),
    availability: joinValues(lines.map(line => firstValue(line.disponibilite, line.stock, line.statutStock))),
    modeTransport: firstValue(arrivage.modeTransport, commandField('modeTransport')),
    origin: firstValue(arrivage.paysOrigine, field('paysOrigine')),
    provenance: firstValue(arrivage.villeEnlevement, arrivage.portDepart, field('paysProvenance')),
    destination: firstValue(arrivage.portArrivee, commandField('villeLivraison'), 'Maroc'),
    eta: firstValue(arrivage.etaActualisee, arrivage.etaPrevue),
    etd: firstValue(arrivage.dateDepartReelle, arrivage.dateDepartPrevue),
    incoterms: joinValues([arrivage.incotermSource, field('incoterm'), commandField('incoterm')]),
    shippingCosts: joinValues(lines.map(line => firstValue(line.shippingCost, line.coutTransportOrigine, line.fraisShipping))),
    goodsValue: firstValue(arrivage.totalImporteSource, commandField('montantTotal'), commandField('valeurMarchandise')),
    currencies: joinValues(lines.map(line => firstValue(line.devise, line.currency))),
    hsCodes: joinValues(lines.map(line => firstValue(line.hsCode, line.hs_code, line.codeHs))),
    customsTaxes: joinValues(lines.map(line => [line.di ? `DI ${line.di}%` : '', line.tpi ? `TPI ${line.tpi}%` : '', line.tva ? `TVA ${line.tva}%` : ''].filter(Boolean).join(' · '))),
    regulations: joinValues(lines.map(line => firstValue(line.normes, line.reglementation, line.documentsRequis))),
    certifications: joinValues(lines.map(line => firstValue(line.organismesConcernes, line.certifications, line.documentsRequis))),
    authorizations: field('autorisations'), laboratory: field('laboratoire'), restrictions: field('restrictions'),
    paymentTerms: joinValues(lines.map(line => firstValue(line.conditionsPaiement, line.paiementFournisseur))),
    advancePayments: joinValues(paid.filter(item => /avance|acompte/i.test(`${item.type || ''} ${item.nature || ''}`)).map(item => `${item.montant || ''} ${item.devise || 'MAD'}`)),
    balancePayments: joinValues(paid.filter(item => /reliquat|solde/i.test(`${item.type || ''} ${item.nature || ''}`)).map(item => `${item.montant || ''} ${item.devise || 'MAD'}`)),
    paymentBeneficiaries: joinValues(payments.map(item => firstValue(item.beneficiaire, item.fournisseur))),
    bankDetails: joinValues(payments.map(item => firstValue(item.banque, item.referenceBancaire))),
    productionLeadTime: joinValues(lines.map(line => firstValue(line.delaiProduction, line.delai, line.leadTime))),
    productionStart: field('dateDebutProduction'), productionEnd: field('dateFinProduction'),
    inspection: joinValues(lines.map(line => firstValue(line.inspection, line.controleQualite))), samples: field('echantillon'),
    transportOffer: firstValue(arrivage.offreTransportSource, arrivage.cotationTransport),
    carriers: joinValues([arrivage.compagnieSource, arrivage.compagnie, arrivage.transporteur]),
    pickup: firstValue(arrivage.villeEnlevement, arrivage.portDepart),
    weightVolume: joinValues([formatNumber(totalWeight, 'kg'), formatNumber(totalCbm, 'CBM'), arrivage.volumePoidsSource]),
    booking: firstValue(arrivage.numReservation), insurance: firstValue(arrivage.assurance, commandField('assurance')),
    packages: joinValues(lines.map(line => firstValue(line.nbCartons, line.nombreCartons, line.nbColis))),
    container: joinValues([arrivage.typeConteneur, arrivage.numConteneur]), seal: arrivage.numPlomb || '',
    tracking: firstValue(arrivage.trackingSource, arrivage.numeroSuivi), masterBl: arrivage.numBLMaitre || '',
    houseBl: arrivage.numBLHouse || '', awb: arrivage.numAWB || '', destinationAgent: arrivage.agentDestination || '',
    releaseDate: arrivage.dateSortieSource || '', storage: firstValue(arrivage.stockage, arrivage.magasinage),
    localTransport: firstValue(arrivage.transporteur, arrivage.transportNational), deliveryAddress: commandField('adresseLivraison'),
    deliveryDate: firstValue(arrivage.dateLivraisonPrevue, commandField('dateLivraison')), deliveryProof: '',
    riskLevel: firstValue(arrivage.niveauRisque, 'À évaluer'), blockingPoints: arrivage.pointsBloquants || '',
    additionalCosts: joinValues((arrivage.frais || []).map(item => `${item.typeFrais || 'Frais'} : ${item.montant || 0} MAD`)),
    commitments: joinValues(commandes.map(item => item.condition)), disputes: arrivage.litiges || '', recommendation: arrivage.recommandationDirection || '',
  };
}

export function createDirectionAnalysisDraft(db, arrivage, existing = null) {
  const context = buildDirectionAnalysisContext(db, arrivage);
  const controls = {};
  LIMEX_DIRECTION_SECTIONS.forEach(section => {
    controls[section.id] = {};
    section.items.forEach(item => {
      const current = String(item.read(context) || '').trim();
      controls[section.id][item.id] = {
        current,
        status: current ? 'À vérifier' : (item.expectedDocument ? 'À recevoir' : 'Manquant'),
        observation: '',
        documentCode: '',
      };
    });
  });
  const defaults = {
    arrivage: arrivage.code,
    activeSection: LIMEX_DIRECTION_SECTIONS[0].id,
    urgency: firstValue(arrivage.niveauRisque, 'Normale'),
    informationLevel: 'Partiellement',
    generalObservation: '',
    immediateAttention: '',
    complements: '',
    mainSource: 'Dossier UBOS',
    controlStatus: 'À vérifier',
    blockage: 'Aucun',
    releaseCondition: '',
    directionValidation: 'En attente',
    mainObservations: '',
    directionDecisions: '',
    identifiedRisks: '',
    complementRequests: [],
    selectedProductIndex: 0,
    decisionRequired: '',
    decisionApproved: false,
    validatedSections: [],
    controls,
    status: 'Brouillon',
  };
  if (!existing) return defaults;
  const mergedControls = { ...controls };
  Object.entries(existing.controls || {}).forEach(([sectionId, rows]) => {
    mergedControls[sectionId] = { ...(controls[sectionId] || {}), ...(rows || {}) };
  });
  return { ...defaults, ...existing, controls: mergedControls };
}

export function summarizeDirectionAnalysis(draft) {
  const counts = { conformes: 0, verifier: 0, corrections: 0, manquants: 0, bloquants: 0, nonApplicables: 0, total: 0 };
  Object.values(draft?.controls || {}).forEach(section => {
    Object.values(section || {}).forEach(control => {
      counts.total += 1;
      if (control.status === 'Conforme') counts.conformes += 1;
      else if (control.status === 'À vérifier' || control.status === 'Non vérifié') counts.verifier += 1;
      else if (control.status === 'À corriger') counts.corrections += 1;
      else if (control.status === 'Manquant' || control.status === 'À recevoir') counts.manquants += 1;
      else if (control.status === 'Bloquant') counts.bloquants += 1;
      else if (control.status === 'N/A') counts.nonApplicables += 1;
    });
  });
  return counts;
}

export function sectionProgress(draft, sectionId) {
  const controls = Object.values(draft?.controls?.[sectionId] || {});
  const applicable = controls.filter(control => control.status !== 'N/A');
  const completed = applicable.filter(control => control.status === 'Conforme').length;
  return { completed, total: applicable.length, percent: applicable.length ? Math.round((completed / applicable.length) * 100) : 100 };
}

export function missingDirectionInformation(draft) {
  const missingStatuses = new Set(['Manquant', 'À recevoir', 'À corriger', 'Bloquant']);
  return LIMEX_DIRECTION_SECTIONS.flatMap(section => section.items.map(item => {
    const control = draft?.controls?.[section.id]?.[item.id];
    return control && missingStatuses.has(control.status)
      ? { sectionId: section.id, section: section.title, label: item.label, status: control.status }
      : null;
  }).filter(Boolean));
}

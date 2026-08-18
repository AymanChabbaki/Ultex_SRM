export const ETAPES = ["Sourcing","Études & Chiffrage","Closing","Paiement","Analyse Dossier","Transport","Transit & Douane","Certification","Livraison","Suivi Client","Clôturé"];
export const SERVICE_ETAPE = {"Sourcing":"Sourcing","Études & Chiffrage":"Études & Chiffrage","Closing":"Closing","Paiement":"Finance","Analyse Dossier":"Analyse Dossiers","Transport":"Transport","Transit & Douane":"Transit & Douane","Certification":"Analyse Dossiers","Livraison":"Transport","Suivi Client":"Suivi Client","Clôturé":"Direction"};
export const USERS = ["Direction","Data","Sourcing","Études & Chiffrage","Closing","Finance","Analyse Dossiers","Transport","Transit & Douane","Suivi Client","Digital"];

export const PAYS_MONDE = [
  {n:"Afghanistan",c:"AF"}, {n:"Afrique du Sud",c:"ZA"}, {n:"Albanie",c:"AL"}, {n:"Algérie",c:"DZ"},
  {n:"Allemagne",c:"DE"}, {n:"Andorre",c:"AD"}, {n:"Angola",c:"AO"}, {n:"Arabie saoudite",c:"SA"},
  {n:"Argentine",c:"AR"}, {n:"Arménie",c:"AM"}, {n:"Australie",c:"AU"}, {n:"Autriche",c:"AT"},
  {n:"Azerbaïdjan",c:"AZ"}, {n:"Bahamas",c:"BS"}, {n:"Bahreïn",c:"BH"}, {n:"Bangladesh",c:"BD"},
  {n:"Belgique",c:"BE"}, {n:"Bénin",c:"BJ"}, {n:"Bhoutan",c:"BT"}, {n:"Biélorussie",c:"BY"},
  {n:"Birmanie",c:"MM"}, {n:"Bolivie",c:"BO"}, {n:"Bosnie-Herzégovine",c:"BA"}, {n:"Botswana",c:"BW"},
  {n:"Brésil",c:"BR"}, {n:"Brunei",c:"BN"}, {n:"Bulgarie",c:"BG"}, {n:"Burkina Faso",c:"BF"},
  {n:"Burundi",c:"BI"}, {n:"Cambodge",c:"KH"}, {n:"Cameroun",c:"CM"}, {n:"Canada",c:"CA"},
  {n:"Cap-Vert",c:"CV"}, {n:"Chili",c:"CL"}, {n:"Chine",c:"CN"}, {n:"Chypre",c:"CY"},
  {n:"Colombie",c:"CO"}, {n:"Comores",c:"KM"}, {n:"Congo",c:"CG"}, {n:"Congo (RDC)",c:"CD"},
  {n:"Corée du Nord",c:"KP"}, {n:"Corée du Sud",c:"KR"}, {n:"Costa Rica",c:"CR"}, {n:"Côte d'Ivoire",c:"CI"},
  {n:"Croatie",c:"HR"}, {n:"Cuba",c:"CU"}, {n:"Danemark",c:"DK"}, {n:"Djibouti",c:"DJ"},
  {n:"Dominique",c:"DM"}, {n:"Égypte",c:"EG"}, {n:"Émirats arabes unis",c:"AE"}, {n:"Équateur",c:"EC"},
  {n:"Érythrée",c:"ER"}, {n:"Espagne",c:"ES"}, {n:"Estonie",c:"EE"}, {n:"Eswatini",c:"SZ"},
  {n:"États-Unis",c:"US"}, {n:"Éthiopie",c:"ET"}, {n:"Fidji",c:"FJ"}, {n:"Finlande",c:"FI"},
  {n:"France",c:"FR"}, {n:"Gabon",c:"GA"}, {n:"Gambie",c:"GM"}, {n:"Géorgie",c:"GE"},
  {n:"Ghana",c:"GH"}, {n:"Grèce",c:"GR"}, {n:"Grenade",c:"GD"}, {n:"Guatemala",c:"GT"},
  {n:"Guinée",c:"GN"}, {n:"Guinée-Bissau",c:"GW"}, {n:"Guinée équatoriale",c:"GQ"}, {n:"Guyana",c:"GY"},
  {n:"Haïti",c:"HT"}, {n:"Honduras",c:"HN"}, {n:"Hongrie",c:"HU"}, {n:"Îles Marshall",c:"MH"},
  {n:"Îles Salomon",c:"SB"}, {n:"Inde",c:"IN"}, {n:"Indonésie",c:"ID"}, {n:"Irak",c:"IQ"},
  {n:"Iran",c:"IR"}, {n:"Irlande",c:"IE"}, {n:"Islande",c:"IS"}, {n:"Israël",c:"IL"},
  {n:"Italie",c:"IT"}, {n:"Jamaïque",c:"JM"}, {n:"Japon",c:"JP"}, {n:"Jordanie",c:"JO"},
  {n:"Kazakhstan",c:"KZ"}, {n:"Kenya",c:"KE"}, {n:"Kirghizistan",c:"KG"}, {n:"Kiribati",c:"KI"},
  {n:"Kosovo",c:"XK"}, {n:"Koweït",c:"KW"}, {n:"Laos",c:"LA"}, {n:"Lesotho",c:"LS"},
  {n:"Lettonie",c:"LV"}, {n:"Liban",c:"LB"}, {n:"Liberia",c:"LR"}, {n:"Libye",c:"LY"},
  {n:"Liechtenstein",c:"LI"}, {n:"Lituanie",c:"LT"}, {n:"Luxembourg",c:"LU"}, {n:"Macédoine du Nord",c:"MK"},
  {n:"Madagascar",c:"MG"}, {n:"Malaisie",c:"MY"}, {n:"Malawi",c:"MW"}, {n:"Maldives",c:"MV"},
  {n:"Mali",c:"ML"}, {n:"Malte",c:"MT"}, {n:"Maroc",c:"MA"}, {n:"Maurice",c:"MU"},
  {n:"Mauritanie",c:"MR"}, {n:"Mexique",c:"MX"}, {n:"Micronésie",c:"FM"}, {n:"Moldavie",c:"MD"},
  {n:"Monaco",c:"MC"}, {n:"Mongolie",c:"MN"}, {n:"Monténégro",c:"ME"}, {n:"Mozambique",c:"MZ"},
  {n:"Namibie",c:"NA"}, {n:"Nauru",c:"NR"}, {n:"Népal",c:"NP"}, {n:"Nicaragua",c:"NI"},
  {n:"Niger",c:"NE"}, {n:"Nigeria",c:"NG"}, {n:"Norvège",c:"NO"}, {n:"Nouvelle-Zélande",c:"NZ"},
  {n:"Oman",c:"OM"}, {n:"Ouganda",c:"UG"}, {n:"Ouzbékistan",c:"UZ"}, {n:"Pakistan",c:"PK"},
  {n:"Palaos",c:"PW"}, {n:"Palestine",c:"PS"}, {n:"Panama",c:"PA"}, {n:"Papouasie-Nouvelle-Guinée",c:"PG"},
  {n:"Paraguay",c:"PY"}, {n:"Pays-Bas",c:"NL"}, {n:"Pérou",c:"PE"}, {n:"Philippines",c:"PH"},
  {n:"Pologne",c:"PL"}, {n:"Portugal",c:"PT"}, {n:"Qatar",c:"QA"}, {n:"République centrafricaine",c:"CF"},
  {n:"République dominicaine",c:"DO"}, {n:"République tchèque",c:"CZ"}, {n:"Roumanie",c:"RO"},
  {n:"Royaume-Uni",c:"GB"}, {n:"Russie",c:"RU"}, {n:"Rwanda",c:"RW"}, {n:"Saint-Marin",c:"SM"},
  {n:"Sainte-Lucie",c:"LC"}, {n:"Salvador",c:"SV"}, {n:"Samoa",c:"WS"}, {n:"Sao Tomé-et-Principe",c:"ST"},
  {n:"Sénégal",c:"SN"}, {n:"Serbie",c:"RS"}, {n:"Seychelles",c:"SC"}, {n:"Sierra Leone",c:"SL"},
  {n:"Singapour",c:"SG"}, {n:"Slovaquie",c:"SK"}, {n:"Slovénie",c:"SI"}, {n:"Somalie",c:"SO"},
  {n:"Soudan",c:"SD"}, {n:"Soudan du Sud",c:"SS"}, {n:"Sri Lanka",c:"LK"}, {n:"Suède",c:"SE"},
  {n:"Suisse",c:"CH"}, {n:"Suriname",c:"SR"}, {n:"Syrie",c:"SY"}, {n:"Tadjikistan",c:"TJ"},
  {n:"Tanzanie",c:"TZ"}, {n:"Tchad",c:"TD"}, {n:"Thaïlande",c:"TH"}, {n:"Timor oriental",c:"TL"},
  {n:"Togo",c:"TG"}, {n:"Tonga",c:"TO"}, {n:"Trinité-et-Tobago",c:"TT"}, {n:"Tunisie",c:"TN"},
  {n:"Turkménistan",c:"TM"}, {n:"Turquie",c:"TR"}, {n:"Tuvalu",c:"TV"}, {n:"Ukraine",c:"UA"},
  {n:"Uruguay",c:"UY"}, {n:"Vanuatu",c:"VU"}, {n:"Vatican",c:"VA"}, {n:"Venezuela",c:"VE"},
  {n:"Viêt Nam",c:"VN"}, {n:"Yémen",c:"YE"}, {n:"Zambie",c:"ZM"}, {n:"Zimbabwe",c:"ZW"}
];

export const INCOTERMS_2020 = [
  {code:"EXW", nom:"Ex Works — À l'usine", exp:"Le vendeur met la marchandise à disposition dans ses locaux. L'acheteur supporte tous les frais et risques dès l'enlèvement.", ex:"Ex Works Shenzhen — l'acheteur organise et paie tout depuis l'usine du fournisseur."},
  {code:"FCA", nom:"Free Carrier — Franco Transporteur", exp:"Le vendeur livre la marchandise, dédouanée à l'export, au transporteur désigné par l'acheteur au lieu convenu.", ex:"FCA Shanghai Port — le vendeur livre au transitaire désigné par ULTEx à Shanghai."},
  {code:"CPT", nom:"Carriage Paid To — Port payé jusqu'à", exp:"Le vendeur paie le transport jusqu'au lieu de destination convenu ; le risque passe à l'acheteur dès la remise au premier transporteur.", ex:"CPT Casablanca — le vendeur paie le fret jusqu'à Casablanca, mais le risque passe plus tôt."},
  {code:"CIP", nom:"Carriage and Insurance Paid To — Port payé, assurance comprise jusqu'à", exp:"Comme CPT, avec en plus une assurance transport (couverture large) prise en charge par le vendeur.", ex:"CIP Casablanca — fret et assurance tous risques inclus jusqu'à Casablanca."},
  {code:"DAP", nom:"Delivered At Place — Rendu au lieu de destination", exp:"Le vendeur livre la marchandise, prête à être déchargée, au lieu de destination convenu. Le dédouanement import reste à la charge de l'acheteur.", ex:"DAP entrepôt ULTEx Casablanca — le vendeur assume le transport jusqu'à l'arrivée, hors douane import."},
  {code:"DPU", nom:"Delivered at Place Unloaded — Rendu au lieu déchargé", exp:"Comme DAP, mais le vendeur assume aussi le déchargement au lieu de destination.", ex:"DPU entrepôt ULTEx — la marchandise est livrée ET déchargée par le vendeur."},
  {code:"DDP", nom:"Delivered Duty Paid — Rendu droits acquittés", exp:"Le vendeur assume tous les frais et risques jusqu'à destination, y compris les droits de douane et taxes à l'import.", ex:"DDP Casablanca — le fournisseur chinois livre et paie même les droits de douane marocains."},
  {code:"FAS", nom:"Free Alongside Ship — Franco le long du navire", exp:"(Maritime uniquement) Le vendeur livre la marchandise le long du navire au port d'embarquement.", ex:"FAS Port de Shenzhen — marchandise posée sur le quai, prête à être chargée."},
  {code:"FOB", nom:"Free On Board — Franco à bord", exp:"(Maritime uniquement) Le vendeur supporte les frais jusqu'au chargement à bord du navire ; le risque passe une fois la marchandise à bord.", ex:"FOB Shenzhen — ULTEx paie et organise le fret maritime à partir de l'embarquement."},
  {code:"CFR", nom:"Cost and Freight — Coût et fret", exp:"(Maritime uniquement) Le vendeur paie le transport maritime jusqu'au port de destination ; le risque passe dès le chargement à bord.", ex:"CFR Casablanca — le vendeur paie le fret maritime, mais pas l'assurance."},
  {code:"CIF", nom:"Cost, Insurance and Freight — Coût, assurance et fret", exp:"(Maritime uniquement) Comme CFR, avec en plus une assurance minimale prise en charge par le vendeur jusqu'au port de destination.", ex:"CIF Casablanca — fret maritime et assurance de base inclus jusqu'au port d'arrivée."}
];

export const PAYS_FAVORIS_ULTEX = ["CN","FR","ES","IT","TR","AE","US","DE","NL","MA"];
export const FORMULES_ULTEX = ["ECG Maritime","DGI Maritime","DGI Aérien","DGI Routier","Transport + Transit","Transport + Transit + Livraison","Certification + Transit","Sourcing + Étude","Service complet","Sur mesure"];
export const IMPORTATEUR_OFFICIEL_OPTIONS = ["ULTEx","Société du client","Client particulier","Société partenaire","Importateur tiers","À définir"];
export const SERVICES_ULTEX = ["Sourcing fournisseur","Vérification fournisseur","Négociation fournisseur","Étude technique","Étude & Chiffrage","Calcul import","Paiement fournisseur","Contrôle documentaire","Transport international","Assurance transport","Certification","Transit","Dédouanement","PortNet","Transport national","Livraison finale","Stockage","Suivi fournisseur","Gestion litige","Facturation finale","Autre service personnalisé"];

export const PACKAGE_SERVICES_MAP = {
  "ECG Maritime": ["Sourcing fournisseur","Négociation fournisseur","Étude & Chiffrage","Paiement fournisseur","Transport international","Transit","Dédouanement","Livraison finale"],
  "DGI Maritime": ["Sourcing fournisseur","Négociation fournisseur","Étude & Chiffrage","Paiement fournisseur","Transport international","Transit","Dédouanement"],
  "DGI Aérien": ["Sourcing fournisseur","Négociation fournisseur","Étude & Chiffrage","Paiement fournisseur","Transport international","Transit","Dédouanement"],
  "DGI Routier": ["Sourcing fournisseur","Négociation fournisseur","Étude & Chiffrage","Paiement fournisseur","Transport international","Transit","Dédouanement"],
  "Transport + Transit": ["Transport international","Transit","Dédouanement"],
  "Transport + Transit + Livraison": ["Transport international","Transit","Dédouanement","Livraison finale"],
  "Certification + Transit": ["Certification","Transit","Dédouanement"],
  "Sourcing + Étude": ["Sourcing fournisseur","Étude & Chiffrage"],
  "Service complet": SERVICES_ULTEX.filter(s=>s!=="Autre service personnalisé"),
  "Sur mesure": []
};

export const SERVICE_TACHES = {
  "Sourcing fournisseur": ["Rechercher des fournisseurs","Comparer les offres"],
  "Vérification fournisseur": ["Vérifier le fournisseur (usine, KYC)"],
  "Négociation fournisseur": ["Négocier prix et conditions"],
  "Étude technique": ["Réaliser l'étude technique"],
  "Étude & Chiffrage": ["Chiffrer le dossier"],
  "Calcul import": ["Calculer les coûts d'import"],
  "Paiement fournisseur": ["Préparer le paiement fournisseur","Effectuer le paiement fournisseur"],
  "Contrôle documentaire": ["Contrôler les documents fournisseur"],
  "Transport international": ["Cotation transport","Réservation transport","Suivre le BL / AWB"],
  "Assurance transport": ["Souscrire l'assurance transport"],
  "Certification": ["Lancer la procédure de certification"],
  "Transit": ["Ouvrir le dossier transit","Déposer le DUM","Obtenir le BAD","Sortie du port"],
  "Dédouanement": ["Contrôle douanier"],
  "PortNet": ["Déclaration PortNet"],
  "Transport national": ["Organiser le transport national"],
  "Livraison finale": ["Planifier la livraison finale"],
  "Stockage": ["Réserver un emplacement de stockage"],
  "Suivi fournisseur": ["Assurer le suivi fournisseur"],
  "Gestion litige": ["Ouvrir le dossier litige"],
  "Facturation finale": ["Préparer la facture finale"],
  "Autre service personnalisé": ["Traiter le service personnalisé"]
};

export const MODES_TRANSPORT_DETAIL = {
  "Maritime": ["LCL / Groupage","FCL 20 pieds","FCL 40 pieds","FCL 40 HC","Open Top","Flat Rack","Reefer","Ro-Ro","Vrac","Autre"],
  "Aérien": ["Fret aérien standard","Express","Courrier","Charter","Marchandise dangereuse","Autre"],
  "Routier": ["Camion complet","Groupage routier","Fourgon","Plateau","Frigorifique","ADR","Autre"],
  "National": ["Livraison port → client","Enlèvement fournisseur","Transfert entre entrepôts","Livraison dernier kilomètre"],
  "Multimodal": ["Combiné mer + route","Combiné air + route","Autre combinaison"],
  "Aucun transport": ["Service sans transport physique"]
};

export const CATEGORIES_TRANSPORT = Object.keys(MODES_TRANSPORT_DETAIL);
export const STATUTS_ARRIVAGE = ["Préparation","Attente documents","Attente réservation","Réservé","Enlèvement prévu","Marchandise enlevée","Empotage","Départ confirmé","En transit","Arrivé au port","Avis d'arrivée reçu","En attente BAD","En dédouanement","Contentieux","Sorti du port","En stockage","En livraison","Livré partiellement","Livré totalement","Clôturé","Bloqué","Annulé","Historique partiellement migré"];
export const PROPRIETAIRES_MARCHANDISE = ["Client ULTEx","ULTEx pour compte propre","Société liée à ULTEx","Autre partenaire"];

export const TYPES_PARTENAIRE = ["Transitaire","Freight forwarder","Compagnie maritime","Compagnie aérienne","Transporteur international","Transporteur national","Agent origine","Agent destination","Courtier","Entrepôt","Manutentionnaire","Laboratoire","Organisme certification","Assureur","Autre"];
export const STATUTS_PARTENAIRE = ["Prospect","En test","Actif","Préféré","Suspendu","Blacklisté","Ancien partenaire","À réévaluer"];

export const STATUTS_DEMANDE = ["Brouillon","Nouvelle","À compléter","En traitement","En sourcing","En étude technique","En calcul","En cotation transport","En analyse réglementaire","Prête pour Closing","En Closing","Partiellement confirmée","Confirmée","Non confirmée","Reportée","Clôturée"];
export const STATUTS_LIGNE_DEMANDE = ["Brouillon","Nouvelle","À compléter","En sourcing","Fournisseur trouvé","En étude technique","En calcul","Calcul terminé","En transport","Transport reçu","En réglementation","Prête pour offre","Offre envoyée","Confirmée","Non confirmée","Reportée","Clôturée"];
export const ROUTES_LIGNE_DEMANDE = ["Sourcing","Vérification fournisseur","Étude technique","Calcul & Chiffrage","Cotation transport","Analyse réglementaire","Closing","Direction"];
export const CANAUX_RECEPTION_DEMANDE = ["WhatsApp","Appel téléphonique","Visite bureau","Email","Site web","Réseaux sociaux","Recommandation","Ancienne relation","Autre"];
export const TYPES_PROJET_DEMANDE = ["Première importation","Réapprovisionnement","Nouveau produit","Création d'activité","Développement d'activité existante","Machine ou équipement","Matière première","Import ponctuel","Projet industriel","Autre"];
export const TYPES_USAGE_DEMANDE = ["Revente","Usage professionnel","Usage personnel"];
export const STATUTS_HS_CODE = ["Fourni par le fournisseur","À analyser","Proposé","Vérifié","Validé","Contesté"];
export const CRITERES_CLIENT_DEMANDE = ["Prix","Qualité","Rapidité","Certification","Marque","Exclusivité","Faible MOQ","Personnalisation","Autre"];
export const TYPES_TRAITEMENT_LIGNE = ["Sourcing nécessaire","Fournisseur connu, Proforma disponible","Fournisseur connu, offre incomplète","Calcul direct possible","Étude technique nécessaire","Analyse réglementaire nécessaire","Cotation transport nécessaire","Informations client manquantes","Traitement combiné"];
export const PIPELINE_ETAPES_CLIENT = ["Prospect","Informations incomplètes","Attente photos","Attente fournisseur","Attente HS Code","Attente quantité","Prêt pour Demande","Envoyé vers Calcul","Envoyé vers Sourcing","Transformé en Commande","Transformé en Dossier"];

export const PRIORITES_TACHE = ["Critique","Très urgente","Urgente","Haute","Normale","Basse"];
export const STATUTS_TACHE = ["À faire","Planifiée","En cours","En attente d'un collègue","En attente client","En attente fournisseur","En attente Direction","Bloquée","Terminée","Terminée avec réserve","Terminée — En attente de validation","Reportée","Annulée"];
export const TYPES_TACHE = ["Action commerciale","Calcul & Chiffrage","Sourcing","Transport & Logistique","Réglementation & LIMEX","Finance & Comptabilité","Administratif","Contrôle qualité","Validation","Autre"];
export const OBJETS_LIABLES_TACHE = [
  {v:"clients", l:"Client", fiche:"ficheClient"},
  {v:"demandes", l:"Demande", fiche:"ficheDemande"},
  {v:"demandeLignes", l:"Ligne de demande", fiche:"ficheDemandeLigne"},
  {v:"commandes", l:"Commande", fiche:"ficheCommande"},
  {v:"arrivages", l:"Arrivage", fiche:"ficheArrivage"},
  {v:"fournisseurs", l:"Fournisseur", fiche:""},
  {v:"partenaires", l:"Partenaire", fiche:""},
  {v:"paiements", l:"Paiement", fiche:""},
  {v:"documents", l:"Document", fiche:"ficheDocument"}
];
export const RECURRENCES_TACHE = ["Aucune","Quotidienne","Hebdomadaire","Mensuelle"];
export const STATUTS_CONSULTATION_FOURN = ["À contacter","Contacté","Attente réponse","Offre reçue","Offre incomplète","En négociation","Recommandé","Non retenu","Refusé","Sans réponse"];
export const CONDITIONS_COMMANDE = ["Devis accepté","Bon de commande signé","Contrat signé","Acompte reçu","Preuve de paiement reçue","Validation exceptionnelle de la Direction"];
export const METHODES_REPARTITION = ["Par poids","Par CBM","Par valeur marchandise","Par nombre de colis","Montant égal par dossier","Montant manuel","Non réparti","Entièrement affecté à ULTEx","Entièrement affecté à un dossier précis"];
export const CATEGORIES_FRAIS_ARRIVAGE = ["Fret international","Assurance","Manutention","Déchargement","Frais portuaires","Magasinage","Surestaries","Transit","Transport national","Inspection","Certification","Laboratoire","Frais bancaires","Autres frais"];
export const RESULTATS_ANALYSE_LIMEX = ["Validé","Validé sous réserve","Informations manquantes","Bloqué","Importation déconseillée","Validation Direction nécessaire"];

export const ANALYSE_LIMEX_SECTIONS = [
  {id:"produit", titre:"A. Produit", champs:[
    {k:"designationExacte",l:"Désignation exacte",t:"text"},{k:"usage",l:"Usage",t:"text"},{k:"matiere",l:"Matière",t:"text"},
    {k:"marque",l:"Marque",t:"text"},{k:"modele",l:"Modèle",t:"text"},{k:"hsCodeProduit",l:"HS Code proposé",t:"text"},
    {k:"neufOccasion",l:"Neuf ou occasion",t:"select",opts:["Neuf","Occasion"]},{k:"dangereux",l:"Dangereux",t:"select",opts:["Non","Oui"]},
    {k:"restriction",l:"Restriction éventuelle",t:"textarea",large:1}]},
  {id:"commercial", titre:"B. Commercial", champs:[
    {k:"factureProforma",l:"Facture proforma reçue",t:"select",opts:["Non","Oui"]},{k:"prixCommercial",l:"Prix",t:"number"},{k:"deviseCommercial",l:"Devise",t:"select",opts:["MAD","USD","EUR","CNY"]},
    {k:"incotermCommercial",l:"Incoterm",t:"incoterm"},{k:"paiementFournisseur",l:"Paiement fournisseur",t:"text"},
    {k:"conditionsConvenues",l:"Conditions convenues",t:"textarea"},{k:"quantiteCommercial",l:"Quantité",t:"text"},
    {k:"coherenceDevis",l:"Cohérence avec le devis client",t:"select",opts:["Cohérent","Écart à vérifier"]}]},
  {id:"transport", titre:"C. Transport", champs:[
    {k:"adresseEnlevement",l:"Adresse d'enlèvement",t:"text",large:1},{k:"poidsTransport",l:"Poids",t:"number"},{k:"volumeTransport",l:"Volume",t:"number"},
    {k:"dimensions",l:"Dimensions",t:"text"},{k:"nbColis",l:"Nombre de colis",t:"number"},{k:"emballage",l:"Emballage",t:"text"},
    {k:"portAeroportAnalyse",l:"Port / aéroport",t:"text"},{k:"transportAdapte",l:"Transport adapté",t:"select",opts:["Non vérifié","Confirmé"]},
    {k:"cotationValide",l:"Cotation valide",t:"select",opts:["Non","Oui"]}]},
  {id:"douane", titre:"D. Douane", champs:[
    {k:"hsCodeDouane",l:"HS Code",t:"text"},{k:"droitsDouaneAnalyse",l:"Droits",t:"text"},{k:"tvaAnalyse",l:"TVA",t:"text"},
    {k:"valeurDeclaree",l:"Valeur déclarée",t:"number"},{k:"valeurReference",l:"Valeur de référence potentielle",t:"number"},
    {k:"origineAnalyse",l:"Origine",t:"pays"},{k:"accordPreferentiel",l:"Accord préférentiel",t:"select",opts:["Aucun","Applicable"]},
    {k:"eur1",l:"EUR.1 / EUR-MED",t:"select",opts:["Non concerné","À obtenir","Obtenu"]},
    {k:"risqueReevaluation",l:"Risque de réévaluation",t:"select",opts:["Faible","Moyen","Élevé"]},{k:"risqueContentieux",l:"Risque contentieux",t:"select",opts:["Faible","Moyen","Élevé"]}]},
  {id:"conformite", titre:"E. Conformité", champs:[
    {k:"cCOC",l:"COC",t:"select",opts:["Non concerné","À faire","Fait"]},{k:"cONSSA",l:"ONSSA",t:"select",opts:["Non concerné","À faire","Fait"]},
    {k:"cANRT",l:"ANRT",t:"select",opts:["Non concerné","À faire","Fait"]},{k:"cIMANOR",l:"IMANOR",t:"select",opts:["Non concerné","À faire","Fait"]},
    {k:"cMCIA",l:"MCIA",t:"select",opts:["Non concerné","À faire","Fait"]},{k:"cLabo",l:"Laboratoire",t:"select",opts:["Non concerné","À faire","Fait"]},
    {k:"cEtiquetage",l:"Étiquetage",t:"select",opts:["Non concerné","À faire","Fait"]},{k:"cLicence",l:"Licence d'importation",t:"select",opts:["Non concerné","À faire","Fait"]},
    {k:"cEngagement",l:"Engagement de non-commercialisation",t:"select",opts:["Non concerné","À faire","Fait"]},{k:"cAutres",l:"Autres autorisations",t:"textarea",large:1}]},
  {id:"documents", titre:"F. Documents", champs:[
    {k:"dProforma",l:"Proforma Invoice",t:"select",opts:["Attendu","Reçu"]},{k:"dCommercial",l:"Commercial Invoice",t:"select",opts:["Attendu","Reçu"]},
    {k:"dPacking",l:"Packing List",t:"select",opts:["Attendu","Reçu"]},{k:"dOrigine",l:"Certificat d'origine",t:"select",opts:["Attendu","Reçu"]},
    {k:"dBLDraft",l:"BL draft",t:"select",opts:["Attendu","Reçu"]},{k:"dFicheTech",l:"Fiche technique",t:"select",opts:["Attendu","Reçu"]},
    {k:"dPhotos",l:"Photos",t:"select",opts:["Attendu","Reçu"]},{k:"dCatalogues",l:"Catalogues",t:"select",opts:["Attendu","Reçu"]},
    {k:"dConformite",l:"Certificat de conformité",t:"select",opts:["Attendu","Reçu"]},{k:"dAutres",l:"Autres documents",t:"textarea",large:1}]}
];

export const ARBORESCENCE_DOCUMENTAIRE = ["00 — Résumé dossier","01 — Client et commande","02 — Fournisseur","03 — Factures","04 — Packing List","05 — Transport","06 — BL / AWB / CMR","07 — Banque et SWIFT","08 — Douane et DUM","09 — Certifications","10 — BAD et mainlevée","11 — Magasinage / surestaries","12 — Livraison","13 — Facturation finale","14 — Litige / contentieux","15 — Photos et preuves","16 — Communications","17 — Clôture"];

export const PORTS_MONDE = [
  {n:"Shenzhen (Yantian)", v:"Shenzhen", p:"Chine", l:"CNSZX"},{n:"Shanghai", v:"Shanghai", p:"Chine", l:"CNSHA"},
  {n:"Ningbo-Zhoushan", v:"Ningbo", p:"Chine", l:"CNNGB"},{n:"Guangzhou", v:"Guangzhou", p:"Chine", l:"CNCAN"},
  {n:"Qingdao", v:"Qingdao", p:"Chine", l:"CNTAO"},{n:"Xiamen", v:"Xiamen", p:"Chine", l:"CNXMN"},
  {n:"Hong Kong", v:"Hong Kong", p:"Chine (RAS)", l:"HKHKG"},{n:"Tianjin", v:"Tianjin", p:"Chine", l:"CNTSN"},
  {n:"Casablanca", v:"Casablanca", p:"Maroc", l:"MACAS"},{n:"Tanger Med", v:"Tanger", p:"Maroc", l:"MAPTM"},
  {n:"Agadir", v:"Agadir", p:"Maroc", l:"MAAGA"},{n:"Nador", v:"Nador", p:"Maroc", l:"MANDR"},
  {n:"Jorf Lasfar", v:"El Jadida", p:"Maroc", l:"MAJRF"},
  {n:"Algésiras", v:"Algésiras", p:"Espagne", l:"ESALG"},{n:"Valence", v:"Valence", p:"Espagne", l:"ESVLC"},
  {n:"Barcelone", v:"Barcelone", p:"Espagne", l:"ESBCN"},
  {n:"Marseille-Fos", v:"Marseille", p:"France", l:"FRMRS"},{n:"Le Havre", v:"Le Havre", p:"France", l:"FRLEH"},
  {n:"Gênes", v:"Gênes", p:"Italie", l:"ITGOA"},{n:"La Spezia", v:"La Spezia", p:"Italie", l:"ITSPE"},
  {n:"Ambarli (Istanbul)", v:"Istanbul", p:"Turquie", l:"TRAMB"},{n:"Mersin", v:"Mersin", p:"Turquie", l:"TRMER"},
  {n:"Jebel Ali (Dubaï)", v:"Dubaï", p:"Émirats arabes unis", l:"AEJEA"},
  {n:"Rotterdam", v:"Rotterdam", p:"Pays-Bas", l:"NLRTM"},{n:"Hambourg", v:"Hambourg", p:"Allemagne", l:"DEHAM"},
  {n:"Anvers", v:"Anvers", p:"Belgique", l:"BEANR"},
  {n:"Los Angeles / Long Beach", v:"Los Angeles", p:"États-Unis", l:"USLAX"},{n:"New York / New Jersey", v:"New York", p:"États-Unis", l:"USNYC"},{n:"Savannah", v:"Savannah", p:"États-Unis", l:"USSAV"},
  {n:"Nhava Sheva (JNPT)", v:"Mumbai", p:"Inde", l:"INNSA"},
  {n:"Ho Chi Minh Ville (Cat Lai)", v:"Ho Chi Minh Ville", p:"Viêt Nam", l:"VNSGN"},
  {n:"Busan", v:"Busan", p:"Corée du Sud", l:"KRPUS"},
  {n:"Alexandrie", v:"Alexandrie", p:"Égypte", l:"EGALY"},{n:"Port-Saïd", v:"Port-Saïd", p:"Égypte", l:"EGPSD"},{n:"Damiette", v:"Damiette", p:"Égypte", l:"EGDAM"},
  {n:"Le Pirée", v:"Athènes", p:"Grèce", l:"GRPIR"},{n:"Southampton", v:"Southampton", p:"Royaume-Uni", l:"GBSOU"},
  {n:"Djeddah (Jeddah Islamic Port)", v:"Djeddah", p:"Arabie saoudite", l:"SAJED"},
  {n:"Lagos (Apapa)", v:"Lagos", p:"Nigeria", l:"NGAPP"},{n:"Dakar", v:"Dakar", p:"Sénégal", l:"SNDKR"},
  {n:"Abidjan", v:"Abidjan", p:"Côte d'Ivoire", l:"CIABJ"},{n:"Tunis-Rades", v:"Tunis", p:"Tunisie", l:"TNTUN"},
  {n:"Singapour", v:"Singapour", p:"Singapour", l:"SGSIN"},{n:"Port Klang", v:"Klang", p:"Malaisie", l:"MYPKG"}
];

export const AEROPORTS_MONDE = [
  {n:"Shenzhen Bao'an", v:"Shenzhen", p:"Chine", i:"SZX"},{n:"Guangzhou Baiyun", v:"Guangzhou", p:"Chine", i:"CAN"},
  {n:"Shanghai Pudong", v:"Shanghai", p:"Chine", i:"PVG"},{n:"Hong Kong", v:"Hong Kong", p:"Chine (RAS)", i:"HKG"},
  {n:"Pékin Capital", v:"Pékin", p:"Chine", i:"PEK"},{n:"Yiwu", v:"Yiwu", p:"Chine", i:"YIW"},
  {n:"Mohammed V", v:"Casablanca", p:"Maroc", i:"CMN"},{n:"Ibn Battouta", v:"Tanger", p:"Maroc", i:"TNG"},
  {n:"Marrakech Ménara", v:"Marrakech", p:"Maroc", i:"RAK"},{n:"Al Massira", v:"Agadir", p:"Maroc", i:"AGA"},
  {n:"Paris Charles de Gaulle", v:"Paris", p:"France", i:"CDG"},{n:"Madrid Barajas", v:"Madrid", p:"Espagne", i:"MAD"},
  {n:"Barcelone El Prat", v:"Barcelone", p:"Espagne", i:"BCN"},{n:"Istanbul", v:"Istanbul", p:"Turquie", i:"IST"},
  {n:"Dubaï International", v:"Dubaï", p:"Émirats arabes unis", i:"DXB"},{n:"Francfort", v:"Francfort", p:"Allemagne", i:"FRA"},
  {n:"Amsterdam Schiphol", v:"Amsterdam", p:"Pays-Bas", i:"AMS"},{n:"Londres Heathrow", v:"Londres", p:"Royaume-Uni", i:"LHR"},
  {n:"Milan Malpensa", v:"Milan", p:"Italie", i:"MXP"},{n:"New York JFK", v:"New York", p:"États-Unis", i:"JFK"},
  {n:"Los Angeles", v:"Los Angeles", p:"États-Unis", i:"LAX"},{n:"Le Caire", v:"Le Caire", p:"Égypte", i:"CAI"},
  {n:"Djeddah King Abdulaziz", v:"Djeddah", p:"Arabie saoudite", i:"JED"},{n:"Lagos Murtala Muhammed", v:"Lagos", p:"Nigeria", i:"LOS"}
];

export const CATEGORIES_DOCUMENT = ["Client","Commande","Contrat","Bon de commande","Proforma Invoice","Commercial Invoice","Packing List","Paiement","SWIFT","Banque","Transport","BL Draft","BL Original","AWB","CMR","Certificat d'origine","EUR.1 / EUR-MED","COC","ONSSA","ANRT","IMANOR","Laboratoire","DUM","BAD","Mainlevée","Magasinage","Surestaries","Livraison","Facture finale","Reliquat","Réclamation","Litige","Photos","Preuves","Autre"];
export const TYPES_FICHIER_DOCUMENT = ["PDF","JPG","JPEG","PNG","WEBP","DOC","DOCX","XLS","XLSX","CSV","TXT","ZIP","Lien Google Drive","Lien OneDrive","Lien Dropbox","Lien externe","Lien fournisseur","Lien vidéo","Lien catalogue","Lien fiche technique"];
export const STATUTS_DOCUMENT = ["Attendu","Reçu","En vérification","À corriger","Validé","Rejeté","Expiré","Remplacé","Archivé"];
export const ROLES_VALIDATION_DOCUMENT = ["Agent","Responsable service","LIMEX","Finance","Direction"];
export const TYPES_MESSAGE = ["Information","Action demandée","Validation demandée","Document à vérifier","Document à corriger","Urgent","Relance","Décision","Alerte","Transfert de responsabilité"];
export const PRIORITES_MESSAGE = ["Normale","Élevée","Urgente"];

export const PFX_ANNEE = ["DOS","FF","AV","REL","ABD","IMP","RMB","CMD","DMD","ARR"];
export const COLLS = ["clients","leads","fournisseurs","produits","dossiers","sourcings","etudes","offres","paiements","analyses","transports","transits","documents","taches","rapports","reclamations","stockage","certifs","transportsNat","pmtIntl","erreurs","utilisateurs","facturesFinales","avoirsFF","abandons","impayes","remboursements","contacts","demandes","commandes","arrivages","analysesLimex","bonsLancement","stocks","mouvementsStock","livraisons","transfertsServices","communicationsDossier","partenaires","importJobs","importFiles","importModels","importMappings","importRows","importErrors","importHistory","importDetectedTypes","importExtractedData","importAttachments","importRollbacks","controlesLimex","dossierControlesLimex","limexDiagnosticOumaima","limexPortesValidation","limexImportHistory","demandeLignes","demandeRoutages","objectifsData","tacheEtapes","rapportsJournaliers","journalSecurite"];

// ---------- Checklist Maître LIMEX (import CHECKLIST_MAITRE_ULTEX_LIMEX.xlsx, onglet 3_Checklist_Maitre) ----------
export const STATUTS_CONTROLE_LIMEX = [
  "Non commencé", "Applicable", "N/A", "A demander", "Demandé", "En attente",
  "Reçu à contrôler", "Non conforme", "Correction demandée", "Bloqué",
  "Validé par Imane", "Validation Oumaima requise", "Validé définitivement"
];
export const COULEUR_STATUT_LIMEX = {
  "Validé par Imane": "p-vert", "Validé définitivement": "p-vert",
  "En attente": "p-ambre", "Demandé": "p-ambre", "Reçu à contrôler": "p-ambre", "Correction demandée": "p-ambre",
  "Bloqué": "p-rouge", "Non conforme": "p-rouge",
  "N/A": "p-gris", "Non commencé": "p-gris",
  "Validation Oumaima requise": "p-jaune", "A demander": "p-jaune"
};
export const PRIORITES_CONTROLE_LIMEX = [
  { code: "P0", label: "P0 — Blocage immédiat (interdit de payer/expédier)" },
  { code: "P1", label: "P1 — Avant paiement de l'avance" },
  { code: "P2", label: "P2 — Avant lancement de production" },
  { code: "P3", label: "P3 — Avant paiement du reliquat" },
  { code: "P4", label: "P4 — Avant expédition" },
  { code: "P5", label: "P5 — Avant arrivée au Maroc" },
  { code: "P6", label: "P6 — Pendant le dédouanement" },
  { code: "P7", label: "P7 — Avant livraison" },
  { code: "P8", label: "P8 — À clôturer après livraison" }
];
export const PORTES_VALIDATION_LIMEX = [
  { n: 1, titre: "Autorisation de paiement de l'avance", phases: ["4. Paiement avance"] },
  { n: 2, titre: "Autorisation de lancement de production", phases: ["5. Production"] },
  { n: 3, titre: "Autorisation de paiement du reliquat", phases: ["6. Paiement reliquat"] },
  { n: 4, titre: "Autorisation d'expédition", phases: ["7. Expedition", "8. Transport"] },
  { n: 5, titre: "Validation du dossier avant arrivée (ETA)", phases: ["9. Preparation douaniere"] },
  { n: 6, titre: "Validation du budget douanier", phases: ["9. Preparation douaniere"] },
  { n: 7, titre: "Autorisation de dédouanement", phases: ["10. Dedouanement"] },
  { n: 8, titre: "Autorisation de livraison", phases: ["11. Livraison"] },
  { n: 9, titre: "Autorisation de clôture", phases: ["12. Cloture / REX"] }
];
export const DECISIONS_PORTE_LIMEX = ["En attente", "GO", "GO sous conditions", "STOP"];

export const MODULES_LIBRES = ["dashboard","monAgenda","notifications","rapports"];
export const MODULES_DIRECTION = ["auditGlobal","utilisateurs","rapportDirection","performance","importCentre","risquesClients"];

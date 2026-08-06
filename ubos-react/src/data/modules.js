import {
    USERS, STATUTS_DEMANDE, CONDITIONS_COMMANDE, FORMULES_ULTEX,
    IMPORTATEUR_OFFICIEL_OPTIONS, PROPRIETAIRES_MARCHANDISE, CATEGORIES_TRANSPORT,
    MODES_TRANSPORT_DETAIL, ETAPES, STATUTS_ARRIVAGE, TYPES_PARTENAIRE,
    STATUTS_PARTENAIRE, CATEGORIES_DOCUMENT, TYPES_FICHIER_DOCUMENT, STATUTS_DOCUMENT,
    TYPES_MESSAGE, PRIORITES_MESSAGE,
    CANAUX_RECEPTION_DEMANDE, TYPES_PROJET_DEMANDE, TYPES_USAGE_DEMANDE,
    STATUTS_LIGNE_DEMANDE, STATUTS_HS_CODE, CRITERES_CLIENT_DEMANDE, TYPES_TRAITEMENT_LIGNE
} from './constants';
import { pill, pillStatut, esc, refLabel, fmtMAD } from '../utils/format';
import { PERS_ET_SERVICES } from './permissions';
import { calculFF } from '../utils/businessActions';
import { genererControlesDossier } from '../utils/limex';
import {
  LayoutDashboard, Contact2, Building2, Archive, ClipboardEdit, ShoppingCart, FolderKanban,
  PackageSearch, Calculator, FileSignature, Wallet, ClipboardCheck, Ship, Scale, Award,
  Anchor, Truck, Landmark, AlertTriangle, Receipt, Handshake, Factory, Flag, Warehouse,
  Package, FolderOpen, ClipboardList, CheckSquare, Bell, Mail, CalendarDays, Gauge,
  FileBarChart, FileBarChart2, Users, TrendingUp, UploadCloud, ShieldAlert, History
} from 'lucide-react';

export const MODS = {
dashboard:{label:"Dashboard Direction", ic:LayoutDashboard, grp:"Pilotage"},

contacts:{label:"Contacts", ic:Contact2, grp:"Commercial", coll:"contacts", pfx:"CT", statut:"statut",
 champs:[
  {k:"nom",l:"Nom",t:"text",req:1,aide:"Toute personne qui contacte ULTEx est enregistrée ici de façon permanente, qu'elle devienne cliente ou non."},
  {k:"telephone",l:"Téléphone",t:"text"},{k:"whatsapp",l:"WhatsApp",t:"text"},{k:"email",l:"E-mail",t:"text"},
  {k:"source",l:"Source du contact",t:"select",opts:["Meta","Google","YouTube","WhatsApp","Téléphone","Site web","Référence","Salon","Autre"]},
  {k:"remarque",l:"Remarque",t:"textarea",large:1},
  {k:"statut",l:"Statut",t:"select",opts:["Nouveau","En échange","Sans suite","Converti en client"]}
 ],
 cols:[["nom","Nom"],["telephone","Téléphone"],["source","Source",v=>pill(v||"—","p-gris")],["statut","Statut",v=>pillStatut(v)],["codeClientAssocie","Client",v=>v?`<a class="lien" href="#ficheClient:${esc(v)}">${esc(v)}</a>`:"—"]],
 actions:[{txt:"Devenir client", cls:"btn mini or", si:o=>!o.codeClientAssocie, fn:"convertirContactEnClient"}]},

clients:{label:"Clients", ic:Building2, grp:"Commercial", coll:"clients", pfx:"C", statut:"segment",
 champs:[
  {k:"nom",l:"Nom / Raison sociale",t:"text",req:1},
  {k:"telephone",l:"Téléphone",t:"text"},
  {k:"email",l:"E-mail",t:"text"},
  {k:"ville",l:"Ville",t:"text"},
  {k:"ice",l:"ICE",t:"text"},
  {k:"rc",l:"RC",t:"text"},
  {k:"idFiscal",l:"Identifiant fiscal (IF)",t:"text"},
  {k:"segment",l:"Segment",t:"select",opts:["Prospect","Client","Client récurrent","Client VIP","Inactif"]},
  {k:"remarque",l:"Remarques",t:"textarea",large:1}
 ],
 fiche:"ficheClient",
 cols:[["nom","Nom"],["telephone","Téléphone"],["ville","Ville"],["segment","Segment",v=>pillStatut(v)]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFicheClient"}]},

leads:{label:"Leads / Data (archive historique)", ic:Archive, grp:"Archives", coll:"leads", pfx:"L", statut:"statut",
 champs:[
  {k:"nom",l:"Nom du contact",t:"text",req:1},
  {k:"telephone",l:"Téléphone",t:"text"},
  {k:"source",l:"Source",t:"select",opts:["Meta","Google","YouTube","WhatsApp","Téléphone","Site web","Référence"]},
  {k:"besoin",l:"Besoin exprimé",t:"textarea",large:1},
  {k:"statut",l:"Statut",t:"select",opts:["Nouveau","Contacté","En qualification","Qualifié","Non qualifié","Perdu"]},
  {k:"assigne",l:"Assigné à",t:"select",opts:USERS}
 ],
 cols:[["nom","Contact"],["telephone","Téléphone"],["source","Source"],["besoin","Besoin",v=>esc(String(v||"").slice(0,42))],["demande","Demande",v=>v?`<span class="pill p-or">${esc(v)}</span>`:"—"],["statut","Statut",v=>pillStatut(v)]],
 actions:[{txt:"Convertir ➜ Contact + Demande", cls:"btn mini or", si:o=>o.statut!=="Qualifié", fn:"qualifierLead"}]},

demandes:{label:"Demandes", ic:ClipboardEdit, grp:"Commercial", coll:"demandes", pfx:"DMD", statut:"statut",
 champs:[
  {k:"client",l:"Client",t:"ref",coll:"clients",cle:"nom",req:1},
  {k:"dateDemande",l:"Date",t:"date"},
  {k:"dateHeureReception",l:"Date et heure de réception",t:"text",aide:"Format libre si l'heure exacte est connue, ex. 05/08/2026 14:30."},
  {k:"responsableData",l:"Responsable Data",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB)},
  {k:"source",l:"Source",t:"select",opts:["Meta","Google","YouTube","WhatsApp","Téléphone","Site web","Référence","Salon","Autre"]},
  {k:"canalReception",l:"Canal de réception",t:"select",opts:CANAUX_RECEPTION_DEMANDE},
  {k:"objectifGeneral",l:"Objet général de la demande",t:"textarea"},
  {k:"typeProjet",l:"Type de projet",t:"select",opts:TYPES_PROJET_DEMANDE},
  {k:"urgence",l:"Urgence",t:"select",opts:["Faible","Normale","Élevée","Urgente"]},
  {k:"budgetGlobalEstime",l:"Budget global estimé (MAD)",t:"number"},
  {k:"dateSouhaiteeClient",l:"Date souhaitée par le client",t:"date"},
  {k:"villeDestination",l:"Ville ou destination finale",t:"text"},
  {k:"typeUsage",l:"Importation pour",t:"select",opts:TYPES_USAGE_DEMANDE},
  {k:"statut",l:"Statut global",t:"select",opts:STATUTS_DEMANDE},
  {k:"remarqueGenerale",l:"Remarques générales",t:"textarea",large:1},
  {k:"actionSuivante",l:"Action suivante",t:"text"},
  {k:"respActionSuivante",l:"Responsable de l'action suivante",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB)},
  {k:"echeanceActionSuivante",l:"Échéance",t:"date"}
 ],
 avantSauve: (DB, o) => { if(!o.dateDemande) o.dateDemande = new Date().toISOString().slice(0,10); if(!o.statut) o.statut = STATUTS_DEMANDE[0]; },
 fiche:"ficheDemande",
 cols:[["client","Client",(v,o,DB)=>esc(refLabel(DB, "clients",v,"nom"))],["dateDemande","Date"],["responsableData","Resp. Data"],["urgence","Urgence",v=>pill(v||"—","p-gris")],["statut","Statut",v=>pillStatut(v)]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFicheDemande"}]},

demandeLignes:{label:"Lignes de demande", ic:ClipboardEdit, grp:"Commercial", coll:"demandeLignes", pfx:"DL", statut:"statut",
 champs:[
  {k:"demande",l:"Demande",t:"ref",coll:"demandes",cle:"code",req:1},
  {k:"typeTraitement",l:"Type de traitement",t:"select",opts:TYPES_TRAITEMENT_LIGNE,req:1,aide:"Détermine le circuit (Sourcing, Études & Chiffrage, Réglementation, Transport…). UBOS propose une valeur, modifiable à tout moment."},
  // Identification
  {k:"nomProduit",l:"Nom commercial du produit",t:"text",req:1},
  {k:"designationTechnique",l:"Désignation technique",t:"text"},
  {k:"famille",l:"Famille de produit",t:"text"},
  {k:"sousFamille",l:"Sous-famille",t:"text"},
  {k:"usage",l:"Usage du produit",t:"textarea"},
  {k:"secteurUtilisation",l:"Secteur d'utilisation",t:"text"},
  {k:"description",l:"Description détaillée",t:"textarea",large:1},
  {k:"marqueSouhaitee",l:"Marque souhaitée",t:"text"},
  {k:"modeleSouhaite",l:"Modèle souhaité",t:"text"},
  {k:"reference",l:"Référence",t:"text"},
  {k:"etatProduit",l:"Produit neuf ou occasion",t:"select",opts:["Neuf","Occasion"]},
  {k:"destinationUsage",l:"Destiné à la revente ou à l'usage propre",t:"select",opts:["Revente","Usage propre"]},
  {k:"lienProduit",l:"Lien produit (site fournisseur, marketplace…)",t:"text"},
  {k:"photo",l:"Photo produit",t:"file"},
  // Quantité & conditionnement
  {k:"quantite",l:"Quantité demandée",t:"number"},
  {k:"unite",l:"Unité",t:"select",opts:["Pièces","Kg","Tonnes","Litres","Mètres","Cartons","Lots","Autre"]},
  {k:"quantiteMin",l:"Quantité minimale acceptable",t:"number"},
  {k:"piecesParCarton",l:"Pièces par carton",t:"number"},
  {k:"nbCartons",l:"Nombre total de cartons",t:"number",aide:"Calculé automatiquement si vide : quantité ÷ pièces par carton."},
  {k:"poidsNetPiece",l:"Poids net par pièce (kg)",t:"number"},
  {k:"poidsBrutCarton",l:"Poids brut par carton (kg)",t:"number"},
  {k:"poidsBrutTotal",l:"Poids brut total (kg)",t:"number",aide:"Calculé automatiquement si vide : cartons × poids par carton."},
  {k:"cbmCarton",l:"Volume par carton (CBM)",t:"number"},
  {k:"cbmTotal",l:"Volume total (CBM)",t:"number",aide:"Calculé automatiquement si vide : cartons × CBM par carton."},
  {k:"dimensionsCarton",l:"Dimensions d'un carton",t:"text"},
  {k:"typeEmballage",l:"Type d'emballage",t:"text"},
  {k:"palettise",l:"Palettisé",t:"select",opts:["Oui","Non"]},
  {k:"nbPalettes",l:"Nombre de palettes",t:"number"},
  {k:"empilable",l:"Empilable",t:"select",opts:["Oui","Non"]},
  {k:"fragile",l:"Fragile",t:"select",opts:["Oui","Non"]},
  {k:"marchandiseDangereuse",l:"Marchandise dangereuse",t:"select",opts:["Oui","Non"]},
  // Fournisseur & offre
  {k:"statutFournisseur",l:"Fournisseur",t:"select",opts:["Fournisseur connu","Nouveau fournisseur","À rechercher","Plusieurs fournisseurs disponibles","Client a son fournisseur"]},
  {k:"fournisseur",l:"Fournisseur (si connu)",t:"ref",coll:"fournisseurs",cle:"nom"},
  {k:"paysFournisseur",l:"Pays du fournisseur",t:"pays"},
  {k:"adresseEnlevement",l:"Adresse d'enlèvement",t:"text"},
  {k:"contactFournisseur",l:"Contact",t:"text"},
  {k:"moq",l:"MOQ",t:"number"},
  {k:"delaiProduction",l:"Délai de production",t:"text"},
  {k:"conditionsPaiement",l:"Conditions de paiement",t:"text"},
  {k:"validiteOffre",l:"Validité de l'offre",t:"date"},
  {k:"quantiteDisponible",l:"Quantité disponible",t:"number"},
  {k:"echantillonDisponible",l:"Échantillon disponible",t:"select",opts:["Oui","Non"]},
  {k:"prixEchantillon",l:"Prix échantillon",t:"number"},
  {k:"proforma",l:"Proforma Invoice",t:"file"},
  {k:"ficheTechniqueFournisseur",l:"Fiche technique fournisseur",t:"file"},
  {k:"commentairesOffre",l:"Commentaires sur l'offre",t:"textarea"},
  // Prix & conditions commerciales
  {k:"prixUnitaire",l:"Prix unitaire fournisseur",t:"number"},
  {k:"devise",l:"Devise",t:"select",opts:["MAD","USD","EUR","CNY","GBP","AED"]},
  {k:"montantMarchandise",l:"Montant total marchandise",t:"number",aide:"Calculé automatiquement si vide : prix unitaire × quantité."},
  {k:"incoterm",l:"Incoterm",t:"incoterm"},
  {k:"lieuIncoterm",l:"Lieu précis de l'Incoterm",t:"text"},
  {k:"modePaiementPropose",l:"Mode de paiement proposé",t:"text"},
  {k:"acompteFournisseur",l:"Acompte fournisseur",t:"number"},
  {k:"soldeFournisseur",l:"Solde fournisseur",t:"number"},
  {k:"remise",l:"Remise éventuelle",t:"number"},
  {k:"fraisMoule",l:"Frais moule",t:"number"},
  {k:"fraisEmballage",l:"Frais emballage",t:"number"},
  {k:"fraisPersonnalisation",l:"Frais personnalisation",t:"number"},
  {k:"fraisDocuments",l:"Frais documents",t:"number"},
  {k:"autresFrais",l:"Autres frais fournisseur",t:"number"},
  // Origine & logistique
  {k:"paysOrigine",l:"Pays d'origine",t:"pays"},
  {k:"villeFournisseur",l:"Ville fournisseur",t:"text"},
  {k:"portProbable",l:"Port ou aéroport probable",t:"port"},
  {k:"modeTransportSouhaite",l:"Mode de transport souhaité",t:"select",opts:["Maritime","Aérien","Routier","À étudier"]},
  {k:"urgenceTransport",l:"Transport urgent ou normal",t:"select",opts:["Normal","Urgent"]},
  {k:"marchandisePrete",l:"Marchandise prête ou en production",t:"select",opts:["Prête","En production"]},
  {k:"dateMarchandisePrete",l:"Date marchandise prête",t:"date"},
  {k:"besoinEnlevement",l:"Besoin d'enlèvement",t:"select",opts:["Oui","Non"]},
  {k:"besoinTransportIntl",l:"Besoin de transport international",t:"select",opts:["Oui","Non"]},
  {k:"besoinTransit",l:"Besoin de transit",t:"select",opts:["Oui","Non"]},
  {k:"besoinLivraisonFinale",l:"Besoin de livraison finale",t:"select",opts:["Oui","Non"]},
  // Technique
  {k:"matiere",l:"Matière / Composition",t:"text"},
  {k:"dimensionsProduit",l:"Dimensions produit",t:"text"},
  {k:"couleur",l:"Couleur",t:"text"},
  {k:"puissanceVoltage",l:"Puissance / Voltage / Fréquence",t:"text"},
  {k:"capaciteTechnologie",l:"Capacité / Technologie / Fonctionnement",t:"textarea"},
  {k:"normesAnnoncees",l:"Normes annoncées",t:"text"},
  {k:"certificatsDisponibles",l:"Certificats disponibles",t:"text"},
  {k:"manuel",l:"Manuel",t:"file"},
  {k:"ficheTechnique",l:"Fiche technique",t:"file"},
  {k:"caracteristiquesPersonnalisees",l:"Caractéristiques personnalisées (ex. \"Tension : 220 V\")",t:"textarea",aide:"Une caractéristique par ligne, format « Champ : Valeur »."},
  // HS Code & réglementation
  {k:"hsCodeFournisseur",l:"HS Code fourni par le fournisseur",t:"text"},
  {k:"hsCodeUltex",l:"HS Code proposé par ULTEx",t:"text"},
  {k:"statutHsCode",l:"Statut du HS Code",t:"select",opts:STATUTS_HS_CODE,aide:"Un HS Code fourni par le fournisseur n'est pas considéré comme validé tant qu'il n'a pas été vérifié."},
  {k:"produitReglemente",l:"Produit réglementé",t:"select",opts:["Oui","Non","À vérifier"]},
  {k:"organismesConcernes",l:"Organismes concernés (ONSSA, ANRT, IMANOR, COC, MCIA…)",t:"text"},
  {k:"licenceRequise",l:"Licence requise",t:"select",opts:["Oui","Non","À vérifier"]},
  {k:"etiquetageRequis",l:"Étiquetage requis",t:"select",opts:["Oui","Non","À vérifier"]},
  {k:"msds",l:"Fiche de sécurité MSDS",t:"file"},
  // Exigences client
  {k:"niveauQualite",l:"Niveau de qualité recherché",t:"select",opts:["Économique","Moyen","Premium"]},
  {k:"prixVenteSouhaite",l:"Prix de vente souhaité",t:"number"},
  {k:"delaiSouhaite",l:"Délai souhaité",t:"text"},
  {k:"personnalisation",l:"Personnalisation (logo, marque propre, couleur…)",t:"text"},
  {k:"criterePrincipal",l:"Critère principal du client",t:"select",opts:CRITERES_CLIENT_DEMANDE},
  {k:"conditionsParticulieres",l:"Conditions particulières",t:"textarea"},
  // Statut
  {k:"statut",l:"Statut de la ligne",t:"select",opts:STATUTS_LIGNE_DEMANDE}
 ],
 avantSauve: (DB, o) => {
   if (!o.statut) o.statut = STATUTS_LIGNE_DEMANDE[0];
 },
 fiche:"ficheDemandeLigne",
 cols:[["nomProduit","Produit"],["quantite","Quantité"],["prixUnitaire","Prix",(v,o)=>v?`${v} ${o.devise||''}`:"—"],["fournisseur","Fournisseur",(v,o,DB)=>v?esc(refLabel(DB,"fournisseurs",v,"nom")):"—"],["statut","Statut",v=>pillStatut(v)]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFicheDemandeLigne"}]},

commandes:{label:"Commandes", ic:ShoppingCart, grp:"Commercial", coll:"commandes", pfx:"CMD", statut:"statut",
 champs:[
  {k:"client",l:"Client",t:"ref",coll:"clients",cle:"nom",req:1},
  {k:"demande",l:"Demande d'origine",t:"ref",coll:"demandes",cle:"code"},
  {k:"condition",l:"Condition de confirmation",t:"select",opts:CONDITIONS_COMMANDE},
  {k:"formuleUltex",l:"Package commercial (raccourci)",t:"select",opts:FORMULES_ULTEX,req:1},
  {k:"devisAccepte",l:"Devis accepté (pièce jointe)",t:"file"},
  {k:"calculValide",l:"Calcul validé (référence)",t:"text"},
  {k:"documents",l:"Documents",t:"text"},
  {k:"paiement",l:"Paiement",t:"text"},
  {k:"statut",l:"Statut",t:"select",opts:["Confirmée","En traitement","Dossier créé","Annulée"]}
 ],
 fiche:"ficheCommande",
 cols:[["client","Client",(v,o,DB)=>esc(refLabel(DB, "clients",v,"nom"))],["demande","Demande",v=>v?`<span class="pill p-gris">${esc(v)}</span>`:"—"],["formuleUltex","Formule",v=>pill(v||"—","p-or")],["statut","Statut",v=>pillStatut(v)]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFicheCommande"}]},

dossiers:{label:"Dossiers", ic:FolderKanban, grp:"Commercial", coll:"dossiers", pfx:"DOS", statut:"etape",
 champs:[
  {k:"client",l:"Client existant",t:"ref",coll:"clients",cle:"nom"},
  {k:"nouveauClient",l:"…ou nouveau client (nom + tél.)",t:"text"},
  {k:"demande",l:"Demande d'origine",t:"ref",coll:"demandes",cle:"code"},
  {k:"commande",l:"Commande confirmée",t:"ref",coll:"commandes",cle:"code"},
  {k:"creationDirecteAutorisee",l:"Création directe autorisée",t:"text"},
  {k:"motifCreationDirecte",l:"Motif de création directe",t:"text"},
  {k:"importateurOfficiel",l:"Au nom de qui l'importation sera-t-elle réalisée ?",t:"select",opts:IMPORTATEUR_OFFICIEL_OPTIONS,req:1,aide:"Si « Société du client » : ses informations légales sont récupérées automatiquement depuis sa fiche."},
  {k:"proprietaireMarchandise",l:"Propriétaire de la marchandise",t:"select",opts:PROPRIETAIRES_MARCHANDISE},
  {k:"formuleUltex",l:"Package commercial (raccourci)",t:"select",opts:FORMULES_ULTEX},
  {k:"produit",l:"Produit / Marchandise",t:"text",req:1},
  {k:"quantite",l:"Quantité",t:"text"},
  {k:"fournisseur",l:"Fournisseur",t:"ref",coll:"fournisseurs",cle:"nom"},
  {k:"fabricantReel",l:"Fabricant réel (si différent du fournisseur)",t:"text"},
  {k:"incoterm",l:"Incoterm",t:"incoterm",aide:"Règle Incoterms® 2020 qui définit qui du vendeur ou de l'acheteur supporte les frais et risques à chaque étape du transport."},
  {k:"paysOrigine",l:"Pays d'origine",t:"pays"},
  {k:"paysProvenance",l:"Pays de provenance (si différent de l'origine)",t:"pays"},
  {k:"portDepart",l:"Port / aéroport de départ",t:"port"},
  {k:"portArrivee",l:"Port / aéroport d'arrivée",t:"port"},
  {k:"modeTransport",l:"Mode de transport",t:"select",opts:()=>CATEGORIES_TRANSPORT.flatMap(cat=>MODES_TRANSPORT_DETAIL[cat].map(s=>cat+" — "+s))},
  {k:"montantVente",l:"Valeur marchandise / vente (MAD)",t:"number"},
  {k:"montantAchat",l:"Coût d'achat estimé (MAD)",t:"number"},
  {k:"cbm",l:"Volume (CBM)",t:"number"},
  {k:"poids",l:"Poids brut (kg)",t:"number"},
  {k:"poidsNet",l:"Poids net (kg)",t:"number"},
  {k:"niveauRisqueInitial",l:"Niveau de risque initial (LIMEX)",t:"select",opts:["Faible","Moyen","Élevé","Critique"]},
  {k:"etape",l:"Étape actuelle",t:"select",opts:ETAPES},
  {k:"responsable",l:"Responsable du dossier",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB)},
  {k:"actionSuivante",l:"Action suivante *",t:"text",req:1},
  {k:"respActionSuivante",l:"Responsable action suivante *",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB),req:1},
  {k:"echeanceActionSuivante",l:"Échéance action suivante *",t:"date",req:1},
  {k:"statut",l:"Statut",t:"select",opts:["Actif","Bloqué","Livré","Annulé"]},
  {k:"remarque",l:"Remarques",t:"textarea",large:1}
 ],
 avantSauve: (DB, o, ctx) => {
   if(!o.client && !o.nouveauClient){ ctx.toast("Indiquez un client existant ou un nouveau client."); return false; }
   if(!o.client && o.nouveauClient){
     const cl = {code: ctx.genCode("C"), nom: o.nouveauClient, segment:"Prospect", ts: Date.now()};
     DB.clients.push(cl);
     ctx.audit("Clients","Création",cl.code,"—","—", cl.nom);
     o.client = cl.code;
     ctx.toast("Nouveau client créé : "+cl.code);
   }
   o.nouveauClient = "";
   if(!o.etape) o.etape = ETAPES[0];
 },
 apresSauve: (DB, o, ancien) => {
   if (!ancien) {
     // Génère automatiquement une ligne de checklist LIMEX par contrôle actif
     // du référentiel — exhaustivité garantie, sans jamais dupliquer le texte
     // des contrôles (qui reste dans controlesLimex).
     const lignes = genererControlesDossier(DB, o.code);
     DB.dossierControlesLimex = [...(DB.dossierControlesLimex || []), ...lignes];
   }
 },
 fiche:"ficheDossier",
 cols:[["client","Client",(v,o,DB)=>esc(refLabel(DB, "clients",v,"nom"))],["produit","Produit"],["fournisseur","Fourn.",(v,o,DB)=>v?esc(refLabel(DB, "fournisseurs",v,"nom")).slice(0,22):"—"],["incoterm","Incoterm",v=>v?pill(v,"p-gris"):"—"],["montantVente","Valeur",v=>fmtMAD(v)],["etape","Étape",(v,o)=>{const i=ETAPES.indexOf(v);return `<span class="pill p-or">${i+1}/${ETAPES.length} · ${esc(v)}</span>`}],["responsable","Resp."],["actionSuivante","Action suivante",(v,o)=>{if(!v)return pill("À définir","p-rouge");const r=o.echeanceActionSuivante&&new Date(o.echeanceActionSuivante)<new Date(new Date().toDateString());return esc(String(v).slice(0,28))+`<br><small style="color:var(--gris)">`+esc(o.respActionSuivante||"—")+" · "+esc(o.echeanceActionSuivante||"—")+(r?" "+pill("Retard","p-rouge"):"")+`</small>`}],["statut","Statut",v=>pillStatut(v)]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFicheDossier"},{txt:"Étape suivante ➜", cls:"btn mini", si:o=>ETAPES.indexOf(o.etape) < ETAPES.length-1 && o.statut!=="Annulé", fn:"avancerDossier"},{txt:"Facture finale", cls:"btn mini doux", fn:"creerFactureDepuisDossier"}]},

sourcings:{label:"Sourcing", ic:PackageSearch, grp:"Études", coll:"sourcings", pfx:"SRC", statut:"statut",
 champs:[
  {k:"dossier",l:"Dossier",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"fournisseur",l:"Fournisseur",t:"ref",coll:"fournisseurs",cle:"nom"},
  {k:"prixFOB",l:"Prix FOB unitaire (USD)",t:"number"},
  {k:"moq",l:"MOQ",t:"text"},
  {k:"delai",l:"Délai de production",t:"text"},
  {k:"statut",l:"Statut",t:"select",opts:["En cours","Offre reçue","Recommandé","Clôturé"]},
  {k:"remarque",l:"Notes de négociation",t:"textarea",large:1}
 ],
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["fournisseur","Fournisseur",(v,o,DB)=>esc(refLabel(DB, "fournisseurs",v,"nom"))],["prixFOB","FOB (USD)"],["delai","Délai"],["statut","Statut",v=>pillStatut(v)]]},

etudes:{label:"Études & Chiffrage", ic:Calculator, grp:"Études", coll:"etudes", pfx:"SIM", statut:"recommandation",
 champs:[
  {k:"dossier",l:"Dossier",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"fob",l:"Total FOB (MAD)",t:"number",req:1},
  {k:"fret",l:"Fret + assurance (MAD)",t:"number"},
  {k:"droitsPct",l:"Droits de douane (%)",t:"number"},
  {k:"tvaPct",l:"TVA (%)",t:"number"},
  {k:"fraisPort",l:"Frais portuaires (MAD)",t:"number"},
  {k:"transportNat",l:"Transport national (MAD)",t:"number"},
  {k:"prixVente",l:"Prix de vente cible (MAD)",t:"number",req:1},
  {k:"recommandation",l:"Recommandation",t:"select",opts:["Go","Renégocier","Stop"]},
 ],
 avantSauve: (DB, o) => {
   const fob=+o.fob||0, fret=+o.fret||0, port=+o.fraisPort||0, tn=+o.transportNat||0;
   const droits=(fob+fret)*((+o.droitsPct||0)/100);
   const tva=(fob+fret+droits)*((+o.tvaPct||0)/100);
   o.coutTotal=Math.round(fob+fret+droits+tva+port+tn);
   o.marge=Math.round((+o.prixVente||0)-o.coutTotal);
   o.margePct=o.prixVente? Math.round(o.marge/(+o.prixVente)*1000)/10 : 0;
 },
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["coutTotal","Coût total DDP",v=>fmtMAD(v)],["prixVente","Prix vente",v=>fmtMAD(v)],["marge","Marge",(v,o)=>v===undefined?"—":`<b style="color:${v>=0?"var(--ok)":"var(--rouge)"}">${fmtMAD(v)} (${o.margePct}%)</b>`],["recommandation","Reco.",v=>pillStatut(v==="Go"?"Validé":v==="Stop"?"Rejeté":v||"—")]]},

offres:{label:"Closing", ic:FileSignature, grp:"Commercial", coll:"offres", pfx:"OFF", statut:"statut",
 champs:[
  {k:"dossier",l:"Dossier",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"montant",l:"Montant de l'offre (MAD)",t:"number",req:1},
  {k:"echeance",l:"Valide jusqu'au",t:"date"},
  {k:"statut",l:"Statut",t:"select",opts:["Brouillon","Émise","Négociation","Acceptée","Perdue"]},
  {k:"remarque",l:"Conditions / notes",t:"textarea",large:1}
 ],
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["montant","Montant",v=>fmtMAD(v)],["echeance","Échéance"],["statut","Statut",v=>pillStatut(v)]]},

paiements:{label:"Paiements", ic:Wallet, grp:"Finance", coll:"paiements", pfx:"PAY", statut:"statut",
 champs:[
  {k:"dossier",l:"Dossier",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"nature",l:"Nature",t:"select",opts:["Acompte","Solde","Reliquat","Paiement fournisseur","Droits de douane","Fret"]},
  {k:"montant",l:"Montant (MAD)",t:"number",req:1},
  {k:"echeance",l:"Échéance",t:"date"},
  {k:"statut",l:"Statut",t:"select",opts:["Prévu","En attente","Payé","En retard","Annulé"]},
  {k:"remarque",l:"Référence bancaire / notes",t:"textarea",large:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(o.statut==="Payé" && (!ancien || ancien.statut!=="Payé")){
     ctx.notifier("Closing", `Paiement ${o.code} (${o.nature}) confirmé — ${fmtMAD(o.montant)} sur ${o.dossier||"dossier"}`, "Paiements");
     if(o.nature==="Acompte"){
       ctx.notifier("Analyse Dossiers", `Acompte encaissé sur ${o.dossier||"un dossier"} : dossier transféré aux Opérations.`, "Paiements");
       const d = DB.dossiers.find(x=>x.code===o.dossier);
       if(d && ETAPES.indexOf(d.etape) <= ETAPES.indexOf("Paiement")){
         ctx.audit("Dossiers","Transfert automatique",d.code,"etape",d.etape,"Analyse Dossier");
         d.etape="Analyse Dossier";
       }
     }
   }
 },
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["nature","Nature"],["montant","Montant",v=>fmtMAD(v)],["echeance","Échéance"],["statut","Statut",v=>pillStatut(v)]]},

analyses:{label:"Analyse Dossier", ic:ClipboardCheck, grp:"Opérations", coll:"analyses", pfx:"ANA", statut:"statut",
 champs:[
  {k:"dossier",l:"Dossier",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"completude",l:"Complétude checklist (%)",t:"number"},
  {k:"anomalies",l:"Anomalies détectées",t:"textarea",large:1},
  {k:"statut",l:"Statut",t:"select",opts:["En cours","Bloqué","Validée"]},
  {k:"bonLancement",l:"Bon de lancement",t:"select",opts:["Non émis","Émis"]}
 ],
 avantSauve: (DB, o, ctx) => {
   if(o.bonLancement==="Émis" && (+o.completude||0) < 100){
     o.bonLancement="Non émis";
     ctx.toast("Verrou UBOS : le bon de lancement exige une checklist à 100 %.");
   }
 },
 apresSauve: (DB, o, ancien, ctx) => {
   if(o.bonLancement==="Émis" && (!ancien || ancien.bonLancement!=="Émis")){
     ctx.notifier("Transport", `Bon de lancement émis sur ${o.dossier||"un dossier"} — expédition à organiser.`, "Analyse Dossier");
   }
 },
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["completude","Checklist",v=>(v||0)+" %"],["statut","Statut",v=>pillStatut(v)],["bonLancement","Bon de lancement",v=>v==="Émis"?pill("Émis","p-vert"):pill("Non émis","p-gris")]]},

transports:{label:"Transport", ic:Ship, grp:"Opérations", coll:"transports", pfx:"TR", statut:"statut",
 champs:[
  {k:"dossier",l:"Dossier",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"mode",l:"Mode",t:"select",opts:["Maritime LCL","Maritime FCL","Aérien","Routier"]},
  {k:"transitaire",l:"Transitaire",t:"text"},
  {k:"blAwb",l:"BL / AWB",t:"text"},
  {k:"depart",l:"Date de départ",t:"date"},
  {k:"eta",l:"ETA",t:"date"},
  {k:"statut",l:"Statut",t:"select",opts:["Cotation","Réservé","En transit","Arrivé","Livré"]}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(o.statut==="En transit" && (!ancien || ancien.statut!=="En transit")){
     ctx.notifier("Transit & Douane", `Départ confirmé ${o.code} (${o.mode||""}) — ETA ${o.eta||"?"} sur ${o.dossier||"dossier"}.`, "Transport");
   }
 },
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["mode","Mode"],["transitaire","Transitaire"],["eta","ETA"],["statut","Statut",v=>pillStatut(v)]]},

transits:{label:"Transit & Douane", ic:Scale, grp:"Opérations", coll:"transits", pfx:"TD", statut:"etapeDum",
 champs:[
  {k:"dossier",l:"Dossier",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"numDum",l:"N° DUM",t:"text"},
  {k:"etapeDum",l:"Étape DUM",t:"select",opts:["Préparé","Déposé","Liquidé","BAD obtenu","Sorti du port"]},
  {k:"franchiseFin",l:"Fin de franchise",t:"date"},
  {k:"liquidation",l:"Liquidation (MAD)",t:"number"},
  {k:"remarque",l:"Notes / contentieux",t:"textarea",large:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(o.etapeDum==="BAD obtenu" && (!ancien || ancien.etapeDum!=="BAD obtenu")){
     ctx.notifier("Transport", `BAD obtenu sur ${o.dossier||"un dossier"} — livraison finale à coordonner.`, "Transit & Douane");
   }
 },
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["numDum","DUM"],["etapeDum","Étape",v=>pillStatut(v)],["franchiseFin","Fin franchise",v=>{if(!v)return "—";const j=Math.ceil((new Date(v)-Date.now())/864e5);return `${esc(v)} ${j<=2?pill(j+" j","p-rouge"):pill(j+" j","p-gris")}`}],["liquidation","Liquidation",v=>fmtMAD(v)]]},

certifs:{label:"Certification & Organismes", ic:Award, grp:"Opérations", coll:"certifs", pfx:"CERT", statut:"statut",
 champs:[
  {k:"dossier",l:"Dossier lié",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"organisme",l:"Organisme / procédure",t:"select",opts:["COC","ONSSA","ANRT","IMANOR","SGS","Bureau Veritas","Laboratoire","Engagement de non-commercialisation","Étiquetage / surétiquetage"],req:1},
  {k:"responsable",l:"Responsable",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB)},
  {k:"echeance",l:"Échéance",t:"date"},
  {k:"statut",l:"Statut",t:"select",opts:["À lancer","En cours","Obtenue","Refusée","Expirée"]},
  {k:"document",l:"Document lié",t:"ref",coll:"documents",cle:"nom"},
  {k:"remarque",l:"Détails / références",t:"textarea",large:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(!ancien && o.responsable && o.responsable!==ctx.userCourant) ctx.notifier(o.responsable, `Certification ${o.code} (${o.organisme}) à suivre sur ${o.dossier} — échéance ${o.echeance||"—"}.`, "Certification");
   if(o.statut==="Obtenue" && (!ancien || ancien.statut!=="Obtenue")) ctx.notifier("Analyse Dossiers", `Certification ${o.organisme} obtenue sur ${o.dossier} (${o.code}).`, "Certification");
   if(o.statut==="Refusée" && (!ancien || ancien.statut!=="Refusée")) ctx.notifier("Direction", `Certification ${o.organisme} REFUSÉE sur ${o.dossier} (${o.code}).`, "Certification");
 },
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["organisme","Organisme",v=>pill(v||"—","p-or")],["responsable","Responsable"],["echeance","Échéance",(v,o)=>{if(!v)return "—";const j=Math.ceil((new Date(v)-Date.now())/864e5);return esc(v)+" "+(j<0&&o.statut!=="Obtenue"?pill("Dépassée","p-rouge"):j<=7&&o.statut!=="Obtenue"?pill(j+" j","p-ambre"):"")}],["statut","Statut",v=>pillStatut(v==="Obtenue"?"Validé":v==="Refusée"?"Rejeté":v)]]},

arrivages:{label:"Arrivages", ic:Anchor, grp:"LIMEX", coll:"arrivages", pfx:"ARR", statut:"statut",
 champs:[
  {k:"ancienNumero",l:"Ancien numéro d'arrivage",t:"text",aide:"Recherchable — ex. Arrivage 39, Arrivage 120."},
  {k:"nomInterne",l:"Nom interne de l'arrivage",t:"text"},
  {k:"responsableLimex",l:"Responsable LIMEX",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB)},
  {k:"type",l:"Type",t:"select",opts:["Import","Export","National"]},
  {k:"formuleDominante",l:"Formule dominante",t:"select",opts:FORMULES_ULTEX},
  {k:"modeTransport",l:"Mode de transport",t:"select",opts:()=>CATEGORIES_TRANSPORT.flatMap(cat=>MODES_TRANSPORT_DETAIL[cat].map(s=>cat+" — "+s))},
  {k:"paysOrigine",l:"Pays d'origine",t:"pays"},
  {k:"villeEnlevement",l:"Ville ou adresse d'enlèvement",t:"text"},
  {k:"portDepart",l:"Port ou aéroport de départ",t:"port"},
  {k:"portArrivee",l:"Port ou aéroport d'arrivée",t:"port"},
  {k:"dateDepartPrevue",l:"Date de départ prévue",t:"date"},{k:"dateDepartReelle",l:"Date de départ réelle",t:"date"},
  {k:"etaPrevue",l:"ETA prévue",t:"date"},{k:"etaActualisee",l:"ETA actualisée",t:"date"},{k:"dateArriveeReelle",l:"Date d'arrivée réelle",t:"date"},
  {k:"compagnie",l:"Compagnie maritime ou aérienne",t:"ref",coll:"partenaires",cle:"nom"},{k:"transitaire",l:"Transitaire",t:"ref",coll:"partenaires",cle:"nom"},
  {k:"transporteur",l:"Transporteur",t:"ref",coll:"partenaires",cle:"nom"},{k:"agentDestination",l:"Agent de destination",t:"ref",coll:"partenaires",cle:"nom"},
  {k:"numReservation",l:"N° de réservation",t:"text"},{k:"numBLMaitre",l:"N° BL maître",t:"text"},{k:"numBLHouse",l:"N° BL house",t:"text"},
  {k:"numAWB",l:"N° AWB",t:"text"},{k:"numConteneur",l:"N° conteneur",t:"text"},{k:"typeConteneur",l:"Type conteneur",t:"text"},
  {k:"numPlomb",l:"N° plomb",t:"text"},{k:"camionImmat",l:"Camion / immatriculation",t:"text"},
  {k:"statut",l:"Statut de l'arrivage",t:"select",opts:STATUTS_ARRIVAGE},
  {k:"niveauRisque",l:"Niveau de risque",t:"select",opts:["Faible","Moyen","Élevé"]},
  {k:"actionSuivante",l:"Prochaine action",t:"text"},{k:"respActionSuivante",l:"Responsable de la prochaine action",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB)},
  {k:"echeanceActionSuivante",l:"Échéance",t:"date"},
  {k:"remarques",l:"Remarques",t:"textarea",large:1}
 ],
 avantSauve: (DB, o) => { if(!o.statut) o.statut = STATUTS_ARRIVAGE[0]; },
 fiche:"ficheArrivage",
 cols:[["nomInterne","Nom"],["ancienNumero","Ancien n°",v=>v?pill(v,"p-gris"):"—"],["statut","Statut",v=>pillStatut(v)],["etaPrevue","ETA"],["responsableLimex","Responsable"]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFicheArrivage"}]},

transportsNat:{label:"Transport national", ic:Truck, grp:"Opérations", coll:"transportsNat", pfx:"TN", statut:"statut",
 champs:[
  {k:"dossier",l:"Dossier lié",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"villeDepart",l:"Ville de départ",t:"text",req:1},
  {k:"villeLivraison",l:"Ville de livraison",t:"text",req:1},
  {k:"transporteur",l:"Transporteur",t:"text"},
  {k:"cout",l:"Coût (MAD)",t:"number"},
  {k:"datePrevue",l:"Date prévue",t:"date"},
  {k:"statut",l:"Statut",t:"select",opts:["Planifié","En cours","Livré","Annulé"]},
  {k:"preuve",l:"Preuve de livraison (document)",t:"ref",coll:"documents",cle:"nom"},
  {k:"remarque",l:"Notes",t:"textarea",large:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(o.statut==="Livré" && (!ancien || ancien.statut!=="Livré")){
     ctx.notifier("Suivi Client", `Livraison nationale effectuée sur ${o.dossier} (${o.villeLivraison}) — suivi client à démarrer.`, "Transport national");
     ctx.notifier("Direction", `Dossier ${o.dossier} livré à ${o.villeLivraison}.`, "Transport national");
   }
 },
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["villeDepart","Départ"],["villeLivraison","Livraison"],["transporteur","Transporteur"],["cout","Coût",v=>fmtMAD(v)],["datePrevue","Date"],["statut","Statut",v=>pillStatut(v)],["preuve","Preuve",v=>v?pill("Jointe","p-vert"):pill("—","p-gris")]]},

pmtIntl:{label:"Banque & Paiements intl.", ic:Landmark, grp:"Finance", coll:"pmtIntl", pfx:"PI", statut:"statut",
 champs:[
  {k:"dossier",l:"Dossier lié",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"type",l:"Type d'opération",t:"select",opts:["SWIFT","CAD","LC (lettre de crédit)","Dotation"],req:1},
  {k:"banque",l:"Banque",t:"text"},
  {k:"beneficiaire",l:"Bénéficiaire",t:"text"},
  {k:"montantDevise",l:"Montant en devise",t:"number"},
  {k:"devise",l:"Devise",t:"select",opts:["USD","EUR","CNY","MAD"]},
  {k:"statut",l:"Statut",t:"select",opts:["Préparé","En attente validation","Envoyé","Confirmé","Rejeté"]},
  {k:"document",l:"Document lié (SWIFT, facture…)",t:"ref",coll:"documents",cle:"nom"},
  {k:"remarque",l:"Références bancaires / notes",t:"textarea",large:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(o.statut==="En attente validation" && (!ancien || ancien.statut!=="En attente validation")) ctx.notifier("Direction", `Paiement international ${o.code} (${o.type} ${o.montantDevise||""} ${o.devise||""}) en attente de validation — dossier ${o.dossier}.`, "Banque");
   if(o.statut==="Confirmé" && (!ancien || ancien.statut!=="Confirmé")){ ctx.notifier("Sourcing", `Paiement ${o.type} confirmé vers ${o.beneficiaire||"fournisseur"} — dossier ${o.dossier}.`, "Banque"); ctx.notifier("Finance", `Paiement international ${o.code} confirmé.`, "Banque"); }
 },
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["type","Type",v=>pill(String(v||"—").split(" (")[0],"p-or")],["banque","Banque"],["beneficiaire","Bénéficiaire"],["montantDevise","Montant",(v,o)=>v?Number(v).toLocaleString("fr-FR")+" "+(o.devise||""):"—"],["statut","Statut",v=>v==="En attente validation"?pill(v,"p-ambre"):pillStatut(v==="Confirmé"?"Validé":v)]]},

erreurs:{label:"Registre des erreurs", ic:AlertTriangle, grp:"Pilotage", coll:"erreurs", pfx:"ERR", statut:"statut",
 champs:[
  {k:"service",l:"Service concerné",t:"select",opts:USERS,req:1},
  {k:"typeErreur",l:"Type d'erreur",t:"text",req:1},
  {k:"dossier",l:"Dossier lié",t:"ref",coll:"dossiers",cle:"produit"},
  {k:"cause",l:"Cause racine",t:"textarea",large:1},
  {k:"actionCorrective",l:"Action corrective",t:"textarea",large:1},
  {k:"responsable",l:"Responsable de la correction",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB)},
  {k:"statut",l:"Statut",t:"select",opts:["Ouverte","Action en cours","Corrigée","Vérifiée"]},
  {k:"repetition",l:"Répétition",t:"select",opts:["Première fois","Répétée"]}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(o.repetition==="Répétée" && (!ancien || ancien.repetition!=="Répétée")) ctx.notifier("Direction", `ERREUR RÉPÉTÉE (${o.code}) : ${o.typeErreur} — service ${o.service}. Action structurelle requise.`, "Registre des erreurs");
   if(!ancien && o.responsable && o.responsable!==ctx.userCourant) ctx.notifier(o.responsable, `Action corrective à mener : ${o.typeErreur} (${o.code}).`, "Registre des erreurs");
 },
 cols:[["service","Service",v=>pill(v||"—","p-gris")],["typeErreur","Type",v=>esc(String(v||"").slice(0,35))],["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["responsable","Responsable"],["repetition","Répétition",v=>v==="Répétée"?pill(v,"p-rouge"):pill(v||"—","p-gris")],["statut","Statut",v=>pillStatut(v==="Corrigée"||v==="Vérifiée"?"Validé":v)]]},

facturation:{label:"Facturation finale", ic:Receipt, grp:"Finance", coll:"facturesFinales", pfx:"FF", statut:"statutFinal",
 champs:[
  {k:"dossier",l:"Dossier",t:"ref",coll:"dossiers",cle:"produit",req:1},
  {k:"echeance",l:"Échéance de règlement du solde",t:"date"},
  {k:"devisInitial",l:"Montant du devis initial (MAD) — informatif, non inclus dans le total",t:"number"},
  {k:"paiementsHorsSysteme",l:"Paiements client hors UBOS (MAD)",t:"number"},
  {k:"statutMarchandise",l:"Statut de la marchandise",t:"select",opts:["Livrée","Abandonnée par le client","Reprise par ULTEx","Stockée par ULTEx","Vendue à un tiers","En contentieux"]},
  {k:"statutFinal",l:"Statut financier",t:"select",opts:["Soldé","Solde partiel","Solde dû","Impayé","Réduction accordée","Avoir émis","Remboursement à effectuer","Abandon de marchandise","Marchandise reprise par ULTEx","Marchandise stockée par ULTEx","Marchandise vendue à un tiers","Dossier en contentieux","Perte supportée par ULTEx","Clôturé avec perte","Clôturé sans perte"]},
  {k:"remarque",l:"Notes",t:"textarea",large:1}
 ],
 avantSauve: (DB, o) => { const d=DB.dossiers.find(x=>x.code===o.dossier); if(d) o.client=d.client; },
 fiche:"ficheFF",
 cols:[["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],
  ["client","Client",(v,o,DB)=>esc(refLabel(DB, "clients",v,"nom")).slice(0,22)],
  ["code","Total TTC",(v,o,DB)=>fmtMAD(calculFF(o,DB).totalTTC)],
  ["echeance","Solde dû",(v,o,DB)=>{const c=calculFF(o,DB);return `<b style="color:${c.soldeDu>0?"var(--rouge)":"var(--ok)"}">${fmtMAD(c.soldeDu)}</b>`}],
  ["validee","Validée",v=>v?pill("Validée","p-vert"):pill("Brouillon","p-gris")],
  ["statutFinal","Statut",v=>pillStatut(v==="Soldé"||v==="Clôturé sans perte"?"Validé":["Impayé","Perte supportée par ULTEx","Clôturé avec perte","Dossier en contentieux"].includes(v)?"Rejeté":v)]],
 actions:[{txt:"Fiche facture", cls:"btn mini or", fn:"ouvrirFicheFF"}]},

partenaires:{label:"Partenaires logistiques", ic:Handshake, grp:"Référentiels", coll:"partenaires", pfx:"PAR", statut:"statut",
 champs:[
  {k:"nom",l:"Nom / Raison sociale",t:"text",req:1},
  {k:"type",l:"Type",t:"select",opts:TYPES_PARTENAIRE,req:1},
  {k:"pays",l:"Pays",t:"pays"},
  {k:"adresse",l:"Adresse",t:"text",large:1},
  {k:"ice",l:"ICE",t:"text"},{k:"idFiscal",l:"IF",t:"text"},{k:"rc",l:"RC",t:"text"},
  {k:"agrement",l:"Agrément",t:"text"},{k:"licence",l:"Licence",t:"text"},
  {k:"contact",l:"Interlocuteur principal",t:"text"},{k:"telephone",l:"Téléphone",t:"text"},
  {k:"whatsapp",l:"WhatsApp",t:"text"},{k:"email",l:"E-mail",t:"text"},
  {k:"conditionsPaiement",l:"Conditions de paiement",t:"text"},{k:"devises",l:"Devises acceptées",t:"text"},
  {k:"freeTime",l:"Free time (jours)",t:"text"},{k:"surestariesTarif",l:"Tarif surestaries",t:"text"},
  {k:"delais",l:"Délais habituels",t:"text"},{k:"services",l:"Services proposés",t:"textarea"},
  {k:"capacites",l:"Capacités",t:"textarea"},
  {k:"statut",l:"Statut",t:"select",opts:STATUTS_PARTENAIRE},
  {k:"remarque",l:"Remarque",t:"textarea",large:1}
 ],
 avantSauve: (DB, o) => { if(!o.statut) o.statut = "Prospect"; },
 fiche:"fichePartenaire",
 cols:[["type","Type",v=>pill(v||"—","p-gris")],["pays","Pays"],["contact","Contact"],["statut","Statut",v=>["Blacklisté","Suspendu"].includes(v)?pill(v,"p-rouge"):v==="Préféré"?pill(v,"p-vert"):pillStatut(v)]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFichePartenaire"}]},

fournisseurs:{label:"Fournisseurs", ic:Factory, grp:"Référentiels", coll:"fournisseurs", pfx:"F", statut:"statut",
 champs:[
  {k:"nom",l:"Raison sociale",t:"text",req:1},
  {k:"pays",l:"Pays",t:"text"},
  {k:"ville",l:"Ville",t:"text"},
  {k:"contact",l:"Nom du contact",t:"text"},
  {k:"whatsapp",l:"WhatsApp",t:"text"},
  {k:"wechat",l:"WeChat",t:"text"},
  {k:"email",l:"E-mail",t:"text"},
  {k:"produitsFournis",l:"Produits fournis",t:"text"},
  {k:"incoterm",l:"Incoterm habituel",t:"select",opts:["EXW","FOB","CFR","CIF","DAP","DDP"]},
  {k:"moq",l:"MOQ",t:"text"},
  {k:"delaiProduction",l:"Délai de production",t:"text"},
  {k:"conditionsPaiement",l:"Conditions de paiement",t:"text"},
  {k:"statut",l:"Statut",t:"select",opts:["En test","Qualifié","Blacklisté"]},
  {k:"remarque",l:"Notes",t:"textarea",large:1}
 ],
 fiche:"ficheFournisseur",
 cols:[["nom","Nom"],["pays","Pays"],["ville","Ville"],["contact","Contact"],["produitsFournis","Produits",v=>esc(String(v||"").slice(0,30))],["incoterm","Incoterm",v=>v?pill(v,"p-gris"):"—"],["statut","Statut",v=>pillStatut(v)]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFicheFournisseur"}]},

reclamations:{label:"Réclamations", ic:Flag, grp:"Commercial", coll:"reclamations", pfx:"REC", statut:"statut",
 champs:[
  {k:"client",l:"Client",t:"ref",coll:"clients",cle:"nom",req:1},
  {k:"dossier",l:"Dossier concerné",t:"ref",coll:"dossiers",cle:"produit"},
  {k:"motif",l:"Motif",t:"text",req:1},
  {k:"gravite",l:"Gravité",t:"select",opts:["Mineure","Majeure","Critique"]},
  {k:"serviceResponsable",l:"Responsable (personne ou service)",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB)},
  {k:"statut",l:"Statut",t:"select",opts:["Ouverte","En cours","Résolue"]},
  {k:"remarque",l:"Détails / résolution",t:"textarea",large:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(!ancien && o.serviceResponsable) ctx.notifier(o.serviceResponsable, `Réclamation ${o.code} (${o.gravite||"—"}) : ${o.motif} — SLA 48h.`, "Réclamations");
   if(o.gravite==="Critique" && (!ancien || ancien.gravite!=="Critique")) ctx.notifier("Direction", `Réclamation critique ${o.code} : ${o.motif}`, "Réclamations");
 },
 cols:[["client","Client",(v,o,DB)=>esc(refLabel(DB, "clients",v,"nom"))],["dossier","Dossier",v=>`<span class="pill p-gris">${esc(v||"—")}</span>`],["motif","Motif",v=>esc(String(v||"").slice(0,40))],["gravite","Gravité",v=>v==="Critique"?pill(v,"p-rouge"):v==="Majeure"?pill(v,"p-ambre"):pill(v||"—","p-gris")],["serviceResponsable","Responsable"],["statut","Statut",v=>pillStatut(v)]]},

stockage:{label:"Stockage société", ic:Warehouse, grp:"Référentiels", coll:"stockage", pfx:"STK", statut:"categorie",
 champs:[
  {k:"categorie",l:"Catégorie",t:"select",opts:["Fournisseur","Transitaire","Transporteur","Banque","Organisme (ONSSA, ANRT, IMANOR, SGS, Bureau Veritas…)","Modèle de document","Contact important","Accès / lien / référence interne","Tarif de référence","Frais portuaires","Frais transport","HS Code traité","Produit déjà étudié"],req:1},
  {k:"titre",l:"Titre / Nom",t:"text",req:1},
  {k:"reference",l:"Référence (HS code, n° compte, modèle…)",t:"text"},
  {k:"contact",l:"Contact (tél. / email / interlocuteur)",t:"text"},
  {k:"valeur",l:"Valeur / tarif (MAD, USD…)",t:"text"},
  {k:"lien",l:"Lien / emplacement",t:"text"},
  {k:"remarque",l:"Détails permanents",t:"textarea",large:1}
 ],
 cols:[["categorie","Catégorie",v=>pill(String(v||"—").split(" (")[0],"p-or")],["titre","Titre"],["reference","Référence",v=>v?`<span class="pill p-gris">${esc(v)}</span>`:"—"],["contact","Contact"],["valeur","Valeur / tarif"],["lien","Lien",v=>esc(String(v||"").slice(0,30))]]},

produits:{label:"Produits", ic:Package, grp:"Référentiels", coll:"produits", pfx:"P", statut:"",
 champs:[
  {k:"designation",l:"Désignation",t:"text",req:1},
  {k:"hsCode",l:"HS Code",t:"text"},
  {k:"cbm",l:"CBM unitaire",t:"number"},
  {k:"poids",l:"Poids unitaire (kg)",t:"number"},
  {k:"remarque",l:"Exigences réglementaires",t:"textarea",large:1}
 ],
 cols:[["designation","Désignation"],["hsCode","HS Code",v=>v?`<span class="pill p-or">${esc(v)}</span>`:"—"],["cbm","CBM"],["poids","Poids (kg)"]]},

documents:{label:"Documents", ic:FolderOpen, grp:"Transverse", coll:"documents", pfx:"DOC", statut:"statut",
 champs:[
  {k:"nom",l:"Nom du document",t:"text",req:1},
  {k:"type",l:"Catégorie",t:"select",opts:CATEGORIES_DOCUMENT},
  {k:"typeFichier",l:"Type de fichier / lien",t:"select",opts:TYPES_FICHIER_DOCUMENT},
  {k:"url",l:"URL (si lien Drive/OneDrive/Dropbox/externe/vidéo/catalogue…)",t:"text"},
  {k:"client",l:"Client lié",t:"ref",coll:"clients",cle:"nom"},
  {k:"demande",l:"Demande liée",t:"ref",coll:"demandes",cle:"code"},
  {k:"ligneDemande",l:"Ligne de demande liée (code)",t:"text"},
  {k:"commande",l:"Commande liée",t:"ref",coll:"commandes",cle:"code"},
  {k:"dossier",l:"Dossier lié",t:"ref",coll:"dossiers",cle:"produit"},
  {k:"arrivage",l:"Arrivage lié",t:"ref",coll:"arrivages",cle:"nomInterne"},
  {k:"fournisseur",l:"Fournisseur lié",t:"ref",coll:"fournisseurs",cle:"nom"},
  {k:"tache",l:"Tâche liée (code)",t:"text"},
  {k:"reclamation",l:"Réclamation liée (code)",t:"text"},
  {k:"confidentialite",l:"Confidentialité",t:"select",opts:["Public (services autorisés)","Direction uniquement","Finance + Direction","Juridique restreint"]},
  {k:"dateExpiration",l:"Date d'expiration éventuelle",t:"date"},
  {k:"version",l:"Version",t:"number"},
  {k:"statut",l:"Statut",t:"select",opts:STATUTS_DOCUMENT},
  {k:"commentaire",l:"Commentaire",t:"textarea",large:1}
 ],
 avantSauve: (DB, o) => { if(!o.version) o.version = 1; if(!o.statut) o.statut = "Reçu"; },
 fiche:"ficheDocument",
 cols:[["nom","Document"],["type","Catégorie",v=>v?pill(v,"p-gris"):"—"],["dossier","Dossier",v=>v?`<span class="pill p-gris">${esc(v)}</span>`:"—"],["arrivage","Arrivage",v=>v?`<span class="pill p-gris">${esc(v)}</span>`:"—"],["version","V.",v=>"v"+(v||1)],["statut","Statut",v=>pillStatut(v)]],
 actions:[{txt:"Fiche", cls:"btn mini or", fn:"ouvrirFicheDocument"}]},

rapports:{label:"Rapport journalier", ic:ClipboardList, grp:"Pilotage", coll:"rapports", pfx:"RJ", statut:"service",
 champs:[
  {k:"service",l:"Service",t:"select",opts:["Data","Sourcing","Closing","LIMEX","Finance","Digital"],req:1},
  {k:"date",l:"Date du rapport",t:"date",req:1},
  {k:"realise",l:"Travail réalisé aujourd'hui",t:"textarea",large:1,req:1},
  {k:"difficultes",l:"Difficultés / blocages",t:"textarea",large:1},
  {k:"demain",l:"Priorités de demain",t:"textarea",large:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(!ancien) ctx.notifier("Direction", `Rapport journalier ${o.service} du ${o.date} déposé (${o.code}).`, "Rapport journalier");
 },
 cols:[["service","Service",v=>pill(v,"p-or")],["par","Déposé par",v=>esc(v||"—")],["date","Date"],["realise","Réalisé",v=>esc(String(v||"").slice(0,60))],["difficultes","Difficultés",v=>v?esc(String(v).slice(0,45)):"—"],["demain","Demain",v=>v?esc(String(v).slice(0,45)):"—"]]},

taches:{label:"Tâches & Décisions", ic:CheckSquare, grp:"Transverse", coll:"taches", pfx:"T", statut:"statut",
 champs:[
  {k:"titre",l:"Titre",t:"text",req:1},
  {k:"dossier",l:"Dossier lié",t:"ref",coll:"dossiers",cle:"produit"},
  {k:"assigne",l:"Responsable",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB),req:1},
  {k:"echeance",l:"Échéance",t:"date"},
  {k:"priorite",l:"Priorité",t:"select",opts:["Basse","Normale","Haute","Critique"]},
  {k:"origine",l:"Origine",t:"select",opts:["Tâche courante","Décision de réunion"]},
  {k:"statut",l:"Statut",t:"select",opts:["À faire","En cours","Terminée"]},
  {k:"remarque",l:"Description",t:"textarea",large:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if(!ancien && o.assigne && o.assigne!==ctx.userCourant) ctx.notifier(o.assigne, `Nouvelle tâche ${o.code} : ${o.titre} (échéance ${o.echeance||"—"})`, "Tâches");
   if(ancien && o.statut==="Terminée" && ancien.statut!=="Terminée") ctx.notifier("Direction", `Tâche ${o.code} terminée : ${o.titre}`, "Tâches");
 },
 cols:[["titre","Titre"],["assigne","Responsable"],["echeance","Échéance",(v,o)=>{if(!v)return "—";const r=o.statut!=="Terminée" && new Date(v) < new Date(new Date().toDateString());return r? `${esc(v)} ${pill("Retard","p-rouge")}` : esc(v)}],["priorite","Priorité",v=>v==="Critique"?pill(v,"p-rouge"):v==="Haute"?pill(v,"p-ambre"):pill(v||"Normale","p-gris")],["origine","Origine"],["statut","Statut",v=>pillStatut(v)]]},

notifications:{label:"Notifications", ic:Bell, grp:"Transverse"},
messagerie:{label:"Messagerie interne", ic:Mail, grp:"Transverse", coll:"communicationsDossier", pfx:"MSG", statut:"type",
 champs:[
  {k:"destinataire",l:"Destinataire",t:"select",opts:(DB)=>PERS_ET_SERVICES(DB),req:1},
  {k:"type",l:"Type de message",t:"select",opts:TYPES_MESSAGE,req:1},
  {k:"priorite",l:"Priorité",t:"select",opts:PRIORITES_MESSAGE},
  {k:"dossier",l:"Dossier lié (optionnel)",t:"ref",coll:"dossiers",cle:"code"},
  {k:"texte",l:"Message",t:"textarea",large:1,req:1}
 ],
 apresSauve: (DB, o, ancien, ctx) => {
   if (!ancien && o.destinataire) ctx.notifier(o.destinataire, `${o.type || "Message"}${o.priorite === "Urgente" ? " (URGENT)" : ""} : ${(o.texte || "").slice(0, 140)}`, "Messagerie");
 },
 cols:[["destinataire","Destinataire"],["type","Type",v=>pill(v||"—","p-gris")],["priorite","Priorité",v=>v==="Urgente"?pill(v,"p-rouge"):v==="Élevée"?pill(v,"p-ambre"):pill(v||"Normale","p-gris")],["texte","Message",v=>esc(String(v||"").slice(0,60))],["dossier","Dossier",v=>v?`<a class="lien" href="#ficheDossier:${esc(v)}">${esc(v)}</a>`:"—"]]},
monAgenda:{label:"Mon agenda", ic:CalendarDays, grp:"Mon espace"},
dashboardLimex:{label:"Tableau de bord LIMEX", ic:Gauge, grp:"LIMEX"},
rapportLimexDirection:{label:"Rapport LIMEX Direction", ic:FileBarChart2, grp:"LIMEX"},
utilisateurs:{label:"Utilisateurs & Permissions", ic:Users, grp:"Pilotage"},
performance:{label:"Performance équipe", ic:TrendingUp, grp:"Pilotage"},
importCentre:{label:"Centre d'importation", ic:UploadCloud, grp:"Pilotage"},
risquesClients:{label:"Factures & Risques clients", ic:ShieldAlert, grp:"Pilotage"},
rapportDirection:{label:"Rapport Direction", ic:FileBarChart, grp:"Pilotage"},
auditGlobal:{label:"Journal d'audit", ic:History, grp:"Pilotage"}
};

export const ORDRE_NAV = [
 ["Mon espace",["dashboard","monAgenda","notifications"]],
 ["Pilotage",["rapportDirection","risquesClients","performance","importCentre","rapports","erreurs","utilisateurs","auditGlobal"]],
 ["Commercial",["clients","contacts","demandes","commandes","dossiers","offres","reclamations"]],
 ["Études",["sourcings","etudes"]],
 ["LIMEX",["dashboardLimex","arrivages","rapportLimexDirection"]],
 ["Opérations",["analyses","transports","transits","certifs","transportsNat"]],
 ["Finance",["paiements","pmtIntl","facturation"]],
 ["Référentiels",["fournisseurs","partenaires","produits","stockage"]],
 ["Transverse",["documents","messagerie","taches"]],
 ["Archives",["leads"]]
];

export const MODS_PAR_COLL = {};
for(const id in MODS){ if(MODS[id].coll) MODS_PAR_COLL[MODS[id].coll] = MODS[id].label; }

import { USERS } from './constants.js';
import { hashPassword } from '../utils/passwordHash.js';

export const MODELES = [
  ["Oumaima","oumaima","Gérante","Direction",["Direction"],[],{voir:1,ajouter:1,modifier:1,supprimer:1,valider:1,exporter:1}],
  ["Imane","imane","Transport international & Études","Opérations Internationales",["Transport","Études & Chiffrage"],["transports","transportsNat","etudes","documents","taches","dossiers"],{voir:1,ajouter:1,modifier:1}],
  ["Mansouri","mansouri","Closing & Suivi Client","Commercial",["Closing","Suivi Client"],["offres","reclamations","clients","dossiers","taches","documents"],{voir:1,ajouter:1,modifier:1,valider:1}],
  ["Ouiam","ouiam","Data & Demandes","Commercial",["Data"],["demandes","clients","contacts","dossiers","taches","tableauBordData"],{voir:1,ajouter:1,modifier:1,valider:1}],
  ["Zoubida","zoubida","Analyse, Transit & Certification","Opérations Internationales",["Analyse Dossiers","Transit & Douane"],["analyses","transits","certifs","documents","dossiers","taches"],{voir:1,ajouter:1,modifier:1,valider:1}],
  ["Yasser","yasser","Sourcing & PortNet","Études Commerciales",["Sourcing","Transit & Douane"],["sourcings","fournisseurs","produits","transits","documents","dossiers","taches"],{voir:1,ajouter:1,modifier:1}],
  ["Mohammed Digital","mohammed","Digital","Digital",["Digital","Data"],["leads","taches"],{voir:1,ajouter:1,modifier:1}],
  ["Nisrine","nisrine","Documents & Stockage","Administration",[],["documents","stockage","taches","dossiers"],{voir:1,ajouter:1,modifier:1}]
];

export function PERSONNES(DB) {
    return (DB.utilisateurs || []).filter(u => u.actif).map(u => u.nomComplet);
}

export function PERS_ET_SERVICES(DB) {
    return PERSONNES(DB).concat(USERS.filter(s => !PERSONNES(DB).includes(s)));
}

export function estDirection(session) {
    return !!session && (session.departement === "Direction" || (session.services || []).includes("Direction"));
}

export function peut(session, action) {
    return !!session && (estDirection(session) || (session.permissions && session.permissions[action]));
}

const MODULES_LIBRES = ["dashboard", "monAgenda", "notifications", "rapports", "monProgramme", "mesTaches", "mesObjectifs", "monRapportJournalier", "monProfil"];
const MODULES_DIRECTION = ["auditGlobal", "utilisateurs", "rapportDirection", "performance", "importCentre", "risquesClients", "objectifsData", "pilotageEquipe", "quiFaitQuoi", "ajouterTache", "journalSecurite", "etatClosing"];

// Un coordinateur Closing travaille dans 4 espaces seulement (Ma journée,
// Mon portefeuille Closing, Devis à contrôler, Coordination Mansouri) —
// ces pages génériques sont désormais fusionnées dedans plutôt que
// supprimées : les données/fonctions continuent d'exister et de tourner
// en arrière-plan (cf. Layout.jsx), seule la navigation est cachée pour
// cette catégorie d'utilisateur. Les autres profils les voient comme avant.
// "mesTaches" reste visible : c'est aussi son seul accès à ses tâches hors
// Closing (son rôle Analyse Dossiers / Transit & Douane reste actif).
const MODULES_FUSIONNES_CLOSING = ["monProgramme", "mesObjectifs", "monRapportJournalier", "monAgenda", "suivisClosing"];
// Même principe pour Imane (§2 du besoin LIMEX) — 4 espaces seulement
// (Ma journée, Suivi LIMEX, Études & Calcul, Paiements & Échéances) ;
// "mesTaches" reste visible pour les exécutants (Yasser/Nisrine/etc.) qui
// reçoivent leurs actions LIMEX comme de vraies tâches.
const MODULES_FUSIONNES_LIMEX = ["monProgramme", "mesObjectifs", "monRapportJournalier", "monAgenda", "suivisLimex", "actionsLimex", "instructionsLimex"];

export function estCoordinateurClosing(session) {
    return !!session && (session.modules || []).includes("maJourneeClosing");
}

export function estCoordinateurLimex(session) {
    return !!session && (session.modules || []).includes("maJourneeImane");
}

export function moduleVisible(session, id) {
    if (!session) return false;
    if (MODULES_DIRECTION.includes(id)) return estDirection(session);
    if (estCoordinateurClosing(session) && MODULES_FUSIONNES_CLOSING.includes(id)) return false;
    if (estCoordinateurLimex(session) && MODULES_FUSIONNES_LIMEX.includes(id)) return false;
    if (MODULES_LIBRES.includes(id)) return true;
    return estDirection(session) || (session.modules || []).includes(id);
}

export function destinataireEstMoi(session, n) {
    if (!session) return false;
    return n.dest === "Tous" || (session.services || []).includes(n.dest) || n.dest === session.nomComplet || n.dest === session.identifiant;
}

export function peutVoirDocument(session, doc) {
    if (estDirection(session)) return true;
    if (!doc.confidentialite || doc.confidentialite.startsWith("Public")) return true;
    if (doc.confidentialite.startsWith("Finance")) return (session.services || []).includes("Finance");
    if (doc.confidentialite === "Juridique restreint") return false;
    return false; // "Direction uniquement"
}

export function seedUsers(DB) {
    if (!DB.utilisateurs) DB.utilisateurs = [];
    if (DB.utilisateurs.length <= 1) {
        MODELES.forEach(m => {
            if (!DB.utilisateurs.some(u => u.identifiant === m[1])) {
                DB.seq["USR"] = Math.max(DB.seq["USR"] || 0, DB.utilisateurs.length) + 1;
                DB.utilisateurs.push({
                    code: "USR" + String(DB.seq["USR"]).padStart(6, "0"), nomComplet: m[0], identifiant: m[1], motDePasse: hashPassword("ubos2026"),
                    poste: m[2], departement: m[3], services: m[4], modules: m[5], permissions: m[6], actif: true, ts: Date.now()
                });
            }
        });
    }
}

/**
 * Ajoute le rôle "Coordination Closing" au compte Zoubida sans rien retirer
 * de son rôle Analyse Dossiers / Transit & Douane actuel (décision explicite :
 * additif, pas un remplacement — ses dossiers LIMEX/transit réels restent
 * intacts). Un seul passage, jamais rejoué (garde `_migrationZoubidaClosingFaite`).
 */
export function migrerRoleZoubidaClosing(DB, auditFn = () => {}) {
    if (DB._migrationZoubidaClosingFaite) return false;
    const NOUVEAUX_MODULES = ["suivisClosing", "maJourneeClosing", "devisAControler", "coordinationMansouri", "monPortefeuilleClosing", "aQualifierClosing"];
    // Recherche par nom plutôt que par identifiant exact : le compte réel
    // peut avoir été renommé/recodé en production (ex. identifiant "SATLI"
    // pour "Zoubida Satli") depuis que le modèle de seed a été écrit.
    const zoubida = (DB.utilisateurs || []).find(u =>
        u.identifiant === "zoubida" || (u.nomComplet || "").toLowerCase().includes("zoubida")
    );
    if (zoubida) {
        if (!(zoubida.services || []).includes("Closing")) {
            const avant = (zoubida.services || []).join(", ");
            zoubida.services = [...(zoubida.services || []), "Closing"];
            auditFn("Utilisateurs", "Service ajouté (Coordination Closing)", zoubida.code, "services", avant, zoubida.services.join(", "));
        }
        const manquants = NOUVEAUX_MODULES.filter(m => !(zoubida.modules || []).includes(m));
        if (manquants.length) {
            const avant = (zoubida.modules || []).join(", ");
            zoubida.modules = [...(zoubida.modules || []), ...manquants];
            auditFn("Utilisateurs", "Modules ajoutés (Coordination Closing)", zoubida.code, "modules", avant, zoubida.modules.join(", "));
        }
    }
    DB._migrationZoubidaClosingFaite = true;
    return true;
}

/**
 * Ajoute le rôle "Coordination LIMEX" au compte Imane sans rien retirer de
 * son rôle Transport / Études & Chiffrage actuel — même décision additive
 * que pour Zoubida. Un seul passage, jamais rejoué.
 */
export function migrerRoleImaneLimex(DB, auditFn = () => {}) {
    if (DB._migrationImaneLimexFaite) return false;
    const NOUVEAUX_MODULES = ["suivisLimex", "actionsLimex", "instructionsLimex", "documentsComptablesCasa", "maJourneeImane", "suiviLimex", "etudesCalcul", "paiementsEcheances"];
    const imane = (DB.utilisateurs || []).find(u =>
        u.identifiant === "imane" || (u.nomComplet || "").toLowerCase().includes("imane")
    );
    if (imane) {
        if (!(imane.services || []).includes("LIMEX")) {
            const avant = (imane.services || []).join(", ");
            imane.services = [...(imane.services || []), "LIMEX"];
            auditFn("Utilisateurs", "Service ajouté (Coordination LIMEX)", imane.code, "services", avant, imane.services.join(", "));
        }
        const manquants = NOUVEAUX_MODULES.filter(m => !(imane.modules || []).includes(m));
        if (manquants.length) {
            const avant = (imane.modules || []).join(", ");
            imane.modules = [...(imane.modules || []), ...manquants];
            auditFn("Utilisateurs", "Modules ajoutés (Coordination LIMEX)", imane.code, "modules", avant, imane.modules.join(", "));
        }
    }
    DB._migrationImaneLimexFaite = true;
    return true;
}

/**
 * Correctif Client/Dossier + nettoyage des compteurs (§24 du besoin) — un
 * seul passage sur les suivis Closing déjà en production. Ne supprime et
 * ne recalcule rien : ajoute seulement codeClient/codeDossier (repris de
 * l'ancien codeSuivi, donc identiques pour l'existant — rien ne change
 * visuellement) et reclasse les "Nouveau" jamais travaillés en "À
 * qualifier" pour qu'ils arrêtent de polluer les compteurs "calcul à
 * demander"/"premier contact" (c'était le bug réel : un code jamais touché
 * était compté comme une vraie action à faire).
 */
export function migrerSuivisClosingV2(DB, auditFn = () => {}) {
    if (DB._migrationSuivisClosingV2Faite) return false;
    let n = 0;
    (DB.suivisClosing || []).forEach(s => {
        if (!s.codeClient) {
            s.codeClient = s.codeSuivi;
            s.codeDossier = s.codeSuivi;
            n++;
        }
        if (s.statutPipeline === "Nouveau" && !s.dernierContact) {
            auditFn("Suivi Closing", "Reclassé À qualifier (migration)", s.code, "statutPipeline", "Nouveau", "À qualifier");
            s.statutPipeline = "À qualifier";
            n++;
        }
    });
    DB._migrationSuivisClosingV2Faite = true;
    return n > 0;
}

export function migrerEtapesDossiers(DB, auditFn = () => {}) {
    if (DB._migrationEtapesFaite) return;
    let n = 0;
    DB.dossiers.forEach(d => {
        if (d.etape === "Lead / Data") {
            auditFn("Dossiers", "Migration étape (Lead / Data supprimée du workflow)", d.code, "etape", "Lead / Data", "Sourcing", d.code);
            d.etape = "Sourcing";
            n++;
        }
    });
    const ouiam = DB.utilisateurs.find(u => u.identifiant === "ouiam");
    if (ouiam) {
        if (ouiam.poste === "Data & Leads") { auditFn("Utilisateurs", "Poste mis à jour", ouiam.code, "poste", "Data & Leads", "Data & Demandes"); ouiam.poste = "Data & Demandes"; n++; }
        if ((ouiam.modules || []).includes("leads")) { auditFn("Utilisateurs", "Modules mis à jour", ouiam.code, "modules", "leads", "demandes"); ouiam.modules = ouiam.modules.filter(m => m !== "leads").concat(ouiam.modules.includes("demandes") ? [] : ["demandes"]); n++; }
    }
    DB._migrationEtapesFaite = true;
    return n > 0;
}

export function migrerAnciensLeads(DB, genCodeFn, genCodeLigneDemandeFn, normTelFn, auditFn = () => {}) {
    if (DB._migrationLeadsFaite) return;
    if (!DB.leads || !DB.leads.length) { DB._migrationLeadsFaite = true; return; }
    let n = 0;
    DB.leads.forEach(l => {
        if (l._migre) return;
        let ct = DB.contacts.find(c => c.telephone && l.telephone && normTelFn(c.telephone) === normTelFn(l.telephone));
        if (!ct) {
            ct = {
                code: genCodeFn("CT"), nom: l.nom || l.telephone || "Contact historique", telephone: l.telephone, source: l.source || "Migration Leads",
                statut: "Nouveau", remarque: "Donnée historique migrée — ancien lead " + l.code, ancienCodeLead: l.code, par: "Migration automatique", ts: l.ts || Date.now()
            };
            DB.contacts.push(ct);
        }
        if (l.client) {
            const cl = DB.clients.find(c => c.code === l.client);
            if (cl && !ct.codeClientAssocie) ct.codeClientAssocie = cl.code;
        }
        const dm = {
            code: genCodeFn("DMD"), client: l.client || "", dateDemande: (l.ts ? new Date(l.ts) : new Date()).toISOString().slice(0, 10),
            responsableData: "Migration automatique", source: l.source || "Migration Leads", objectifGeneral: "Donnée historique migrée — ancien lead " + l.code,
            urgence: "Normale", statut: l.statut === "Qualifié" ? "Confirmée" : "En cours d'étude",
            remarqueGenerale: "Migré automatiquement depuis l'ancien module Leads / Data. Ancien code : " + l.code, migrationHistorique: true, ancienCodeLead: l.code,
            lignes: [], _seqLigne: 0, par: "Migration automatique", ts: l.ts || Date.now()
        };
        dm.lignes.push({
            id: "dl1_" + dm.code, code: genCodeLigneDemandeFn(dm.code, dm), produitService: (l.besoin || "Besoin non précisé").slice(0, 200),
            statut: "Nouvelle", route: [], fournisseurConnu: "Non", proformaDisponible: "Non", consultationsFournisseurs: [], selection: null,
            statutConfirmation: l.statut === "Qualifié" ? "Confirmée" : "Non confirmée", ts: l.ts || Date.now()
        });
        DB.demandes.push(dm);
        l._migre = true; l._demandeMigree = dm.code; l._contactMigre = ct.code;
        auditFn("Migration", "Lead migré", l.code, "—", "—", "Contact " + ct.code + " · Demande " + dm.code);
        n++;
    });
    DB._migrationLeadsFaite = true;
    if (n) { auditFn("Migration", "Migration Leads terminée", "—", "—", "—", n + " ancien(s) lead(s) migré(s) en contacts + demandes"); }
    return n > 0;
}

export function migrerPartenairesTexte(DB, normColFn, genCodeFn, auditFn = () => {}) {
    if (DB._migrationPartenairesFaite) return;
    const parNom = {}; DB.partenaires.forEach(p => parNom[normColFn(p.nom)] = p);
    const rattacher = (val, typeParDefaut) => {
        if (!val || val.length < 2) return val;
        const cle = normColFn(val);
        if (parNom[cle]) return parNom[cle].code; 
        const p = {
            code: genCodeFn("PAR"), nom: val, type: typeParDefaut, statut: "À réévaluer",
            remarque: "Migré automatiquement depuis un ancien arrivage (texte libre) : « " + val + " ».", par: "Migration automatique", ts: Date.now()
        };
        DB.partenaires.push(p);
        parNom[cle] = p;
        auditFn("Partenaires", "Création (migration)", p.code, "—", "—", "Ancienne valeur texte : " + val);
        return p.code;
    };
    let n = 0;
    DB.arrivages.forEach(a => {
        if (a.transitaire && !a.transitaire.startsWith("PAR")) { const av = a.transitaire; a.transitaire = rattacher(av, "Transitaire"); if (a.transitaire !== av) { auditFn("Arrivages", "Transitaire migré vers Partenaires", a.code, "transitaire", av, a.transitaire, a.code); n++; } }
        if (a.transporteur && !a.transporteur.startsWith("PAR")) { const av = a.transporteur; a.transporteur = rattacher(av, "Transporteur international"); if (a.transporteur !== av) { auditFn("Arrivages", "Transporteur migré vers Partenaires", a.code, "transporteur", av, a.transporteur, a.code); n++; } }
        if (a.compagnie && !a.compagnie.startsWith("PAR")) { const av = a.compagnie; a.compagnie = rattacher(av, "Compagnie maritime"); if (a.compagnie !== av) { auditFn("Arrivages", "Compagnie migrée vers Partenaires", a.code, "compagnie", av, a.compagnie, a.code); n++; } }
    });
    DB._migrationPartenairesFaite = true;
    if (n) { auditFn("Migration", "Migration Partenaires terminée", "—", "—", "—", n + " ancienne(s) valeur(s) texte rattachée(s) au référentiel Partenaires"); }
    return n > 0;
}

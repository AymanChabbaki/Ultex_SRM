import React from 'react';

export function optionsPaysDatalist(PAYS_MONDE, PAYS_FAVORIS_ULTEX) {
  const favoris = PAYS_FAVORIS_ULTEX.map(c => PAYS_MONDE.find(p => p.c === c)).filter(Boolean);
  const reste = PAYS_MONDE.filter(p => !PAYS_FAVORIS_ULTEX.includes(p.c)).sort((a, b) => a.n.localeCompare(b.n, "fr"));
  return favoris.concat(reste).map((p, idx) => (
    <option key={idx} value={p.n}>{p.n} ({p.c})</option>
  ));
}

export function optionsPortsDatalist(PORTS_MONDE) {
  return PORTS_MONDE.map((p, idx) => (
    <option key={idx} value={p.n}>{p.n} — {p.v}, {p.p} ({p.l})</option>
  ));
}

export function optionsAeroportsDatalist(AEROPORTS_MONDE) {
  return AEROPORTS_MONDE.map((a, idx) => (
    <option key={idx} value={a.n}>{a.n} — {a.v}, {a.p} ({a.i})</option>
  ));
}

export function peutSelectionnerPartenaire(DB, codePartenaire, estDirection) {
  if (!DB || !DB.partenaires) return true;
  const p = DB.partenaires.find(x => x.code === codePartenaire);
  if (!p) return true;
  if (["Suspendu", "Blacklisté"].includes(p.statut)) return estDirection;
  return true;
}

export function recupererInfosSocieteClient(DB, codeClient) {
  if (!DB || !DB.clients) return null;
  const c = DB.clients.find(x => x.code === codeClient);
  if (!c) return null;
  return {
    raisonSociale: c.raisonSociale || c.nom,
    ice: c.ice,
    idFiscal: c.idFiscal,
    rc: c.rc,
    adresse: c.adresse,
    representantLegal: c.representantLegal
  };
}

export function genererTachesDepuisServices(DB, dossier, auditFn, genCodeFn, SERVICE_ETAPE, SERVICE_TACHES, userCourant) {
  dossier._tachesServicesGenerees = dossier._tachesServicesGenerees || [];
  const services = dossier.servicesInclus || [];
  let n = 0;
  services.forEach(srv => {
    if (dossier._tachesServicesGenerees.includes(srv)) return;
    (SERVICE_TACHES[srv] || []).forEach(titre => {
      DB.taches.push({
        code: genCodeFn("T", DB),
        titre: titre + " — " + dossier.code,
        dossier: dossier.code,
        assigne: dossier.responsable || SERVICE_ETAPE[dossier.etape] || "",
        statut: "À faire",
        echeance: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
        origine: "Service : " + srv,
        ts: Date.now()
      });
      n++;
    });
    dossier._tachesServicesGenerees.push(srv);
  });
  if (n && auditFn) {
    auditFn(DB, "Dossiers", "Tâches générées depuis les services", dossier.code, "servicesInclus", "—", n + " tâche(s) créée(s) pour " + services.filter(s => SERVICE_TACHES[s]).length + " service(s)", dossier.code, userCourant);
  }
  return n;
}

export function estLienDocument(t) {
  return t && t.startsWith("Lien ");
}

export function apercuPossible(url) {
  return url && /\.(pdf|jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
}

export function labelObjet(type) {
  return {
    dossier: "Dossier",
    demande: "Demande",
    arrivage: "Arrivage",
    commande: "Commande",
    client: "Client",
    tache: "Tâche",
    reclamation: "Réclamation",
    document: "Document"
  }[type] || type;
}

export function ficheHashPour(objetType, objetCode) {
  const map = {
    dossier: "ficheDossier",
    demande: "ficheDemande",
    arrivage: "ficheArrivage",
    commande: "ficheCommande",
    client: "ficheClient",
    document: "ficheDocument"
  };
  return map[objetType] ? map[objetType] + ":" + objetCode : "";
}

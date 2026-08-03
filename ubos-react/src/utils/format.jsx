import React from 'react';

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

export function refLabel(DB, coll, code, cle) {
  if (!DB || !DB[coll]) return code || "—";
  const o = DB[coll].find(x => x.code === code);
  return o ? (o[cle] || o.code) + " (" + o.code + ")" : (code || "—");
}

export function fmtMAD(v) {
  return v ? Number(v).toLocaleString("fr-FR") + " MAD" : "—";
}

export function pill(txt, type) {
  // Returns a React element for easy rendering in JSX
  return <span className={`pill ${type}`}>{txt}</span>;
}

export function pillStatut(s) {
  const ok = ["Payé","Validée","Validé","Acceptée","Qualifié","Terminée","Livré","Livraison","Clôturé","Actif","Émis"];
  const bad = ["En retard","Rejeté","Perdue","Bloqué","Blacklisté","Non qualifié","Suspendu","Annulé"];
  const amb = ["En attente","Prévu","En vérification","En cours","Négociation","Nouveau","À faire","En transit","En évaluation","Contacté"];
  
  if (ok.includes(s)) return pill(s, "p-vert");
  if (bad.includes(s)) return pill(s, "p-rouge");
  if (amb.includes(s)) return pill(s, "p-ambre");
  return pill(s || "—", "p-gris");
}

export function normTel(t) {
  if (!t) return "";
  return String(t).replace(/\D/g, "");
}

export function labelPays(nomOuCode, PAYS_MONDE) {
  const p = PAYS_MONDE.find(x => x.n === nomOuCode || x.c === nomOuCode);
  return p ? p.n : (nomOuCode || "");
}

export function labelIncoterm(code, INCOTERMS_2020) {
  const i = INCOTERMS_2020.find(x => x.code === code);
  return i ? code + " — " + i.nom.split(" — ")[1] : (code || "");
}

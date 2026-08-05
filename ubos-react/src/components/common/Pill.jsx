import React from 'react';

export const Pill = ({ text, texte, type }) => {
  return <span className={`pill ${type || 'p-gris'}`}>{texte ?? text}</span>;
};

export const PillStatut = ({ text, texte }) => {
  const val = texte ?? text;
  if (!val) return <Pill texte="—" type="p-gris" />;

  const lower = val.toLowerCase();
  let type = "p-gris";

  if (lower.includes("livré") || lower.includes("payée") || lower.includes("clôturé") || lower.includes("qualifié") || lower === "actif") {
    type = "p-vert";
  } else if (lower.includes("en cours") || lower.includes("partiel") || lower.includes("validé")) {
    type = "p-or";
  } else if (lower.includes("bloqué") || lower.includes("annulé") || lower.includes("rejeté") || lower.includes("impayé") || lower.includes("critique")) {
    type = "p-rouge";
  } else if (lower.includes("attente") || lower.includes("nouveau") || lower.includes("nouvelle")) {
    type = "p-ambre";
  }

  return <Pill texte={val} type={type} />;
};

export default Pill;

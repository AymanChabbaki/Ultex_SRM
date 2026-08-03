import React from 'react';

export const Pill = ({ text, type }) => {
  return <span className={`pill ${type || 'p-gris'}`}>{text}</span>;
};

export const PillStatut = ({ text }) => {
  if (!text) return <Pill text="—" type="p-gris" />;
  
  const lower = text.toLowerCase();
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

  return <Pill text={text} type={type} />;
};

export default Pill;

import React from 'react';

const EmptyState = ({ title, message }) => {
  return (
    <div className="vide">
      <h3>{title || "Aucune donnée"}</h3>
      <p>{message || "Rien à afficher pour le moment."}</p>
    </div>
  );
};

export default EmptyState;

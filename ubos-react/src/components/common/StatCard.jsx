import React from 'react';

export default function StatCard({ value, val, label, alerte, trend, splitVal }) {
  const displayVal = value !== undefined ? value : val;

  return (
    <div className={`stat-card-modern ${alerte ? 'alerte-border' : ''}`}>
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        {alerte ? (
          <span className="stat-badge alert">Attention</span>
        ) : (
          <span className="stat-badge active">Actif</span>
        )}
      </div>
      <div className="stat-card-val-wrap">
        {splitVal ? (
          <span className="stat-val-split">
            <span className="stat-val-part traite" title="Traités">{splitVal.traite ?? 0}</span>
            <span className="stat-val-sep">/</span>
            <span className="stat-val-part nonTraite" title="Non traités">{splitVal.nonTraite ?? 0}</span>
          </span>
        ) : (
          <span className="stat-val">{displayVal ?? 0}</span>
        )}
        {trend && <span className="stat-trend">{trend}</span>}
      </div>
      {splitVal && (
        <div className="stat-val-legend">
          <span className="stat-val-legend-item"><span className="stat-val-dot traite"></span>Traité</span>
          <span className="stat-val-legend-item"><span className="stat-val-dot nonTraite"></span>Non traité</span>
        </div>
      )}
      <div className="stat-card-bar"></div>
    </div>
  );
}

import React from 'react';

export default function StatCard({ value, val, label, alerte, trend }) {
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
        <span className="stat-val">{displayVal ?? 0}</span>
        {trend && <span className="stat-trend">{trend}</span>}
      </div>
      <div className="stat-card-bar"></div>
    </div>
  );
}

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';

const Topbar = ({ titre, toggleSidebar }) => {
  const { session, deconnecter, estDirection } = useAuth();
  const { db, isPostgresConnected, syncToPostgres } = useDB();
  const [terme, setTerme] = useState('');
  const [syncing, setSyncing] = useState(false);

  const nb = (db?.notifications || []).filter(n => !n.lue).length;

  const handleRecherche = (e) => {
    if (e.key === 'Enter') {
      window.location.hash = `recherche:${terme}`;
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    await syncToPostgres();
    setSyncing(false);
  };

  const init = session ? (session.nomComplet || "?").split(" ").map(m => m[0]).join("").slice(0,2).toUpperCase() : "?";
  const role = session ? (session.poste || session.departement || "") : "";

  return (
    <div className="top">
      <button className="burger" onClick={toggleSidebar}>☰</button>
      <h2>{titre}</h2>
      <input 
        type="search" 
        className="gsearch" 
        placeholder="🔎 Recherche globale (Entrée)" 
        value={terme}
        onChange={e => setTerme(e.target.value)}
        onKeyDown={handleRecherche}
      />
      
      {/* PostgreSQL Status Indicator */}
      <div 
        title={isPostgresConnected ? "Base PostgreSQL connectée et synchronisée" : "Cliquer pour tenter la synchro PostgreSQL"}
        onClick={handleManualSync}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '16px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          background: isPostgresConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
          color: isPostgresConnected ? '#059669' : '#d97706',
          border: `1px solid ${isPostgresConnected ? '#10b981' : '#f59e0b'}`
        }}
      >
        <span>{isPostgresConnected ? '🟢 PostgreSQL' : '🟠 Mode Cache'}</span>
        {syncing && <span>🔄</span>}
      </div>

      <button className="cloche" onClick={() => window.location.hash = 'notifications'} title="Notifications">
        🔔<em style={{ display: nb ? 'block' : 'none' }}>{nb > 0 ? nb : ''}</em>
      </button>
      <div className="badge-user">
        <div className="rond">{init}</div>
        <div>
          <b>{session ? session.nomComplet : "—"}</b>
          <small>{role}{estDirection() ? " · Direction" : ""}</small>
        </div>
        <button className="btn mini rouge" onClick={deconnecter} title="Se déconnecter">Quitter</button>
      </div>
    </div>
  );
};

export default Topbar;

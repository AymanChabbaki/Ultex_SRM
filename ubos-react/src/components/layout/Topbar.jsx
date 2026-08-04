import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import { useSidebar } from './Layout';
import { MenuIcon, BellIcon, DatabaseIcon, SyncIcon } from '../common/Icons';

const Topbar = ({ titre, toggleSidebar: propToggle }) => {
  const { session, deconnecter, estDirection } = useAuth();
  const { db, isPostgresConnected, syncToPostgres } = useDB();
  const sidebarCtx = useSidebar();
  const [terme, setTerme] = useState('');
  const [syncing, setSyncing] = useState(false);

  const toggle = propToggle || sidebarCtx?.toggleSidebar;

  const nb = (db?.notifications || []).filter(n => !n.lu).length;

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
      <button className="burger" onClick={toggle} title="Réduire / Agrandir le menu (Sidebar)">
        <MenuIcon size={18} color="#ffffff" />
      </button>
      <h2>{titre}</h2>
      <input 
        type="search" 
        className="gsearch" 
        placeholder="Recherche globale (Entrée)" 
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
          padding: '5px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          background: isPostgresConnected ? 'rgba(5, 150, 105, 0.12)' : 'rgba(217, 119, 6, 0.12)',
          color: isPostgresConnected ? '#059669' : '#d97706',
          border: `1px solid ${isPostgresConnected ? '#10b981' : '#f59e0b'}`
        }}
      >
        <DatabaseIcon size={15} color={isPostgresConnected ? '#059669' : '#d97706'} />
        <span>{isPostgresConnected ? 'PostgreSQL Actif' : 'Mode Cache'}</span>
        {syncing && <SyncIcon size={14} color={isPostgresConnected ? '#059669' : '#d97706'} className="animate-spin" />}
      </div>

      <button className="cloche" onClick={() => window.location.hash = 'notifications'} title="Notifications">
        <BellIcon size={18} color="#0159A3" />
        <em style={{ display: nb ? 'block' : 'none' }}>{nb > 0 ? nb : ''}</em>
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

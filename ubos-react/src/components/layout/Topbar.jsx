import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';

const Topbar = ({ titre, toggleSidebar }) => {
  const { session, deconnecter, estDirection } = useAuth();
  const { db } = useDB();
  const [terme, setTerme] = useState('');

  const nb = (db?.notifications || []).filter(n => !n.lue).length;

  const handleRecherche = (e) => {
    if (e.key === 'Enter') {
      window.location.hash = `recherche:${terme}`;
    }
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

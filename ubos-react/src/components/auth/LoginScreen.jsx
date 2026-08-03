import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';

export default function LoginScreen() {
  const { db } = useDB();
  const { connecter } = useAuth();
  
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [error, setError] = useState('');

  const prem = db?.utilisateurs?.some(u => u.identifiant === "oumaima" && u.motDePasse === "ubos2026");
  const noteText = prem
    ? "Comptes équipe créés — mot de passe initial commun : <b>ubos2026</b>.<br>Direction : identifiant <b>oumaima</b>. Chaque mot de passe est à changer dans Utilisateurs & Permissions."
    : "Accès réservé à l'équipe ULTEx. En cas d'oubli, contactez la Direction.";

  const handleConnecter = () => {
    const id = identifiant.trim();
    if (!connecter(id, motDePasse)) {
      const u = db?.utilisateurs?.find(x => x.identifiant === id);
      if (u && !u.actif) {
        setError("Compte désactivé — contactez la Direction.");
      } else {
        setError("Identifiant ou mot de passe incorrect.");
      }
    } else {
      setError('');
    }
  };

  return (
    <div id="ecranLogin">
      <div className="carte-login">
        <h1>UB<span>O</span>S</h1>
        <div className="sous">ULTEx Business Operating System</div>
        {error && <div className="login-err" id="loginErr" style={{ display: 'block' }}>{error}</div>}
        <div className="champ">
          <label>Identifiant</label>
          <input 
            id="logId" 
            autoComplete="username" 
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('logMdp').focus(); }} 
          />
        </div>
        <div className="champ">
          <label>Mot de passe</label>
          <input 
            id="logMdp" 
            type="password" 
            autoComplete="current-password" 
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConnecter(); }} 
          />
        </div>
        <button className="btn" onClick={handleConnecter}>Se connecter</button>
        <div className="login-note" id="loginNote" dangerouslySetInnerHTML={{ __html: noteText }}></div>
      </div>
    </div>
  );
}

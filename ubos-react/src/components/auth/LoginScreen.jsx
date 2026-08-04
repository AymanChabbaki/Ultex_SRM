import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import Logo from '../common/Logo';
import { UserIcon, KeyIcon, EyeIcon, EyeOffIcon, AlertIcon, ShieldCheckIcon } from '../common/Icons';

export default function LoginScreen() {
  const { db, isPostgresConnected } = useDB();
  const { connecter } = useAuth();
  
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const id = identifiant.trim();
    if (!id || !motDePasse) {
      setError("Veuillez saisir votre identifiant et votre mot de passe.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const success = await connecter(id, motDePasse);
      if (!success) {
        const u = db?.utilisateurs?.find(x => x.identifiant === id || x.code === id);
        if (u && !u.actif) {
          setError("Compte désactivé — Veuillez contacter l'Administration ULTEx.");
        } else {
          setError("Identifiant ou mot de passe incorrect.");
        }
      }
    } catch (err) {
      setError(err.message || "Erreur de connexion au serveur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="ecranLogin">
      {/* Background Animated Glowing Ambient Blobs */}
      <div className="login-bg-glow glow-1"></div>
      <div className="login-bg-glow glow-2"></div>

      <div className="carte-login">
        {/* Brand Header */}
        <div className="login-header">
          <Logo size="large" />
          <p className="system-tagline">Portail Sécurisé d'Exploit & SRM</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="login-err animate-fade">
            <AlertIcon size={16} color="#991b1b" className="err-icon" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="champ">
            <label htmlFor="logId">
              <span>Identifiant Utilisateur</span>
            </label>
            <div className="input-wrapper">
              <span className="input-icon">
                <UserIcon size={18} color="#64748b" />
              </span>
              <input 
                id="logId" 
                type="text"
                autoComplete="username"
                placeholder="Votre identifiant..."
                value={identifiant}
                onChange={(e) => setIdentifiant(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>
          </div>

          <div className="champ">
            <label htmlFor="logMdp">
              <span>Mot de Passe</span>
            </label>
            <div className="input-wrapper">
              <span className="input-icon">
                <KeyIcon size={18} color="#64748b" />
              </span>
              <input 
                id="logMdp" 
                type={showPassword ? "text" : "password"} 
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                disabled={loading}
              />
              <button 
                type="button" 
                className="toggle-pwd-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? "Masquer" : "Afficher"}
              >
                {showPassword ? <EyeOffIcon size={18} color="#64748b" /> : <EyeIcon size={18} color="#64748b" />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-login-submit" disabled={loading}>
            {loading ? (
              <span className="spinner-wrap">
                <span className="spinner"></span> Connexion en cours...
              </span>
            ) : (
              <span>Se Connecter à UBOS &rarr;</span>
            )}
          </button>
        </form>

        {/* Secure Connection Badge & Footer */}
        <div className="login-security-badge">
          <div className="sec-status">
            <ShieldCheckIcon size={14} color="#059669" />
            <span>{isPostgresConnected ? 'Connexion PostgreSQL Chiffrée' : 'Espace Sécurisé SSL'}</span>
          </div>
          <small>© 2026 ULTEx SRM. Tous droits réservés.</small>
        </div>
      </div>
    </div>
  );
}

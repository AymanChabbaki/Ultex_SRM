import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useDB } from './DBContext';
import { estDirection as estDirectionPerm, peut as peutPerm, moduleVisible as moduleVisiblePerm } from '../data/permissions';
import { loginBackend } from '../services/api';
import { verifyPassword } from '../utils/passwordHash';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const { db, updateDB, setUserCourant, audit } = useDB();

  const [session, setSession] = useState(() => {
    try {
      const s = localStorage.getItem('ubos_session');
      if (s && db && db.utilisateurs) {
        if (s.startsWith('{')) {
          return JSON.parse(s);
        }
        return db.utilisateurs.find(x => (x.identifiant === s || x.code === s) && x.actif) || null;
      }
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    if (!session) {
      const s = localStorage.getItem('ubos_session');
      if (s && db && db.utilisateurs) {
        let u = null;
        if (s.startsWith('{')) {
          try { u = JSON.parse(s); } catch (e) {}
        } else {
          u = db.utilisateurs.find(x => (x.identifiant === s || x.code === s) && x.actif);
        }
        if (u) {
          setSession(u);
          setUserCourant(u.nomComplet || u.identifiant);
        }
      }
    } else if (db && db.utilisateurs) {
      const updatedUser = db.utilisateurs.find(x => x.code === session.code || x.identifiant === session.identifiant);
      if (updatedUser) {
        if (updatedUser.identifiant !== session.identifiant || updatedUser.nomComplet !== session.nomComplet) {
          setSession(updatedUser);
          localStorage.setItem('ubos_session', JSON.stringify(updatedUser));
          setUserCourant(updatedUser.nomComplet || updatedUser.identifiant);
        } else {
          setUserCourant(session.nomComplet || session.identifiant);
        }
      }
    }
  }, [db, session, setUserCourant]);

  const login = useCallback((user) => {
    setSession(user);
    localStorage.setItem('ubos_session', JSON.stringify(user));
    setUserCourant(user.nomComplet || user.identifiant);
    audit("Sécurité", "Connexion", user.code || user.identifiant, "—", "—", user.identifiant);
  }, [setUserCourant, audit]);

  const connecter = useCallback(async (id, mdp) => {
    // 1. Try PostgreSQL Backend Login
    try {
      const res = await loginBackend(id, mdp);
      if (res && res.user) {
        login(res.user);
        return true;
      }
    } catch (e) {
      console.warn("Backend login fail, fallback local check:", e.message);
    }

    // 2. Local fallback check
    if (!db || !db.utilisateurs) return false;
    const user = db.utilisateurs.find(u => (u.identifiant === id || u.code === id) && u.actif && verifyPassword(mdp, u.motDePasse));
    if (user) {
      login(user);
      return true;
    }
    return false;
  }, [db, login]);

  const deconnecter = useCallback(() => {
    if (session) {
      audit("Sécurité", "Déconnexion", session.code || session.identifiant, "—", "—", session.identifiant);
    }
    setSession(null);
    localStorage.removeItem('ubos_session');
    setUserCourant("Invité");
  }, [session, audit, setUserCourant]);

  const estDirection = useCallback(() => {
    return estDirectionPerm(session);
  }, [session]);

  const peut = useCallback((action) => {
    return peutPerm(session, action);
  }, [session]);

  const moduleVisible = useCallback((modId) => {
    return moduleVisiblePerm(session, modId);
  }, [session]);

  return (
    <AuthContext.Provider value={{
      session,
      login,
      connecter,
      deconnecter,
      estDirection,
      peut,
      moduleVisible,
      userCourant: session ? (session.nomComplet || session.identifiant) : "Invité"
    }}>
      {children}
    </AuthContext.Provider>
  );
};

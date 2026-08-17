import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useDB } from './DBContext';
import { estDirection as estDirectionPerm, peut as peutPerm, moduleVisible as moduleVisiblePerm } from '../data/permissions';
import { loginBackend, fetchMe, getToken, setToken, clearToken } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const { setUserCourant, audit, chargerDonnees, viderDonnees } = useDB();

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Rehydrate from a stored token on first load — no local user cache to
  // fall back to, PostgreSQL is asked directly who this token belongs to.
  useEffect(() => {
    let isMounted = true;
    async function rehydrater() {
      const token = getToken();
      if (!token) {
        if (isMounted) setAuthLoading(false);
        return;
      }
      try {
        const user = await fetchMe();
        await chargerDonnees();
        if (!isMounted) return;
        setSession(user);
        setUserCourant(user.nomComplet || user.identifiant);
      } catch (e) {
        clearToken();
        if (isMounted) setSession(null);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    }
    rehydrater();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (user, token) => {
    setToken(token);
    setSession(user);
    setUserCourant(user.nomComplet || user.identifiant);
    await chargerDonnees();
    audit("Sécurité", "Connexion", user.code || user.identifiant, "—", "—", user.identifiant);
  }, [setUserCourant, audit, chargerDonnees]);

  const connecter = useCallback(async (id, mdp) => {
    // No offline/local fallback: PostgreSQL is the only source of truth,
    // so a real, reachable backend is required to log in at all.
    const res = await loginBackend(id, mdp);
    if (res && res.user && res.token) {
      await login(res.user, res.token);
      return true;
    }
    return false;
  }, [login]);

  const deconnecter = useCallback(() => {
    if (session) {
      audit("Sécurité", "Déconnexion", session.code || session.identifiant, "—", "—", session.identifiant);
    }
    clearToken();
    setSession(null);
    setUserCourant("Invité");
    viderDonnees();
  }, [session, audit, setUserCourant, viderDonnees]);

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
      authLoading,
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

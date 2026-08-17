import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { baseVide, genCode as genCodeDb, audit as auditDb, notifier as notifierDb } from '../data/db';
import { seedUsers } from '../data/permissions';
import { checkBackendHealth, fetchDB, saveDBSync } from '../services/api';
import { useToast } from './ToastContext';

const DBContext = createContext();

export const useDB = () => useContext(DBContext);

export const DBProvider = ({ children }) => {
  const [db, setDb] = useState(() => baseVide());
  const [userCourant, setUserCourant] = useState("Invité");
  const [isPostgresConnected, setIsPostgresConnected] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const { toast } = useToast();

  // Always the latest committed db, updated synchronously (not through a
  // useEffect, which only runs after React finishes the current handler).
  // audit()/notifier()/genCode() read from this so that several of them
  // called back-to-back in the same event handler each see the others'
  // results immediately, instead of racing on a stale value.
  const dbRef = useRef(db);

  useEffect(() => {
    let isMounted = true;
    checkBackendHealth().then(health => {
      if (isMounted) setIsPostgresConnected(!!(health && health.status === 'ok'));
    });
    return () => { isMounted = false; };
  }, []);

  // Called by AuthContext once a valid session/token exists — not on its
  // own mount. There is no local cache to fall back to: PostgreSQL is the
  // only source of truth, so this must succeed (or throw) before the app
  // shows anything but the login screen.
  const chargerDonnees = useCallback(async () => {
    setDbLoading(true);
    try {
      const remoteDb = await fetchDB();
      const merged = Object.assign(baseVide(), remoteDb);
      seedUsers(merged);
      dbRef.current = merged;
      setDb(merged);
      setIsPostgresConnected(true);
    } catch (e) {
      if (!(e && e.name === 'AuthError')) setIsPostgresConnected(false);
      throw e;
    } finally {
      setDbLoading(false);
    }
  }, []);

  // Called on logout so the previous user's data doesn't linger in memory
  // while the login screen is showing.
  const viderDonnees = useCallback(() => {
    dbRef.current = baseVide();
    setDb(dbRef.current);
  }, []);

  // The one place every mutation funnels through: applies `next` to state
  // immediately (the UI stays responsive), then confirms it against
  // PostgreSQL. If that fails, the optimistic change is rolled back and
  // the user is told — instead of the previous silent fire-and-forget
  // that could leave the browser and the database disagreeing.
  const commit = useCallback(async (next) => {
    const previous = dbRef.current;
    dbRef.current = next;
    setDb(next);
    try {
      await saveDBSync(next);
    } catch (e) {
      dbRef.current = previous;
      setDb(previous);
      toast(e && e.name === 'AuthError' ? 'Session expirée — reconnectez-vous.' : "Échec de l'enregistrement — vérifiez votre connexion.");
    }
  }, [toast]);

  // Returns the underlying promise so call sites that need to know when a
  // save has actually landed (e.g. before reloading the page) can await
  // it — most callers just fire it and move on, exactly as before.
  const updateDB = useCallback((newDb) => {
    return commit({ ...newDb });
  }, [commit]);

  const genCode = useCallback((pfx) => {
    return genCodeDb(pfx, dbRef.current);
  }, []);

  const audit = useCallback((module, action, ref, champ, av, ap, doss) => {
    const nDb = { ...dbRef.current };
    auditDb(nDb, module, action, ref, champ, av, ap, doss, userCourant);
    commit(nDb);
  }, [userCourant, commit]);

  const notifier = useCallback((dest, texte, lien) => {
    const nDb = { ...dbRef.current };
    notifierDb(nDb, dest, texte, lien, userCourant, (pfx, d) => genCodeDb(pfx, d));
    commit(nDb);
  }, [userCourant, commit]);

  const syncToPostgres = useCallback(async () => {
    try {
      await saveDBSync(dbRef.current);
      setIsPostgresConnected(true);
    } catch (e) {
      setIsPostgresConnected(false);
      toast('Échec de la synchronisation manuelle.');
    }
  }, [toast]);

  return (
    <DBContext.Provider value={{
      db, setDb, updateDB, genCode, audit, notifier,
      userCourant, setUserCourant, isPostgresConnected, syncToPostgres,
      dbLoading, chargerDonnees, viderDonnees
    }}>
      {children}
    </DBContext.Provider>
  );
};

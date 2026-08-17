import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { charger, sauver, baseVide, genCode as genCodeDb, audit as auditDb, notifier as notifierDb, CLE } from '../data/db';
import { seedUsers } from '../data/permissions';
import { fetchDB, checkBackendHealth, saveDBSync } from '../services/api';

const DBContext = createContext();

export const useDB = () => useContext(DBContext);

export const DBProvider = ({ children }) => {
  // Captured once, before charger()/sauver() below ever touch localStorage:
  // true only for a browser that has genuinely never loaded UBOS before.
  const navigateurVierge = useRef(typeof window !== 'undefined' && window.localStorage.getItem(CLE) === null);

  const [db, setDb] = useState(() => {
    const data = charger();
    seedUsers(data);
    sauver(data);
    return data;
  });
  const [userCourant, setUserCourant] = useState("Invité");
  const [isPostgresConnected, setIsPostgresConnected] = useState(false);

  // Fetch initial PostgreSQL data on mount — but only to bootstrap a
  // genuinely fresh browser. If this device already has local data, it's
  // the source of truth: every change already pushes to Postgres via
  // sauver()/saveDBSync, so pulling here too would risk clobbering a
  // just-made change (e.g. a password/profile update) with a backend copy
  // that hasn't caught up to that push yet.
  useEffect(() => {
    let isMounted = true;
    async function initPostgres() {
      const health = await checkBackendHealth();
      if (!health || health.status !== 'ok') {
        if (isMounted) setIsPostgresConnected(false);
        return;
      }
      if (isMounted) setIsPostgresConnected(true);
      if (!navigateurVierge.current) return;

      const remoteDb = await fetchDB();
      if (remoteDb && isMounted) {
        const merged = Object.assign(baseVide(), remoteDb);
        seedUsers(merged);
        setDb(merged);
        try {
          localStorage.setItem(CLE, JSON.stringify(merged));
        } catch (e) {}
      }
    }
    initPostgres();
    return () => { isMounted = false; };
  }, []);

  const updateDB = useCallback((newDb) => {
    const updated = { ...newDb };
    setDb(updated);
    sauver(updated);
  }, []);

  const genCode = useCallback((pfx) => {
    return genCodeDb(pfx, db);
  }, [db]);

  const audit = useCallback((module, action, ref, champ, av, ap, doss) => {
    setDb(prev => {
      const nDb = { ...prev };
      auditDb(nDb, module, action, ref, champ, av, ap, doss, userCourant);
      sauver(nDb);
      return nDb;
    });
  }, [userCourant]);

  const notifier = useCallback((dest, texte, lien) => {
    setDb(prev => {
      const nDb = { ...prev };
      notifierDb(nDb, dest, texte, lien, userCourant, (pfx, d) => genCodeDb(pfx, d));
      sauver(nDb);
      return nDb;
    });
  }, [userCourant]);

  const syncToPostgres = useCallback(async () => {
    if (db) {
      await saveDBSync(db);
      setIsPostgresConnected(true);
    }
  }, [db]);

  return (
    <DBContext.Provider value={{
      db, setDb, updateDB, sauver, genCode, audit, notifier,
      userCourant, setUserCourant, isPostgresConnected, syncToPostgres
    }}>
      {children}
    </DBContext.Provider>
  );
};

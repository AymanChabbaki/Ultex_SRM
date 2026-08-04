import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { charger, sauver, baseVide, genCode as genCodeDb, audit as auditDb, notifier as notifierDb } from '../data/db';
import { seedUsers } from '../data/permissions';
import { fetchDB, checkBackendHealth, saveDBSync } from '../services/api';

const DBContext = createContext();

export const useDB = () => useContext(DBContext);

export const DBProvider = ({ children }) => {
  const [db, setDb] = useState(() => {
    const data = charger();
    seedUsers(data);
    sauver(data);
    return data;
  });
  const [userCourant, setUserCourant] = useState("Invité");
  const [isPostgresConnected, setIsPostgresConnected] = useState(false);

  // Fetch initial PostgreSQL data on mount
  useEffect(() => {
    let isMounted = true;
    async function initPostgres() {
      const health = await checkBackendHealth();
      if (health && health.status === 'ok') {
        if (isMounted) setIsPostgresConnected(true);
        const remoteDb = await fetchDB();
        if (remoteDb && isMounted) {
          const merged = Object.assign(baseVide(), remoteDb);
          seedUsers(merged);
          setDb(merged);
          // Update cache
          try {
            localStorage.setItem('ubos_mvp_v1', JSON.stringify(merged));
          } catch (e) {}
        }
      } else {
        if (isMounted) setIsPostgresConnected(false);
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

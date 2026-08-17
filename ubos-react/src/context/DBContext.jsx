import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { charger, sauver, genCode as genCodeDb, audit as auditDb, notifier as notifierDb } from '../data/db';
import { seedUsers } from '../data/permissions';
import { checkBackendHealth, saveDBSync } from '../services/api';

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

  // The browser's local storage is the single source of truth — never
  // overwritten by whatever happens to be in Postgres. Every change still
  // pushes to Postgres (sauver()/saveDBSync, and the manual sync button)
  // for backup/multi-device purposes, but nothing ever pulls from it and
  // replaces local state: that pull-on-load behavior used to silently
  // revert changes (e.g. a password update) whenever the backend's copy
  // hadn't caught up yet by the time the page reloaded. This effect only
  // checks connectivity for the status badge.
  useEffect(() => {
    let isMounted = true;
    checkBackendHealth().then(health => {
      if (isMounted) setIsPostgresConnected(!!(health && health.status === 'ok'));
    });
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

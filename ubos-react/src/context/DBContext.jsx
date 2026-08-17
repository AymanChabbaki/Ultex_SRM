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
    return data;
  });
  const [userCourant, setUserCourant] = useState("Invité");
  const [isPostgresConnected, setIsPostgresConnected] = useState(false);

  // The browser's local storage is the single source of truth — never
  // overwritten by whatever happens to be in Postgres. Every change still
  // pushes to Postgres (sauver()/saveDBSync, and the manual sync button)
  // for backup/multi-device purposes, but nothing ever pulls from it and
  // replaces local state. This effect only checks connectivity for the
  // status badge.
  useEffect(() => {
    let isMounted = true;
    checkBackendHealth().then(health => {
      if (isMounted) setIsPostgresConnected(!!(health && health.status === 'ok'));
    });
    return () => { isMounted = false; };
  }, []);

  // The ONLY place sauver() is called. Previously updateDB()/audit()/
  // notifier() each called sauver() themselves, including from inside
  // setState updater functions — but React defers those updaters to its
  // own batching schedule, decoupled from call order in the code. Whenever
  // a component called audit(...) before updateDB(...) (e.g. the "Modifier
  // utilisateur" screen), the audit updater's sauver() — carrying a stale
  // pre-update snapshot — ended up executing AFTER updateDB's, silently
  // overwriting a fresh change (a password, an identifiant...) in
  // localStorage with the old value, even before any reload. Persisting
  // from a single effect keyed on the committed `db` state removes the
  // race entirely: it always runs exactly once per real change, with
  // whatever the final state actually is.
  useEffect(() => {
    sauver(db);
  }, [db]);

  const updateDB = useCallback((newDb) => {
    setDb({ ...newDb });
  }, []);

  const genCode = useCallback((pfx) => {
    return genCodeDb(pfx, db);
  }, [db]);

  const audit = useCallback((module, action, ref, champ, av, ap, doss) => {
    setDb(prev => {
      const nDb = { ...prev };
      auditDb(nDb, module, action, ref, champ, av, ap, doss, userCourant);
      return nDb;
    });
  }, [userCourant]);

  const notifier = useCallback((dest, texte, lien) => {
    setDb(prev => {
      const nDb = { ...prev };
      notifierDb(nDb, dest, texte, lien, userCourant, (pfx, d) => genCodeDb(pfx, d));
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

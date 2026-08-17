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

  // Backstop persistence: fires whenever the committed `db` state actually
  // changes, so a bare audit()/notifier() call (no accompanying updateDB())
  // still gets saved. updateDB() below ALSO persists synchronously and
  // immediately (some flows call `updateDB(); window.location.reload();`
  // back to back, which wouldn't reliably survive if saving only happened
  // through this effect — effects run after paint, not before a reload).
  useEffect(() => {
    sauver(db);
  }, [db]);

  const updateDB = useCallback((newDb) => {
    const updated = { ...newDb };
    setDb(updated);
    sauver(updated);
  }, []);

  const genCode = useCallback((pfx) => {
    return genCodeDb(pfx, db);
  }, [db]);

  // audit()/notifier() intentionally do NOT call sauver() themselves. They
  // used to, from inside this setState updater — but React defers updater
  // functions to its own batching schedule, decoupled from call order in
  // the code. Whenever a component called audit(...) before updateDB(...)
  // (e.g. the "Modifier utilisateur" screen), the audit updater ran with a
  // stale pre-update snapshot and its sauver() call executed AFTER
  // updateDB's synchronous one, silently overwriting a fresh change (a
  // password, an identifiant...) in localStorage with the old value —
  // even before any reload. They now only update state; the effect above
  // persists whatever the final committed state turns out to be.
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

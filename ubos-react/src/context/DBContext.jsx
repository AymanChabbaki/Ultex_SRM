import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { charger, sauver, genCode as genCodeDb, audit as auditDb, notifier as notifierDb } from '../data/db';
import { seedUsers } from '../data/permissions';

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

  return (
    <DBContext.Provider value={{ db, setDb, updateDB, sauver, genCode, audit, notifier, userCourant, setUserCourant }}>
      {children}
    </DBContext.Provider>
  );
};

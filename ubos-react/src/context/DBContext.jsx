import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { baseVide, genCode as genCodeDb, audit as auditDb, notifier as notifierDb, journaliserSecurite as journaliserSecuriteDb } from '../data/db';
import { COLLS } from '../data/constants';
import { seedUsers } from '../data/permissions';
import { checkBackendHealth, fetchCollectionPage, fetchDB, saveDBPatch, saveDBSync } from '../services/api';
import { useToast } from './ToastContext';

const DBContext = createContext();

const TRACKED_ARRAYS = [...new Set([...COLLS, 'audit', 'notifs'])];

function recordKey(record) {
  return String(record?.id || record?.code || '');
}

function fingerprint(value) {
  const input = JSON.stringify(value ?? null);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fingerprintDatabase(database) {
  const arrays = {};
  TRACKED_ARRAYS.forEach(key => {
    arrays[key] = new Map();
    (database[key] || []).forEach(record => {
      const id = recordKey(record);
      if (id) arrays[key].set(id, { ref: record, hash: fingerprint(record) });
    });
  });
  return { seq: fingerprint(database.seq || {}), arrays };
}

function createPatch(database, keys, fingerprints) {
  const patch = { collections: {} };
  const nextSeq = fingerprint(database.seq || {});
  if (nextSeq !== fingerprints.seq) patch.seq = database.seq || {};

  keys.forEach(key => {
    if (!TRACKED_ARRAYS.includes(key) || !Array.isArray(database[key])) return;
    const known = fingerprints.arrays[key] || new Map();
    const changed = database[key].filter(record => {
      const id = recordKey(record);
      if (!id) return false;
      const previous = known.get(id);
      if (!previous || previous.ref !== record) return true;
      return previous.hash !== fingerprint(record);
    });
    if (!changed.length) return;
    if (key === 'utilisateurs' || key === 'audit' || key === 'notifs') patch[key] = changed;
    else patch.collections[key] = changed;
  });

  return patch;
}

function patchIsEmpty(patch) {
  return !patch.seq && !patch.utilisateurs && !patch.audit && !patch.notifs
    && Object.keys(patch.collections || {}).length === 0;
}

function updateFingerprints(fingerprints, patch) {
  if (patch.seq) fingerprints.seq = fingerprint(patch.seq);
  const arrays = { ...(patch.collections || {}) };
  ['utilisateurs', 'audit', 'notifs'].forEach(key => {
    if (patch[key]) arrays[key] = patch[key];
  });
  Object.entries(arrays).forEach(([key, records]) => {
    if (!fingerprints.arrays[key]) fingerprints.arrays[key] = new Map();
    records.forEach(record => fingerprints.arrays[key].set(recordKey(record), { ref: record, hash: fingerprint(record) }));
  });
}

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
  const fingerprintsRef = useRef(fingerprintDatabase(db));
  const collectionLoadsRef = useRef(new Map());

  // audit()/notifier()/updateDB() each trigger their own saveDBSync() call,
  // and callers routinely fire several of them back-to-back without
  // awaiting (e.g. every "retour" handler: updateDB, then audit, audit,
  // notifier). Without this queue those requests race the network — the
  // server does a full-state overwrite per request, so whichever response
  // arrives last wins even if it was sent first with less-complete data,
  // silently dropping whatever the later calls added (a notification, an
  // audit line...). Queuing guarantees requests reach the server in the
  // same order they were made, so the most complete state always wins.
  const syncQueueRef = useRef(Promise.resolve());

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
      fingerprintsRef.current = fingerprintDatabase(merged);
      setDb(merged);
      setIsPostgresConnected(true);
    } catch (e) {
      if (!(e && e.name === 'AuthError')) setIsPostgresConnected(false);
      throw e;
    } finally {
      setDbLoading(false);
    }
  }, []);

  const chargerCollections = useCallback(async (collectionNames) => {
    const names = [...new Set((collectionNames || []).filter(name => TRACKED_ARRAYS.includes(name)))];
    const loaded = await Promise.all(names.map(async name => {
      let pending = collectionLoadsRef.current.get(name);
      if (!pending) {
        pending = (async () => {
          const records = [];
          let page = 1;
          let totalPages = 1;
          do {
            const result = await fetchCollectionPage(name, { page, pageSize: 100 });
            records.push(...(result.items || []));
            totalPages = Math.max(1, Number(result.totalPages || 1));
            page += 1;
          } while (page <= totalPages);
          return records;
        })();
        collectionLoadsRef.current.set(name, pending);
      }
      try {
        return [name, await pending];
      } catch (error) {
        collectionLoadsRef.current.delete(name);
        throw error;
      }
    }));

    const next = { ...dbRef.current };
    loaded.forEach(([name, records]) => {
      next[name] = records;
      const fingerprints = new Map();
      records.forEach(record => {
        const id = recordKey(record);
        if (id) fingerprints.set(id, { ref: record, hash: fingerprint(record) });
      });
      fingerprintsRef.current.arrays[name] = fingerprints;
    });
    dbRef.current = next;
    setDb(next);
    return next;
  }, []);

  // Called on logout so the previous user's data doesn't linger in memory
  // while the login screen is showing.
  const viderDonnees = useCallback(() => {
    dbRef.current = baseVide();
    fingerprintsRef.current = fingerprintDatabase(dbRef.current);
    collectionLoadsRef.current.clear();
    setDb(dbRef.current);
  }, []);

  // The one place every mutation funnels through: applies `next` to state
  // immediately (the UI stays responsive), then confirms it against
  // PostgreSQL. If that fails, the optimistic change is rolled back and
  // the user is told — instead of the previous silent fire-and-forget
  // that could leave the browser and the database disagreeing.
  const commit = useCallback((next, forcedKeys = []) => {
    const previous = dbRef.current;
    const changedKeys = new Set(forcedKeys);
    TRACKED_ARRAYS.forEach(key => {
      if (next[key] !== previous[key]) changedKeys.add(key);
    });
    // A few older forms still mutate an array before shallow-cloning the DB.
    // If no changed reference is visible, compare all collections once so the
    // update is still persisted while those forms are migrated.
    if (!changedKeys.size) TRACKED_ARRAYS.forEach(key => changedKeys.add(key));
    const patch = createPatch(next, changedKeys, fingerprintsRef.current);
    dbRef.current = next;
    setDb(next);

    if (patchIsEmpty(patch)) return Promise.resolve();

    const enqueued = syncQueueRef.current.then(async () => {
      try {
        try {
          await saveDBPatch(patch);
          updateFingerprints(fingerprintsRef.current, patch);
        } catch (e) {
          // Allows a rolling deployment: a freshly deployed frontend can still
          // save against the previous backend until the backend container is up.
          if (e?.status !== 404 && e?.status !== 405) throw e;
          await saveDBSync(next);
          fingerprintsRef.current = fingerprintDatabase(next);
        }
      } catch (e) {
        // Only roll back if nothing more recent has already superseded
        // this commit locally — otherwise a slow, now-stale failed request
        // would wipe out newer local changes made while it was in flight.
        if (dbRef.current === next) {
          dbRef.current = previous;
          setDb(previous);
        }
        toast(e && e.name === 'AuthError' ? 'Session expirée — reconnectez-vous.' : "Échec de l'enregistrement — vérifiez votre connexion.");
      }
    });
    syncQueueRef.current = enqueued;
    return enqueued;
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
    commit(nDb, ['audit']);
  }, [userCourant, commit]);

  const notifier = useCallback((dest, texte, lien) => {
    const nDb = { ...dbRef.current };
    notifierDb(nDb, dest, texte, lien, userCourant, (pfx, d) => genCodeDb(pfx, d));
    commit(nDb, ['notifs']);
  }, [userCourant, commit]);

  const journalSecurite = useCallback((action, module, resultat) => {
    const nDb = { ...dbRef.current };
    journaliserSecuriteDb(nDb, action, userCourant, module, resultat);
    commit(nDb, ['journalSecurite']);
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
      db, setDb, updateDB, genCode, audit, notifier, journalSecurite,
      userCourant, setUserCourant, isPostgresConnected, syncToPostgres,
      dbLoading, chargerDonnees, chargerCollections, viderDonnees
    }}>
      {children}
    </DBContext.Provider>
  );
};

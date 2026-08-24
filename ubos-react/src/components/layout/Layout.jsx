import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import Sidebar from './Sidebar';
import LoginScreen from '../auth/LoginScreen';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import Toast from '../common/Toast';
import { verifierTachesAutomatiques, calculerOccurrencesRecurrentesDues } from '../../utils/tachesPilotage';
import { verifierTachesAutoClosing, suivisDeCoordinateur, construireRapportAutoJour } from '../../utils/closingCoordination';
import { migrerRoleZoubidaClosing } from '../../data/permissions';

const SidebarContext = createContext();
export const useSidebar = () => useContext(SidebarContext);

const Layout = ({ children }) => {
  const { session, authLoading } = useAuth();
  const { db, dbLoading, updateDB, genCode, audit } = useDB();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dejaVerifieRef = useRef(false);

  useEffect(() => {
    if (!session || dbLoading || dejaVerifieRef.current) return;
    dejaVerifieRef.current = true;

    const migrationJouee = migrerRoleZoubidaClosing(db, (...args) => audit(...args));

    const ajd = new Date().toISOString().slice(0, 10);
    let toutesNouvelles = [];
    if (db._tachesAutoDate !== ajd) {
      const nouvellesAuto = verifierTachesAutomatiques(db, genCode);
      const nouvellesClosing = verifierTachesAutoClosing(db, genCode);
      const occurrences = calculerOccurrencesRecurrentesDues(db.taches || [], ajd);
      toutesNouvelles = [...nouvellesAuto, ...nouvellesClosing, ...occurrences];
      db._tachesAutoDate = ajd;
    }

    // Rapport journalier silencieux (simplification profil Zoubida) : la
    // page dédiée n'est plus dans sa navigation, mais les données doivent
    // continuer d'exister pour la Direction — recalculé et enregistré à
    // chaque ouverture de session, sans aucune action de sa part.
    let rapportsSuivants = null;
    if (suivisDeCoordinateur(db, session).length) {
      const auto = construireRapportAutoJour(db, session);
      const nom = session.nomComplet || session.identifiant;
      const existantRapport = (db.rapportsJournaliers || []).find(r => r.utilisateur === nom && r.date === ajd);
      if (existantRapport) {
        rapportsSuivants = (db.rapportsJournaliers || []).map(r => r.code === existantRapport.code ? { ...r, ...auto } : r);
      } else {
        rapportsSuivants = [{
          code: genCode('RJU'), ts: Date.now(), utilisateur: nom, date: ajd, depose: true,
          faitsImportants: '', problemes: '', besoins: '', prioriteDemain: '', ...auto
        }, ...(db.rapportsJournaliers || [])];
      }
    }

    if (migrationJouee || toutesNouvelles.length || rapportsSuivants) {
      updateDB({
        ...db,
        taches: [...toutesNouvelles, ...(db.taches || [])],
        ...(rapportsSuivants ? { rapportsJournaliers: rapportsSuivants } : {})
      });
      toutesNouvelles.forEach(t => audit('Tâches', 'Création automatique', t.code, '—', '—', t.titre, t.dossier));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, dbLoading]);

  const toggleSidebar = () => {
    if (window.innerWidth <= 900) {
      setMobileOpen(!mobileOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  if (authLoading) {
    return (
      <div className="ecran-chargement">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (dbLoading) {
    return (
      <div className="ecran-chargement">
        <div className="spinner"></div>
        <p>Chargement des données…</p>
      </div>
    );
  }

  return (
    <SidebarContext.Provider value={{ collapsed, mobileOpen, toggleSidebar }}>
      <div id="app" className={`${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <Sidebar 
          ouvert={mobileOpen} 
          collapsed={collapsed} 
          toggleSidebar={toggleSidebar} 
        />
        <main id="main">
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, { toggleSidebar });
            }
            return child;
          })}
        </main>
      </div>
      <Toast />
    </SidebarContext.Provider>
  );
};

export default Layout;

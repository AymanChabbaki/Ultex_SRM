import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import Sidebar from './Sidebar';
import LoginScreen from '../auth/LoginScreen';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import Toast from '../common/Toast';
import { verifierTachesAutomatiques, calculerOccurrencesRecurrentesDues } from '../../utils/tachesPilotage';
import { verifierTachesAutoClosing, suivisDeCoordinateur, construireRapportAutoJour } from '../../utils/closingCoordination';
import { verifierActionsAutoLimex, verifierEcheancesProduction, suivisLimexDeCoordinateur, construireRapportAutoJourImane } from '../../utils/limexCoordination';
import { migrerRoleZoubidaClosing, migrerSuivisClosingV2, migrerRoleImaneLimex } from '../../data/permissions';
import { migrerArchitectureSansDossier } from '../../utils/workflowArchitecture';

const SidebarContext = createContext();
export const useSidebar = () => useContext(SidebarContext);

const MAINTENANCE_COLLECTIONS = [
  'actionsLimex', 'arrivages', 'audit', 'clients', 'commandes', 'demandeLignes',
  'demandes', 'dossiers', 'leads', 'paiements', 'partenaires',
  'rapportsJournaliers', 'suivisClosing', 'suivisLimex', 'taches', 'transits'
];

const Layout = ({ children }) => {
  const { session, authLoading } = useAuth();
  const { dbLoading, updateDB, genCode, audit, chargerCollections } = useDB();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dejaVerifieRef = useRef(false);

  useEffect(() => {
    if (!session || dbLoading || dejaVerifieRef.current) return;
    dejaVerifieRef.current = true;

    // Legacy migrations and automatic-task generation traverse several large
    // collections. Run them after the first interactive paint so login and
    // navigation are never blocked by maintenance work.
    const executerMaintenance = async () => {
    let donnees;
    try {
      donnees = await chargerCollections(MAINTENANCE_COLLECTIONS);
    } catch (error) {
      console.error('Maintenance différée non exécutée:', error);
      return;
    }

    const migrationRoleJouee = migrerRoleZoubidaClosing(donnees, (...args) => audit(...args));
    const migrationSuivisJouee = migrerSuivisClosingV2(donnees, (...args) => audit(...args));
    const migrationImaneJouee = migrerRoleImaneLimex(donnees, (...args) => audit(...args));
    const migrationArchitectureJouee = migrerArchitectureSansDossier(donnees);
    const migrationJouee = migrationRoleJouee || migrationSuivisJouee || migrationImaneJouee || migrationArchitectureJouee;

    const ajd = new Date().toISOString().slice(0, 10);
    let toutesNouvelles = [];
    if (donnees._tachesAutoDate !== ajd) {
      const nouvellesAuto = verifierTachesAutomatiques(donnees, genCode);
      const nouvellesClosing = verifierTachesAutoClosing(donnees, genCode);
      const nouvellesLimex = verifierActionsAutoLimex(donnees, genCode);
      const nouvellesProduction = verifierEcheancesProduction(donnees, genCode);
      const occurrences = calculerOccurrencesRecurrentesDues(donnees.taches || [], ajd);
      toutesNouvelles = [...nouvellesAuto, ...nouvellesClosing, ...nouvellesLimex, ...nouvellesProduction, ...occurrences];
      donnees._tachesAutoDate = ajd;
    }

    // Rapports journaliers silencieux (simplification profil Zoubida/Imane) :
    // les pages dédiées ne sont plus dans leur navigation, mais les données
    // doivent continuer d'exister pour la Direction — recalculées et
    // enregistrées à chaque ouverture de session, sans action de leur part.
    const nom = session.nomComplet || session.identifiant;
    const existantRapport = (donnees.rapportsJournaliers || []).find(r => r.utilisateur === nom && r.date === ajd);
    let auto = null;
    if (suivisDeCoordinateur(donnees, session).length) auto = construireRapportAutoJour(donnees, session);
    else if (suivisLimexDeCoordinateur(donnees, session).length) auto = construireRapportAutoJourImane(donnees, session);

    let rapportsSuivants = null;
    if (auto) {
      if (existantRapport) {
        rapportsSuivants = (donnees.rapportsJournaliers || []).map(r => r.code === existantRapport.code ? { ...r, ...auto } : r);
      } else {
        rapportsSuivants = [{
          code: genCode('RJU'), ts: Date.now(), utilisateur: nom, date: ajd, depose: true,
          faitsImportants: '', problemes: '', besoins: '', prioriteDemain: '', ...auto
        }, ...(donnees.rapportsJournaliers || [])];
      }
    }

    if (migrationJouee || toutesNouvelles.length || rapportsSuivants) {
      updateDB({
        ...donnees,
        taches: [...toutesNouvelles, ...(donnees.taches || [])],
        ...(rapportsSuivants ? { rapportsJournaliers: rapportsSuivants } : {})
      });
      toutesNouvelles.forEach(t => audit('Tâches', 'Création automatique', t.code, '—', '—', t.titre, t.dossier));
    }
    };

    let idleId = null;
    const timeoutId = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => void executerMaintenance(), { timeout: 60000 });
      } else {
        void executerMaintenance();
      }
    }, 30000);
    return () => {
      window.clearTimeout(timeoutId);
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
    };
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

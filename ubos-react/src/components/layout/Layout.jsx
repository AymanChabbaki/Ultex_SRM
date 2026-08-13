import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import Sidebar from './Sidebar';
import LoginScreen from '../auth/LoginScreen';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import Toast from '../common/Toast';
import { verifierTachesAutomatiques, calculerOccurrencesRecurrentesDues } from '../../utils/tachesPilotage';

const SidebarContext = createContext();
export const useSidebar = () => useContext(SidebarContext);

const Layout = ({ children }) => {
  const { session } = useAuth();
  const { db, updateDB, genCode, audit } = useDB();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dejaVerifieRef = useRef(false);

  useEffect(() => {
    if (!session || !db || dejaVerifieRef.current) return;
    const ajd = new Date().toISOString().slice(0, 10);
    if (db._tachesAutoDate === ajd) { dejaVerifieRef.current = true; return; }
    dejaVerifieRef.current = true;

    const nouvellesAuto = verifierTachesAutomatiques(db, genCode);
    const occurrences = calculerOccurrencesRecurrentesDues(db.taches || [], ajd);
    const toutesNouvelles = [...nouvellesAuto, ...occurrences];

    updateDB({ ...db, taches: [...toutesNouvelles, ...(db.taches || [])], _tachesAutoDate: ajd });
    toutesNouvelles.forEach(t => audit('Tâches', 'Création automatique', t.code, '—', '—', t.titre, t.dossier));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const toggleSidebar = () => {
    if (window.innerWidth <= 900) {
      setMobileOpen(!mobileOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  if (!session) {
    return <LoginScreen />;
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

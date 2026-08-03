import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { DBProvider } from './context/DBContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/layout/Layout';

// Dashboard
import Dashboard from './components/dashboard/Dashboard';

// Fiches
import FicheClient from './components/fiches/FicheClient';
import FicheDossier from './components/fiches/FicheDossier';
import FicheDemande from './components/fiches/FicheDemande';
import FicheCommande from './components/fiches/FicheCommande';
import FicheArrivage from './components/fiches/FicheArrivage';
import FicheDocument from './components/fiches/FicheDocument';

// Custom Modules
import Notifications from './components/custom/Notifications';
import MonAgenda from './components/custom/MonAgenda';
import AuditGlobal from './components/custom/AuditGlobal';
import Utilisateurs from './components/custom/Utilisateurs';
import RechercheGlobale from './components/custom/RechercheGlobale';
import Rapports from './components/custom/Rapports';
import RapportDirection from './components/custom/RapportDirection';
import Performance from './components/custom/Performance';
import ImportCentre from './components/custom/ImportCentre';
import RisquesClients from './components/custom/RisquesClients';
import DashboardLimex from './components/custom/DashboardLimex';
import RapportLimexDirection from './components/custom/RapportLimexDirection';

// Generic
import GenericModule from './components/modules/GenericModule';

// Constants
import { MODS } from './data/modules';

const Router = () => {
  const [currentHash, setCurrentHash] = useState(window.location.hash.replace('#', '') || 'dashboard');

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash.replace('#', '') || 'dashboard');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const renderRoute = () => {
    const parts = currentHash.split(':');
    const route = parts[0];
    const params = parts[1];

    switch (route) {
      case 'dashboard': return <Dashboard />;
      case 'ficheClient': return <FicheClient code={params} />;
      case 'ficheDossier': return <FicheDossier code={params} />;
      case 'ficheDemande': return <FicheDemande code={params} />;
      case 'ficheCommande': return <FicheCommande code={params} />;
      case 'ficheArrivage': return <FicheArrivage code={params} />;
      case 'ficheDocument': return <FicheDocument code={params} />;
      
      case 'notifications': return <Notifications />;
      case 'monAgenda': return <MonAgenda />;
      case 'auditGlobal': return <AuditGlobal />;
      case 'utilisateurs': return <Utilisateurs />;
      case 'rechercheGlobale': return <RechercheGlobale />;
      case 'rapports': return <Rapports />;
      case 'rapportDirection': return <RapportDirection />;
      case 'performance': return <Performance />;
      case 'importCentre': return <ImportCentre />;
      case 'risquesClients': return <RisquesClients />;
      case 'dashboardLimex': return <DashboardLimex />;
      case 'rapportLimexDirection': return <RapportLimexDirection />;

      default:
        // Check if it's a generic module (clients, contacts, demandes, dossiers, documents, etc.)
        const moduleConfig = MODS[route];
        if (moduleConfig && moduleConfig.coll) {
          return <GenericModule moduleId={route} />;
        }
        return <Dashboard />;
    }
  };

  return (
    <Layout>
      {renderRoute()}
    </Layout>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <DBProvider>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </DBProvider>
    </ToastProvider>
  );
}

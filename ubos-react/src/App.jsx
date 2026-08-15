import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DBProvider, useDB } from './context/DBContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/layout/Layout';

// Dashboard
import Dashboard from './components/dashboard/Dashboard';
import PersonalDashboard from './components/dashboard/PersonalDashboard';

// Fiches
import FicheClient from './components/fiches/FicheClient';
import FicheDossier from './components/fiches/FicheDossier';
import FicheDemande from './components/fiches/FicheDemande';
import FicheDemandeLigne from './components/fiches/FicheDemandeLigne';
import FicheCommande from './components/fiches/FicheCommande';
import FicheArrivage from './components/fiches/FicheArrivage';
import FicheDocument from './components/fiches/FicheDocument';
import FicheFF from './components/fiches/FicheFF';
import FicheChecklistLimex from './components/fiches/FicheChecklistLimex';
import FicheTache from './components/fiches/FicheTache';

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
import TableauBordData from './components/custom/TableauBordData';
import MonProgrammeDuJour from './components/custom/MonProgrammeDuJour';
import MesTaches from './components/custom/MesTaches';
import MesObjectifs from './components/custom/MesObjectifs';
import MonRapportJournalier from './components/custom/MonRapportJournalier';
import PilotageEquipe from './components/custom/PilotageEquipe';
import QuiFaitQuoi from './components/custom/QuiFaitQuoi';
import AjouterTache from './components/custom/AjouterTache';
import MonProfil from './components/custom/MonProfil';

// Generic
import GenericModule from './components/modules/GenericModule';

// Constants
import { MODS } from './data/modules';

const DashUserRoute = ({ identifiant }) => {
  const { db } = useDB();
  const { estDirection } = useAuth();

  if (!estDirection()) {
    return (
      <div className="panneau">
        <div className="note-verrou"><b>Réservé à la Direction</b></div>
      </div>
    );
  }

  const targetUser = (db.utilisateurs || []).find(u => u.identifiant === identifiant || u.code === identifiant);
  if (!targetUser) {
    return (
      <div className="panneau">
        <div className="vide"><b>Utilisateur introuvable</b> ({identifiant})</div>
      </div>
    );
  }

  return <PersonalDashboard user={targetUser} isAdminView />;
};

const TableauBordDataRoute = ({ identifiant }) => {
  const { db } = useDB();
  const { session, estDirection } = useAuth();

  if (!identifiant) {
    return <TableauBordData user={session} />;
  }

  if (!estDirection()) {
    return (
      <div className="panneau">
        <div className="note-verrou"><b>Réservé à la Direction</b></div>
      </div>
    );
  }

  const targetUser = (db.utilisateurs || []).find(u => u.identifiant === identifiant || u.code === identifiant);
  if (!targetUser) {
    return (
      <div className="panneau">
        <div className="vide"><b>Utilisateur introuvable</b> ({identifiant})</div>
      </div>
    );
  }

  return <TableauBordData user={targetUser} isAdminView />;
};

const PersonalPageRoute = ({ Component, identifiant }) => {
  const { db } = useDB();
  const { session, estDirection } = useAuth();

  if (!identifiant) {
    return <Component user={session} />;
  }

  if (!estDirection()) {
    return (
      <div className="panneau">
        <div className="note-verrou"><b>Réservé à la Direction</b></div>
      </div>
    );
  }

  const targetUser = (db.utilisateurs || []).find(u => u.identifiant === identifiant || u.code === identifiant);
  if (!targetUser) {
    return (
      <div className="panneau">
        <div className="vide"><b>Utilisateur introuvable</b> ({identifiant})</div>
      </div>
    );
  }

  return <Component user={targetUser} isAdminView />;
};

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
      case 'dashUser': return <DashUserRoute identifiant={params} />;
      case 'tableauBordData': return <TableauBordDataRoute identifiant={params} />;
      case 'monProgramme': return <PersonalPageRoute Component={MonProgrammeDuJour} identifiant={params} />;
      case 'mesTaches': return <PersonalPageRoute Component={MesTaches} identifiant={params} />;
      case 'mesObjectifs': return <PersonalPageRoute Component={MesObjectifs} identifiant={params} />;
      case 'monRapportJournalier': return <PersonalPageRoute Component={MonRapportJournalier} identifiant={params} />;
      case 'monProfil': return <MonProfil />;
      case 'pilotageEquipe': return <PilotageEquipe />;
      case 'quiFaitQuoi': return <QuiFaitQuoi />;
      case 'ajouterTache': return <AjouterTache />;
      case 'ficheTache': return <FicheTache codeProp={params} code={params} />;
      case 'ficheClient': return <FicheClient codeProp={params} code={params} />;
      case 'ficheDossier': return <FicheDossier codeProp={params} code={params} />;
      case 'ficheDemande': return <FicheDemande codeProp={params} code={params} />;
      case 'ficheDemandeLigne': return <FicheDemandeLigne codeProp={params} code={params} />;
      case 'ficheCommande': return <FicheCommande codeProp={params} code={params} />;
      case 'ficheArrivage': return <FicheArrivage codeProp={params} code={params} />;
      case 'ficheDocument': return <FicheDocument codeProp={params} code={params} />;
      case 'ficheFF': return <FicheFF codeProp={params} code={params} />;
      case 'ficheChecklistLimex': return <FicheChecklistLimex codeProp={params} code={params} />;
      
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

import React, { lazy, Suspense, useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DBProvider, useDB } from './context/DBContext';
import { ToastProvider } from './context/ToastContext';
import { SecurityProvider } from './context/SecurityContext';
import Layout from './components/layout/Layout';

// Route components are split into independent chunks. PDF/OCR/Excel and the
// dozens of operational screens no longer block the login/dashboard bundle.
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
const PersonalDashboard = lazy(() => import('./components/dashboard/PersonalDashboard'));
const FicheClient = lazy(() => import('./components/fiches/FicheClient'));
const FicheDossier = lazy(() => import('./components/fiches/FicheDossier'));
const FicheDemande = lazy(() => import('./components/fiches/FicheDemande'));
const FicheDemandeLigne = lazy(() => import('./components/fiches/FicheDemandeLigne'));
const FicheCommande = lazy(() => import('./components/fiches/FicheCommande'));
const FicheArrivage = lazy(() => import('./components/fiches/FicheArrivage'));
const FicheDocument = lazy(() => import('./components/fiches/FicheDocument'));
const FicheFF = lazy(() => import('./components/fiches/FicheFF'));
const FicheChecklistLimex = lazy(() => import('./components/fiches/FicheChecklistLimex'));
const FicheTache = lazy(() => import('./components/fiches/FicheTache'));
const FicheSuiviClosing = lazy(() => import('./components/fiches/FicheSuiviClosing'));
const FicheClientClosing = lazy(() => import('./components/fiches/FicheClientClosing'));
const FicheSuiviLimex = lazy(() => import('./components/fiches/FicheSuiviLimex'));
const Notifications = lazy(() => import('./components/custom/Notifications'));
const MonAgenda = lazy(() => import('./components/custom/MonAgenda'));
const AuditGlobal = lazy(() => import('./components/custom/AuditGlobal'));
const Utilisateurs = lazy(() => import('./components/custom/Utilisateurs'));
const RechercheGlobale = lazy(() => import('./components/custom/RechercheGlobale'));
const Rapports = lazy(() => import('./components/custom/Rapports'));
const RapportDirection = lazy(() => import('./components/custom/RapportDirection'));
const Performance = lazy(() => import('./components/custom/Performance'));
const ImportCentre = lazy(() => import('./components/custom/ImportCentre'));
const RisquesClients = lazy(() => import('./components/custom/RisquesClients'));
const DashboardLimex = lazy(() => import('./components/custom/DashboardLimex'));
const RapportLimexDirection = lazy(() => import('./components/custom/RapportLimexDirection'));
const TableauBordData = lazy(() => import('./components/custom/TableauBordData'));
const MonProgrammeDuJour = lazy(() => import('./components/custom/MonProgrammeDuJour'));
const MesTaches = lazy(() => import('./components/custom/MesTaches'));
const MesObjectifs = lazy(() => import('./components/custom/MesObjectifs'));
const MonRapportJournalier = lazy(() => import('./components/custom/MonRapportJournalier'));
const PilotageEquipe = lazy(() => import('./components/custom/PilotageEquipe'));
const QuiFaitQuoi = lazy(() => import('./components/custom/QuiFaitQuoi'));
const AjouterTache = lazy(() => import('./components/custom/AjouterTache'));
const MonProfil = lazy(() => import('./components/custom/MonProfil'));
const JournalSecurite = lazy(() => import('./components/custom/JournalSecurite'));
const MaJourneeClosing = lazy(() => import('./components/custom/MaJourneeClosing'));
const DevisAControler = lazy(() => import('./components/custom/DevisAControler'));
const CoordinationMansouri = lazy(() => import('./components/custom/CoordinationMansouri'));
const MonPortefeuilleClosing = lazy(() => import('./components/custom/MonPortefeuilleClosing'));
const EtatClosing = lazy(() => import('./components/custom/EtatClosing'));
const AQualifierClosing = lazy(() => import('./components/custom/AQualifierClosing'));
const MaJourneeImane = lazy(() => import('./components/custom/MaJourneeImane'));
const SuiviLimex = lazy(() => import('./components/custom/SuiviLimex'));
const EtudesCalcul = lazy(() => import('./components/custom/EtudesCalcul'));
const PaiementsEcheances = lazy(() => import('./components/custom/PaiementsEcheances'));
const FacturationRecus = lazy(() => import('./components/custom/FacturationRecus'));
const DocumentsPartages = lazy(() => import('./components/custom/DocumentsPartages'));
const GenericModule = lazy(() => import('./components/modules/GenericModule'));

const IMPORT_COLLECTIONS = [
  'importJobs', 'importFiles', 'importModels', 'importMappings', 'importRows',
  'importErrors', 'importHistory', 'importDetectedTypes', 'importExtractedData',
  'importAttachments', 'importRollbacks', 'limexImportHistory'
];

const ImportCentreRoute = () => {
  const { chargerCollections } = useDB();
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    let mounted = true;
    chargerCollections(IMPORT_COLLECTIONS)
      .then(() => { if (mounted) setState({ loading: false, error: '' }); })
      .catch(error => { if (mounted) setState({ loading: false, error: error?.message || 'Chargement impossible' }); });
    return () => { mounted = false; };
  }, [chargerCollections]);

  if (state.loading) return <div className="panneau"><div className="vide"><b>Chargement du centre d’importation…</b></div></div>;
  if (state.error) return <div className="panneau"><div className="note-verrou">{state.error}</div></div>;
  return <ImportCentre />;
};

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
    const sousPage = parts[2];

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
      case 'journalSecurite': return <JournalSecurite />;
      case 'maJourneeClosing': return <PersonalPageRoute Component={MaJourneeClosing} identifiant={params} />;
      case 'devisAControler': return <PersonalPageRoute Component={DevisAControler} identifiant={params} />;
      case 'coordinationMansouri': return <PersonalPageRoute Component={CoordinationMansouri} identifiant={params} />;
      case 'monPortefeuilleClosing': return <PersonalPageRoute Component={MonPortefeuilleClosing} identifiant={params} />;
      case 'aQualifierClosing': return <PersonalPageRoute Component={AQualifierClosing} identifiant={params} />;
      case 'maJourneeImane': return <PersonalPageRoute Component={MaJourneeImane} identifiant={params} />;
      case 'suiviLimex': return <PersonalPageRoute Component={SuiviLimex} identifiant={params} />;
      case 'etudesCalcul': return <EtudesCalcul />;
      case 'paiementsEcheances': return <PaiementsEcheances />;
      case 'etatClosing': return <EtatClosing />;
      case 'ficheSuiviClosing': return <FicheSuiviClosing codeProp={params} code={params} />;
      case 'ficheClientClosing': return <FicheClientClosing codeProp={params} code={params} />;
      case 'ficheSuiviLimex': return <FicheSuiviLimex codeProp={params} code={params} />;
      case 'ajouterTache': return <AjouterTache />;
      case 'ficheTache': return <FicheTache codeProp={params} code={params} />;
      case 'ficheClient': return <FicheClient codeProp={params} code={params} ongletInitial={sousPage} />;
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
      case 'importCentre': return <ImportCentreRoute />;
      case 'risquesClients': return <RisquesClients />;
      case 'dashboardLimex': return <DashboardLimex />;
      case 'rapportLimexDirection': return <RapportLimexDirection />;
      case 'facturationRecus': return <FacturationRecus />;
      case 'documentsPartages': return <DocumentsPartages />;

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
      <Suspense fallback={<div className="panneau"><div className="vide"><b>Chargement…</b></div></div>}>
        {renderRoute()}
      </Suspense>
    </Layout>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <DBProvider>
        <AuthProvider>
          <SecurityProvider>
            <Router />
          </SecurityProvider>
        </AuthProvider>
      </DBProvider>
    </ToastProvider>
  );
}

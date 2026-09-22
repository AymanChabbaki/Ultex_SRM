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
  'importAttachments', 'importRollbacks', 'limexImportHistory', 'clients',
  'dossiers', 'controlesLimex'
];

const DataBoundary = ({ collections, children, label = 'Chargement des données…' }) => {
  const { chargerCollections } = useDB();
  const collectionKey = [...new Set(collections || [])].sort().join(',');
  const [state, setState] = useState({ key: '', loading: true, error: '' });

  useEffect(() => {
    let mounted = true;
    const names = collectionKey ? collectionKey.split(',') : [];
    setState({ key: collectionKey, loading: true, error: '' });
    chargerCollections(names)
      .then(() => { if (mounted) setState({ key: collectionKey, loading: false, error: '' }); })
      .catch(error => { if (mounted) setState({ key: collectionKey, loading: false, error: error?.message || 'Chargement impossible' }); });
    return () => { mounted = false; };
  }, [chargerCollections, collectionKey]);

  if (state.key !== collectionKey || state.loading) return <div className="panneau"><div className="vide"><b>{label}</b></div></div>;
  if (state.error) return <div className="panneau"><div className="note-verrou">{state.error}</div></div>;
  return children;
};

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
import { COLLS } from './data/constants';

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
  const { session, estDirection } = useAuth();

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
    const wrap = (element, collections, label) => (
      <DataBoundary key={`${route}:${params || ''}`} collections={collections} label={label}>{element}</DataBoundary>
    );
    const dashboardCollections = estDirection()
      ? ['leads', 'dossiers', 'paiements', 'taches', 'transits']
      : (session?.services || []).includes('Data')
        ? ['clients', 'demandes', 'demandeLignes', 'objectifsData', 'taches']
        : ['dossiers', 'taches'];

    switch (route) {
      case 'dashboard': return wrap(<Dashboard />, dashboardCollections, 'Préparation de votre tableau de bord…');
      case 'dashUser': return wrap(<DashUserRoute identifiant={params} />, ['dossiers', 'taches'], 'Chargement du tableau de bord…');
      case 'tableauBordData': return wrap(<TableauBordDataRoute identifiant={params} />, ['clients', 'demandes', 'demandeLignes', 'objectifsData', 'taches']);
      case 'monProgramme': return wrap(<PersonalPageRoute Component={MonProgrammeDuJour} identifiant={params} />, ['dossiers', 'taches', 'suivisClosing']);
      case 'mesTaches': return wrap(<PersonalPageRoute Component={MesTaches} identifiant={params} />, ['taches', 'suivisClosing']);
      case 'mesObjectifs': return wrap(<PersonalPageRoute Component={MesObjectifs} identifiant={params} />, ['audit', 'clients', 'demandeLignes', 'demandes', 'objectifsData', 'suivisClosing', 'taches']);
      case 'monRapportJournalier': return wrap(<PersonalPageRoute Component={MonRapportJournalier} identifiant={params} />, ['rapportsJournaliers']);
      case 'monProfil': return <MonProfil />;
      case 'pilotageEquipe': return <PilotageEquipe />;
      case 'quiFaitQuoi': return wrap(<QuiFaitQuoi />, ['dossiers', 'taches']);
      case 'journalSecurite': return wrap(<JournalSecurite />, ['journalSecurite']);
      case 'maJourneeClosing': return wrap(<PersonalPageRoute Component={MaJourneeClosing} identifiant={params} />, ['suivisClosing']);
      case 'devisAControler': return wrap(<PersonalPageRoute Component={DevisAControler} identifiant={params} />, ['suivisClosing']);
      case 'coordinationMansouri': return wrap(<PersonalPageRoute Component={CoordinationMansouri} identifiant={params} />, ['suivisClosing', 'taches']);
      case 'monPortefeuilleClosing': return wrap(<PersonalPageRoute Component={MonPortefeuilleClosing} identifiant={params} />, ['clients', 'suivisClosing']);
      case 'aQualifierClosing': return wrap(<PersonalPageRoute Component={AQualifierClosing} identifiant={params} />, ['suivisClosing']);
      case 'maJourneeImane': return wrap(<PersonalPageRoute Component={MaJourneeImane} identifiant={params} />, ['actionsLimex', 'suivisLimex']);
      case 'suiviLimex': return wrap(<PersonalPageRoute Component={SuiviLimex} identifiant={params} />, ['suivisLimex', 'paiements']);
      case 'etudesCalcul': return wrap(<EtudesCalcul />, ['taches']);
      case 'paiementsEcheances': return wrap(<PaiementsEcheances />, ['paiements', 'documentsComptablesCasa']);
      case 'etatClosing': return wrap(<EtatClosing />, ['suivisClosing']);
      case 'ficheSuiviClosing': return wrap(<FicheSuiviClosing codeProp={params} code={params} />, ['audit', 'suivisClosing', 'taches']);
      case 'ficheClientClosing': return wrap(<FicheClientClosing codeProp={params} code={params} />, ['suivisClosing']);
      case 'ficheSuiviLimex': return wrap(<FicheSuiviLimex codeProp={params} code={params} />, ['actionsLimex', 'audit', 'suivisLimex', 'taches']);
      case 'ajouterTache': return wrap(<AjouterTache />, ['taches']);
      case 'ficheTache': return wrap(<FicheTache codeProp={params} code={params} />, ['actionsLimex', 'audit', 'suivisClosing', 'suivisLimex', 'tacheEtapes', 'taches']);
      case 'ficheClient': return wrap(<FicheClient codeProp={params} code={params} ongletInitial={sousPage} />, ['audit', 'clients', 'commandes', 'contacts', 'demandes', 'documents', 'dossiers', 'suivisClosing']);
      case 'ficheDossier': return wrap(<FicheDossier codeProp={params} code={params} />, ['dossiers', 'clients', 'suivisClosing']);
      case 'ficheDemande': return wrap(<FicheDemande codeProp={params} code={params} />, ['audit', 'clients', 'commandes', 'demandeLignes', 'demandeRoutages', 'demandes', 'documents', 'paiements']);
      case 'ficheDemandeLigne': return wrap(<FicheDemandeLigne codeProp={params} code={params} />, ['demandeLignes', 'demandeRoutages', 'demandes', 'produits', 'taches']);
      case 'ficheCommande': return wrap(<FicheCommande codeProp={params} code={params} />, ['arrivages', 'clients', 'commandes']);
      case 'ficheArrivage': return wrap(<FicheArrivage codeProp={params} code={params} />, ['arrivages', 'clients', 'commandes', 'documents', 'fournisseurs', 'paiements']);
      case 'ficheDocument': return wrap(<FicheDocument codeProp={params} code={params} />, ['documents']);
      case 'ficheFF': return wrap(<FicheFF codeProp={params} code={params} />, ['clients', 'documents', 'dossiers', 'facturesFinales']);
      case 'ficheChecklistLimex': return wrap(<FicheChecklistLimex codeProp={params} code={params} />, ['controlesLimex', 'dossierControlesLimex', 'dossiers', 'limexPortesValidation']);
      
      case 'notifications': return <Notifications />;
      case 'monAgenda': return wrap(<MonAgenda />, ['certifs', 'clients', 'paiements', 'taches', 'transits', 'transports', 'transportsNat']);
      case 'auditGlobal': return wrap(<AuditGlobal />, ['audit']);
      case 'utilisateurs': return <Utilisateurs />;
      case 'rechercheGlobale': return wrap(<RechercheGlobale />, COLLS);
      case 'rapports': return wrap(<Rapports />, ['rapports']);
      case 'rapportDirection': return wrap(<RapportDirection />, ['dossiers', 'erreurs', 'paiements', 'taches']);
      case 'performance': return wrap(<Performance />, ['audit', 'contacts', 'dossiers', 'erreurs', 'rapports', 'taches']);
      case 'importCentre': return <ImportCentreRoute />;
      case 'risquesClients': return wrap(<RisquesClients />, ['abandons', 'facturesFinales', 'impayes']);
      case 'dashboardLimex': return wrap(<DashboardLimex />, ['arrivages', 'documents', 'dossiers', 'transits']);
      case 'rapportLimexDirection': return wrap(<RapportLimexDirection />, ['arrivages', 'dossiers']);
      case 'facturationRecus': return <FacturationRecus />;
      case 'documentsPartages': return wrap(<DocumentsPartages />, ['documents']);

      default:
        // Check if it's a generic module (clients, contacts, demandes, dossiers, documents, etc.)
        const moduleConfig = MODS[route];
        if (moduleConfig && moduleConfig.coll) {
          const references = (moduleConfig.champs || []).map(field => field.coll).filter(Boolean);
          return wrap(<GenericModule moduleId={route} />, references);
        }
        return wrap(<Dashboard />, dashboardCollections);
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

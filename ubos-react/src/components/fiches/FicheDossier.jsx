import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import CheminDossier from '../common/CheminDossier';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';
import * as Actions from '../../utils/businessActions';
import { PrinterIcon } from '../common/Icons';

function colsToDataTableColumns(cols, db) {
  return (cols || []).map(([key, label, fmt]) => ({
    key,
    label,
    render: (val, row) => {
      if (!fmt) return val ?? '—';
      const formatted = fmt(val, row, db);
      if (React.isValidElement(formatted)) return formatted;
      if (typeof formatted === 'string' && formatted.includes('<')) {
        return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
      }
      return formatted ?? '—';
    }
  }));
}

const FicheDossier = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, genCode, audit, userCourant, notifier } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [ajoutSection, setAjoutSection] = useState(null);

  useEffect(() => {
    const c = codeProp || codeFromProp;
    if (c) {
      setCode(c);
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheDossier:')) {
        setCode(hash.split(':')[1]);
      }
    }
  }, [codeProp, codeFromProp, window.location.hash]);

  const dossier = (db?.dossiers || []).find(d => d.code === code);
  
  if (!dossier) {
    return (
      <div>
        <Topbar titre="Fiche Dossier" />
        <div className="panneau">
          <div className="vide"><b>Dossier introuvable</b> {code ? `(${code})` : ''} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const client = db.clients?.find(c => c.code === dossier.client) || {};
  
  const sousSections = [
    {id: 'sourcing', titre: 'Sourcing', moduleId: 'sourcings'},
    {id: 'etude', titre: 'Études & Chiffrage', moduleId: 'etudes'},
    {id: 'closing', titre: 'Offres / Closing', moduleId: 'offres'},
    {id: 'paiement', titre: 'Paiements', moduleId: 'paiements'},
    {id: 'analyse', titre: 'Analyse Dossier', moduleId: 'analyses'},
    {id: 'transport', titre: 'Transport International', moduleId: 'transports'},
    {id: 'transit', titre: 'Transit & Douane', moduleId: 'transits'},
    {id: 'certification', titre: 'Certification', moduleId: 'certifs'},
    {id: 'livraison', titre: 'Transport National', moduleId: 'transportsNat'},
    {id: 'litige', titre: 'Réclamations & Litiges', moduleId: 'reclamations'},
    {id: 'docs', titre: 'Documents', moduleId: 'documents'},
    {id: 'facturation', titre: 'Factures Finales', moduleId: 'facturation'},
  ];

  const handleAjouterSection = (sec) => {
    if (sec.id === 'facturation') {
      Actions.creerFactureDepuisDossier(code, db, genCode, audit, userCourant, updateDB, toast, peut('ajouter'));
      return;
    }
    setAjoutSection(sec);
  };

  const mainFields = [
    {k: "client", l: "Client"},
    {k: "produit", l: "Produit"},
    {k: "fournisseur", l: "Fournisseur"},
    {k: "incoterm", l: "Incoterm"},
    {k: "paysOrigine", l: "Pays d'origine"},
    {k: "portDepart", l: "Port de départ"},
    {k: "portArrivee", l: "Port d'arrivée"},
    {k: "modeTransport", l: "Mode de transport"},
    {k: "montantVente", l: "Montant de vente (MAD)"},
    {k: "montantAchat", l: "Coût d'achat (MAD)"},
    {k: "cbm", l: "Volume (CBM)"},
    {k: "poids", l: "Poids (kg)"},
    {k: "responsable", l: "Responsable"},
    {k: "statut", l: "Statut"},
    {k: "remarque", l: "Remarques"}
  ];

  return (
    <div>
      <Topbar titre={`Dossier : ${code}`} />
      <div className="panneau">
        <CheminDossier etape={dossier.etape} />
        
        <div className="outils" style={{marginTop: '15px'}}>
          <b className="titre-fiche">{code} - {dossier.produit}</b>
          <span className="spacer"></span>
          <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>
          <button className="btn vert" onClick={() => {
              Actions.avancerDossier(code, db, genCode, audit, userCourant, updateDB, toast, peut('valider'), notifier);
          }}>Étape suivante</button>
          <button className="btn or" onClick={() => window.print()}><PrinterIcon size={14} /> Imprimer</button>
        </div>
        {showEdit && (
          <ModuleForm 
            moduleId="dossiers" 
            MODS={MODS}
            recordCode={code} 
            onClose={() => setShowEdit(false)} 
          />
        )}

        <div className="bloc-fiche large">
          <h4>Informations Principales</h4>
          <KVDisplay data={dossier} fields={mainFields} />
        </div>

        <div className="bloc-fiche large">
          <h4>Services inclus</h4>
          <div style={{display:'flex', gap:'5px', flexWrap:'wrap', marginTop:'10px'}}>
            {(dossier.services || []).map(s => (
              <span key={s} className="pill p-bleu">{s}</span>
            ))}
            {(!dossier.services || dossier.services.length === 0) && <span className="pill p-gris">Aucun service spécifié</span>}
          </div>
        </div>

        {sousSections.map(sec => {
          const M = MODS[sec.moduleId];
          const records = (db[M.coll] || []).filter(r => r.dossier === code);
          return (
            <div className="bloc-fiche large" key={sec.id}>
              <h4>
                {sec.titre}
                {peut('ajouter') && (
                  <button className="btn mini" style={{float:'right'}} onClick={() => handleAjouterSection(sec)}>+ Ajouter</button>
                )}
              </h4>
              <DataTable columns={colsToDataTableColumns(M.cols, db)} data={records} />
            </div>
          );
        })}

        {ajoutSection && (
          <ModuleForm
            moduleId={ajoutSection.moduleId}
            MODS={MODS}
            initialData={{ dossier: code }}
            onClose={() => setAjoutSection(null)}
          />
        )}
      </div>
    </div>
  );
};

export default FicheDossier;

import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import CheminDossier from '../common/CheminDossier';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';

const FicheDossier = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, genCode, audit, userCourant, notifier } = useDB();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);

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
    {id: 'sourcing', titre: 'Sourcing'},
    {id: 'etude', titre: 'Études & Chiffrage'},
    {id: 'closing', titre: 'Offres / Closing'},
    {id: 'paiement', titre: 'Paiements'},
    {id: 'analyse', titre: 'Analyse Dossier'},
    {id: 'transport', titre: 'Transport International'},
    {id: 'transit', titre: 'Transit & Douane'},
    {id: 'certification', titre: 'Certification'},
    {id: 'livraison', titre: 'Transport National'},
    {id: 'litige', titre: 'Réclamations & Litiges'},
    {id: 'docs', titre: 'Documents'},
    {id: 'facturation', titre: 'Factures Finales'},
  ];

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
          <b style={{fontSize:'16px', color:'var(--vert)'}}>{code} - {dossier.produit}</b>
          <span style={{flex:1}}></span>
          <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>
          <button className="btn vert" onClick={() => {
            import('../../utils/businessActions').then(Actions => {
              Actions.avancerDossier(code, db, genCode, audit, userCourant, updateDB, (msg) => alert(msg), notifier);
            });
          }}>Étape suivante</button>
          <button className="btn or" onClick={() => window.print()}>🖨 Imprimer</button>
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

        {sousSections.map(sec => (
          <div className="bloc-fiche large" key={sec.id}>
            <h4>{sec.titre} <button className="btn mini" style={{float:'right'}}>+ Ajouter</button></h4>
            <div className="vide">Aucun enregistrement pour le moment.</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FicheDossier;

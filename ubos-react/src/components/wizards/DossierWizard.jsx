import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Modal from '../common/Modal';
import FormField from '../common/FormField';

const ETAPES_ASSISTANT_DOSSIER = [
  {id:"general", titre:"Informations générales", sous:"Qui est le client, quel est le besoin ?"},
  {id:"commercial", titre:"Informations commerciales", sous:"Fournisseur et valeurs du dossier"},
  {id:"services", titre:"Services & Formule ULTEx", sous:"Au nom de qui, quels services, quel package"},
  {id:"transport", titre:"Transport", sous:"Incoterm, origine, mode et points de passage"},
  {id:"workflow", titre:"Workflow", sous:"Étape, responsable et action suivante"},
  {id:"validation", titre:"Validation", sous:"Vérifiez le récapitulatif avant de créer le dossier"}
];

export default function DossierWizard({ isOpen, code, onClose }) {
  const { db, saveDB } = useDB();
  const { session, peut } = useAuth();
  
  const [pasActuel, setPasActuel] = useState(0);
  const [data, setData] = useState({ modeTransport: "Maritime FCL", servicesInclus: [] });
  const [erreurs, setErreurs] = useState({});

  useEffect(() => {
    if (isOpen) {
      // Logic to load draft or existing record
      // const brouillon = lireBrouillonDossier(code);
      // setData(brouillon?.data || { modeTransport: "Maritime FCL", servicesInclus: [] });
      // setPasActuel(brouillon?.pas || 0);
    }
  }, [isOpen, code]);

  if (!isOpen) return null;

  const assistantMaj = (k, v) => {
    setData(prev => {
      const next = { ...prev, [k]: v };
      // sauverBrouillonDossier(next);
      return next;
    });
  };

  const handleNext = () => {
    // Validate current step
    // If valid:
    if (pasActuel < ETAPES_ASSISTANT_DOSSIER.length - 1) {
      setPasActuel(p => p + 1);
    }
  };

  const handlePrev = () => {
    if (pasActuel > 0) setPasActuel(p => p - 1);
  };

  const handleConfirm = () => {
    // Save logic
    onClose();
  };

  const etape = ETAPES_ASSISTANT_DOSSIER[pasActuel];

  return (
    <Modal title={code ? `Modifier le dossier ${code} — Assistant` : "Nouveau dossier — Assistant"} onClose={onClose} isLarge>
      <div className="assist-barre">
        {ETAPES_ASSISTANT_DOSSIER.map((e, i) => (
          <div key={i} className={`assist-pas ${i < pasActuel ? "fait" : i === pasActuel ? "actif" : ""}`}></div>
        ))}
      </div>
      <div className="assist-etapes">
        {ETAPES_ASSISTANT_DOSSIER.map((e, i) => (
          <span 
            key={i} 
            className={i === pasActuel ? "actif" : ""}
            style={i < pasActuel ? { cursor: 'pointer' } : {}}
            onClick={() => i < pasActuel && setPasActuel(i)}
          >
            {i + 1}. {e.titre}
          </span>
        ))}
      </div>
      <div className="assist-corps">
        <h3>{etape.titre}</h3>
        <div className="sous">{etape.sous}</div>
        
        {/* Render fields based on etape */}
        <div className="assist-grille">
          {/* Mock fields for illustration, actual implementation should use champsEtape(pasActuel) and render FormField */}
          <div className="champ">
            <label>Mode de transport</label>
            <input value={data.modeTransport} onChange={e => assistantMaj('modeTransport', e.target.value)} />
          </div>
        </div>

      </div>
      <div className="assist-pied">
        <div>
          {pasActuel > 0 && <button className="btn doux" onClick={handlePrev}>← Précédent</button>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn doux" onClick={onClose}>Continuer plus tard</button>
          {pasActuel < ETAPES_ASSISTANT_DOSSIER.length - 1 ? (
            <button className="btn" onClick={handleNext}>Suivant →</button>
          ) : (
            <button className="btn or" onClick={handleConfirm}>✓ Confirmer et créer le dossier</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

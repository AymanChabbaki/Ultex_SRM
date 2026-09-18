import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../common/Modal';
import FormField from '../common/FormField';
import { MODS as MODS_DATA } from '../../data/modules';
import { detecterMentions } from '../../data/db';
import { USERS } from '../../data/constants';
import { prochaineReferenceDemande, prochaineReferenceProduit, prochaineReferenceCommande, lignesCommandeDepuisDemande } from '../../utils/workflowArchitecture';

export default function ModuleForm({ moduleId, MODS = MODS_DATA, recordCode, initialData, onClose }) {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { userCourant } = useAuth();
  const { toast } = useToast();

  const M = MODS[moduleId];
  const isEdit = !!recordCode;

  const [formData, setFormData] = useState(() => (!recordCode && initialData) ? { ...initialData } : {});

  // Modules with many fields (dossiers, demandes, demandeLignes, clients...)
  // can tag each champ with a `groupe` name to split the edit modal into
  // steps/tabs instead of one long scroll. Purely additive: a module whose
  // champs have no `groupe` renders exactly as before, as a single
  // ungrouped list -- no visual change for the ~30 smaller modules that
  // don't opt in. Group order follows first-appearance order in `champs`.
  const champsList = M?.champs || [];
  const groupNames = [...new Set(champsList.map(f => f.groupe || 'Général'))];
  const hasSteps = groupNames.length > 1;
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    setActiveStep(0);
  }, [moduleId, recordCode]);

  const visibleChamps = hasSteps
    ? champsList.filter(f => (f.groupe || 'Général') === groupNames[activeStep])
    : champsList;

  useEffect(() => {
    if (isEdit && M && db[M.coll]) {
      const record = db[M.coll].find(x => x.code === recordCode);
      if (record) {
        setFormData({ ...record });
      }
    } else {
      setFormData(initialData ? { ...initialData } : {});
    }
  }, [isEdit, recordCode, M, db]);

  if (!M) return null;

  const handleChange = (k, v) => {
    setFormData(prev => {
      const next = { ...prev, [k]: v };

      // Clear dependent references when their parent changes and the current
      // selection no longer belongs to the newly selected parent.
      champsList.forEach(field => {
        if (field.dependsOn !== k || !next[field.k]) return;
        const candidates = db[field.coll] || [];
        const selected = candidates.find(item => item.code === next[field.k]);
        if (!selected || (field.filterOptions && !field.filterOptions(selected, next, db))) {
          next[field.k] = '';
        }
      });

      return next;
    });
  };

  const handleSave = () => {
    const propre = { ...formData };

    if (M.avantSauve && M.avantSauve(db, propre) === false) return;

    const collection = db[M.coll] ? [...db[M.coll]] : [];

    if (isEdit) {
      const idx = collection.findIndex(x => x.code === recordCode);
      if (idx > -1) {
        const obj = { ...collection[idx] };
        const ancien = { ...obj };

        (M.champs || []).forEach(f => {
          if (String(obj[f.k] ?? "") !== String(propre[f.k] ?? "")) {
            audit(M.label, "Modification", obj.code, f.k, obj[f.k], propre[f.k]);
            obj[f.k] = propre[f.k];
          }
        });

        collection[idx] = obj;
        const nextDb = { ...db, [M.coll]: collection };

        if (M.apresSauve) {
          M.apresSauve(nextDb, obj, ancien, { userCourant, notifier });
        }

        updateDB(nextDb);
        toast(`${obj.code} mis à jour`);
      }
    } else {
      const newCode = genCode(M.pfx || "REC");
      propre.code = newCode;
      propre.ts = Date.now();
      propre.par = userCourant;
      if (moduleId === 'clients') {
        propre.dateEntreeData = propre.dateEntreeData || new Date().toISOString().slice(0, 10);
        propre.dateCreation = propre.dateCreation || propre.dateEntreeData;
      }
      if (moduleId === 'demandes') {
        propre.referenceMetier = propre.referenceMetier || prochaineReferenceDemande(db, propre.client);
      } else if (moduleId === 'demandeLignes') {
        propre.referenceMetier = propre.referenceMetier || prochaineReferenceProduit(db, propre.demande);
      } else if (moduleId === 'commandes') {
        propre.referenceMetier = propre.referenceMetier || prochaineReferenceCommande(db, propre.client);
        propre.source_demande_id = propre.source_demande_id || propre.demande || '';
        propre.lignes = propre.lignes?.length ? propre.lignes : lignesCommandeDepuisDemande(db, propre.demande);
      }

      const nextCollection = [propre, ...collection];
      const nextDb = { ...db, [M.coll]: nextCollection };

      audit(M.label, "Création", propre.code, "—", "—", propre[M.champs?.[0]?.k] || propre.code);

      if (M.apresSauve) {
        M.apresSauve(nextDb, propre, null, { userCourant, notifier });
      }

      updateDB(nextDb);
      toast(`${propre.code} créé`);
    }

    (M.champs || []).forEach(f => {
      if (f.t === 'textarea' && propre[f.k]) {
        detecterMentions(propre[f.k], propre.code, db, userCourant, USERS, notifier);
      }
    });

    onClose();
  };

  return (
    <Modal
      title={isEdit ? `Modifier ${recordCode}` : `Ajouter ${M.label}`}
      onClose={onClose}
      large={hasSteps}
      footer={
        <>
          <button className="btn doux" onClick={onClose}>Annuler</button>
          <button className="btn" onClick={handleSave}>Enregistrer</button>
        </>
      }
    >
      {hasSteps && (
        <div className="onglets" style={{ padding: '0 20px', flexWrap: 'wrap' }}>
          {groupNames.map((g, i) => (
            <button
              type="button"
              key={g}
              className={`onglet ${activeStep === i ? 'actif' : ''}`}
              onClick={() => setActiveStep(i)}
            >
              {i + 1}. {g}
            </button>
          ))}
        </div>
      )}
      <div className="corps">
        {visibleChamps.map((f, i) => (
          <FormField
            key={f.k || i}
            fieldConfig={f}
            value={formData[f.k]}
            onChange={(val) => handleChange(f.k, val)}
            db={db}
            formData={formData}
          />
        ))}
      </div>
    </Modal>
  );
}

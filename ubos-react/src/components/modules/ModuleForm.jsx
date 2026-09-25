import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../common/Modal';
import FormField from '../common/FormField';
import { MODS as MODS_DATA } from '../../data/modules';
import { detecterMentions, renommerCodeClient } from '../../data/db';
import { USERS } from '../../data/constants';
import { recordFollowup } from '../../utils/dataFollowup';
import { prochaineReferenceDemande, prochaineReferenceProduit, prochaineReferenceCommande, lignesCommandeDepuisDemande } from '../../utils/workflowArchitecture';
import { renameClientCode, reserveNumericClientCode } from '../../services/api';

function normaliserCodeClient(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

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

  const handleSave = async () => {
    const propre = { ...formData };

    if (M.avantSauve && M.avantSauve(db, propre) === false) return;

    const collection = db[M.coll] ? [...db[M.coll]] : [];

    if (isEdit) {
      let workingDb = db;
      let workingCollection = collection;
      let workingCode = recordCode;
      let renamedClientCode = '';
      const originalIndex = collection.findIndex(x => x.code === recordCode);
      const original = originalIndex > -1 ? { ...collection[originalIndex] } : null;

      if (moduleId === 'clients' && original) {
        const requestedCode = normaliserCodeClient(propre.codeClientUltex) || normaliserCodeClient(original.code);
        const duplicate = collection.find(client => client.code !== original.code && (
          normaliserCodeClient(client.code) === requestedCode
          || normaliserCodeClient(client.codeClientUltex) === requestedCode
        ));
        if (duplicate) {
          toast(`Le code client ${requestedCode} existe déjà (${duplicate.nom || duplicate.code}).`);
          return;
        }
        if (requestedCode !== normaliserCodeClient(original.code)) {
          try {
            await renameClientCode(original.code, requestedCode);
          } catch (error) {
            toast(error?.message || 'Impossible de modifier le code client.');
            return;
          }
          workingDb = renommerCodeClient(db, original.code, requestedCode).db;
          workingCollection = [...(workingDb[M.coll] || [])];
          workingCode = requestedCode;
          renamedClientCode = requestedCode;
          propre.codeClientUltex = requestedCode;
        }
      }

      const idx = workingCollection.findIndex(x => x.code === workingCode);
      if (idx > -1) {
        const obj = { ...workingCollection[idx] };
        const ancien = original || { ...obj };

        (M.champs || []).forEach(f => {
          if (String(ancien[f.k] ?? "") !== String(propre[f.k] ?? "")) {
            audit(M.label, "Modification", obj.code, f.k, ancien[f.k], propre[f.k]);
            obj[f.k] = propre[f.k];
          }
        });

        workingCollection[idx] = moduleId === 'clients' ? recordFollowup(ancien, obj, { actor: userCourant, notes: propre.remarque || '', action: 'Modification de la fiche' }) : obj;
        const nextDb = { ...workingDb, [M.coll]: workingCollection };

        if (M.apresSauve) {
          M.apresSauve(nextDb, obj, ancien, { userCourant, notifier });
        }

        await updateDB(nextDb);
        toast(`${obj.code} mis à jour`);
        if (renamedClientCode && window.location.hash.startsWith(`#ficheClient:${recordCode}`)) {
          window.location.hash = `#ficheClient:${renamedClientCode}`;
        }
      }
    } else {
      const codeClientSaisi = moduleId === 'clients' ? normaliserCodeClient(propre.codeClientUltex) : '';
      if (codeClientSaisi) {
        const doublon = collection.find(client =>
          normaliserCodeClient(client.code) === codeClientSaisi
          || normaliserCodeClient(client.codeClientUltex) === codeClientSaisi
        );
        if (doublon) {
          toast(`Le code client ${codeClientSaisi} existe déjà (${doublon.nom || doublon.code}).`);
          return;
        }
      }
      let newCode = codeClientSaisi;
      if (!newCode) {
        try {
          newCode = moduleId === 'clients'
            ? await reserveNumericClientCode()
            : genCode(M.pfx || "REC");
        } catch (error) {
          toast(error?.message || 'Impossible de générer le code client.');
          return;
        }
      }
      propre.code = newCode;
      propre.ts = Date.now();
      propre.par = userCourant;
      if (moduleId === 'clients') {
        propre.codeClientUltex = newCode;
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

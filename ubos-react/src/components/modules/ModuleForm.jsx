import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../common/Modal';
import FormField from '../common/FormField';
import { MODS as MODS_DATA } from '../../data/modules';
import { detecterMentions } from '../../data/db';
import { USERS } from '../../data/constants';

export default function ModuleForm({ moduleId, MODS = MODS_DATA, recordCode, onClose }) {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { userCourant } = useAuth();
  const { toast } = useToast();
  
  const M = MODS[moduleId];
  const isEdit = !!recordCode;
  
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (isEdit && M && db[M.coll]) {
      const record = db[M.coll].find(x => x.code === recordCode);
      if (record) {
        setFormData({ ...record });
      }
    } else {
      setFormData({});
    }
  }, [isEdit, recordCode, M, db]);

  if (!M) return null;

  const handleChange = (k, v) => {
    setFormData(prev => ({ ...prev, [k]: v }));
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
      footer={
        <>
          <button className="btn doux" onClick={onClose}>Annuler</button>
          <button className="btn" onClick={handleSave}>Enregistrer</button>
        </>
      }
    >
      <div className="corps">
        {(M.champs || []).map((f, i) => (
          <FormField 
            key={i} 
            fieldConfig={f} 
            value={formData[f.k]} 
            onChange={(val) => handleChange(f.k, val)} 
            db={db}
          />
        ))}
      </div>
    </Modal>
  );
}

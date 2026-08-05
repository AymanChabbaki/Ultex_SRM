import React, { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import Modal from './Modal';
import FormField from './FormField';

/**
 * Generic add/edit modal for records that live inside an array nested in a
 * parent document (e.g. facture lines, arrivage frais) rather than a
 * top-level `db[coll]` collection — so ModuleForm's collection-based save
 * logic doesn't apply. Reuses the same `{k,l,t,opts,req}` champ shape and
 * FormField renderer used everywhere else in the app.
 */
export default function LigneModal({ title, champs, initialData, onSave, onClose }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState(() => (initialData ? { ...initialData } : {}));

  const handleChange = (k, v) => setFormData(prev => ({ ...prev, [k]: v }));

  const handleSave = () => {
    const missing = (champs || []).find(f => f.req && !String(formData[f.k] ?? '').trim());
    if (missing) {
      toast(`Le champ « ${missing.l} » est obligatoire.`);
      return;
    }
    onSave(formData);
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn doux" onClick={onClose}>Annuler</button>
          <button className="btn" onClick={handleSave}>Enregistrer</button>
        </>
      }
    >
      <div className="corps">
        {(champs || []).map((f, i) => (
          <FormField key={f.k || i} fieldConfig={f} value={formData[f.k]} onChange={(val) => handleChange(f.k, val)} />
        ))}
      </div>
    </Modal>
  );
}

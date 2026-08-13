import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import FormField from '../common/FormField';
import { MODS } from '../../data/modules';
import { calculerChargeUtilisateur } from '../../utils/tachesPilotage';
import { pill } from '../../utils/format';

const CHARGE_PILL = { 'Sous-chargé': 'p-bleu', 'Charge normale': 'p-vert', 'Chargé': 'p-ambre', 'Surchargé': 'p-rouge' };

export default function AjouterTache() {
  const { db, updateDB, genCode, audit, notifier, userCourant } = useDB();
  const { estDirection } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState({});

  if (!estDirection()) {
    return (
      <div>
        <Topbar titre="Ajouter une tâche" />
        <div className="panneau"><div className="note-verrou"><b>Réservé à la Direction</b></div></div>
      </div>
    );
  }

  const champs = MODS.taches.champs;
  const handleChange = (k, v) => setFormData(prev => ({ ...prev, [k]: v }));
  const assigneUser = (db.utilisateurs || []).find(u => u.nomComplet === formData.assigne);
  const charge = assigneUser ? calculerChargeUtilisateur(db, assigneUser) : null;

  const handleCreer = () => {
    if (!formData.titre || !formData.assigne) { toast('Titre et responsable sont obligatoires.'); return; }
    const code = genCode('T');
    const tache = { code, ts: Date.now(), par: userCourant, statut: formData.statut || 'À faire', nbReports: 0, ...formData };
    updateDB({ ...db, taches: [tache, ...(db.taches || [])] });
    audit('Tâches', 'Création (Direction)', code, '—', '—', formData.titre);
    notifier(formData.assigne, `Nouvelle tâche ${code} assignée par la Direction : ${formData.titre} (échéance ${formData.echeance || '—'})`, 'Tâches');
    toast(`Tâche ${code} créée pour ${formData.assigne}.`);
    window.location.hash = `ficheTache:${code}`;
  };

  return (
    <div>
      <Topbar titre="Ajouter une tâche" />

      {charge && (
        <div className="vide" style={{ textAlign: 'left', marginBottom: '14px' }}>
          Charge actuelle de {formData.assigne} : {pill(charge.tag, CHARGE_PILL[charge.tag] || 'p-gris')} — {charge.nbTaches} tâche(s) ouverte(s), {charge.dossiersActifs} dossier(s) actif(s).
        </div>
      )}

      <div className="panneau">
        <div className="corps">
          {champs.map((f, i) => (
            <FormField key={i} fieldConfig={f} value={formData[f.k]} onChange={(val) => handleChange(f.k, val)} db={db} />
          ))}
        </div>
      </div>

      <div className="outils" style={{ marginTop: '14px' }}>
        <button className="btn or" onClick={handleCreer}>Créer et assigner la tâche</button>
      </div>
    </div>
  );
}

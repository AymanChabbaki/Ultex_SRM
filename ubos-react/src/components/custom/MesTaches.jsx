import React, { useMemo, useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import FormField from '../common/FormField';
import { pill } from '../../utils/format';
import { tachesDeUtilisateur } from '../../utils/tachesPilotage';
import { TYPES_TACHE, PRIORITES_TACHE } from '../../data/constants';

const CHAMPS_TACHE_PERSO = [
  { k: "titre", l: "Titre", t: "text", req: 1 },
  { k: "remarque", l: "Description", t: "textarea", large: 1 },
  { k: "type", l: "Type de tâche", t: "select", opts: TYPES_TACHE },
  { k: "dossier", l: "Dossier lié (optionnel)", t: "ref", coll: "dossiers", cle: "produit" },
  { k: "datePrevue", l: "Date prévue", t: "date" },
  { k: "heure", l: "Heure", t: "text", aide: "Ex. 08:45 — utilisé pour trier le programme du jour." },
  { k: "echeance", l: "Échéance", t: "date" },
  { k: "priorite", l: "Priorité", t: "select", opts: PRIORITES_TACHE }
];

const COLONNES = [
  { id: 'afaire', label: 'À faire', statuts: ['À faire', 'Planifiée', 'Reportée'], statutDepot: 'À faire' },
  { id: 'encours', label: 'En cours', statuts: ['En cours'], statutDepot: 'En cours' },
  { id: 'attente', label: 'En attente', statuts: ["En attente d'un collègue", 'En attente client', 'En attente fournisseur', 'En attente Direction'], statutDepot: "En attente d'un collègue" },
  { id: 'bloquee', label: 'Bloquée', statuts: ['Bloquée'], statutDepot: 'Bloquée' },
  { id: 'validation', label: 'En validation', statuts: ['Terminée — En attente de validation'], statutDepot: 'Terminée — En attente de validation' },
  { id: 'terminee', label: 'Terminée', statuts: ['Terminée', 'Terminée avec réserve'], statutDepot: 'Terminée' }
];

const PRIORITE_PILL = (p) => ['Critique', 'Très urgente', 'Urgente'].includes(p) ? 'p-rouge' : p === 'Haute' ? 'p-ambre' : 'p-gris';

export default function MesTaches({ user, isAdminView }) {
  const { db, updateDB, genCode, audit, userCourant } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const cible = user || {};
  const [dragCode, setDragCode] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});

  const mesTaches = useMemo(() => tachesDeUtilisateur(db, cible).filter(t => t.statut !== 'Annulée'), [db, cible]);

  const parColonne = useMemo(() => {
    const map = {};
    COLONNES.forEach(c => { map[c.id] = mesTaches.filter(t => c.statuts.includes(t.statut)); });
    return map;
  }, [mesTaches]);

  const handleDrop = (colonne) => {
    if (!dragCode || !peut('modifier')) { setDragCode(null); return; }
    const t = mesTaches.find(x => x.code === dragCode);
    if (!t || t.statut === colonne.statutDepot) { setDragCode(null); return; }
    updateDB({ ...db, taches: (db.taches || []).map(x => x.code === dragCode ? { ...x, statut: colonne.statutDepot } : x) });
    audit('Tâches', 'Changement de statut (Kanban)', dragCode, 'statut', t.statut, colonne.statutDepot, t.dossier);
    toast(`${dragCode} déplacée vers « ${colonne.label} ».`);
    setDragCode(null);
  };

  const ouvrirCreation = () => {
    setFormData({ priorite: 'Normale', type: 'Tâche courante' });
    setShowForm(true);
  };

  const handleCreer = () => {
    if (!formData.titre) { toast('Le titre est obligatoire.'); return; }
    const code = genCode('T');
    const tache = {
      code, ts: Date.now(), par: userCourant, assigne: cible.nomComplet,
      statut: 'À faire', origine: 'Tâche courante', nbReports: 0, ...formData
    };
    updateDB({ ...db, taches: [tache, ...(db.taches || [])] });
    audit('Tâches', 'Création (personnelle)', code, '—', '—', formData.titre, tache.dossier);
    toast(`Tâche ${code} créée.`);
    setShowForm(false);
    setFormData({});
  };

  return (
    <div>
      <Topbar titre={isAdminView ? `Tâches — ${cible.nomComplet}` : 'Mes tâches'} />
      <div className="outils">
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={ouvrirCreation}>+ Nouvelle tâche</button>
      </div>
      <div className="kanban">
        {COLONNES.map(col => (
          <div key={col.id} className="kanban-colonne" onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(col)}>
            <h4>{col.label} <span className="pill p-gris">{parColonne[col.id].length}</span></h4>
            {parColonne[col.id].map(t => (
              <div key={t.code} className="kanban-carte" draggable={peut('modifier')} onDragStart={() => setDragCode(t.code)}>
                <a href={`#ficheTache:${t.code}`}><b>{t.titre}</b></a>
                <div className="qui">{t.code} · {t.echeance || 'sans échéance'}</div>
                {pill(t.priorite || 'Normale', PRIORITE_PILL(t.priorite))}
              </div>
            ))}
            {!parColonne[col.id].length && <div className="vide" style={{ padding: '14px' }}>Aucune</div>}
          </div>
        ))}
      </div>

      {showForm && (
        <Modal
          title={isAdminView ? `Nouvelle tâche pour ${cible.nomComplet}` : 'Nouvelle tâche'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn doux" onClick={() => setShowForm(false)}>Annuler</button>
              <button className="btn" onClick={handleCreer}>Créer</button>
            </>
          }
        >
          <div className="corps">
            {CHAMPS_TACHE_PERSO.map((f, i) => (
              <FormField key={i} fieldConfig={f} value={formData[f.k]} onChange={(val) => setFormData(prev => ({ ...prev, [f.k]: val }))} db={db} />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

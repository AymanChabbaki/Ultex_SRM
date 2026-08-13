import React, { useMemo, useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { tachesDeUtilisateur } from '../../utils/tachesPilotage';

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
  const { db, updateDB, audit } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const cible = user || {};
  const [dragCode, setDragCode] = useState(null);

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

  return (
    <div>
      <Topbar titre={isAdminView ? `Tâches — ${cible.nomComplet}` : 'Mes tâches'} />
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
    </div>
  );
}

import React, { useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import BarreProgression from '../common/BarreProgression';
import { calculerObjectifActif, calculerProgressionJour } from '../../utils/dataPipeline';

export default function MesObjectifs({ user, isAdminView }) {
  const { db } = useDB();
  const cible = user || {};
  const objectif = useMemo(() => calculerObjectifActif(db, cible), [db, cible]);
  const progression = useMemo(() => calculerProgressionJour(db, cible), [db, cible]);

  return (
    <div>
      <Topbar titre={isAdminView ? `Objectifs — ${cible.nomComplet}` : 'Mes objectifs'} />

      {objectif.parDefaut && (
        <div className="vide" style={{ textAlign: 'left', marginBottom: '14px' }}>{objectif.label}</div>
      )}

      <div className="panneau" style={{ padding: '18px 22px' }}>
        <h4 style={{ marginTop: 0 }}>{!objectif.parDefaut ? objectif.label : 'Objectifs du jour'}</h4>
        <BarreProgression val={progression.demandesCreees} obj={objectif.demandesParJour} label="Demandes créées" />
        <BarreProgression val={progression.clientsContactes} obj={objectif.clientsContactesParJour} label="Clients contactés" />
        <BarreProgression val={progression.relancesEffectuees} obj={objectif.relancesParJour} label="Relances effectuées" />
        <BarreProgression val={progression.nouveauxClients} obj={objectif.nouveauxClientsParJour} label="Nouveaux clients créés" />
      </div>

      {!objectif.parDefaut && (
        <p style={{ color: 'var(--gris)', fontSize: '12px', marginTop: '10px' }}>
          Période : {objectif.dateDebut} → {objectif.dateFin}{objectif.utilisateur ? ` — objectif nominatif pour ${objectif.utilisateur}` : ' — objectif global du service Data'}.
        </p>
      )}
    </div>
  );
}

import React, { useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import BarreProgression from '../common/BarreProgression';
import StatCard from '../common/StatCard';
import { calculerObjectifActif, calculerProgressionJour } from '../../utils/dataPipeline';
import { suivisDeCoordinateur, calculerObjectifsClosingJour, calculerKpisClosingPeriode } from '../../utils/closingCoordination';

export default function MesObjectifs({ user, isAdminView }) {
  const { db } = useDB();
  const cible = user || {};
  const objectif = useMemo(() => calculerObjectifActif(db, cible), [db, cible]);
  const progression = useMemo(() => calculerProgressionJour(db, cible), [db, cible]);
  const estCoordinateurClosing = suivisDeCoordinateur(db, cible).length > 0;
  const closingJour = useMemo(() => estCoordinateurClosing ? calculerObjectifsClosingJour(db, cible) : null, [db, cible, estCoordinateurClosing]);
  const closingPeriode = useMemo(() => estCoordinateurClosing ? calculerKpisClosingPeriode(db, cible) : null, [db, cible, estCoordinateurClosing]);

  return (
    <div>
      <Topbar titre={isAdminView ? `Objectifs — ${cible.nomComplet}` : 'Mes objectifs'} />

      {objectif.parDefaut && (
        <div className="vide" style={{ textAlign: 'left', marginBottom: '14px' }}>{objectif.label}</div>
      )}

      <div className="panneau" style={{ padding: '18px 22px' }}>
        <h4 style={{ marginTop: 0 }}>{!objectif.parDefaut ? objectif.label : 'Objectifs du jour'}</h4>
        {estCoordinateurClosing ? (
          <>
            <BarreProgression val={closingJour.codesSuivis} obj={objectif.codesTraitesParJour} label="Codes traités" />
            <BarreProgression val={closingJour.clientsContactes} obj={objectif.clientsContactesParJour} label="Clients contactés" />
            <BarreProgression val={closingJour.relancesRealisees} obj={objectif.relancesParJour} label="Relances dues effectuées" />
            <BarreProgression val={closingJour.devisValides} obj={objectif.devisControlesParJour} label="Devis contrôlés" />
            <BarreProgression val={closingJour.codesTraitesMansouri} obj={objectif.retoursMansouriParJour} label="Retours Mansouri traités" />
          </>
        ) : (
          <>
            <BarreProgression val={progression.demandesCreees} obj={objectif.demandesParJour} label="Demandes créées" />
            <BarreProgression val={progression.clientsContactes} obj={objectif.clientsContactesParJour} label="Clients contactés" />
            <BarreProgression val={progression.relancesEffectuees} obj={objectif.relancesParJour} label="Relances effectuées" />
            <BarreProgression val={progression.nouveauxClients} obj={objectif.nouveauxClientsParJour} label="Nouveaux clients créés" />
          </>
        )}
      </div>

      {!objectif.parDefaut && (
        <p style={{ color: 'var(--gris)', fontSize: '12px', marginTop: '10px' }}>
          Période : {objectif.dateDebut} → {objectif.dateFin}{objectif.utilisateur ? ` — objectif nominatif pour ${objectif.utilisateur}` : ' — objectif global du service Data'}.
        </p>
      )}

      {estCoordinateurClosing && (
        <div className="bloc-fiche large" style={{ marginTop: '14px' }}>
          <h4>Cette semaine</h4>
          <div className="stats">
            <StatCard label="Confirmations" value={closingPeriode.confirmations} />
            <StatCard label="Avances obtenues" value={closingPeriode.avancesObtenues} />
            <StatCard label="Montant des avances (MAD)" value={closingPeriode.montantAvances.toLocaleString('fr-FR')} />
            <StatCard label="Taux de conversion" value={`${closingPeriode.tauxConversionPct}%`} />
            <StatCard label="Délai moyen code → confirmation" value={closingPeriode.delaiMoyenJours !== null ? `${closingPeriode.delaiMoyenJours} j` : '—'} />
            <StatCard label="Dossiers perdus" value={closingPeriode.dossiersPerdus} />
            <StatCard label="Dossiers actifs" value={closingPeriode.dossiersActifs} />
            <StatCard label="Sans action depuis 5j+" value={closingPeriode.dossiersSansActionDepuis5j} alerte={closingPeriode.dossiersSansActionDepuis5j > 0} />
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { calculerSyntheseJour, calculerChargeUtilisateur } from '../../utils/tachesPilotage';
import { calculerObjectifActif, calculerProgressionJour } from '../../utils/dataPipeline';

const CHARGE_PILL = { 'Sous-chargé': 'p-bleu', 'Charge normale': 'p-vert', 'Chargé': 'p-ambre', 'Surchargé': 'p-rouge' };

export default function PilotageEquipe() {
  const { db } = useDB();
  const { estDirection } = useAuth();

  if (!estDirection()) {
    return (
      <div>
        <Topbar titre="Pilotage équipe" />
        <div className="panneau"><div className="note-verrou"><b>Réservé à la Direction</b></div></div>
      </div>
    );
  }

  const utilisateursActifs = (db.utilisateurs || []).filter(x => x.actif);

  return (
    <div>
      <Topbar titre="Pilotage équipe" />
      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Collaborateur</th><th>Aujourd'hui</th><th>Terminées</th><th>En retard</th>
                <th>Bloquées</th><th>Objectif</th><th>Progression</th><th>Charge</th><th></th>
              </tr>
            </thead>
            <tbody>
              {utilisateursActifs.map(x => {
                const s = calculerSyntheseJour(db, x);
                const charge = calculerChargeUtilisateur(db, x);
                const objectif = calculerObjectifActif(db, x);
                const progression = calculerProgressionJour(db, x);
                const objectifPct = objectif.demandesParJour ? Math.round((progression.demandesCreees / objectif.demandesParJour) * 100) : null;
                return (
                  <tr key={x.code}>
                    <td><b>{x.nomComplet}</b><br /><small style={{ color: 'var(--gris)' }}>{(x.services || []).join(', ') || x.poste}</small></td>
                    <td>{s.prevues}</td>
                    <td>{s.terminees}</td>
                    <td>{s.enRetard ? <b style={{ color: 'var(--rouge)' }}>{s.enRetard}</b> : 0}</td>
                    <td>{s.bloquees ? <b style={{ color: 'var(--rouge)' }}>{s.bloquees}</b> : 0}</td>
                    <td>{objectifPct !== null ? `${objectifPct}%` : '—'}</td>
                    <td>{s.progressionPct}%</td>
                    <td>{pill(charge.tag, CHARGE_PILL[charge.tag] || 'p-gris')}</td>
                    <td>
                      <button className="btn mini doux" onClick={() => window.location.hash = `monProgramme:${x.identifiant}`}>Programme</button>
                      <button className="btn mini doux" onClick={() => window.location.hash = `mesTaches:${x.identifiant}`}>Tâches</button>
                      <button className="btn mini doux" onClick={() => window.location.hash = `monRapportJournalier:${x.identifiant}`}>Rapport</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

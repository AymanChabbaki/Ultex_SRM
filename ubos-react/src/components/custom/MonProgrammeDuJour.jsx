import React, { useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { genererProgrammeDuJour, calculerSyntheseJour } from '../../utils/tachesPilotage';

const PRIORITE_PILL = { 'Critique': 'p-rouge', 'Très urgente': 'p-rouge', 'Urgente': 'p-ambre', 'Haute': 'p-ambre', 'Normale': 'p-gris', 'Basse': 'p-gris' };

export default function MonProgrammeDuJour({ user, isAdminView }) {
  const { db } = useDB();
  const cible = user || {};
  const programme = useMemo(() => genererProgrammeDuJour(db, cible), [db, cible]);
  const synthese = useMemo(() => calculerSyntheseJour(db, cible), [db, cible]);

  return (
    <div>
      <Topbar titre={isAdminView ? `Programme du jour — ${cible.nomComplet}` : 'Mon programme du jour'} />

      <div className="stats">
        <div className="stat"><b>{synthese.prevues}</b><small>Prévues</small></div>
        <div className="stat"><b>{synthese.terminees}</b><small>Terminées</small></div>
        <div className="stat"><b>{synthese.enCours}</b><small>En cours</small></div>
        <div className="stat"><b>{synthese.enRetard}</b><small>En retard</small></div>
        <div className="stat"><b>{synthese.bloquees}</b><small>Bloquées</small></div>
        <div className="stat"><b>{synthese.progressionPct}%</b><small>Progression</small></div>
      </div>

      <div className="panneau liste-notif">
        {programme.length ? programme.map(item => (
          <div key={item.code} className="notif nonlu">
            <div className="pt-n" style={{ background: item.retard ? 'var(--rouge)' : 'var(--or)' }}></div>
            <div className="spacer">
              <div>{item.heure && <b style={{ marginRight: '8px' }}>{item.heure}</b>}<a href={item.lien}>{item.titre}</a></div>
              <div className="qui">{item.sousLibelle}</div>
            </div>
            {pill(item.priorite, PRIORITE_PILL[item.priorite] || 'p-gris')}
          </div>
        )) : (
          <div className="vide"><b>Rien de prévu</b>Aucune tâche ni relance pour aujourd'hui.</div>
        )}
      </div>
    </div>
  );
}

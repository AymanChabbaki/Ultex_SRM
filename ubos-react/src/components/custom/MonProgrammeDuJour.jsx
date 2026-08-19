import React, { useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { genererProgrammeDuJour, calculerSyntheseJour } from '../../utils/tachesPilotage';
import { suivisDeCoordinateur, genererProgrammeClosing } from '../../utils/closingCoordination';

const PRIORITE_PILL = { 'Critique': 'p-rouge', 'Très urgente': 'p-rouge', 'Urgente': 'p-ambre', 'Haute': 'p-ambre', 'Normale': 'p-gris', 'Basse': 'p-gris' };

const MOTS_DEVIS = ['calcul', 'devis'];
const MOTS_MANSOURI = ['mansouri', 'transmettre'];

// Classe chaque élément dans un des 3 créneaux Closing (§9) à partir de son
// libellé — les tâches génériques (sans lien avec un code Closing) restent
// dans le créneau du matin par défaut, comportement inchangé pour elles.
function classerBloc(item) {
  const t = (item.titre || '').toLowerCase();
  if (MOTS_MANSOURI.some(m => t.includes(m))) return '14h–18h — Coordination Mansouri';
  if (MOTS_DEVIS.some(m => t.includes(m))) return '11h–13h — Contrôle des devis';
  return '09h–11h — Préparation & Relances';
}

const ORDRE_BLOCS = ['09h–11h — Préparation & Relances', '11h–13h — Contrôle des devis', '14h–18h — Coordination Mansouri'];

export default function MonProgrammeDuJour({ user, isAdminView }) {
  const { db } = useDB();
  const cible = user || {};
  const synthese = useMemo(() => calculerSyntheseJour(db, cible), [db, cible]);

  const aDesSuivisClosing = suivisDeCoordinateur(db, cible).length > 0;

  const programme = useMemo(() => {
    const base = genererProgrammeDuJour(db, cible);
    if (!aDesSuivisClosing) return base;
    const closingItems = genererProgrammeClosing(db, cible).map(c => ({
      code: c.code, heure: '', titre: `Code ${c.codeSuivi} — ${c.actionAujourdhui}`,
      sousLibelle: c.situation, lien: c.lien,
      priorite: c.priorite === 'Retard' ? 'Critique' : c.priorite === "Aujourd'hui" ? 'Haute' : 'Normale',
      retard: c.priorite === 'Retard'
    }));
    return [...base, ...closingItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, cible, aDesSuivisClosing]);

  const blocs = useMemo(() => {
    if (!aDesSuivisClosing) return null;
    const map = {};
    ORDRE_BLOCS.forEach(b => { map[b] = []; });
    programme.forEach(item => { map[classerBloc(item)].push(item); });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programme, aDesSuivisClosing]);

  const renderItem = (item) => (
    <div key={item.code} className="notif nonlu">
      <div className="pt-n" style={{ background: item.retard ? 'var(--rouge)' : 'var(--or)' }}></div>
      <div className="spacer">
        <div>{item.heure && <b style={{ marginRight: '8px' }}>{item.heure}</b>}<a href={item.lien}>{item.titre}</a></div>
        <div className="qui">{item.sousLibelle}</div>
      </div>
      {pill(item.priorite, PRIORITE_PILL[item.priorite] || 'p-gris')}
    </div>
  );

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

      {blocs ? (
        ORDRE_BLOCS.map(b => (
          <div key={b} className="bloc-fiche large">
            <h4>{b}</h4>
            <div className="liste-notif">
              {blocs[b].length ? blocs[b].map(renderItem) : <div className="vide">Rien de prévu sur ce créneau.</div>}
            </div>
          </div>
        ))
      ) : (
        <div className="panneau liste-notif">
          {programme.length ? programme.map(renderItem) : (
            <div className="vide"><b>Rien de prévu</b>Aucune tâche ni relance pour aujourd'hui.</div>
          )}
        </div>
      )}
    </div>
  );
}

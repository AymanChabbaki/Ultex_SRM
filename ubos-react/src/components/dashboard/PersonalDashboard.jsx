import React, { useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { destinataireEstMoi } from '../../data/permissions';
import Topbar from '../layout/Topbar';
import StatCard from '../common/StatCard';
import { pill, pillStatut, esc } from '../../utils/format';
import { collecterAgenda } from '../custom/MonAgenda';
import { calculerSyntheseJour } from '../../utils/tachesPilotage';

const estDirectionFalse = () => false;

export default function PersonalDashboard({ user, isAdminView }) {
  const { db } = useDB();
  const suffixe = isAdminView && user?.identifiant ? `:${user.identifiant}` : '';
  const synthese = useMemo(() => calculerSyntheseJour(db, user), [db, user]);
  const aValider = useMemo(() => (db.taches || []).filter(t =>
    t.statut === 'Terminée — En attente de validation' && t.validateur === (user.nomComplet || user.identifiant)
  ), [db, user]);

  const auj = new Date(new Date().toDateString());
  const ajd = new Date().toISOString().slice(0, 10);

  const mesTaches = useMemo(() => (db.taches || []).filter(t =>
    (user.services || []).includes(t.assigne) || t.assigne === user.nomComplet
  ), [db, user]);

  const tJour = mesTaches.filter(t => t.statut !== "Terminée" && t.echeance === ajd);
  const tRetard = mesTaches.filter(t => t.statut !== "Terminée" && t.echeance && new Date(t.echeance) < auj);

  const mesDossiers = useMemo(() => (db.dossiers || []).filter(d =>
    d.statut !== "Annulé" && d.etape !== "Clôturé" &&
    (d.responsable === user.nomComplet || d.respActionSuivante === user.nomComplet || (user.services || []).includes(d.responsable))
  ), [db, user]);

  const nonLues = useMemo(() => (db.notifs || [])
    .filter(n => !n.lu && destinataireEstMoi(user, n))
    .slice(0, 8), [db, user]);

  const agendaSemaine = useMemo(() => {
    const fin = new Date(auj.getTime() + 7 * 864e5);
    return collecterAgenda(db, user, estDirectionFalse)
      .filter(e => { const d = new Date(e.date); return d >= auj && d < fin; })
      .slice(0, 8);
  }, [db, user, auj]);

  const aFaire = [...tRetard, ...tJour];

  return (
    <>
      <Topbar titre={isAdminView ? `Tableau de bord — ${user.nomComplet}` : "Mon tableau de bord"} />

      {isAdminView && (
        <div className="outils mb-lg">
          <button className="btn mini doux" onClick={() => window.location.hash = 'performance'}>← Retour à l'équipe</button>
        </div>
      )}

      <div className="outils">
        <a className="btn mini doux" href={`#monProgramme${suffixe}`}>Programme du jour</a>
        <a className="btn mini doux" href={`#mesTaches${suffixe}`}>Mes tâches (Kanban)</a>
        <a className="btn mini doux" href={`#mesObjectifs${suffixe}`}>Mes objectifs</a>
        <a className="btn mini doux" href={`#monRapportJournalier${suffixe}`}>Mon rapport du jour</a>
      </div>

      <div className="stats">
        <StatCard val={synthese.prevues} label="Tâches prévues aujourd'hui" />
        <StatCard val={synthese.terminees} label="Terminées" />
        <StatCard val={synthese.enCours} label="En cours" />
        <StatCard val={synthese.enRetard} label="En retard" alerte={synthese.enRetard > 0} />
        <StatCard val={synthese.bloquees} label="Bloquées" alerte={synthese.bloquees > 0} />
        <StatCard val={`${synthese.progressionPct}%`} label="Progression du jour" />
        <StatCard val={mesDossiers.length} label="Dossiers affectés" />
        <StatCard val={nonLues.length} label="Notifications non lues" alerte={nonLues.length > 0} />
      </div>

      {aValider.length > 0 && (
        <>
          <h3 className="titre-sec">Tâches à valider</h3>
          <div className="panneau liste-notif mb-lg">
            {aValider.map(t => (
              <div key={t.code} className="notif nonlu">
                <div className="pt-n" style={{ background: 'var(--or)' }}></div>
                <div className="spacer">
                  <div><a href={`#ficheTache:${t.code}`}>{esc(t.titre)}</a></div>
                  <div className="qui">{t.code} · {t.assigne}</div>
                </div>
                {pill('En attente de validation', 'p-ambre')}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="deux-col">
        <div>
          <h3 className="titre-sec">Mes tâches</h3>
          <div className="panneau liste-notif">
            {aFaire.length ? aFaire.map(t => (
              <div key={t.code} className="notif nonlu">
                <div className="pt-n" style={{ background: t.echeance && new Date(t.echeance) < auj ? 'var(--rouge)' : 'var(--or)' }}></div>
                <div className="spacer">
                  <div>{esc(t.titre || t.code)}</div>
                  <div className="qui">{t.code} · échéance {t.echeance || "—"}</div>
                </div>
                {pillStatut(t.statut)}
              </div>
            )) : (
              <div className="vide"><b>Rien d'urgent</b>Aucune tâche du jour ou en retard.</div>
            )}
          </div>
        </div>
        <div>
          <h3 className="titre-sec">Notifications non lues</h3>
          <div className="panneau liste-notif">
            {nonLues.length ? nonLues.map(n => (
              <div key={n.code} className="notif nonlu">
                <div className="pt-n"></div>
                <div>
                  <div>{esc(n.texte)}</div>
                  <div className="qui">{n.de} · {n.module} · {n.date}</div>
                </div>
              </div>
            )) : (
              <div className="vide"><b>Rien à signaler</b>Les notifications apparaîtront ici.</div>
            )}
          </div>
        </div>
      </div>

      <h3 className="titre-sec mt-lg">Cette semaine</h3>
      <div className="panneau">
        <div className="defile">
          <table>
            <tbody>
              {agendaSemaine.length ? agendaSemaine.map((e, i) => (
                <tr key={i}>
                  <td style={{ width: '110px' }}>{e.date}</td>
                  <td style={{ width: '170px' }}>{pill(e.type, "p-gris")}</td>
                  <td>{esc(e.libelle)}</td>
                  <td style={{ width: '110px' }}>{e.statut === "Retard" ? pill("Retard", "p-rouge") : pillStatut(e.statut)}</td>
                </tr>
              )) : (
                <tr><td className="vide">Aucune échéance cette semaine.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="titre-sec mt-lg">Mes dossiers actifs</h3>
      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Code</th><th>Produit</th><th>Étape</th><th>Statut</th></tr></thead>
            <tbody>
              {mesDossiers.length ? mesDossiers.map(d => (
                <tr key={d.code}>
                  <td><a href={`#ficheDossier:${d.code}`}>{d.code}</a></td>
                  <td>{esc(d.produit || "—")}</td>
                  <td>{pill(d.etape, "p-gris")}</td>
                  <td>{pillStatut(d.statut)}</td>
                </tr>
              )) : (
                <tr><td colSpan="4" className="vide">Aucun dossier actif affecté.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

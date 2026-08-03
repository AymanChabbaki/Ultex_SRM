import React from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import StatCard from '../common/StatCard';
import { pillStatut, refLabel, esc } from '../../utils/format';

export default function DashboardLimex() {
  const { db } = useDB();

  const arrivagesActifs = (db.arrivages || []).filter(a => !["Clôturé", "Annulé"].includes(a.statut));
  const enPrep = arrivagesActifs.filter(a => a.statut === "Préparation").length;
  const enTransit = arrivagesActifs.filter(a => a.statut === "En transit").length;
  const dossiersSansDocs = (db.dossiers || []).filter(d => d.statut === "Actif" && !(db.documents || []).some(x => x.dossier === d.code)).length;
  const bad = (db.transits || []).filter(t => t.etapeDum === "En attente BAD" || t.etapeDum === "En dédouanement").length;

  return (
    <>
      <Topbar titre="Tableau de bord LIMEX" />
      <div className="outils">
        <span style={{ flex: 1, color: "var(--gris)" }}>
          Centre de pilotage LIMEX — {arrivagesActifs.length} arrivage(s) actif(s)
        </span>
        <button className="btn" onClick={() => window.location.hash = "arrivages"}>
          + Arrivages
        </button>
      </div>

      <div className="stats">
        <StatCard label="Arrivages en préparation" value={enPrep} />
        <StatCard label="Arrivages en transit" value={enTransit} />
        <StatCard label="Dossiers sans documents" value={dossiersSansDocs} alerte={dossiersSansDocs > 0} />
        <StatCard label="BAD non obtenu" value={bad} alerte={bad > 0} />
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Nom</th>
                <th>Statut</th>
                <th>ETA prévue</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {!arrivagesActifs.length ? (
                <tr><td colSpan="5" style={{ textAlign: "center", padding: "16px" }}>Aucun arrivage actif</td></tr>
              ) : (
                arrivagesActifs.map(a => (
                  <tr key={a.code}>
                    <td className="code"><a href={`#ficheArrivage:${a.code}`}>{a.code}</a></td>
                    <td>{esc(a.nomInterne || "—")}</td>
                    <td>{pillStatut(a.statut)}</td>
                    <td>{esc(a.etaPrevue || "—")}</td>
                    <td>{esc(a.responsableLimex || "—")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

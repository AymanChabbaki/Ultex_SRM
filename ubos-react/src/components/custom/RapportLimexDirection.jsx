import React from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import StatCard from '../common/StatCard';
import { pillStatut, pill } from '../../utils/format';

export default function RapportLimexDirection() {
  const { db } = useDB();
  const { estDirection } = useAuth();

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="Rapport LIMEX Direction" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à la Direction</b>
          </div>
        </div>
      </>
    );
  }

  const arrivagesActifs = (db.arrivages || []).filter(a => !["Clôturé", "Annulé"].includes(a.statut));
  const deports = (db.arrivages || []).filter(a => a.statut === "Départ confirmé" || a.statut === "En transit").length;
  const arrivees = (db.arrivages || []).filter(a => a.statut === "Arrivé au port").length;
  const bloques = (db.dossiers || []).filter(d => d.statut === "Bloqué").length;

  return (
    <>
      <Topbar titre="Rapport LIMEX Direction" />
      <div className="outils">
        <span style={{ flex: 1, color: "var(--gris)" }}>
          Généré le {new Date().toLocaleString("fr-FR")}
        </span>
        <button className="btn or" onClick={() => window.print()}>🖨 Imprimer</button>
      </div>

      <div className="stats">
        <StatCard label="Arrivages actifs" value={arrivagesActifs.length} />
        <StatCard label="Départs" value={deports} />
        <StatCard label="Arrivées" value={arrivees} />
        <StatCard label="Dossiers bloqués" value={bloques} alerte={bloques > 0} />
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Statut</th>
                <th>ETA</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {!arrivagesActifs.length ? (
                <tr><td colSpan="4" style={{ textAlign: "center", padding: "16px" }}>Aucun arrivage actif</td></tr>
              ) : (
                arrivagesActifs.map(a => (
                  <tr key={a.code}>
                    <td className="code"><a href={`#ficheArrivage:${a.code}`}>{a.code}</a></td>
                    <td>{pillStatut(a.statut)}</td>
                    <td>{a.etaPrevue || "—"}</td>
                    <td>{a.responsableLimex || "—"}</td>
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

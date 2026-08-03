import React from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import StatCard from '../common/StatCard';
import { fmtMAD, refLabel, esc, pill, pillStatut } from '../../utils/format';

export default function RapportDirection() {
  const { db } = useDB();
  const { estDirection, userCourant } = useAuth();

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="Rapport Direction" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à la Direction</b>
          </div>
        </div>
      </>
    );
  }

  const auj = new Date(new Date().toDateString());
  const actifs = (db.dossiers || []).filter(d => d.statut === "Actif" && d.etape !== "Clôturé");
  const bloques = (db.dossiers || []).filter(d => d.statut === "Bloqué");
  const payAtt = (db.paiements || []).filter(p => ["Prévu", "En attente", "En retard"].includes(p.statut));
  const tRetard = (db.taches || []).filter(t => t.statut !== "Terminée" && t.echeance && new Date(t.echeance) < auj);
  const errRec = (db.erreurs || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 10);
  const notifsImp = (db.notifs || []).filter(n => !n.lu).slice(0, 15);

  return (
    <>
      <Topbar titre="Rapport Direction" />
      <div className="outils">
        <span style={{ flex: 1, color: "var(--gris)" }}>
          Généré le {new Date().toLocaleString("fr-FR")} — {esc(userCourant)}
        </span>
        <button className="btn or" onClick={() => window.print()}>🖨 Imprimer / PDF</button>
      </div>

      <div className="entete-impression">
        <b>Rapport Direction — {new Date().toLocaleDateString("fr-FR")}</b>
      </div>

      <div className="stats">
        <StatCard label="Dossiers actifs" value={actifs.length} />
        <StatCard label="Dossiers bloqués" value={bloques.length} alerte={bloques.length > 0} />
        <StatCard label="Paiements en attente" value={payAtt.length} alerte={payAtt.length > 0} />
        <StatCard label="Tâches en retard" value={tRetard.length} alerte={tRetard.length > 0} />
        <StatCard label="Erreurs récentes" value={errRec.length} />
      </div>

      <div className="fiche-grille">
        <div className="bloc-fiche large">
          <h4>Dossiers actifs ({actifs.length})</h4>
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Étape</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {!actifs.length ? (
                  <tr><td colSpan="5" style={{ textAlign: "center", padding: "16px" }}>Aucun dossier actif</td></tr>
                ) : (
                  actifs.map(d => (
                    <tr key={d.code}>
                      <td className="code"><a href={`#ficheDossier:${d.code}`}>{d.code}</a></td>
                      <td>{refLabel(db, "clients", d.client, "nom")}</td>
                      <td>{d.produit || "—"}</td>
                      <td>{pill(d.etape, "p-or")}</td>
                      <td>{d.responsable || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bloc-fiche">
          <h4>Paiements en attente</h4>
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Montant</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {payAtt.slice(0, 8).map(p => (
                  <tr key={p.code}>
                    <td className="code">{p.code}</td>
                    <td>{fmtMAD(p.montant)}</td>
                    <td>{pillStatut(p.statut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bloc-fiche">
          <h4>Tâches en retard</h4>
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Titre</th>
                  <th>Assigné</th>
                  <th>Échéance</th>
                </tr>
              </thead>
              <tbody>
                {tRetard.slice(0, 8).map(t => (
                  <tr key={t.code}>
                    <td>{t.titre}</td>
                    <td>{t.assigne}</td>
                    <td><b style={{ color: "var(--rouge)" }}>{t.echeance}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

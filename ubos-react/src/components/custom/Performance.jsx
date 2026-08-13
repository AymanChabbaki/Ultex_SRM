import React from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import { pill, esc } from '../../utils/format';
import { PrinterIcon } from '../common/Icons';
import { calculerObjectifActif, calculerProgressionJour } from '../../utils/dataPipeline';

export default function Performance() {
  const { db } = useDB();
  const { estDirection } = useAuth();

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="Performance équipe" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à la Direction</b>
          </div>
        </div>
      </>
    );
  }

  const lim7 = Date.now() - 7 * 864e5;
  const lim30 = Date.now() - 30 * 864e5;
  const auj = new Date(new Date().toDateString());

  const utilisateursActifs = (db.utilisateurs || []).filter(x => x.actif);
  const contactsTotal = (db.contacts || []).length;
  const contactsConvertis = (db.contacts || []).filter(c => !!c.codeClientAssocie).length;
  const tauxTransformation = contactsTotal ? Math.round((contactsConvertis / contactsTotal) * 100) : 0;

  return (
    <>
      <Topbar titre="Performance équipe" />
      <div className="outils">
        <span className="spacer" style={{ color: "var(--gris)" }}>
          Vue consolidée par personne — tâches, dossiers, actions, rapports, erreurs, connexions
        </span>
        <button className="btn or" onClick={() => window.print()}><PrinterIcon size={14} /> Imprimer / PDF</button>
      </div>

      <div className="entete-impression">
        <b>ULTEX — Performance équipe</b>
        <small>{new Date().toLocaleDateString("fr-FR")}</small>
      </div>

      <p style={{ color: "var(--gris)", fontSize: "13px" }}>
        Taux de transformation Contacts → Clients (global) : <b>{tauxTransformation}%</b> ({contactsConvertis} / {contactsTotal})
      </p>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Tâches terminées</th>
                <th>Tâches en retard</th>
                <th>Dossiers actifs</th>
                <th>Demandes créées (30 j)</th>
                <th>Objectif du jour atteint</th>
                <th>Actions 7 j</th>
                <th>Actions 30 j</th>
                <th>Rapports déposés (30 j)</th>
                <th>Erreurs répétées</th>
                <th>Dernière connexion</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {utilisateursActifs.map(x => {
                const mesT = (db.taches || []).filter(t => (x.services || []).includes(t.assigne) || t.assigne === x.nomComplet);
                const term = mesT.filter(t => t.statut === "Terminée").length;
                const ret = mesT.filter(t => t.statut !== "Terminée" && t.echeance && new Date(t.echeance) < auj).length;
                const dossA = (db.dossiers || []).filter(d => d.statut === "Actif" && d.etape !== "Clôturé" && (d.responsable === x.nomComplet || d.respActionSuivante === x.nomComplet || (x.services || []).includes(d.responsable))).length;
                const a7 = (db.audit || []).filter(a => a.ts >= lim7 && a.utilisateur === x.nomComplet).length;
                const a30 = (db.audit || []).filter(a => a.ts >= lim30 && a.utilisateur === x.nomComplet).length;
                const demandes30 = (db.audit || []).filter(a => a.ts >= lim30 && a.utilisateur === x.nomComplet && a.module === "Demandes" && a.action === "Création").length;
                const rap = (db.rapports || []).filter(r => r.par === x.nomComplet && (r.ts || 0) >= lim30).length;
                const errRep = (db.erreurs || []).filter(e => e.repetition === "Répétée" && (e.responsable === x.nomComplet || (x.services || []).includes(e.service))).length;
                const conn = (db.audit || []).find(a => a.action === "Connexion" && a.utilisateur === x.nomComplet);
                const estData = (x.services || []).includes("Data");
                const objectifActif = estData ? calculerObjectifActif(db, x) : null;
                const progressionJour = estData ? calculerProgressionJour(db, x) : null;
                const objectifPct = estData && objectifActif.demandesParJour
                  ? Math.round((progressionJour.demandesCreees / objectifActif.demandesParJour) * 100)
                  : null;

                return (
                  <tr key={x.code}>
                    <td>
                      <b>{esc(x.nomComplet)}</b><br />
                      <small style={{ color: "var(--gris)" }}>{esc((x.services || []).join(", ") || x.poste || "—")}</small>
                    </td>
                    <td>{term}</td>
                    <td>{ret ? <b style={{ color: "var(--rouge)" }}>{ret}</b> : "0"}</td>
                    <td>{dossA}</td>
                    <td>{demandes30}</td>
                    <td>{objectifPct !== null ? pill(`${objectifPct}%`, objectifPct >= 100 ? "p-vert" : objectifPct >= 50 ? "p-ambre" : "p-rouge") : "—"}</td>
                    <td>{a7}</td>
                    <td>{a30}</td>
                    <td>{rap}</td>
                    <td>{errRep ? <b style={{ color: "var(--rouge)" }}>{errRep}</b> : "0"}</td>
                    <td>{conn ? esc(conn.date + " " + conn.heure.slice(0, 5)) : pill("Jamais", "p-gris")}</td>
                    <td>
                      <button className="btn mini doux" onClick={() => window.location.hash = `dashUser:${x.identifiant}`}>
                        Son tableau de bord
                      </button>
                      {estData && (
                        <button className="btn mini or" style={{ marginLeft: "4px" }} onClick={() => window.location.hash = `tableauBordData:${x.identifiant}`}>
                          Tableau de bord Data
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ color: "var(--gris)", fontSize: "12px", marginTop: "10px" }}>
        Les « actions » comptent chaque création, modification, validation ou transfert enregistré au journal d'audit. Les erreurs répétées proviennent du Registre des erreurs. L'« Objectif du jour atteint » n'est calculé que pour les agents du service Data, à partir de l'objectif actif configuré dans Objectifs Service Data.
      </p>
    </>
  );
}

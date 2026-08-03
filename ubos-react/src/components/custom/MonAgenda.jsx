import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import { pill, pillStatut, esc, fmtMAD } from '../../utils/format';

function collecterAgenda(db, user, estDirection) {
  if (!db || !user) return [];
  const dir = estDirection();
  const auj = new Date(new Date().toDateString());
  const evts = [];
  const mien = (srv, resp) => dir || (user.services || []).includes(srv) || resp === user.nomComplet;

  (db.taches || []).forEach(t => {
    if (t.echeance && (dir || (user.services || []).includes(t.assigne) || t.assigne === user.nomComplet)) {
      evts.push({
        date: t.echeance,
        type: t.origine === "Décision de réunion" ? "Réunion / décision" : "Tâche",
        libelle: t.code + " · " + (t.titre || ""),
        statut: t.statut === "Terminée" ? "Terminée" : (new Date(t.echeance) < auj ? "Retard" : (t.statut === "En cours" ? "En cours" : "À faire"))
      });
    }
  });

  (db.paiements || []).forEach(p => {
    if (p.echeance && !["Payé", "Annulé"].includes(p.statut) && mien("Finance")) {
      evts.push({
        date: p.echeance,
        type: "Rappel paiement",
        libelle: p.code + " · " + (p.nature || "") + " " + fmtMAD(p.montant) + " — " + (p.dossier || ""),
        statut: new Date(p.echeance) < auj ? "Retard" : "À faire"
      });
    }
  });

  (db.certifs || []).forEach(c => {
    if (c.echeance && c.statut !== "Obtenue" && mien("Analyse Dossiers", c.responsable)) {
      evts.push({
        date: c.echeance,
        type: "Rappel certification",
        libelle: c.code + " · " + (c.organisme || "") + " — " + (c.dossier || ""),
        statut: new Date(c.echeance) < auj ? "Retard" : (c.statut === "En cours" ? "En cours" : "À faire")
      });
    }
  });

  (db.transports || []).forEach(t => {
    if (t.eta && !["Livré"].includes(t.statut) && mien("Transport")) {
      evts.push({
        date: t.eta,
        type: "Rappel transport",
        libelle: t.code + " · ETA " + (t.mode || "") + " — " + (t.dossier || ""),
        statut: t.statut === "En transit" ? "En cours" : "À faire"
      });
    }
  });

  (db.transportsNat || []).forEach(t => {
    if (t.datePrevue && t.statut !== "Livré" && mien("Transport")) {
      evts.push({
        date: t.datePrevue,
        type: "Rappel transport",
        libelle: t.code + " · Livraison " + (t.villeLivraison || "") + " — " + (t.dossier || ""),
        statut: new Date(t.datePrevue) < auj ? "Retard" : "À faire"
      });
    }
  });

  (db.transits || []).forEach(t => {
    if (t.franchiseFin && t.etapeDum !== "Sorti du port" && mien("Transit & Douane")) {
      evts.push({
        date: t.franchiseFin,
        type: "Fin de franchise",
        libelle: t.code + " · Franchise port — " + (t.dossier || ""),
        statut: new Date(t.franchiseFin) < auj ? "Retard" : "À faire"
      });
    }
  });

  return evts.sort((a, b) => a.date < b.date ? -1 : 1);
}

export default function MonAgenda() {
  const { db } = useDB();
  const { session, estDirection } = useAuth();
  const [filtreAgenda, setFiltreAgenda] = useState("semaine");

  const evts = useMemo(() => collecterAgenda(db, session, estDirection), [db, session, estDirection]);

  const filtres = useMemo(() => {
    const auj = new Date(new Date().toDateString());
    if (filtreAgenda === "semaine") {
      const fin = new Date(auj.getTime() + 7 * 864e5);
      return evts.filter(e => {
        const d = new Date(e.date);
        return d >= auj && d < fin;
      });
    } else if (filtreAgenda === "retard") {
      return evts.filter(e => e.statut === "Retard");
    }
    return evts;
  }, [evts, filtreAgenda]);

  const parJour = useMemo(() => {
    const obj = {};
    filtres.forEach(e => {
      (obj[e.date] = obj[e.date] || []).push(e);
    });
    return obj;
  }, [filtres]);

  return (
    <>
      <Topbar titre="Mon agenda" />
      <div className="outils">
        <select value={filtreAgenda} onChange={e => setFiltreAgenda(e.target.value)}>
          <option value="semaine">Cette semaine</option>
          <option value="tout">Tout l'agenda</option>
          <option value="retard">En retard uniquement</option>
        </select>
        <span style={{ color: "var(--gris)" }}>
          {filtres.length} élément(s) — tâches, échéances dossiers, paiements, certifications, transports, décisions
        </span>
      </div>

      {!filtres.length ? (
        <div className="panneau">
          <div className="vide">
            <b>Agenda vide</b>
            Aucune échéance sur cette période.
          </div>
        </div>
      ) : (
        Object.keys(parJour).sort().map(j => {
          const estAuj = j === new Date().toISOString().slice(0, 10);
          return (
            <div className="agenda-jour" key={j}>
              <h4>
                {estAuj ? "Aujourd'hui — " : ""}
                {new Date(j + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </h4>
              <div className="panneau">
                <div className="defile">
                  <table>
                    <tbody>
                      {parJour[j].map((e, idx) => (
                        <tr key={idx}>
                          <td style={{ width: "170px" }}>{pill(e.type, "p-gris")}</td>
                          <td>{esc(e.libelle)}</td>
                          <td style={{ width: "110px" }}>
                            {e.statut === "Retard" ? pill("Retard", "p-rouge") : pillStatut(e.statut)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

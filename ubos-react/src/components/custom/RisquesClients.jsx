import React from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import StatCard from '../common/StatCard';
import { fmtMAD, refLabel, esc, pill } from '../../utils/format';
import { PrinterIcon } from '../common/Icons';

export default function RisquesClients() {
  const { db } = useDB();
  const { estDirection } = useAuth();

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="Factures finales & Risques clients" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à la Direction</b>
          </div>
        </div>
      </>
    );
  }

  const factures = db.facturesFinales || [];
  const impayes = db.impayes || [];
  const abandons = db.abandons || [];

  const totalRestant = impayes.reduce((s, i) => s + (+i.montantImpaye || 0), 0);
  const abandonnees = factures.filter(f => f.statutMarchandise === "Abandonnée par le client").length;
  const stockees = factures.filter(f => f.statutMarchandise === "Stockée par ULTEx").length;
  const contentieux = factures.filter(f => f.statutFinal === "Dossier en contentieux" || f.statutMarchandise === "En contentieux").length;

  return (
    <>
      <Topbar titre="Factures finales & Risques clients" />
      <div className="outils">
        <span className="spacer" style={{ color: "var(--gris)" }}>{factures.length} facture(s) finale(s) émise(s)</span>
        <button className="btn or" onClick={() => window.print()}><PrinterIcon size={14} /> Imprimer</button>
      </div>

      <div className="stats">
        <StatCard label="Factures finales émises" value={factures.length} />
        <StatCard label="Total restant dû (MAD)" value={fmtMAD(totalRestant)} alerte={totalRestant > 0} />
        <StatCard label="Marchandises abandonnées" value={abandonnees} alerte={abandonnees > 0} />
        <StatCard label="Stockées par ULTEx" value={stockees} />
        <StatCard label="Dossiers en contentieux" value={contentieux} alerte={contentieux > 0} />
      </div>

      <div className="deux-col">
        <div className="bloc-fiche">
          <h4>Impayés en cours</h4>
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Client</th>
                  <th>Montant</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {!impayes.length ? (
                  <tr><td colSpan="4" style={{ textAlign: "center", padding: "16px", color: "var(--gris)" }}>Aucun impayé</td></tr>
                ) : (
                  impayes.map(i => (
                    <tr key={i.code}>
                      <td className="code">{i.code}</td>
                      <td>{refLabel(db, "clients", i.client, "nom")}</td>
                      <td><b style={{ color: "var(--rouge)" }}>{fmtMAD(i.montantImpaye)}</b></td>
                      <td>{pill(i.statut || "En cours", "p-rouge")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bloc-fiche">
          <h4>Abandons & Pertes</h4>
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Dossier</th>
                  <th>Montant perdu</th>
                </tr>
              </thead>
              <tbody>
                {!abandons.length ? (
                  <tr><td colSpan="3" style={{ textAlign: "center", padding: "16px", color: "var(--gris)" }}>Aucun abandon</td></tr>
                ) : (
                  abandons.map(a => (
                    <tr key={a.code}>
                      <td className="code">{a.code}</td>
                      <td>{a.dossier || "—"}</td>
                      <td><b style={{ color: "var(--rouge)" }}>{fmtMAD(a.montantPerdu)}</b></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import { pill, esc } from '../../utils/format';

export default function Rapports() {
  const { db, updateDB, genCode, audit } = useDB();
  const { session, userCourant } = useAuth();
  
  const [remarque, setRemarque] = useState('');

  const rapports = (db.rapports || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const handleAjouterRapport = () => {
    if (!remarque.trim()) return;
    const r = {
      code: genCode('RJ'),
      service: (session?.services || [])[0] || 'Général',
      date: new Date().toISOString().slice(0, 10),
      par: userCourant,
      remarque: remarque.trim(),
      ts: Date.now()
    };
    const newDb = { ...db, rapports: [r, ...(db.rapports || [])] };
    updateDB(newDb);
    audit("Rapports", "Dépôt rapport journalier", r.code, "remarque", "—", r.remarque);
    setRemarque('');
  };

  return (
    <>
      <Topbar titre="Rapports journaliers" />
      
      <div className="bloc-fiche" style={{ marginBottom: "18px" }}>
        <h4>Déposer un rapport journalier</h4>
        <div style={{ padding: "16px", display: "grid", gap: "10px" }}>
          <textarea
            placeholder="Aujourd'hui, j'ai réalisé..."
            value={remarque}
            onChange={e => setRemarque(e.target.value)}
            style={{ width: "100%", minHeight: "80px", padding: "10px", borderRadius: "8px", border: "1px solid var(--bord)" }}
          />
          <div style={{ textAlign: "right" }}>
            <button className="btn" onClick={handleAjouterRapport}>Soumettre le rapport</button>
          </div>
        </div>
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Date</th>
                <th>Service</th>
                <th>Auteur</th>
                <th>Rapport</th>
              </tr>
            </thead>
            <tbody>
              {!rapports.length ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: "16px", color: "var(--gris)" }}>
                    Aucun rapport déposé
                  </td>
                </tr>
              ) : (
                rapports.map(r => (
                  <tr key={r.code}>
                    <td className="code">{r.code}</td>
                    <td>{r.date}</td>
                    <td>{pill(r.service || "Général", "p-gris")}</td>
                    <td><b>{esc(r.par)}</b></td>
                    <td>{esc(r.remarque)}</td>
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

import React from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import StatCard from '../common/StatCard';
import { pill, pillStatut } from '../../utils/format';
import { suivisDeCoordinateur, calculerPrioriteSuivi } from '../../utils/closingCoordination';

export default function DevisAControler({ user }) {
  const { db } = useDB();
  const cible = user || {};

  const aControler = suivisDeCoordinateur(db, cible).filter(s => s.statutDevis === 'À contrôler');
  const nouveaux = aControler.filter(s => !s.motifRevoir);
  const retournes = aControler.filter(s => s.motifRevoir);
  const urgents = aControler.filter(s => ['Retard', "Aujourd'hui"].includes(calculerPrioriteSuivi(s).tag));

  return (
    <div>
      <Topbar titre="Devis à contrôler" />

      <div className="stats">
        <StatCard label="Devis à contrôler" value={aControler.length} />
        <StatCard label="Nouveaux" value={nouveaux.length} />
        <StatCard label="Retournés après correction" value={retournes.length} />
        <StatCard label="Urgents" value={urgents.length} alerte={urgents.length > 0} />
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Code</th><th>Calcul terminé</th><th>Attente depuis</th><th>HS proposé</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {aControler.length ? aControler.map(s => (
                <tr key={s.code}>
                  <td className="code">{s.codeSuivi}</td>
                  <td>{pill('Oui', 'p-vert')}</td>
                  <td>{s.dernierContact || '—'}</td>
                  <td>{s.hsCodePropose || '—'}</td>
                  <td>{pillStatut(s.statutDevis)}</td>
                  <td><a className="btn mini or" href={`#ficheSuiviClosing:${s.code}`}>🔍 Vérifier</a></td>
                </tr>
              )) : (
                <tr><td colSpan="6"><div className="vide"><b>Rien à contrôler</b> Aucun devis en attente de vérification.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

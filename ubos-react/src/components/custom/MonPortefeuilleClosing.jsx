import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { pillStatut } from '../../utils/format';
import { suivisDeCoordinateur, calculerPrioriteSuivi } from '../../utils/closingCoordination';

const FILTRES = ['Tous', "Aujourd'hui", 'À relancer', 'Attente Mansouri', 'Attente client', 'Devis', 'Urgents', 'Confirmés', 'Sans prochaine action'];

function joursSansActivite(s) {
  if (!s.dernierContact) return Math.max(0, Math.floor((Date.now() - (s.ts || Date.now())) / 864e5));
  return Math.max(0, Math.floor((Date.now() - new Date(s.dernierContact)) / 864e5));
}

export default function MonPortefeuilleClosing({ user }) {
  const { db } = useDB();
  const cible = user || {};
  const [filtre, setFiltre] = useState('Tous');

  const tous = suivisDeCoordinateur(db, cible);
  const auj = new Date(new Date().toDateString());

  const filtres = useMemo(() => {
    switch (filtre) {
      case "Aujourd'hui": return tous.filter(s => s.echeanceActionSuivante && new Date(s.echeanceActionSuivante).getTime() === auj.getTime());
      case 'À relancer': return tous.filter(s => s.echeanceActionSuivante && new Date(s.echeanceActionSuivante) <= auj);
      case 'Attente Mansouri': return tous.filter(s => s.responsableActionActuelle === 'Mansouri');
      case 'Attente client': return tous.filter(s => ['Attente décision', 'À rappeler', 'Documents manquants', 'Attente paiement'].includes(s.resultatDernierContact));
      case 'Devis': return tous.filter(s => ['Calcul demandé', 'Devis en cours', 'Devis envoyé'].includes(s.statutPipeline));
      case 'Urgents': return tous.filter(s => ['Retard', "Aujourd'hui"].includes(calculerPrioriteSuivi(s).tag));
      case 'Confirmés': return tous.filter(s => ['Confirmation', 'Avance reçue'].includes(s.statutPipeline));
      case 'Sans prochaine action': return tous.filter(s => !s.echeanceActionSuivante);
      default: return tous;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre, tous]);

  return (
    <div>
      <Topbar titre="Mon portefeuille Closing" />
      <div className="outils">
        {FILTRES.map(f => (
          <button key={f} className={`btn mini ${filtre === f ? 'or' : 'doux'}`} onClick={() => setFiltre(f)}>{f}</button>
        ))}
        <span className="spacer" style={{ color: 'var(--gris)' }}>{filtres.length} code(s)</span>
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Code</th><th>Statut</th><th>Responsable action</th><th>Dernier contact</th><th>Jours sans activité</th><th>Prochaine action</th><th>Échéance</th><th></th></tr></thead>
            <tbody>
              {filtres.length ? filtres.map(s => (
                <tr key={s.code}>
                  <td className="code">{s.codeSuivi}</td>
                  <td>{pillStatut(s.statutPipeline)}</td>
                  <td>{s.responsableActionActuelle || s.coordinateur}</td>
                  <td>{s.dernierContact || '—'}</td>
                  <td>{joursSansActivite(s)}</td>
                  <td>{s.actionRecommandee || (s.dernierContact ? 'Relancer' : 'Premier contact')}</td>
                  <td>{s.echeanceActionSuivante || '—'}</td>
                  <td><a className="btn mini or" href={`#ficheSuiviClosing:${s.code}`}>Ouvrir</a></td>
                </tr>
              )) : (
                <tr><td colSpan="8"><div className="vide"><b>Rien ici</b> Aucun code ne correspond à ce filtre.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

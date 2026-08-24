import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { suivisDeCoordinateur, calculerPrioriteSuivi } from '../../utils/closingCoordination';

const FILTRES = ['Tous', 'À relancer', 'Attente client', 'Attente Mansouri', 'Urgents', 'Confirmés'];

export default function MonPortefeuilleClosing({ user }) {
  const { db } = useDB();
  const cible = user || {};
  const [filtre, setFiltre] = useState('Tous');
  const [recherche, setRecherche] = useState('');

  const tous = suivisDeCoordinateur(db, cible);
  const auj = new Date(new Date().toDateString());

  const filtres = useMemo(() => {
    let base;
    switch (filtre) {
      case 'À relancer': base = tous.filter(s => s.echeanceActionSuivante && new Date(s.echeanceActionSuivante) <= auj); break;
      case 'Attente client': base = tous.filter(s => ['Attente décision', 'À rappeler', 'Documents manquants', 'Attente paiement'].includes(s.resultatDernierContact)); break;
      case 'Attente Mansouri': base = tous.filter(s => s.responsableActionActuelle === 'Mansouri'); break;
      case 'Urgents': base = tous.filter(s => ['Retard', "Aujourd'hui"].includes(calculerPrioriteSuivi(s).tag)); break;
      case 'Confirmés': base = tous.filter(s => ['Confirmation', 'Avance reçue'].includes(s.statutPipeline)); break;
      default: base = tous;
    }
    if (recherche.trim()) base = base.filter(s => s.codeSuivi.toLowerCase().includes(recherche.trim().toLowerCase()));
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre, tous, recherche]);

  return (
    <div>
      <Topbar titre="Mon portefeuille Closing" />

      <div className="outils">
        <input
          type="search"
          placeholder="Rechercher un code…"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          style={{ maxWidth: '280px', fontSize: '15px' }}
        />
        <span className="spacer" style={{ color: 'var(--gris)' }}>{filtres.length} code(s)</span>
      </div>

      <div className="outils">
        {FILTRES.map(f => (
          <button key={f} className={`btn mini ${filtre === f ? 'or' : 'doux'}`} onClick={() => setFiltre(f)}>{f}</button>
        ))}
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Code</th><th>Situation</th><th>Dernière action</th><th>Prochaine action</th><th>Échéance</th><th>Alerte</th><th></th></tr></thead>
            <tbody>
              {filtres.length ? filtres.map(s => {
                const p = calculerPrioriteSuivi(s);
                return (
                  <tr key={s.code}>
                    <td className="code">{s.codeSuivi}</td>
                    <td>{s.situationActuelle || s.statutPipeline || 'Nouveau'}</td>
                    <td>{s.resultatDernierContact || '—'}</td>
                    <td>{s.actionRecommandee || (s.dernierContact ? 'Relancer' : 'Premier contact')}</td>
                    <td>{s.echeanceActionSuivante || '—'}</td>
                    <td>{pill(p.tag, p.pill)}</td>
                    <td><a className="btn mini or" href={`#ficheSuiviClosing:${s.code}`}>Ouvrir</a></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="7"><div className="vide"><b>Rien ici</b> Aucun code ne correspond à ce filtre.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

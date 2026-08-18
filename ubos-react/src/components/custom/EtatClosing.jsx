import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import { pillStatut } from '../../utils/format';
import { estSuiviOuvert, calculerPipelineClosing } from '../../utils/closingCoordination';
import { STATUTS_PIPELINE_CLOSING } from '../../data/constants';

const RESULTATS_ATTENTE = ['Attente décision', 'À rappeler', 'Documents manquants', 'Attente paiement'];

const CARTES = [
  { id: 'total', label: 'Suivis en cours', filtre: s => estSuiviOuvert(s) },
  { id: 'sansContact', label: '> 2 jours sans contact', filtre: s => estSuiviOuvert(s) && (!s.dernierContact || Math.floor((Date.now() - new Date(s.dernierContact)) / 864e5) >= 2) },
  { id: 'etude', label: 'Attente Études & Chiffrage', filtre: s => s.statutPipeline === 'Calcul demandé' },
  { id: 'coordinateur', label: 'Attente coordinateur', filtre: s => estSuiviOuvert(s) && (!s.responsableActionActuelle || s.responsableActionActuelle === s.coordinateur) },
  { id: 'mansouri', label: 'Attente Mansouri', filtre: s => s.responsableActionActuelle === 'Mansouri' },
  { id: 'client', label: 'Attente client', filtre: s => RESULTATS_ATTENTE.includes(s.resultatDernierContact) },
  { id: 'proche', label: 'Proches de confirmation', filtre: s => s.statutPipeline === 'Accord' },
  { id: 'confirmes', label: 'Confirmés', filtre: s => ['Confirmation', 'Avance reçue'].includes(s.statutPipeline) },
  { id: 'avance', label: 'Avance payée', filtre: s => s.statutPipeline === 'Avance reçue' }
];

export default function EtatClosing() {
  const { db } = useDB();
  const { estDirection } = useAuth();
  const [actif, setActif] = useState('total');

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="État du Closing" />
        <div className="panneau"><div className="note-verrou"><b>Réservé à la Direction</b></div></div>
      </>
    );
  }

  const tous = db.suivisClosing || [];
  const carteActive = CARTES.find(c => c.id === actif) || CARTES[0];
  const lignes = useMemo(() => tous.filter(carteActive.filtre), [tous, actif]);
  const pipeline = calculerPipelineClosing(db, null);

  return (
    <div>
      <Topbar titre="État du Closing" />

      <div className="bloc-fiche large">
        <h4>Entonnoir pipeline</h4>
        {STATUTS_PIPELINE_CLOSING.map(etape => {
          const n = pipeline.parEtape[etape] || 0;
          const pct = pipeline.total ? Math.round((n / pipeline.total) * 100) : 0;
          return (
            <div key={etape} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ width: '170px', fontSize: '13px' }}>{etape}</span>
              <div style={{ flex: 1, background: 'var(--ivoire)', borderRadius: '6px', height: '18px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, background: 'var(--or)', height: '100%' }}></div>
              </div>
              <span style={{ width: '60px', textAlign: 'right', fontSize: '13px' }}>{n} ({pct}%)</span>
            </div>
          );
        })}
      </div>

      <div className="stats">
        {CARTES.map(c => {
          const n = tous.filter(c.filtre).length;
          return (
            <div key={c.id} onClick={() => setActif(c.id)} style={{ cursor: 'pointer' }}>
              <div className={`stat-card-modern ${actif === c.id ? 'alerte-border' : ''}`}>
                <div className="stat-card-top"><span className="stat-label">{c.label}</span></div>
                <div className="stat-card-val-wrap"><span className="stat-val">{n}</span></div>
                <div className="stat-card-bar"></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Code</th><th>Coordinateur</th><th>Statut</th><th>Responsable action</th><th>Dernier contact</th></tr></thead>
            <tbody>
              {lignes.length ? lignes.map(s => (
                <tr key={s.code}>
                  <td className="code"><a href={`#ficheSuiviClosing:${s.code}`}>{s.codeSuivi}</a></td>
                  <td>{s.coordinateur}</td>
                  <td>{pillStatut(s.statutPipeline)}</td>
                  <td>{s.responsableActionActuelle || s.coordinateur}</td>
                  <td>{s.dernierContact || '—'}</td>
                </tr>
              )) : (
                <tr><td colSpan="5"><div className="vide">Aucun code dans cette catégorie.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

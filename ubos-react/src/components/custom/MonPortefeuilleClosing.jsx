import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { pill, pillStatut } from '../../utils/format';
import { suivisDeCoordinateur, estSuiviOuvert, estQualifie, calculerPrioriteSuivi, rechercherSuivis, dossiersDuClient } from '../../utils/closingCoordination';

const FILTRES = ['Tous', "Aujourd'hui", 'À relancer', 'Attente client', 'Attente Mansouri', 'Devis', 'Urgents', 'Retards', 'Sans prochaine action', 'Confirmés'];

export default function MonPortefeuilleClosing({ user }) {
  const { db } = useDB();
  const cible = user || {};
  const [filtre, setFiltre] = useState('Tous');
  const [recherche, setRecherche] = useState('');

  const tous = suivisDeCoordinateur(db, cible).filter(estQualifie);
  const auj = new Date(new Date().toDateString());

  const filtres = useMemo(() => {
    let base;
    switch (filtre) {
      case "Aujourd'hui": base = tous.filter(s => s.echeanceActionSuivante && new Date(s.echeanceActionSuivante).getTime() === auj.getTime()); break;
      case 'À relancer': base = tous.filter(s => estSuiviOuvert(s) && s.echeanceActionSuivante && new Date(s.echeanceActionSuivante) <= auj); break;
      case 'Attente client': base = tous.filter(s => ['Attente décision', 'À rappeler', 'Documents manquants', 'Attente paiement'].includes(s.resultatDernierContact)); break;
      case 'Attente Mansouri': base = tous.filter(s => s.responsableActionActuelle === 'Mansouri'); break;
      case 'Devis': base = tous.filter(s => ['Calcul demandé', 'Calcul en cours', 'Devis en cours', 'Devis à contrôler', 'Devis envoyé'].includes(s.statutPipeline)); break;
      case 'Urgents': base = tous.filter(s => ['Retard', "Aujourd'hui"].includes(calculerPrioriteSuivi(s).tag)); break;
      case 'Retards': base = tous.filter(s => estSuiviOuvert(s) && s.echeanceActionSuivante && new Date(s.echeanceActionSuivante) < auj); break;
      case 'Sans prochaine action': base = tous.filter(s => estSuiviOuvert(s) && !s.echeanceActionSuivante); break;
      case 'Confirmés': base = tous.filter(s => ['Confirmation', 'Avance reçue'].includes(s.statutPipeline)); break;
      default: base = tous;
    }
    if (recherche.trim()) base = rechercherSuivis({ ...db, suivisClosing: base }, cible, recherche);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre, tous, recherche]);

  const handleRechercheEntree = (e) => {
    if (e.key !== 'Enter') return;
    const q = recherche.trim();
    if (!q) return;
    const dossiers = dossiersDuClient(db, q);
    if (dossiers.length === 1) window.location.hash = `#ficheSuiviClosing:${dossiers[0].code}`;
    else if (dossiers.length > 1) window.location.hash = `#ficheClientClosing:${dossiers[0].codeClient}`;
  };

  return (
    <div>
      <Topbar titre="Mon portefeuille Closing" />

      <div className="outils">
        <input
          type="search"
          placeholder="Rechercher un code…"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          onKeyDown={handleRechercheEntree}
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
            <thead><tr><th>Code client</th><th>Dossier</th><th>Statut</th><th>Dernière action</th><th>Dernier contact</th><th>Prochaine action</th><th>Prochaine échéance</th><th>Responsable actuel</th><th>Alerte</th><th></th></tr></thead>
            <tbody>
              {filtres.length ? filtres.map(s => {
                const p = calculerPrioriteSuivi(s);
                return (
                  <tr key={s.code}>
                    <td className="code">{s.codeClient || s.codeSuivi}</td>
                    <td>{s.codeDossier && s.codeDossier !== s.codeClient ? s.codeDossier : '—'}</td>
                    <td>{pillStatut(s.statutPipeline)}</td>
                    <td>{s.resultatDernierContact || '—'}</td>
                    <td>{s.dernierContact || '—'}</td>
                    <td>{s.actionRecommandee || (s.dernierContact ? 'Relancer' : 'Premier contact')}</td>
                    <td>{s.echeanceActionSuivante || (estSuiviOuvert(s) ? '🔴 Aucune' : '—')}</td>
                    <td>{s.responsableActionActuelle || s.coordinateur}</td>
                    <td>{pill(p.tag, p.pill)}</td>
                    <td><a className="btn mini or" href={`#ficheSuiviClosing:${s.code}`}>Ouvrir</a></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="10"><div className="vide"><b>Rien ici</b> Aucun code ne correspond à ce filtre. {recherche.trim() && 'Vérifiez le code saisi — recherche partielle acceptée (ex. "84" trouve "8477").'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { pillStatut } from '../../utils/format';
import { suivisDeCoordinateur, estSuiviOuvert } from '../../utils/closingCoordination';

function queFaire(suivi) {
  if (suivi.resultatDernierContact === 'Documents manquants') return 'Réclamer les documents manquants au client.';
  if (suivi.resultatDernierContact === 'Attente paiement') return "Confirmer la réception du paiement.";
  if (suivi.resultatDernierContact === 'Demande modification') return 'Traiter la demande de modification du client.';
  if (suivi.statutPipeline === 'Devis envoyé') return 'Relancer le client pour avis sur le devis.';
  if (suivi.statutPipeline === 'Négociation') return 'Poursuivre la négociation jusqu\'à accord.';
  return 'Faire le point avec le client et remonter le résultat à Zoubida.';
}

export default function CoordinationMansouri({ user }) {
  const { db } = useDB();
  const cible = user || {};

  const codes = suivisDeCoordinateur(db, cible).filter(s => estSuiviOuvert(s) && s.responsableActionActuelle === 'Mansouri');

  return (
    <div>
      <Topbar titre="Coordination avec Mansouri" />
      <div className="panneau">
        <div className="defile">
          {codes.length ? codes.map(s => {
            const jours = Math.max(0, Math.floor((Date.now() - (s.ts || Date.now())) / 864e5));
            return (
              <div key={s.code} className="bloc-fiche large" style={{ marginBottom: '12px' }}>
                <h4>
                  Code {s.codeSuivi}
                  <span style={{ float: 'right' }}>{pillStatut(s.statutPipeline)}</span>
                </h4>
                <div className="kv">
                  <div><label>Dernière action</label><span>{s.resultatDernierContact || '—'}</span></div>
                  <div><label>Dernier contact</label><span>{s.dernierContact || '—'}</span></div>
                  <div><label>Prochaine action</label><span>{s.echeanceActionSuivante || 'Aujourd\'hui'}</span></div>
                  <div><label>Responsable actuel</label><span>Mansouri</span></div>
                  <div><label>Jours en suivi</label><span>{jours} jour(s)</span></div>
                </div>
                <div style={{ marginTop: '10px', padding: '10px', background: 'var(--fond-jaune)', borderRadius: '8px' }}>
                  <b>« Que faire maintenant ? »</b><br />{queFaire(s)}
                </div>
                <a className="btn mini or" style={{ marginTop: '10px', display: 'inline-block' }} href={`#ficheSuiviClosing:${s.code}`}>Ouvrir le code</a>
              </div>
            );
          }) : <div className="vide"><b>Rien avec Mansouri pour l'instant</b> Aucun code confié n'attend de retour.</div>}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import { pillStatut, pill } from '../../utils/format';
import {
  suivisDeCoordinateur, estSuiviOuvert, suivisATransmettreMansouri,
  suivisRetourMansouriRecu, suivisRetourMansouriEnRetard,
  construireTachePourMansouri, construireMessageSuiviClosing
} from '../../utils/closingCoordination';

function queFaire(suivi) {
  if (suivi.resultatDernierContact === 'Documents manquants') return 'Réclamer les documents manquants au client.';
  if (suivi.resultatDernierContact === 'Attente paiement') return "Confirmer la réception du paiement.";
  if (suivi.resultatDernierContact === 'Demande modification') return 'Traiter la demande de modification du client.';
  if (suivi.statutPipeline === 'Devis envoyé') return 'Relancer le client pour avis sur le devis.';
  if (suivi.statutPipeline === 'Négociation') return 'Poursuivre la négociation jusqu\'à accord.';
  return 'Faire le point avec le client et remonter le résultat à Zoubida.';
}

export default function CoordinationMansouri({ user }) {
  const { db, updateDB, audit, notifier, genCode, userCourant } = useDB();
  const { toast } = useToast();
  const cible = user || {};
  const [dateEdit, setDateEdit] = useState({});

  const chezMansouri = suivisDeCoordinateur(db, cible).filter(s => estSuiviOuvert(s) && s.responsableActionActuelle === 'Mansouri');
  const aTransmettre = suivisATransmettreMansouri(db, cible);
  const retourRecu = suivisRetourMansouriRecu(db, cible);
  const retourEnRetard = suivisRetourMansouriEnRetard(db, cible);

  const handleTransmettre = (suivi) => {
    updateDB({
      ...db,
      taches: [construireTachePourMansouri(suivi, genCode, userCourant), ...(db.taches || [])],
      suivisClosing: (db.suivisClosing || []).map(s => s.code === suivi.code ? { ...s, responsableActionActuelle: 'Mansouri' } : s)
    });
    audit('Suivi Closing', 'Confié à Mansouri', suivi.code, 'responsableActionActuelle', suivi.responsableActionActuelle, 'Mansouri');
    notifier('Mansouri', construireMessageSuiviClosing({ ...suivi, responsableActionActuelle: 'Mansouri' }, { titre: `Code confié par ${userCourant} — Code ${suivi.codeSuivi}` }), 'Suivi Closing');
    toast(`${suivi.codeSuivi} confié à Mansouri.`);
  };

  const handleConfirmerRelance = (suivi) => {
    const date = dateEdit[suivi.code] || suivi.echeanceActionSuivante;
    updateDB({ ...db, suivisClosing: (db.suivisClosing || []).map(s => s.code === suivi.code ? { ...s, echeanceActionSuivante: date } : s) });
    audit('Suivi Closing', 'Relance confirmée après retour Mansouri', suivi.code, 'echeanceActionSuivante', suivi.echeanceActionSuivante, date);
    toast(`Relance confirmée pour ${suivi.codeSuivi} — ${date}.`);
  };

  const handleRelancerMansouri = (suivi) => {
    notifier('Mansouri', construireMessageSuiviClosing(suivi, { titre: `Retour en attente — Code ${suivi.codeSuivi}`, extra: `Relance de ${userCourant} : merci de faire votre retour.` }), 'Suivi Closing');
    toast(`Relance envoyée à Mansouri pour ${suivi.codeSuivi}.`);
  };

  return (
    <div>
      <Topbar titre="Coordination avec Mansouri" />

      <div className="bloc-fiche large">
        <h4>À transmettre à Mansouri {pill(aTransmettre.length, 'p-gris')}</h4>
        {aTransmettre.length ? (
          <div className="defile">
            <table>
              <thead><tr><th>Code</th><th>Statut</th><th>Dernier contact</th><th></th></tr></thead>
              <tbody>
                {aTransmettre.map(s => (
                  <tr key={s.code}>
                    <td className="code"><a href={`#ficheSuiviClosing:${s.code}`}>{s.codeSuivi}</a></td>
                    <td>{pillStatut(s.statutPipeline)}</td>
                    <td>{s.dernierContact || '—'}</td>
                    <td><button className="btn mini or" onClick={() => handleTransmettre(s)}>Transmettre</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="vide">Aucun code prêt à transmettre.</div>}
      </div>

      <div className="bloc-fiche large">
        <h4>Chez Mansouri / en attente de retour {pill(chezMansouri.length, 'p-gris')}</h4>
        {chezMansouri.length ? chezMansouri.map(s => {
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
                <div><label>Jours en suivi</label><span>{jours} jour(s)</span></div>
              </div>
              <div style={{ marginTop: '10px', padding: '10px', background: 'var(--fond-jaune)', borderRadius: '8px' }}>
                <b>« Que faire maintenant ? »</b><br />{queFaire(s)}
              </div>
              <a className="btn mini or" style={{ marginTop: '10px', display: 'inline-block' }} href={`#ficheSuiviClosing:${s.code}`}>Ouvrir le code</a>
            </div>
          );
        }) : <div className="vide">Rien chez Mansouri pour l'instant.</div>}
      </div>

      <div className="bloc-fiche large">
        <h4>Retour Mansouri reçu {pill(retourRecu.length, 'p-vert')}</h4>
        {retourRecu.length ? (
          <div className="defile">
            <table>
              <thead><tr><th>Code</th><th>Dernier retour</th><th>Prochaine relance proposée</th><th></th></tr></thead>
              <tbody>
                {retourRecu.map(s => (
                  <tr key={s.code}>
                    <td className="code"><a href={`#ficheSuiviClosing:${s.code}`}>{s.codeSuivi}</a></td>
                    <td>{(s.memoire || [])[(s.memoire || []).length - 1]?.texte}</td>
                    <td><input type="date" value={dateEdit[s.code] || s.echeanceActionSuivante || ''} onChange={e => setDateEdit(prev => ({ ...prev, [s.code]: e.target.value }))} /></td>
                    <td><button className="btn mini or" onClick={() => handleConfirmerRelance(s)}>Confirmer</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="vide">Aucun retour à traiter.</div>}
      </div>

      <div className="bloc-fiche large">
        <h4>Retour en retard {pill(retourEnRetard.length, retourEnRetard.length ? 'p-rouge' : 'p-gris')}</h4>
        {retourEnRetard.length ? (
          <div className="defile">
            <table>
              <thead><tr><th>Code</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                {retourEnRetard.map(s => (
                  <tr key={s.code}>
                    <td className="code"><a href={`#ficheSuiviClosing:${s.code}`}>{s.codeSuivi}</a></td>
                    <td>{pillStatut(s.statutPipeline)}</td>
                    <td><button className="btn mini doux" onClick={() => handleRelancerMansouri(s)}>Relancer Mansouri</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="vide">Aucun retour en retard.</div>}
      </div>
    </div>
  );
}

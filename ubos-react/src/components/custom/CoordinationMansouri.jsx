import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import { pillStatut, pill } from '../../utils/format';
import {
  suivisDeCoordinateur, estSuiviOuvert, suivisATransmettreMansouri,
  suivisRetourMansouriRecu, suivisRetourMansouriEnRetard,
  construireTachePourMansouri, construireMessageSuiviClosing, confierAMansouri, libelleCode
} from '../../utils/closingCoordination';

function queFaire(suivi) {
  if (suivi.resultatDernierContact === 'Documents manquants') return 'Réclamer les documents manquants au client.';
  if (suivi.resultatDernierContact === 'Attente paiement') return "Confirmer la réception du paiement.";
  if (suivi.resultatDernierContact === 'Demande modification') return 'Traiter la demande de modification du client.';
  if (suivi.statutPipeline === 'Devis envoyé') return 'Relancer le client pour avis sur le devis.';
  if (suivi.statutPipeline === 'Négociation') return 'Poursuivre la négociation jusqu\'à accord.';
  return 'Faire le point avec le client et remonter le résultat à Zoubida.';
}

function joursDepuis(dateIso) {
  if (!dateIso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(dateIso)) / 864e5));
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
      suivisClosing: (db.suivisClosing || []).map(s => s.code === suivi.code ? { ...s, ...confierAMansouri() } : s)
    });
    audit('Suivi Closing', 'Confié à Mansouri', suivi.code, 'responsableActionActuelle', suivi.responsableActionActuelle, 'Mansouri');
    notifier('Mansouri', construireMessageSuiviClosing({ ...suivi, responsableActionActuelle: 'Mansouri' }, { titre: `Code confié par ${userCourant} — Code ${libelleCode(suivi)}` }), 'Suivi Closing');
    toast(`${libelleCode(suivi)} confié à Mansouri.`);
  };

  const handleConfirmerRelance = (suivi) => {
    const date = dateEdit[suivi.code] || suivi.echeanceActionSuivante;
    updateDB({ ...db, suivisClosing: (db.suivisClosing || []).map(s => s.code === suivi.code ? { ...s, echeanceActionSuivante: date } : s) });
    audit('Suivi Closing', 'Relance confirmée après retour Mansouri', suivi.code, 'echeanceActionSuivante', suivi.echeanceActionSuivante, date);
    toast(`Relance confirmée pour ${libelleCode(suivi)} — ${date}.`);
  };

  const handleRelancerMansouri = (suivi) => {
    notifier('Mansouri', construireMessageSuiviClosing(suivi, { titre: `Retour en attente — Code ${libelleCode(suivi)}`, extra: `Relance de ${userCourant} : merci de faire votre retour.` }), 'Suivi Closing');
    toast(`Relance envoyée à Mansouri pour ${libelleCode(suivi)}.`);
  };

  return (
    <div>
      <Topbar titre="Coordination avec Mansouri" />

      <div className="bloc-fiche large">
        <h4>À transmettre {pill(aTransmettre.length, 'p-gris')}</h4>
        {aTransmettre.length ? (
          <div className="defile">
            <table>
              <thead><tr><th>Code</th><th>Ce qu'il doit faire</th><th>Échéance</th><th>Action</th></tr></thead>
              <tbody>
                {aTransmettre.map(s => (
                  <tr key={s.code}>
                    <td className="code"><a href={`#ficheSuiviClosing:${s.code}`}>{libelleCode(s)}</a></td>
                    <td>{queFaire(s)}</td>
                    <td>{s.echeanceActionSuivante || '—'}</td>
                    <td><button className="btn mini or" onClick={() => handleTransmettre(s)}>Transmettre</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="vide">Aucun code prêt à transmettre.</div>}
      </div>

      <div className="bloc-fiche large">
        <h4>Attente Mansouri {pill(chezMansouri.length, 'p-gris')}</h4>
        {chezMansouri.length ? (
          <div className="defile">
            <table>
              <thead><tr><th>Code</th><th>Ce qu'il doit faire</th><th>Transmis depuis</th><th>Échéance</th><th>Retour</th><th>Action</th></tr></thead>
              <tbody>
                {chezMansouri.map(s => {
                  const jours = joursDepuis(s.dateConfieAMansouri);
                  return (
                    <tr key={s.code}>
                      <td className="code"><a href={`#ficheSuiviClosing:${s.code}`}>{libelleCode(s)}</a></td>
                      <td>{queFaire(s)}</td>
                      <td>{jours !== null ? `${jours} j` : '—'}</td>
                      <td>{s.echeanceActionSuivante || 'Aujourd\'hui'}</td>
                      <td>{pillStatut(s.statutPipeline)}</td>
                      <td><a className="btn mini doux" href={`#ficheSuiviClosing:${s.code}`}>Ouvrir</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="vide">Rien chez Mansouri pour l'instant.</div>}
      </div>

      <div className="bloc-fiche large">
        <h4>Retour reçu {pill(retourRecu.length, 'p-vert')}</h4>
        {retourRecu.length ? (
          <div className="defile">
            <table>
              <thead><tr><th>Code</th><th>Retour de Mansouri</th><th>Prochaine relance proposée</th><th>Action</th></tr></thead>
              <tbody>
                {retourRecu.map(s => (
                  <tr key={s.code}>
                    <td className="code"><a href={`#ficheSuiviClosing:${s.code}`}>{libelleCode(s)}</a></td>
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
        <h4>En retard {pill(retourEnRetard.length, retourEnRetard.length ? 'p-rouge' : 'p-gris')}</h4>
        {retourEnRetard.length ? (
          <div className="defile">
            <table>
              <thead><tr><th>Code</th><th>Statut</th><th>Action</th></tr></thead>
              <tbody>
                {retourEnRetard.map(s => (
                  <tr key={s.code}>
                    <td className="code"><a href={`#ficheSuiviClosing:${s.code}`}>{libelleCode(s)}</a></td>
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

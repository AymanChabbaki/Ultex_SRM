import React, { useMemo, useState } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { fmtMAD, pill } from '../../utils/format';

export default function DemandesConverties() {
  const { db } = useDB();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState('Toutes');

  const convertedRows = useMemo(() => {
    const clients = new Map((db.clients || []).map(client => [client.code, client]));
    const commandes = new Map((db.commandes || []).map(commande => [commande.source_demande_id || commande.demande, commande]));
    return (db.demandes || [])
      .filter(demande => demande.closingTag === 'converti' || demande.closingEtat === 'Converti / Gagné')
      .map(demande => ({ demande, client: clients.get(demande.client), commande: commandes.get(demande.code) }))
      .sort((a, b) => String(b.demande.dateConversionWorkflow || '').localeCompare(String(a.demande.dateConversionWorkflow || '')));
  }, [db.clients, db.commandes, db.demandes]);

  const rows = useMemo(() => {
    const query = recherche.trim().toLowerCase();
    return convertedRows
      .filter(row => filtre === 'Toutes'
        || (filtre === 'Commande créée' && row.commande)
        || (filtre === 'À vérifier' && (!row.commande || !row.commande.paiementConfirme)))
      .filter(row => !query || [
        row.demande.code, row.demande.referenceMetier, row.client?.nom,
        row.client?.code, row.demande.objectifGeneral, row.commande?.referenceMetier,
      ].some(value => String(value || '').toLowerCase().includes(query)));
  }, [convertedRows, recherche, filtre]);

  const totalConverties = convertedRows.length;
  const commandesAuto = convertedRows.filter(row => row.commande?.autoCreeeDepuisWorkflow).length;
  const aVerifier = convertedRows.filter(row => !row.commande || !row.commande.paiementConfirme).length;

  return (
    <div>
      <Topbar titre="Demandes converties" />

      <div className="stats">
        <div className="stat"><b>{totalConverties}</b><small>Demandes Converti / Gagné</small></div>
        <div className="stat"><b>{commandesAuto}</b><small>Commandes créées automatiquement</small></div>
        <div className="stat"><b>{aVerifier}</b><small>Paiements / synchronisations à vérifier</small></div>
      </div>

      <div className="outils">
        <input
          type="search"
          placeholder="Client, demande, produit ou commande…"
          value={recherche}
          onChange={event => setRecherche(event.target.value)}
        />
        <select value={filtre} onChange={event => setFiltre(event.target.value)}>
          <option>Toutes</option>
          <option>Commande créée</option>
          <option>À vérifier</option>
        </select>
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr>
              <th>Demande</th><th>Client</th><th>Besoin / produit</th><th>Package</th>
              <th>Devis validé</th><th>Paiement</th><th>Commande</th><th>Statut</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map(({ demande, client, commande }) => (
                <tr key={demande.code}>
                  <td><a href={`#ficheDemande:${demande.code}`}><b>{demande.referenceMetier || demande.code}</b></a></td>
                  <td>{client ? <a href={`#ficheClient:${client.code}`}>{client.nom || client.code}</a> : demande.client || '—'}</td>
                  <td>{demande.objectifGeneral || '—'}</td>
                  <td>{commande?.formuleUltex || demande.commercialPackage || 'Sur mesure'}</td>
                  <td>
                    <b>{commande?.calculValide || demande.closingValidatedDevisReference || '—'}</b>
                    {Number(commande?.calculValideMontantMad || demande.closingValidatedDevisTotalMad) > 0 && (
                      <><br/><small>{fmtMAD(Number(commande?.calculValideMontantMad || demande.closingValidatedDevisTotalMad))}</small></>
                    )}
                  </td>
                  <td>{commande?.paiementConfirme ? pill('Confirmé', 'p-vert') : pill('À vérifier', 'p-ambre')}</td>
                  <td>{commande ? <a href={`#ficheCommande:${commande.code}`}><b>{commande.referenceMetier || commande.code}</b></a> : pill('Manquante', 'p-rouge')}</td>
                  <td>{pill(commande?.statut || demande.statut || '—', commande ? 'p-vert' : 'p-ambre')}</td>
                  <td><div className="acts">
                    <a className="btn mini doux" href={`#ficheDemande:${demande.code}`}>Demande</a>
                    {commande && <a className="btn mini or" href={`#ficheCommande:${commande.code}`}>Commande</a>}
                  </div></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="9"><div className="vide"><b>Aucune demande convertie</b>Les demandes marquées « Converti / Gagné » dans Workflow apparaîtront ici avec leur commande.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

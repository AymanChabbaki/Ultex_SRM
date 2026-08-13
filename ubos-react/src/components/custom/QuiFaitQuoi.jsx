import React from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { calculerChargeUtilisateur, estTacheOuverte } from '../../utils/tachesPilotage';

const CHARGE_PILL = { 'Sous-chargé': 'p-bleu', 'Charge normale': 'p-vert', 'Chargé': 'p-ambre', 'Surchargé': 'p-rouge' };

export default function QuiFaitQuoi() {
  const { db } = useDB();
  const { estDirection } = useAuth();

  if (!estDirection()) {
    return (
      <div>
        <Topbar titre="Qui fait quoi ?" />
        <div className="panneau"><div className="note-verrou"><b>Réservé à la Direction</b></div></div>
      </div>
    );
  }

  const utilisateursActifs = (db.utilisateurs || []).filter(x => x.actif);
  const charges = utilisateursActifs.map(x => ({ user: x, charge: calculerChargeUtilisateur(db, x) }));
  const surcharges = charges.filter(c => c.charge.tag === 'Surchargé');
  const sousCharges = charges.filter(c => c.charge.tag === 'Sous-chargé');
  const tachesBloquees = (db.taches || []).filter(t => t.statut === 'Bloquée');
  const tachesCritiques = (db.taches || []).filter(t => estTacheOuverte(t) && t.priorite === 'Critique');

  const dossiersActifs = (db.dossiers || []).filter(d => d.statut === 'Actif' && d.etape !== 'Clôturé');
  const dossiersSansResponsable = dossiersActifs.filter(d => !d.responsable);

  const parDossier = {};
  (db.taches || []).filter(estTacheOuverte).forEach(t => { if (t.dossier) (parDossier[t.dossier] = parDossier[t.dossier] || []).push(t); });
  const dependanceUnique = Object.entries(parDossier).filter(([, taches]) => new Set(taches.map(t => t.assigne)).size === 1);

  return (
    <div>
      <Topbar titre="Qui fait quoi ?" />

      <h3 className="titre-sec">Charge par collaborateur</h3>
      {(surcharges.length || sousCharges.length) > 0 && (
        <p style={{ color: 'var(--gris)', fontSize: '13px' }}>
          {surcharges.length ? `${surcharges.length} surchargé(s) : ${surcharges.map(c => c.user.nomComplet).join(', ')}. ` : ''}
          {sousCharges.length ? `${sousCharges.length} sous-chargé(s) : ${sousCharges.map(c => c.user.nomComplet).join(', ')}.` : ''}
        </p>
      )}
      <div className="panneau mb-lg">
        <div className="defile">
          <table>
            <thead><tr><th>Collaborateur</th><th>Tâches ouvertes</th><th>Dossiers actifs</th><th>Charge</th></tr></thead>
            <tbody>
              {charges.map(({ user, charge }) => (
                <tr key={user.code}>
                  <td>{user.nomComplet}</td><td>{charge.nbTaches}</td><td>{charge.dossiersActifs}</td>
                  <td>{pill(charge.tag, CHARGE_PILL[charge.tag] || 'p-gris')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="deux-col">
        <div>
          <h3 className="titre-sec">Tâches bloquées ({tachesBloquees.length})</h3>
          <div className="panneau liste-notif">
            {tachesBloquees.length ? tachesBloquees.map(t => (
              <div key={t.code} className="notif nonlu">
                <div className="pt-n" style={{ background: 'var(--rouge)' }}></div>
                <div className="spacer"><a href={`#ficheTache:${t.code}`}>{t.titre}</a><div className="qui">{t.assigne}</div></div>
              </div>
            )) : <div className="vide">Aucune tâche bloquée.</div>}
          </div>
        </div>
        <div>
          <h3 className="titre-sec">Tâches critiques ouvertes ({tachesCritiques.length})</h3>
          <div className="panneau liste-notif">
            {tachesCritiques.length ? tachesCritiques.map(t => (
              <div key={t.code} className="notif nonlu">
                <div className="pt-n" style={{ background: 'var(--rouge)' }}></div>
                <div className="spacer"><a href={`#ficheTache:${t.code}`}>{t.titre}</a><div className="qui">{t.assigne}</div></div>
              </div>
            )) : <div className="vide">Aucune tâche critique.</div>}
          </div>
        </div>
      </div>

      <h3 className="titre-sec mt-lg">Dossiers sans responsable ({dossiersSansResponsable.length})</h3>
      <div className="panneau mb-lg">
        {dossiersSansResponsable.length ? (
          <div style={{ padding: '14px' }}>{dossiersSansResponsable.map(d => <a key={d.code} href={`#ficheDossier:${d.code}`} style={{ marginRight: '12px' }}>{d.code}</a>)}</div>
        ) : <div className="vide">Tous les dossiers actifs ont un responsable.</div>}
      </div>

      <h3 className="titre-sec mt-lg">Tâches à dépendance unique par dossier ({dependanceUnique.length})</h3>
      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Dossier</th><th>Responsable unique</th><th>Nb tâches</th></tr></thead>
            <tbody>
              {dependanceUnique.length ? dependanceUnique.map(([dossier, taches]) => (
                <tr key={dossier}><td><a href={`#ficheDossier:${dossier}`}>{dossier}</a></td><td>{taches[0].assigne}</td><td>{taches.length}</td></tr>
              )) : <tr><td colSpan="3" className="vide">Aucune dépendance à personne unique détectée.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

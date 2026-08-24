import React from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { suivisDeCoordinateur, libelleCode } from '../../utils/closingCoordination';

const CHOIX = [
  { label: 'À relancer', statut: 'Attente retour client' },
  { label: 'Calcul', statut: 'Calcul à demander' },
  { label: 'Devis', statut: 'Devis en cours' },
  { label: 'Attente client', statut: 'Attente client' },
  { label: 'Mansouri', statut: 'Attente Mansouri' },
  { label: 'Confirmé', statut: 'Confirmation' },
  { label: 'Clôturé', statut: 'Clôturé' }
];

export default function AQualifierClosing({ user }) {
  const { db, updateDB, audit } = useDB();
  const { toast } = useToast();
  const cible = user || {};

  const aQualifier = suivisDeCoordinateur(db, cible).filter(s => s.statutPipeline === 'À qualifier');

  const handleQualifier = (suivi, choix) => {
    updateDB({ ...db, suivisClosing: (db.suivisClosing || []).map(s => s.code === suivi.code ? { ...s, statutPipeline: choix.statut, dateDebutSuiviClosing: new Date().toISOString().slice(0, 10) } : s) });
    audit('Suivi Closing', 'Qualifié', suivi.code, 'statutPipeline', 'À qualifier', choix.statut);
    toast(`${libelleCode(suivi)} qualifié : ${choix.label}.`);
  };

  return (
    <div>
      <Topbar titre="À qualifier" />
      <div className="vide" style={{ textAlign: 'left', marginBottom: '14px' }}>
        Anciennes données dont l'état réel n'est pas encore connu — elles n'apparaissent pas dans « Ma journée » tant qu'elles ne sont pas qualifiées.
      </div>

      {aQualifier.length ? aQualifier.map(s => (
        <div key={s.code} className="bloc-fiche large" style={{ marginBottom: '12px' }}>
          <h4>Code {libelleCode(s)} {pill('À qualifier', 'p-ambre')}</h4>
          <p style={{ margin: '4px 0 10px' }}>Ce dossier est actuellement :</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CHOIX.map(c => (
              <button key={c.label} className="btn doux" onClick={() => handleQualifier(s, c)}>{c.label}</button>
            ))}
          </div>
        </div>
      )) : <div className="vide"><b>Rien à qualifier</b> Toutes les anciennes données ont été classées.</div>}
    </div>
  );
}

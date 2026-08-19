import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import { tachesDeUtilisateur, STATUTS_TERMINES } from '../../utils/tachesPilotage';
import { clientsDeAgent } from '../../utils/dataPipeline';
import { suivisDeCoordinateur, estSuiviOuvert, calculerObjectifsClosingJour } from '../../utils/closingCoordination';

const VIDE = { faitsImportants: '', problemes: '', besoins: '', prioriteDemain: '' };

export default function MonRapportJournalier({ user, isAdminView }) {
  const { db, updateDB, genCode, audit } = useDB();
  const { toast } = useToast();
  const cible = user || {};
  const nom = cible.nomComplet || cible.identifiant;
  const ajd = new Date().toISOString().slice(0, 10);

  const existant = (db.rapportsJournaliers || []).find(r => r.utilisateur === nom && r.date === ajd);

  const genererAuto = () => {
    const mesTaches = tachesDeUtilisateur(db, cible);
    const prevues = mesTaches.filter(t => t.datePrevue === ajd || t.echeance === ajd);
    const terminees = prevues.filter(t => STATUTS_TERMINES.includes(t.statut) && t.statut !== 'Annulée');
    const nonTerminees = prevues.filter(t => !STATUTS_TERMINES.includes(t.statut));
    const reportees = mesTaches.filter(t => t.statut === 'Reportée');
    const clientsContactes = clientsDeAgent(db, cible).filter(c => c.dernierContact === ajd).length;
    const dateAuditAjd = new Date().toLocaleDateString('fr-FR');
    const auditAujourdhui = (db.audit || []).filter(a => a.utilisateur === nom && a.date === dateAuditAjd);
    const demandesTraitees = auditAujourdhui.filter(a => a.module === 'Demandes' || a.module === 'Lignes de demande').length;
    const documentsCrees = auditAujourdhui.filter(a => a.module === 'Documents' && a.action === 'Création').length;
    const dossiers = [...new Set(mesTaches.filter(t => t.dossier).map(t => t.dossier))];
    const base = {
      tachesPrevues: prevues.length, tachesTerminees: terminees.length,
      tachesNonTerminees: nonTerminees.length, tachesReportees: reportees.length,
      clientsContactes, demandesTraitees, documentsCrees,
      dossiersTravailles: dossiers.join(', ')
    };
    // Compteurs Coordination Closing (§19) — seulement pour les coordinateurs
    // Closing, en plus des champs génériques ci-dessus, pas à la place.
    if (suivisDeCoordinateur(db, cible).length) {
      const c = calculerObjectifsClosingJour(db, cible);
      base.closingCodesSuivis = c.codesSuivis;
      base.closingClientsContactes = c.clientsContactes;
      base.closingDevisValides = c.devisValides;
      base.closingRetoursCorrection = c.retoursCorrection;
      base.closingCodesMansouri = c.codesTraitesMansouri;
      base.closingConfirmationsSemaine = c.confirmationsSemaine;
      base.closingAvancesSemaine = c.avancesSemaine;
      base.aReprendreDemain = suivisDeCoordinateur(db, cible).filter(estSuiviOuvert)
        .filter(s => s.echeanceActionSuivante && s.echeanceActionSuivante <= ajd)
        .map(s => `${s.codeSuivi} — ${s.resultatDernierContact || s.statutPipeline || 'à traiter'}`).join('\n');
    }
    return base;
  };

  const [form, setForm] = useState(() => existant || { ...genererAuto(), ...VIDE });

  useEffect(() => {
    setForm(existant || { ...genererAuto(), ...VIDE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nom]);

  const handleChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleDeposer = () => {
    const next = { ...form, utilisateur: nom, date: ajd, depose: true };
    if (existant) {
      updateDB({ ...db, rapportsJournaliers: (db.rapportsJournaliers || []).map(r => r.code === existant.code ? { ...r, ...next } : r) });
      audit('Rapports journaliers', 'Mise à jour', existant.code, 'depose', existant.depose, true);
    } else {
      const newCode = genCode('RJU');
      updateDB({ ...db, rapportsJournaliers: [{ code: newCode, ts: Date.now(), ...next }, ...(db.rapportsJournaliers || [])] });
      audit('Rapports journaliers', 'Dépôt', newCode, '—', '—', 'Rapport déposé');
    }
    setForm(next);
    toast('Rapport journalier déposé.');
  };

  return (
    <div>
      <Topbar titre={isAdminView ? `Rapport du jour — ${cible.nomComplet}` : 'Mon rapport du jour'} />

      <div className="panneau" style={{ padding: '18px 22px' }}>
        <div className="kv">
          <div><label>Tâches prévues</label><span>{form.tachesPrevues}</span></div>
          <div><label>Tâches terminées</label><span>{form.tachesTerminees}</span></div>
          <div><label>Tâches non terminées</label><span>{form.tachesNonTerminees}</span></div>
          <div><label>Tâches reportées</label><span>{form.tachesReportees}</span></div>
          <div><label>Clients contactés</label><span>{form.clientsContactes}</span></div>
          <div><label>Demandes traitées</label><span>{form.demandesTraitees}</span></div>
          <div><label>Documents créés</label><span>{form.documentsCrees}</span></div>
          <div><label>Dossiers travaillés</label><span>{form.dossiersTravailles || '—'}</span></div>
        </div>
      </div>

      {form.closingCodesSuivis !== undefined && (
        <div className="panneau" style={{ padding: '18px 22px', marginTop: '14px' }}>
          <h4 style={{ marginTop: 0 }}>Coordination Closing</h4>
          <div className="kv">
            <div><label>Codes suivis</label><span>{form.closingCodesSuivis}</span></div>
            <div><label>Clients contactés</label><span>{form.closingClientsContactes}</span></div>
            <div><label>Devis validés</label><span>{form.closingDevisValides}</span></div>
            <div><label>Retours correction</label><span>{form.closingRetoursCorrection}</span></div>
            <div><label>Codes traités avec Mansouri</label><span>{form.closingCodesMansouri}</span></div>
            <div><label>Confirmations (semaine)</label><span>{form.closingConfirmationsSemaine}</span></div>
            <div><label>Avances obtenues (semaine)</label><span>{form.closingAvancesSemaine}</span></div>
          </div>
        </div>
      )}

      <div className="panneau mb-lg" style={{ marginTop: '14px' }}>
        <div className="corps">
          <div className="champ large"><label>Faits importants</label><textarea value={form.faitsImportants} onChange={e => handleChange('faitsImportants', e.target.value)} /></div>
          <div className="champ large"><label>Problèmes rencontrés</label><textarea value={form.problemes} onChange={e => handleChange('problemes', e.target.value)} /></div>
          <div className="champ"><label>Besoins</label><textarea value={form.besoins} onChange={e => handleChange('besoins', e.target.value)} /></div>
          <div className="champ"><label>Priorité de demain</label><textarea value={form.prioriteDemain} onChange={e => handleChange('prioriteDemain', e.target.value)} /></div>
          {form.aReprendreDemain !== undefined && (
            <div className="champ large"><label>À reprendre demain (codes Closing)</label><textarea readOnly value={form.aReprendreDemain || 'Aucun'} /></div>
          )}
          <div className="champ large">
            <label>Observation Direction</label>
            {isAdminView ? (
              <textarea value={form.observationDirection || ''} onChange={e => handleChange('observationDirection', e.target.value)} placeholder="Visible par la collaboratrice, non modifiable par elle." />
            ) : (
              <textarea readOnly value={form.observationDirection || 'Aucune observation pour l\'instant.'} />
            )}
          </div>
        </div>
      </div>

      <div className="outils">
        <button className="btn or" onClick={handleDeposer}>{isAdminView ? "Enregistrer l'observation" : (form.depose ? 'Mettre à jour mon rapport' : 'Déposer mon rapport journalier')}</button>
      </div>
    </div>
  );
}

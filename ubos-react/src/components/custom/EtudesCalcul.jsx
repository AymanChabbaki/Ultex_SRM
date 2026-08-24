import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { pill, pillStatut } from '../../utils/format';
import { PERS_ET_SERVICES } from '../../data/permissions';
import { MOTIFS_RETOUR_CALCUL, NIVEAUX_CONFIANCE_HS } from '../../data/constants';

const SECTIONS = [
  { id: 'aCalculer', label: 'À calculer', filtre: t => t.statut === 'À faire' },
  { id: 'enCours', label: 'En cours', filtre: t => t.statut === 'En cours' },
  { id: 'aControler', label: 'À contrôler', filtre: t => t.statut === 'Terminée — En attente de validation' },
  { id: 'corrections', label: 'Corrections', filtre: t => t.correctionDemandee && t.statut !== 'Terminée' },
  { id: 'valides', label: 'Validés', filtre: t => t.statut === 'Terminée' },
  { id: 'enRetard', label: 'En retard', filtre: t => t.echeance && new Date(t.echeance) < new Date(new Date().toDateString()) && t.statut !== 'Terminée' }
];

export default function EtudesCalcul() {
  const { db, updateDB, audit, notifier } = useDB();
  const { toast } = useToast();
  const [onglet, setOnglet] = useState('aCalculer');
  const [tacheOuverte, setTacheOuverte] = useState(null);
  const [panneau, setPanneau] = useState(null);
  const [nouvelAffecte, setNouvelAffecte] = useState('');
  const [motifRetour, setMotifRetour] = useState(MOTIFS_RETOUR_CALCUL[0]);
  const [hsForm, setHsForm] = useState({});

  const taches = (db.taches || []).filter(t => t.type === 'Calcul & Chiffrage' && t.statut !== 'Annulée');
  const active = SECTIONS.find(s => s.id === onglet);
  const liste = taches.filter(active.filtre);

  const majTache = (code, patch, action, avant, apres) => {
    updateDB({ ...db, taches: (db.taches || []).map(t => t.code === code ? { ...t, ...patch } : t) });
    if (action) audit('Études & Calcul', action, code, '—', avant ?? '—', apres ?? '—');
  };

  const fermer = () => { setTacheOuverte(null); setPanneau(null); setNouvelAffecte(''); setHsForm({}); };

  const handleAffecter = () => {
    if (!nouvelAffecte) return;
    majTache(tacheOuverte.code, { assigne: nouvelAffecte }, 'Affecté', tacheOuverte.assigne, nouvelAffecte);
    notifier(nouvelAffecte, `Calcul affecté — ${tacheOuverte.titre}\nLien : #ficheTache:${tacheOuverte.code}`, 'Études & Calcul');
    toast(`Affecté à ${nouvelAffecte}.`);
    fermer();
  };

  const handleValider = (t) => {
    majTache(t.code, { statut: 'Terminée', correctionDemandee: false }, 'Validé', t.statut, 'Terminée');
    if (t.par) notifier(t.par, `Calcul validé — ${t.titre}\nLien : #ficheTache:${t.code}`, 'Études & Calcul');
    toast('Calcul validé.');
    fermer();
  };

  const handleRetourner = () => {
    majTache(tacheOuverte.code, { statut: 'À faire', correctionDemandee: true, motifRetour }, 'Retourné', tacheOuverte.statut, `À revoir (${motifRetour})`);
    notifier(tacheOuverte.assigne, `Correction demandée — ${tacheOuverte.titre}\nMotif : ${motifRetour}\nLien : #ficheTache:${tacheOuverte.code}`, 'Études & Calcul');
    toast('Retourné pour correction.');
    fermer();
  };

  const handleDemanderExplication = () => {
    audit('Études & Calcul', 'Explication demandée', tacheOuverte.code, '—', '—', '—');
    notifier(tacheOuverte.assigne, `Explication demandée — ${tacheOuverte.titre}\nLien : #ficheTache:${tacheOuverte.code}`, 'Études & Calcul');
    toast('Explication demandée.');
    fermer();
  };

  const ouvrirControle = (t) => { setNouvelAffecte(t.assigne || ''); setTacheOuverte(t); setPanneau('controler'); };

  const ouvrirHS = (t) => {
    setHsForm({
      hs: t.positionTarifaireHS || '', designation: t.positionTarifaireDesignation || '',
      source: t.positionTarifaireSource || '', justification: t.positionTarifaireJustification || '',
      niveau: t.niveauConfianceHS || 'À confirmer'
    });
    setTacheOuverte(t);
    setPanneau('hs');
  };

  const handleValiderHS = () => {
    majTache(tacheOuverte.code, {
      positionTarifaireHS: hsForm.hs, positionTarifaireDesignation: hsForm.designation,
      positionTarifaireSource: hsForm.source, positionTarifaireJustification: hsForm.justification,
      niveauConfianceHS: hsForm.niveau
    }, 'Position tarifaire validée', '—', hsForm.hs);
    toast('Position tarifaire enregistrée.');
    fermer();
  };

  return (
    <div>
      <Topbar titre="Études & Calcul" />

      <div className="outils">
        {SECTIONS.map(s => (
          <button key={s.id} className={`btn mini ${onglet === s.id ? 'or' : 'doux'}`} onClick={() => setOnglet(s.id)}>
            {s.label} {pill(taches.filter(s.filtre).length, s.id === 'enRetard' ? 'p-rouge' : 'p-gris')}
          </button>
        ))}
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Code</th><th>Titre</th><th>Calculateur</th><th>Reçu à</th><th>Échéance</th><th>Statut</th><th>Position tarifaire</th><th></th></tr></thead>
            <tbody>
              {liste.length ? liste.map(t => (
                <tr key={t.code}>
                  <td className="code"><a href={`#ficheTache:${t.code}`}>{t.code}</a></td>
                  <td>{t.titre}</td>
                  <td>{t.assigne || '—'}</td>
                  <td>{t.datePrevue || t.echeance || '—'}</td>
                  <td>{t.echeance || '—'}</td>
                  <td>{pillStatut(t.statut)}</td>
                  <td>{t.positionTarifaireHS ? `${t.positionTarifaireHS} ${pill(t.niveauConfianceHS || 'À confirmer', t.niveauConfianceHS === 'Élevé' ? 'p-vert' : t.niveauConfianceHS === 'Faible' ? 'p-rouge' : 'p-ambre')}` : '—'}</td>
                  <td>
                    <button className="btn mini doux" onClick={() => ouvrirControle(t)}>Contrôler</button>{' '}
                    <button className="btn mini doux" onClick={() => ouvrirHS(t)}>Position HS</button>{' '}
                    {t.statut === 'Terminée — En attente de validation' && <button className="btn mini vert" onClick={() => handleValider(t)}>Valider</button>}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="8"><div className="vide">Rien dans cette catégorie.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {panneau === 'controler' && tacheOuverte && (
        <Modal title={`Contrôler — ${tacheOuverte.titre}`} onClose={fermer} large footer={
          <>
            <button className="btn doux" onClick={fermer}>Fermer</button>
            <button className="btn doux" onClick={handleDemanderExplication}>DEMANDER EXPLICATION</button>
            <button className="btn rouge" onClick={handleRetourner}>RETOURNER</button>
            <button className="btn vert" onClick={() => handleValider(tacheOuverte)}>VALIDER</button>
          </>
        }>
          <div className="corps">
            <div className="champ large"><label>Affecter à</label>
              <select value={nouvelAffecte} onChange={e => setNouvelAffecte(e.target.value)}>
                <option value="">—</option>
                {PERS_ET_SERVICES(db).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="btn mini" style={{ marginTop: '6px' }} onClick={handleAffecter}>Affecter</button>
            </div>
            <div className="champ large"><label>Motif si retourné</label>
              <select value={motifRetour} onChange={e => setMotifRetour(e.target.value)}>
                {MOTIFS_RETOUR_CALCUL.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {panneau === 'hs' && tacheOuverte && (
        <Modal title="Position tarifaire" onClose={fermer} footer={
          <><button className="btn doux" onClick={fermer}>Annuler</button><button className="btn or" onClick={handleValiderHS}>Valider HS</button></>
        }>
          <div className="corps">
            <div className="champ"><label>HS proposé</label><input value={hsForm.hs} onChange={e => setHsForm(prev => ({ ...prev, hs: e.target.value }))} placeholder="Ex. 84371000" /></div>
            <div className="champ"><label>Niveau de confiance</label>
              <select value={hsForm.niveau} onChange={e => setHsForm(prev => ({ ...prev, niveau: e.target.value }))}>
                {NIVEAUX_CONFIANCE_HS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="champ large"><label>Désignation</label><input value={hsForm.designation} onChange={e => setHsForm(prev => ({ ...prev, designation: e.target.value }))} /></div>
            <div className="champ large"><label>Source</label><input value={hsForm.source} onChange={e => setHsForm(prev => ({ ...prev, source: e.target.value }))} /></div>
            <div className="champ large"><label>Justification</label><textarea value={hsForm.justification} onChange={e => setHsForm(prev => ({ ...prev, justification: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

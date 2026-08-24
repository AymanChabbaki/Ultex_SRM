import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import StatCard from '../common/StatCard';
import { pill } from '../../utils/format';
import { genererProgrammeClosing, genererAlertesClosing, suivisDeCoordinateur, estSuiviOuvert, calculerObjectifsClosingJour } from '../../utils/closingCoordination';

const BLOCS_HORAIRE = [
  { debut: 9, fin: 11, titre: '09h–11h — Préparation & Relances', desc: 'Codes à traiter, WhatsApp, clients à relancer, calculs à lancer.' },
  { debut: 11, fin: 13, titre: '11h–13h — Contrôle des devis', desc: 'Vérifier les devis terminés et la position tarifaire.', lien: '#devisAControler', libelleLien: 'Ouvrir les devis à contrôler' },
  { debut: 14, fin: 18, titre: '14h–18h — Coordination avec Mansouri', desc: 'Suivre chaque dossier jusqu\'à confirmation.', lien: '#coordinationMansouri', libelleLien: 'Ouvrir la coordination Mansouri' }
];

export default function MaJourneeClosing({ user }) {
  const { db, updateDB, genCode, audit, userCourant } = useDB();
  const { toast } = useToast();
  const cible = user || {};
  const [showAjouter, setShowAjouter] = useState(false);
  const [nouveauCode, setNouveauCode] = useState('');

  const suivis = suivisDeCoordinateur(db, cible);
  const suivisOuverts = suivis.filter(estSuiviOuvert);
  const programme = genererProgrammeClosing(db, cible);
  const alertes = genererAlertesClosing(db, cible);
  const resume = calculerObjectifsClosingJour(db, cible);

  const relances = suivisOuverts.filter(s => s.echeanceActionSuivante && new Date(s.echeanceActionSuivante) <= new Date(new Date().toDateString())).length;
  const devisAControler = suivisOuverts.filter(s => s.statutDevis === 'À contrôler').length;
  const attenteMansouri = suivisOuverts.filter(s => s.responsableActionActuelle === 'Mansouri').length;
  const retards = programme.filter(p => p.priorite === 'Retard').length;

  const heureActuelle = new Date().getHours();

  const handleAjouter = () => {
    const codeSuivi = nouveauCode.trim();
    if (!codeSuivi) { toast('Entrez un code.'); return; }
    const existant = (db.suivisClosing || []).find(s => s.codeSuivi === codeSuivi && estSuiviOuvert(s));
    if (existant) {
      toast(`Un suivi existe déjà pour le code ${codeSuivi}.`);
      window.location.hash = `#ficheSuiviClosing:${existant.code}`;
      setShowAjouter(false);
      setNouveauCode('');
      return;
    }
    const code = genCode('SVC');
    const suivi = { code, codeSuivi, statutPipeline: 'Nouveau', coordinateur: userCourant, memoire: [], par: userCourant, ts: Date.now() };
    updateDB({ ...db, suivisClosing: [suivi, ...(db.suivisClosing || [])] });
    audit('Suivi Closing', 'Création (suivi provisoire)', code, '—', '—', codeSuivi);
    toast(`Suivi provisoire ${codeSuivi} créé.`);
    setShowAjouter(false);
    setNouveauCode('');
    window.location.hash = `#ficheSuiviClosing:${code}`;
  };

  return (
    <div>
      <Topbar titre={`Bonjour ${(cible.nomComplet || 'Zoubida').split(' ')[0]} — Programme du ${new Date().toLocaleDateString('fr-FR')}`} />

      <div className="outils">
        <span className="spacer"></span>
        <button className="btn or gros" style={{ flex: 'none' }} onClick={() => setShowAjouter(true)}>➕ Ajouter un code à mon suivi</button>
      </div>

      <div className="stats">
        <StatCard label="À faire aujourd'hui" value={programme.length} />
        <StatCard label="À relancer" value={relances} />
        <StatCard label="Devis à contrôler" value={devisAControler} />
        <StatCard label="Attente Mansouri" value={attenteMansouri} />
        <StatCard label="Retards" value={retards} alerte={retards > 0} />
      </div>

      {programme.length > 0 && (
        <div className="bloc-fiche large">
          <h4>UBOS vous recommande de commencer par :</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {programme.slice(0, 3).map((item, i) => (
              <div key={item.code} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--bord)' : 'none' }}>
                <b style={{ color: 'var(--gris)' }}>{i + 1}.</b>
                <span style={{ flex: 1 }}>CODE {item.codeSuivi} — {item.actionAujourdhui}</span>
                <a className="btn mini or" href={item.lien}>TRAITER</a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="vide" style={{ textAlign: 'left' }}>
        <b>Aujourd'hui</b> {resume.clientsContactes} client(s) contacté(s) · {resume.devisValides} devis validé(s) · {resume.codesTraitesMansouri} code(s) traité(s) avec Mansouri
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Code</th><th>Situation</th><th>Action recommandée</th><th>Dernier contact</th><th>Prochaine échéance</th><th>Priorité</th><th></th></tr></thead>
            <tbody>
              {programme.length ? programme.map(item => (
                <tr key={item.code}>
                  <td className="code">{item.codeSuivi}</td>
                  <td>{item.situation}</td>
                  <td>{item.actionAujourdhui}</td>
                  <td>{item.dernierContact}</td>
                  <td>{item.echeance}</td>
                  <td>{pill(item.priorite, item.pill)}</td>
                  <td><a className="btn mini or" href={item.lien}>TRAITER</a></td>
                </tr>
              )) : (
                <tr><td colSpan="7"><div className="vide"><b>Rien à traiter</b> Aucun code en attente d'action aujourd'hui.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bloc-fiche large">
        <h4>Clients à activer aujourd'hui</h4>
        {alertes.length ? alertes.map((a, i) => (
          <div key={i} style={{ marginBottom: '10px' }}>
            <b>{a.titre}</b> {pill(a.suivis.length, 'p-rouge')}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              {a.suivis.map(s => <a key={s.code} className="pill p-gris" href={`#ficheSuiviClosing:${s.code}`}>{s.codeSuivi}</a>)}
            </div>
          </div>
        )) : <div className="vide">Aucune alerte pour l'instant — bonne mémoire, UBOS surveille.</div>}
      </div>

      {BLOCS_HORAIRE.map(b => {
        const actif = heureActuelle >= b.debut && heureActuelle < b.fin;
        return (
          <div key={b.titre} className="bloc-fiche large" style={actif ? { border: '2px solid var(--or)' } : undefined}>
            <h4>{b.titre} {actif && pill('En cours', 'p-or')}</h4>
            <p style={{ margin: '4px 0 8px', color: 'var(--gris)' }}>{b.desc}</p>
            {b.lien && <a className="btn doux" href={b.lien}>{b.libelleLien}</a>}
          </div>
        );
      })}

      {showAjouter && (
        <Modal title="Ajouter un code à mon suivi" onClose={() => setShowAjouter(false)} footer={
          <><button className="btn doux" onClick={() => setShowAjouter(false)}>Annuler</button><button className="btn or" onClick={handleAjouter}>Ajouter</button></>
        }>
          <div className="corps">
            <div className="champ large">
              <label>Code client</label>
              <input autoFocus value={nouveauCode} onChange={e => setNouveauCode(e.target.value)} placeholder="Ex. 8477" onKeyDown={e => e.key === 'Enter' && handleAjouter()} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

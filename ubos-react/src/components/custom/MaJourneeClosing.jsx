import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { pill } from '../../utils/format';
import {
  genererProgrammeClosing, genererAlertesClosing, suivisDeCoordinateur, estSuiviOuvert, estQualifie,
  calculerObjectifsClosingJour, libelleCode, trouverClientExistant, genererCodeDossierSuivant
} from '../../utils/closingCoordination';

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
  const [conflit, setConflit] = useState(null);
  const [filtreActif, setFiltreActif] = useState(null);

  const auj = new Date(new Date().toDateString());
  const suivis = suivisDeCoordinateur(db, cible);
  const aQualifier = suivis.filter(s => !s.archive && s.statutPipeline === 'À qualifier');
  const suivisOuverts = suivis.filter(estSuiviOuvert).filter(estQualifie);
  const programme = genererProgrammeClosing(db, cible);
  const alertes = genererAlertesClosing(db, cible);
  const resume = calculerObjectifsClosingJour(db, cible);

  const suivisARelancer = suivisOuverts.filter(s => s.echeanceActionSuivante && new Date(s.echeanceActionSuivante) <= auj);
  const suivisDevis = suivisOuverts.filter(s => s.statutDevis === 'À contrôler');
  const suivisMansouri = suivisOuverts.filter(s => s.responsableActionActuelle === 'Mansouri');
  const suivisRetard = suivisOuverts.filter(s => s.echeanceActionSuivante && new Date(s.echeanceActionSuivante) < auj);

  const heureActuelle = new Date().getHours();

  const CARTES = [
    { id: 'traiter', label: "À faire aujourd'hui", liste: programme.map(p => suivis.find(s => s.code === p.code)).filter(Boolean) },
    { id: 'relancer', label: 'À relancer', liste: suivisARelancer },
    { id: 'devis', label: 'Devis à contrôler', liste: suivisDevis },
    { id: 'mansouri', label: 'Attente Mansouri', liste: suivisMansouri },
    { id: 'retards', label: 'Retards', liste: suivisRetard, alerte: true }
  ];
  const carteActive = CARTES.find(c => c.id === filtreActif);

  const handleAjouter = () => {
    const codeSaisi = nouveauCode.trim();
    if (!codeSaisi) { toast('Entrez un code.'); return; }
    const existant = trouverClientExistant(db, codeSaisi);
    if (existant) { setConflit(existant); return; }
    creerNouveauClient(codeSaisi);
  };

  const creerNouveauClient = (codeSaisi) => {
    const code = genCode('SVC');
    const suivi = {
      code, codeClient: codeSaisi, codeDossier: codeSaisi, codeSuivi: codeSaisi,
      statutPipeline: 'Nouveau', coordinateur: userCourant, memoire: [], par: userCourant, ts: Date.now()
    };
    updateDB({ ...db, suivisClosing: [suivi, ...(db.suivisClosing || [])] });
    audit('Suivi Closing', 'Création (suivi provisoire)', code, '—', '—', codeSaisi);
    toast(`Suivi provisoire ${codeSaisi} créé.`);
    fermerAjout();
    window.location.hash = `#ficheSuiviClosing:${code}`;
  };

  const handleAjouterNouveauDossier = () => {
    const codeDossier = genererCodeDossierSuivant(db, conflit.codeClient);
    const code = genCode('SVC');
    const suivi = {
      code, codeClient: conflit.codeClient, codeDossier, codeSuivi: codeDossier,
      statutPipeline: 'Nouveau', coordinateur: conflit.coordinateur, memoire: [], par: userCourant, ts: Date.now()
    };
    updateDB({ ...db, suivisClosing: [suivi, ...(db.suivisClosing || [])] });
    audit('Suivi Closing', 'Création (nouveau dossier)', code, '—', '—', codeDossier);
    toast(`Dossier ${codeDossier} créé.`);
    fermerAjout();
    window.location.hash = `#ficheSuiviClosing:${code}`;
  };

  const fermerAjout = () => { setShowAjouter(false); setNouveauCode(''); setConflit(null); };

  return (
    <div>
      <Topbar titre={`Bonjour ${(cible.nomComplet || 'Zoubida').split(' ')[0]} — Programme du ${new Date().toLocaleDateString('fr-FR')}`} />

      {aQualifier.length > 0 && (
        <div className="vide" style={{ textAlign: 'left', marginBottom: '14px', background: 'var(--fond-jaune)' }}>
          <b>{aQualifier.length} code(s) à qualifier</b> — présents dans votre suivi mais pas encore classés (rien n'est perdu, ils n'apparaissent juste pas encore ici tant qu'ils ne sont pas qualifiés).{' '}
          <a href="#aQualifierClosing">Les qualifier maintenant</a> · <a href="#monPortefeuilleClosing">Voir tout mon portefeuille</a>
        </div>
      )}

      <div className="outils">
        <span className="spacer"></span>
        <button className="btn or gros" style={{ flex: 'none' }} onClick={() => setShowAjouter(true)}>➕ Ajouter un code à mon suivi</button>
      </div>

      <div className="stats">
        {CARTES.map(c => (
          <div key={c.id} onClick={() => setFiltreActif(filtreActif === c.id ? null : c.id)} style={{ cursor: 'pointer' }}>
            <div className={`stat-card-modern ${filtreActif === c.id ? 'alerte-border' : ''}`}>
              <div className="stat-card-top">
                <span className="stat-label">{c.label}</span>
                {c.alerte && c.liste.length > 0 ? <span className="stat-badge alert">Attention</span> : <span className="stat-badge active">Actif</span>}
              </div>
              <div className="stat-card-val-wrap"><span className="stat-val">{c.liste.length}</span></div>
              <div className="stat-card-bar"></div>
            </div>
          </div>
        ))}
      </div>

      {carteActive && (
        <div className="panneau">
          <div className="outils">
            <b>{carteActive.label}</b>
            <span className="spacer"></span>
            <button className="btn mini doux" onClick={() => setFiltreActif(null)}>✕ Retirer le filtre</button>
          </div>
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Situation</th>
                  {filtreActif === 'retards' ? <><th>Retard depuis</th><th>Responsable</th></> : <><th>Dernier contact</th><th>Prochaine échéance</th></>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {carteActive.liste.length ? carteActive.liste.map(s => (
                  <tr key={s.code}>
                    <td className="code">{libelleCode(s)}</td>
                    <td>{s.situationActuelle || s.statutPipeline || 'Nouveau'}</td>
                    {filtreActif === 'retards' ? (
                      <>
                        <td>{Math.floor((auj - new Date(s.echeanceActionSuivante)) / 864e5)} j</td>
                        <td>{s.responsableActionActuelle || s.coordinateur}</td>
                      </>
                    ) : (
                      <>
                        <td>{s.dernierContact || '—'}</td>
                        <td>{s.echeanceActionSuivante || '—'}</td>
                      </>
                    )}
                    <td><a className="btn mini or" href={`#ficheSuiviClosing:${s.code}`}>TRAITER</a></td>
                  </tr>
                )) : (
                  <tr><td colSpan="5"><div className="vide">Rien dans cette catégorie.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              {a.suivis.map(s => <a key={s.code} className="pill p-gris" href={`#ficheSuiviClosing:${s.code}`}>{libelleCode(s)}</a>)}
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
        <Modal title="Ajouter un code à mon suivi" onClose={fermerAjout} footer={
          conflit ? (
            <><button className="btn doux" onClick={fermerAjout}>Annuler</button></>
          ) : (
            <><button className="btn doux" onClick={fermerAjout}>Annuler</button><button className="btn or" onClick={handleAjouter}>Ajouter</button></>
          )
        }>
          {conflit ? (
            <div className="corps">
              <p style={{ gridColumn: '1/-1' }}>Le client <b>{conflit.codeClient}</b> existe déjà.</p>
              <div className="champ large" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a className="btn or" href={`#ficheClientClosing:${conflit.codeClient}`}>Ouvrir le client</a>
                <button className="btn doux" onClick={handleAjouterNouveauDossier}>Ajouter un nouveau dossier</button>
                <button className="btn doux" onClick={fermerAjout}>Annuler</button>
              </div>
            </div>
          ) : (
            <div className="corps">
              <div className="champ large">
                <label>Code client</label>
                <input autoFocus value={nouveauCode} onChange={e => setNouveauCode(e.target.value)} placeholder="Ex. 8477" onKeyDown={e => e.key === 'Enter' && handleAjouter()} />
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

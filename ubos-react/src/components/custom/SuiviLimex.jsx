import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import InstructionLimexModal from './InstructionLimexModal';
import { pill, pillStatut } from '../../utils/format';
import {
  suivisLimexDeCoordinateur, estSuiviLimexOuvert, actionsDuSuivi, estActionOuverte,
  calculerPrioriteAction, calculerEtatGlobal, pillEtatGlobal, normaliserCodeLimex
} from '../../utils/limexCoordination';

const FILTRES = ["Aujourd'hui", 'Urgents', 'En retard', 'Attente retour', 'Bloqués', 'Paiement', 'Tous'];

export default function SuiviLimex({ user }) {
  const { db } = useDB();
  const cible = user || {};
  const [filtre, setFiltre] = useState('Tous');
  const [recherche, setRecherche] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);

  const auj = new Date(new Date().toDateString());
  const tous = suivisLimexDeCoordinateur(db, cible).filter(estSuiviLimexOuvert);

  const enrichis = useMemo(() => tous.map(s => {
    const actions = actionsDuSuivi(db, s.code);
    const ouvertes = actions.filter(estActionOuverte);
    const enRetard = ouvertes.some(a => calculerPrioriteAction(a).tag === 'Retard');
    const urgent = ouvertes.some(a => ['Critique', 'Urgente'].includes(a.priorite));
    const attenteRetour = ouvertes.some(a => ['Attente fournisseur', 'Attente collègue'].includes(a.statut));
    const bloque = (s.blocages || []).some(b => b.actif) || ouvertes.some(a => a.statut === 'Bloqué');
    const paiementLie = (db.paiements || []).some(p => p.codeReference === s.codeReference && !['Payé', 'Annulé'].includes(p.statut));
    const auj2 = ouvertes.some(a => a.echeance && new Date(a.echeance).getTime() === auj.getTime());
    return { suivi: s, actions, ouvertes, enRetard, urgent, attenteRetour, bloque, paiementLie, auj: auj2 };
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [tous, db]);

  const filtres = useMemo(() => {
    let base;
    switch (filtre) {
      case "Aujourd'hui": base = enrichis.filter(e => e.auj); break;
      case 'Urgents': base = enrichis.filter(e => e.urgent); break;
      case 'En retard': base = enrichis.filter(e => e.enRetard); break;
      case 'Attente retour': base = enrichis.filter(e => e.attenteRetour); break;
      case 'Bloqués': base = enrichis.filter(e => e.bloque); break;
      case 'Paiement': base = enrichis.filter(e => e.paiementLie); break;
      default: base = enrichis;
    }
    if (recherche.trim()) {
      const q = normaliserCodeLimex(recherche);
      base = base.filter(e => normaliserCodeLimex(e.suivi.codeReference).includes(q));
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre, enrichis, recherche]);

  return (
    <div>
      <Topbar titre="Suivi LIMEX" />

      <div className="outils">
        <input type="search" placeholder="Rechercher un code…" value={recherche} onChange={e => setRecherche(e.target.value)} style={{ maxWidth: '260px' }} />
        <span className="spacer" style={{ color: 'var(--gris)' }}>{filtres.length} dossier(s)</span>
        <button className="btn doux" onClick={() => setShowInstruction(true)}>+ Instruction LIMEX</button>
      </div>

      <div className="outils">
        {FILTRES.map(f => (
          <button key={f} className={`btn mini ${filtre === f ? 'or' : 'doux'}`} onClick={() => setFiltre(f)}>{f}</button>
        ))}
      </div>

      {filtres.length ? filtres.map(({ suivi, ouvertes }) => {
        const etat = calculerEtatGlobal(actionsDuSuivi(db, suivi.code));
        return (
          <div key={suivi.code} className="bloc-fiche large" style={{ marginBottom: '12px' }}>
            <h4>
              CODE {suivi.codeReference}
              <span style={{ float: 'right' }}>{pill(etat, pillEtatGlobal(etat))}</span>
            </h4>
            <div className="kv">
              <div><label>Coordination</label><span>{suivi.coordinateur}</span></div>
              <div><label>Exécutant principal</label><span>{suivi.executantPrincipal || '—'}</span></div>
              <div><label>Dernière actualité</label><span>{suivi.derniereActualite || '—'}</span></div>
              <div><label>Prochaine vérification</label><span>{suivi.prochaineVerification || '—'}</span></div>
            </div>
            {ouvertes.length > 0 && (
              <div className="defile" style={{ marginTop: '10px' }}>
                <table>
                  <thead><tr><th>Point</th><th>Responsable</th><th>Statut</th></tr></thead>
                  <tbody>
                    {ouvertes.slice(0, 6).map(a => (
                      <tr key={a.code}>
                        <td>{a.libelle}</td>
                        <td>{a.responsable}</td>
                        <td>{pillStatut(a.statut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <a className="btn mini or" style={{ marginTop: '10px', display: 'inline-block' }} href={`#ficheSuiviLimex:${suivi.code}`}>Ouvrir le dossier</a>
          </div>
        );
      }) : <div className="vide"><b>Rien ici</b> Aucun dossier ne correspond à ce filtre.</div>}

      {showInstruction && <InstructionLimexModal onClose={() => setShowInstruction(false)} />}
    </div>
  );
}

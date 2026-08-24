import React from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import { pillStatut } from '../../utils/format';
import { dossiersDuClient, genererCodeDossierSuivant } from '../../utils/closingCoordination';

export default function FicheClientClosing({ codeProp, code: codeFromProp }) {
  const { db, updateDB, genCode, audit, userCourant } = useDB();
  const { toast } = useToast();
  const codeClient = codeProp || codeFromProp || (window.location.hash.startsWith('#ficheClientClosing:') ? window.location.hash.split(':')[1] : '');

  const dossiers = dossiersDuClient(db, codeClient);

  if (!dossiers.length) {
    return (
      <div>
        <Topbar titre="Client Closing" />
        <div className="panneau"><div className="vide"><b>Client introuvable</b> {codeClient ? `(${codeClient})` : ''}</div></div>
      </div>
    );
  }

  const premier = dossiers[0];
  const memoireAgregee = dossiers
    .flatMap(d => (d.memoire || []).map(m => ({ ...m, dossier: d.codeDossier })))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const handleAjouterDossier = () => {
    const codeDossier = genererCodeDossierSuivant(db, codeClient);
    const code = genCode('SVC');
    const suivi = {
      code, codeClient, codeDossier, codeSuivi: codeDossier, statutPipeline: 'Nouveau',
      coordinateur: premier.coordinateur, memoire: [], par: userCourant, ts: Date.now()
    };
    updateDB({ ...db, suivisClosing: [suivi, ...(db.suivisClosing || [])] });
    audit('Suivi Closing', 'Création (nouveau dossier)', code, '—', '—', codeDossier);
    toast(`Dossier ${codeDossier} créé pour le client ${codeClient}.`);
    window.location.hash = `#ficheSuiviClosing:${code}`;
  };

  return (
    <div>
      <Topbar titre={`Client ${codeClient}`} />

      <div className="outils">
        <span className="pill p-or" style={{ fontSize: '14px', padding: '6px 14px' }}>{codeClient}</span>
        <span className="spacer" style={{ color: 'var(--gris)' }}>{dossiers.length} dossier(s)</span>
        <button className="btn or" onClick={handleAjouterDossier}>+ Ajouter un dossier</button>
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Dossier</th><th>Produit</th><th>Statut</th><th>Dernier contact</th><th></th></tr></thead>
            <tbody>
              {dossiers.map(d => (
                <tr key={d.code}>
                  <td className="code">{d.codeDossier}</td>
                  <td>{d.produit || '—'}</td>
                  <td>{pillStatut(d.statutPipeline)}</td>
                  <td>{d.dernierContact || '—'}</td>
                  <td><a className="btn mini or" href={`#ficheSuiviClosing:${d.code}`}>Ouvrir</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bloc-fiche large">
        <h4>Mémoire du client (tous dossiers confondus)</h4>
        {memoireAgregee.length ? (
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {memoireAgregee.map((m, i) => <li key={i}><b>{m.date}</b> ({m.dossier}) — {m.texte} <span style={{ color: 'var(--gris)' }}>({m.auteur})</span></li>)}
          </ul>
        ) : <div className="vide">Aucune note pour l'instant.</div>}
      </div>
    </div>
  );
}

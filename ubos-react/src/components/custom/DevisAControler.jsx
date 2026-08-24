import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { suivisDeCoordinateur, calculerPrioriteSuivi, libelleCode } from '../../utils/closingCoordination';

const ONGLETS = ['Tous', 'Nouveaux', 'Urgents', 'Retournés'];

export default function DevisAControler({ user }) {
  const { db } = useDB();
  const cible = user || {};
  const [onglet, setOnglet] = useState('Tous');

  const aControler = suivisDeCoordinateur(db, cible).filter(s => s.statutDevis === 'À contrôler');
  const nouveaux = aControler.filter(s => !s.motifRevoir);
  const retournes = aControler.filter(s => s.motifRevoir);
  const urgents = aControler.filter(s => ['Retard', "Aujourd'hui"].includes(calculerPrioriteSuivi(s).tag));

  const affiches = useMemo(() => {
    switch (onglet) {
      case 'Nouveaux': return nouveaux;
      case 'Urgents': return urgents;
      case 'Retournés': return retournes;
      default: return aControler;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, aControler]);

  return (
    <div>
      <Topbar titre="Devis à contrôler" />

      <div className="outils">
        {ONGLETS.map(o => (
          <button key={o} className={`btn mini ${onglet === o ? 'or' : 'doux'}`} onClick={() => setOnglet(o)}>
            {o} {o === 'Tous' ? pill(aControler.length, 'p-gris') : o === 'Nouveaux' ? pill(nouveaux.length, 'p-gris') : o === 'Urgents' ? pill(urgents.length, urgents.length ? 'p-rouge' : 'p-gris') : pill(retournes.length, 'p-gris')}
          </button>
        ))}
      </div>

      <div className="panneau">
        {affiches.length ? affiches.map(s => (
          <div key={s.code} className="bloc-fiche large" style={{ marginBottom: '12px' }}>
            <h4>
              Code {libelleCode(s)}
              {s.motifRevoir && <span style={{ float: 'right' }}>{pill('Retourné', 'p-ambre')}</span>}
            </h4>
            <div className="kv">
              <div><label>Position tarifaire</label><span>{s.hsCodePropose || 'Non renseignée'}</span></div>
              <div><label>Calcul terminé</label><span>{s.calculTermineHeure || '—'}</span></div>
            </div>
            <a className="btn mini or" style={{ marginTop: '10px', display: 'inline-block' }} href={`#ficheSuiviClosing:${s.code}`}>CONTRÔLER</a>
          </div>
        )) : <div className="vide"><b>Rien à contrôler</b> Aucun devis en attente de vérification.</div>}
      </div>
    </div>
  );
}

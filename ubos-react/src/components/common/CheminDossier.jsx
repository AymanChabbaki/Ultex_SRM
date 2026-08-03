import React from 'react';
import { ETAPES } from '../../data/constants';

export default function CheminDossier({ dossier, etapeStr, compte, titre = "Le chemin du dossier ULTEx" }) {
  const currentEtape = dossier ? dossier.etape : etapeStr;
  const currentIndex = currentEtape ? ETAPES.indexOf(currentEtape) : -1;
  const listEtapes = ETAPES.slice(0, ETAPES.length - 1);

  return (
    <div className="chemin">
      {titre && <h3>{titre}</h3>}
      <div className="ligne">
        {listEtapes.map((e, i) => {
          let count = 0;
          let isActif = false;

          if (compte) {
            count = compte[e] || 0;
            isActif = count > 0;
          } else if (currentIndex >= 0) {
            isActif = i <= currentIndex;
          }

          return (
            <div key={e} className={`pas ${isActif ? "actif" : ""}`}>
              <div className="pt">{count || i + 1}</div>
              <small>{e}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

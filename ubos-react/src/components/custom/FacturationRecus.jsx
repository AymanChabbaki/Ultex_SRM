import React from 'react';
import Topbar from '../layout/Topbar';

export default function FacturationRecus() {
  return (
    <>
      <Topbar titre="Facturation & reçus" />
      <div className="panneau">
        <div className="vide" style={{padding:'48px 20px'}}>
          <b>Facturation & reçus — bientôt disponible</b>
          Cette page permettra de générer, numéroter, télécharger et suivre les factures et les reçus clients.
        </div>
      </div>
    </>
  );
}

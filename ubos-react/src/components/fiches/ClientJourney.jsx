import React from 'react';
import { buildClientJourney } from '../../utils/clientJourney';

const ClientJourney = ({ db, clientCode }) => {
  const journey = buildClientJourney(db, clientCode);

  return (
    <section className="client-journey" aria-label="Parcours client">
      <div className="client-journey-heading">
        <div>
          <h3>Parcours client</h3>
          <p>
            {journey.demande ? (
              <>
                Progression de la demande active ·{' '}
                <a href={`#ficheDemande:${journey.demande.code}`}>{journey.reference}</a>
              </>
            ) : 'Aucune demande active pour ce client'}
          </p>
        </div>
        {journey.complete && <span className="client-journey-complete">Parcours terminé</span>}
      </div>

      <div className="client-journey-track">
        {journey.steps.map((step, index) => (
          <React.Fragment key={step.label}>
            <div className={`client-journey-step is-${step.state}`} aria-current={step.state === 'active' ? 'step' : undefined}>
              <span className="client-journey-dot">{step.state === 'done' ? '✓' : index + 1}</span>
              <span className="client-journey-label">{step.label}</span>
            </div>
            {index < journey.steps.length - 1 && (
              <span className={`client-journey-line ${step.state === 'done' ? 'is-done' : ''}`} aria-hidden="true" />
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
};

export default ClientJourney;


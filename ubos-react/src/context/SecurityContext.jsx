import React, { createContext, useContext, useState, useCallback } from 'react';
import { demanderOtp, verifierOtp } from '../services/security';
import Modal from '../components/common/Modal';
import { useToast } from './ToastContext';

const SecurityContext = createContext();

export const useSecurity = () => useContext(SecurityContext);

// Elevation token lives in memory only — never localStorage. It's a
// short-lived ("secure session") credential on top of the normal login
// token, not something that should survive a page reload.
export const SecurityProvider = ({ children }) => {
  const { toast } = useToast();
  const [elevationToken, setElevationToken] = useState(null);
  const [elevationExpiresAt, setElevationExpiresAt] = useState(null);
  const [pending, setPending] = useState(null);
  const [etape, setEtape] = useState('demande');
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const estElevee = useCallback(() => {
    return !!(elevationToken && elevationExpiresAt && Date.now() < elevationExpiresAt);
  }, [elevationToken, elevationExpiresAt]);

  // Resolves immediately with the current token if already elevated (the
  // 15-minute window — §9 of the spec: don't ask for a new code on every
  // click). Otherwise opens the modal and resolves once the user completes
  // it, or rejects if they cancel.
  const demanderElevation = useCallback((action) => {
    if (estElevee()) return Promise.resolve(elevationToken);
    return new Promise((resolve, reject) => {
      setPending({ action, resolve, reject });
      setEtape('demande');
      setCode('');
      setErreur('');
    });
  }, [estElevee, elevationToken]);

  const handleEnvoyerCode = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      await demanderOtp(pending.action);
      setEtape('saisie');
      toast("Code envoyé à l'adresse de sécurité Direction.");
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  };

  const handleVerifier = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      const res = await verifierOtp(code);
      setElevationToken(res.elevationToken);
      setElevationExpiresAt(Date.now() + res.expiresInSeconds * 1000);
      toast('Session sécurisée activée (15 minutes).');
      pending.resolve(res.elevationToken);
      setPending(null);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  };

  const handleAnnuler = () => {
    if (pending) pending.reject(new Error('Vérification annulée.'));
    setPending(null);
  };

  return (
    <SecurityContext.Provider value={{ estElevee, demanderElevation, elevationToken }}>
      {children}

      {pending && (
        <Modal
          title="Vérification de sécurité"
          onClose={handleAnnuler}
          footer={
            etape === 'demande' ? (
              <>
                <button className="btn doux" onClick={handleAnnuler}>Annuler</button>
                <button className="btn or" onClick={handleEnvoyerCode} disabled={envoi}>{envoi ? 'Envoi…' : 'Envoyer le code'}</button>
              </>
            ) : (
              <>
                <button className="btn doux" onClick={handleAnnuler}>Annuler</button>
                <button className="btn or" onClick={handleVerifier} disabled={envoi || code.length !== 6}>{envoi ? 'Vérification…' : 'Vérifier'}</button>
              </>
            )
          }
        >
          <div className="corps">
            {erreur && <div className="vide" style={{ gridColumn: '1/-1' }}>{erreur}</div>}
            {etape === 'demande' ? (
              <p style={{ gridColumn: '1/-1' }}>
                Cette action nécessite une vérification de sécurité. Un code à usage unique va être envoyé à l'adresse Direction autorisée.
              </p>
            ) : (
              <div className="champ large">
                <label>Code reçu (6 chiffres)</label>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  style={{ fontSize: '20px', letterSpacing: '4px', textAlign: 'center' }}
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </SecurityContext.Provider>
  );
};

import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import { esc, pill } from '../../utils/format';

function pillResultat(resultat) {
  const r = String(resultat || '');
  if (/^Échec/i.test(r)) return pill(r, 'p-rouge');
  if (/Réussi/i.test(r)) return pill(r, 'p-vert');
  return pill(r, 'p-gris');
}

export default function JournalSecurite() {
  const { db } = useDB();
  const { estDirection, userCourant } = useAuth();

  const [fUser, setFUser] = useState('');
  const [fAct, setFAct] = useState('');
  const [recherche, setRecherche] = useState('');

  const journal = db.journalSecurite || [];

  const users = [...new Set(journal.map(j => j.utilisateur).filter(Boolean))];
  const actions = [...new Set(journal.map(j => j.action).filter(Boolean))];

  const filtre = useMemo(() => {
    let lignes = journal;
    if (fUser) lignes = lignes.filter(j => j.utilisateur === fUser);
    if (fAct) lignes = lignes.filter(j => j.action === fAct);
    if (recherche) {
      const q = recherche.toLowerCase();
      lignes = lignes.filter(j => Object.values(j).some(v => String(v || '').toLowerCase().includes(q)));
    }
    return [...lignes].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 400);
  }, [journal, fUser, fAct, recherche]);

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="Journal de sécurité" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à la Direction</b><br />
            Le journal de sécurité (connexions, codes de vérification, suppressions, restaurations, gestion des comptes) est réservé à la Direction.<br />
            Chaque événement concernant {userCourant} y est néanmoins enregistré.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar titre="Journal de sécurité" />

      <div className="outils">
        <input
          type="search"
          placeholder="Rechercher (utilisateur, action, module…)"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
        />
        <select value={fUser} onChange={e => setFUser(e.target.value)}>
          <option value="">Tous les utilisateurs</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={fAct} onChange={e => setFAct(e.target.value)}>
          <option value="">Toutes les actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Heure</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Module</th>
                <th>Résultat</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {filtre.length > 0 ? (
                filtre.map((j, i) => (
                  <tr key={j.code || i}>
                    <td>{j.date}</td>
                    <td>{j.heure}</td>
                    <td><b>{esc(j.utilisateur)}</b></td>
                    <td>{esc(j.action)}</td>
                    <td>{esc(j.module)}</td>
                    <td>{pillResultat(j.resultat)}</td>
                    <td>{esc(j.ip)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">
                    <div className="vide">
                      <b>Journal vide</b>
                      Connexions, codes de vérification, suppressions, restaurations et gestion des comptes seront enregistrés ici, sans possibilité d'effacement.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

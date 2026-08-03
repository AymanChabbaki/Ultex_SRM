import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import { esc } from '../../utils/format';

export default function AuditGlobal() {
  const { db } = useDB();
  const { estDirection, userCourant } = useAuth();
  
  const [fUser, setFUser] = useState('');
  const [fMod, setFMod] = useState('');
  const [fAct, setFAct] = useState('');
  const [recherche, setRecherche] = useState('');

  const auditData = db.audit || [];
  
  const mods = [...new Set(auditData.map(a => a.module).filter(Boolean))];
  const acts = [...new Set(auditData.map(a => a.action).filter(Boolean))];
  const users = [...new Set(auditData.map(a => a.utilisateur).filter(Boolean))];

  const filteredAudit = useMemo(() => {
    let lignes = auditData;
    if (fUser) lignes = lignes.filter(a => a.utilisateur === fUser);
    if (fMod) lignes = lignes.filter(a => a.module === fMod);
    if (fAct) lignes = lignes.filter(a => a.action === fAct);
    if (recherche) {
      const q = recherche.toLowerCase();
      lignes = lignes.filter(a => Object.values(a).some(v => String(v || '').toLowerCase().includes(q)));
    }
    return lignes.slice(0, 400);
  }, [auditData, fUser, fMod, fAct, recherche]);

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="Journal d'audit global" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à la Direction</b><br />
            Le journal d'audit complet est réservé à la Direction.<br />
            Chaque action de {userCourant} y est néanmoins enregistrée.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar titre="Journal d'audit global" />
      
      <div className="outils">
        <input 
          type="search" 
          placeholder="Rechercher (code dossier, valeur…)" 
          value={recherche} 
          onChange={e => setRecherche(e.target.value)} 
        />
        <select value={fUser} onChange={e => setFUser(e.target.value)}>
          <option value="">Tous les utilisateurs</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={fMod} onChange={e => setFMod(e.target.value)}>
          <option value="">Tous les modules</option>
          {mods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={fAct} onChange={e => setFAct(e.target.value)}>
          <option value="">Toutes les actions</option>
          {acts.map(a => <option key={a} value={a}>{a}</option>)}
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
                <th>Module</th>
                <th>Action</th>
                <th>Objet</th>
                <th>Dossier</th>
                <th>Champ</th>
                <th>Ancienne valeur</th>
                <th>Nouvelle valeur</th>
              </tr>
            </thead>
            <tbody>
              {filteredAudit.length > 0 ? (
                filteredAudit.map((a, i) => (
                  <tr key={i}>
                    <td>{a.date}</td>
                    <td>{a.heure}</td>
                    <td><b>{esc(a.utilisateur)}</b></td>
                    <td>{esc(a.module)}</td>
                    <td>{esc(a.action)}</td>
                    <td className="code">{esc(a.objet)}</td>
                    <td className="code">
                      {a.dossier && a.dossier !== "—" ? (
                        <a href={`#ficheDossier:${a.dossier}`}>{esc(a.dossier)}</a>
                      ) : "—"}
                    </td>
                    <td>{esc(a.champ)}</td>
                    <td>{esc(String(a.avant || '').slice(0, 60))}</td>
                    <td>{esc(String(a.apres || '').slice(0, 60))}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10">
                    <div className="vide">
                      <b>Journal vide</b>
                      Chaque création, modification et suppression sera enregistrée ici, sans possibilité d'effacement.
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

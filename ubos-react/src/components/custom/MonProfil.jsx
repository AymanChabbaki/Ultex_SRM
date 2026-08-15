import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import { pill } from '../../utils/format';
import { hashPassword, verifyPassword } from '../../utils/passwordHash';
import { renommerUtilisateur } from '../../data/db';
import { EyeIcon, EyeOffIcon } from '../common/Icons';

export default function MonProfil() {
  const { db, updateDB, audit } = useDB();
  const { session } = useAuth();
  const { toast } = useToast();

  const moi = (db.utilisateurs || []).find(u => u.code === session?.code);

  const [nomComplet, setNomComplet] = useState(moi?.nomComplet || '');
  const [poste, setPoste] = useState(moi?.poste || '');
  const [ancienMdp, setAncienMdp] = useState('');
  const [nouveauMdp, setNouveauMdp] = useState('');
  const [confirmMdp, setConfirmMdp] = useState('');
  const [voirMdp, setVoirMdp] = useState(false);

  if (!moi) {
    return (
      <div>
        <Topbar titre="Mon profil" />
        <div className="panneau"><div className="vide"><b>Session introuvable</b> Reconnectez-vous pour accéder à votre profil.</div></div>
      </div>
    );
  }

  const handleEnregistrerIdentite = () => {
    const nom = nomComplet.trim();
    if (!nom) { toast('Le nom complet est obligatoire.'); return; }

    let nextDb = db;
    let renameCount = 0;
    if (nom !== moi.nomComplet) {
      const result = renommerUtilisateur(db, moi.nomComplet, nom);
      nextDb = result.db;
      renameCount = result.count;
    }
    nextDb = { ...nextDb, utilisateurs: (nextDb.utilisateurs || []).map(u => u.code === moi.code ? { ...u, nomComplet: nom, poste } : u) };
    updateDB(nextDb);

    audit('Utilisateurs', 'Modification du profil', moi.code, 'nomComplet', moi.nomComplet, nom);
    if (renameCount > 0) {
      audit('Utilisateurs', 'Renommage en cascade', moi.code, 'références mises à jour', moi.nomComplet, `${renameCount} référence(s) → ${nom}`);
    }
    toast(renameCount > 0 ? `Profil mis à jour — ${renameCount} référence(s) mises à jour dans l'application.` : 'Profil mis à jour.');
  };

  const handleChangerMotDePasse = () => {
    if (!ancienMdp || !nouveauMdp || !confirmMdp) { toast('Tous les champs mot de passe sont obligatoires.'); return; }
    if (!verifyPassword(ancienMdp, moi.motDePasse)) { toast('Mot de passe actuel incorrect.'); return; }
    if (nouveauMdp !== confirmMdp) { toast('La confirmation ne correspond pas au nouveau mot de passe.'); return; }
    if (nouveauMdp.length < 4) { toast('Le nouveau mot de passe est trop court (4 caractères minimum).'); return; }

    updateDB({ ...db, utilisateurs: (db.utilisateurs || []).map(u => u.code === moi.code ? { ...u, motDePasse: hashPassword(nouveauMdp) } : u) });
    audit('Utilisateurs', 'Changement de mot de passe', moi.code, 'motDePasse', '—', 'Modifié par l\'utilisateur');
    toast('Mot de passe modifié.');
    setAncienMdp(''); setNouveauMdp(''); setConfirmMdp('');
  };

  return (
    <div>
      <Topbar titre="Mon profil" />

      <div className="bloc-fiche large">
        <h4>Mon identité</h4>
        <div className="corps">
          <div className="champ">
            <label>Nom complet</label>
            <input value={nomComplet} onChange={e => setNomComplet(e.target.value)} />
          </div>
          <div className="champ">
            <label>Poste</label>
            <input value={poste} onChange={e => setPoste(e.target.value)} />
          </div>
        </div>
        {nomComplet.trim() !== moi.nomComplet && (
          <p style={{ color: 'var(--gris)', fontSize: '12px', margin: '4px 0 0' }}>
            Ce changement de nom mettra automatiquement à jour toutes les tâches, dossiers, demandes et autres enregistrements où vous êtes désigné(e) comme responsable.
          </p>
        )}
        <button className="btn or" style={{ marginTop: '12px' }} onClick={handleEnregistrerIdentite}>Enregistrer</button>
      </div>

      <div className="bloc-fiche large">
        <h4>Informations du compte</h4>
        <div className="kv">
          <div><label>Identifiant</label><span>{moi.identifiant}</span></div>
          <div><label>Département</label><span>{moi.departement || '—'}</span></div>
          <div><label>Services</label><span>{(moi.services || []).length ? moi.services.map(s => pill(s, 'p-gris')) : '—'}</span></div>
          <div><label>Statut</label><span>{moi.actif ? pill('Actif', 'p-vert') : pill('Inactif', 'p-rouge')}</span></div>
        </div>
        <p style={{ color: 'var(--gris)', fontSize: '12px', marginTop: '10px' }}>
          L'identifiant, le département et les permissions ne peuvent être modifiés que par la Direction (Utilisateurs & Permissions).
        </p>
      </div>

      <div className="bloc-fiche large">
        <h4>Changer mon mot de passe</h4>
        <div className="corps">
          <div className="champ">
            <label>Mot de passe actuel</label>
            <div style={{ position: 'relative' }}>
              <input type={voirMdp ? 'text' : 'password'} value={ancienMdp} onChange={e => setAncienMdp(e.target.value)} style={{ width: '100%', paddingRight: '38px' }} />
              <button type="button" onClick={() => setVoirMdp(!voirMdp)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                {voirMdp ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>
          <div className="champ">
            <label>Nouveau mot de passe</label>
            <input type={voirMdp ? 'text' : 'password'} value={nouveauMdp} onChange={e => setNouveauMdp(e.target.value)} />
          </div>
          <div className="champ">
            <label>Confirmer le nouveau mot de passe</label>
            <input type={voirMdp ? 'text' : 'password'} value={confirmMdp} onChange={e => setConfirmMdp(e.target.value)} />
          </div>
        </div>
        <button className="btn or" style={{ marginTop: '12px' }} onClick={handleChangerMotDePasse}>Changer le mot de passe</button>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSecurity } from '../../context/SecurityContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { MODS } from '../../data/modules';
import { USERS } from '../../data/constants';
import { pill, esc } from '../../utils/format';
import { hashPassword } from '../../utils/passwordHash';
import { EyeIcon, EyeOffIcon } from '../common/Icons';
import { creerUtilisateurSecurise, modifierUtilisateurSecurise } from '../../services/security';

const DEPARTEMENTS = ["Direction", "Commercial", "Études Commerciales", "Opérations Internationales", "Digital", "Administration"];
const ACTIONS_PERM = ["voir", "ajouter", "modifier", "supprimer", "valider", "exporter"];

export default function Utilisateurs() {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { estDirection, session } = useAuth();
  const { toast } = useToast();
  const { demanderElevation } = useSecurity();

  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [formData, setFormData] = useState({
    nomComplet: '', identifiant: '', motDePasse: '', poste: '', departement: 'Commercial',
    actif: true, services: [], modules: [], permissions: { voir: 1, ajouter: 1, modifier: 1 }
  });

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="Utilisateurs & Permissions" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à la Direction</b><br />
            La gestion des comptes et permissions n'est accessible qu'à la Direction.
          </div>
        </div>
      </>
    );
  }

  const utilisateurs = db.utilisateurs || [];
  const modulesMetier = Object.keys(MODS).filter(id => MODS[id].coll && id !== "rapports");

  const estDirectionUser = (u) => u.departement === "Direction" || (u.services || []).includes("Direction");

  const handleOpenAdd = () => {
    setEditingCode(null);
    setShowPasswordModal(true);
    setFormData({
      nomComplet: '', identifiant: '', motDePasse: 'ubos2026', poste: '', departement: 'Commercial',
      actif: true, services: [], modules: [], permissions: { voir: 1, ajouter: 1, modifier: 1 }
    });
    setShowModal(true);
  };

  const handleOpenEdit = (u) => {
    setEditingCode(u.code);
    setShowPasswordModal(false);
    setFormData({
      nomComplet: u.nomComplet || '',
      identifiant: u.identifiant || '',
      motDePasse: '',
      poste: u.poste || '',
      departement: u.departement || 'Commercial',
      actif: u.actif !== false,
      services: u.services ? [...u.services] : [],
      modules: u.modules ? [...u.modules] : [],
      permissions: u.permissions ? { ...u.permissions } : {}
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const nom = formData.nomComplet.trim();
    const id = formData.identifiant.trim();
    const mdp = formData.motDePasse.trim();

    if (!nom || !id) {
      toast("Nom complet et identifiant obligatoires.");
      return;
    }

    if (utilisateurs.some(x => x.identifiant === id && x.code !== editingCode)) {
      toast("Cet identifiant existe déjà.");
      return;
    }

    if (!editingCode && !mdp) {
      toast("Mot de passe obligatoire à la création.");
      return;
    }

    const nextUsers = [...utilisateurs];
    // Collected here and fired AFTER updateDB() below — audit()/notifier()
    // schedule a state update that resolves relative to whatever updateDB()
    // already committed, so updateDB() must run first or their result can
    // be discarded by React's batching.
    let apresEnregistrement = null;

    try {
      if (editingCode) {
        const idx = nextUsers.findIndex(x => x.code === editingCode);
        if (idx > -1) {
          const existant = nextUsers[idx];
          const u = { ...existant };
          u.nomComplet = nom;
          u.identifiant = id;
          u.poste = formData.poste;
          u.departement = formData.departement;
          u.actif = formData.actif;
          u.services = formData.services;
          u.modules = formData.modules;
          u.permissions = formData.permissions;
          if (mdp) u.motDePasse = hashPassword(mdp);

          const elevationToken = await demanderElevation(`Modification utilisateur : ${nom}`);
          // Full flat snapshot, not just the changed fields — the secure
          // route merges onto the raw Postgres user record, which doesn't
          // carry poste/departement/services/modules at the top level, so
          // a partial patch would silently blank them out there.
          await modifierUtilisateurSecurise(existant.id, {
            identifiant: u.identifiant, nomComplet: u.nomComplet, poste: u.poste,
            departement: u.departement, actif: u.actif, services: u.services,
            modules: u.modules, permissions: u.permissions,
            ...(mdp ? { motDePasse: u.motDePasse } : {})
          }, elevationToken);

          nextUsers[idx] = u;
          apresEnregistrement = { type: 'edit', code: u.code, nom, id, nomComplet: u.nomComplet, mdpChange: !!mdp };
        }
      } else {
        const u = {
          code: genCode("USR"),
          nomComplet: nom,
          identifiant: id,
          motDePasse: hashPassword(mdp),
          poste: formData.poste,
          departement: formData.departement,
          services: formData.services,
          modules: formData.modules,
          permissions: formData.permissions,
          actif: formData.actif,
          ts: Date.now()
        };

        const elevationToken = await demanderElevation(`Création utilisateur : ${nom}`);
        await creerUtilisateurSecurise(u, elevationToken);

        nextUsers.push(u);
        apresEnregistrement = { type: 'create', code: u.code, nom, id };
      }
    } catch (e) {
      if (e && e.message !== 'Vérification annulée.') toast(e.message || "Échec de la vérification de sécurité.");
      return;
    }

    updateDB({ ...db, utilisateurs: nextUsers });

    if (apresEnregistrement?.type === 'edit') {
      if (apresEnregistrement.mdpChange) {
        notifier(apresEnregistrement.nomComplet, "Votre mot de passe UBOS a été mis à jour par la Direction.", "Utilisateurs");
      }
      audit("Utilisateurs", "Modification", apresEnregistrement.code, "compte", "—", apresEnregistrement.nom + " (" + apresEnregistrement.id + ")");
      toast(`${apresEnregistrement.code} mis à jour`);
    } else if (apresEnregistrement?.type === 'create') {
      audit("Utilisateurs", "Création", apresEnregistrement.code, "—", "—", apresEnregistrement.nom + " (" + apresEnregistrement.id + ")");
      toast(`${apresEnregistrement.code} créé — ${apresEnregistrement.nom} peut se connecter`);
    }

    setShowModal(false);
  };

  const handleToggleActif = async (u) => {
    try {
      const elevationToken = await demanderElevation(`${u.actif ? 'Désactivation' : 'Réactivation'} utilisateur : ${u.nomComplet}`);
      await modifierUtilisateurSecurise(u.id, {
        identifiant: u.identifiant, nomComplet: u.nomComplet, poste: u.poste,
        departement: u.departement, services: u.services, modules: u.modules,
        permissions: u.permissions, actif: !u.actif
      }, elevationToken);
    } catch (e) {
      if (e && e.message !== 'Vérification annulée.') toast(e.message || "Échec de la vérification de sécurité.");
      return;
    }
    const nextUsers = utilisateurs.map(x => {
      if (x.code === u.code) {
        return { ...x, actif: !x.actif };
      }
      return x;
    });
    audit("Utilisateurs", !u.actif ? "Réactivation" : "Désactivation", u.code, "actif", String(u.actif), String(!u.actif));
    updateDB({ ...db, utilisateurs: nextUsers });
    toast(`${u.nomComplet} ${!u.actif ? "réactivé" : "désactivé"}`);
  };

  return (
    <>
      <Topbar titre="Utilisateurs & Permissions" />

      <div className="outils">
        <span style={{ flex: 1, color: "var(--gris)" }}>
          {utilisateurs.filter(u => u.actif).length} compte(s) actif(s)
        </span>
        <button className="btn" onClick={handleOpenAdd}>+ Ajouter un utilisateur</button>
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Nom complet</th>
                <th>Identifiant</th>
                <th>Mot de passe</th>
                <th>Poste</th>
                <th>Département</th>
                <th>Services</th>
                <th>Modules</th>
                <th>Actions autorisées</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {utilisateurs.map(u => {
                return (
                  <tr key={u.code}>
                    <td className="code">{u.code}</td>
                    <td><b>{esc(u.nomComplet)}</b></td>
                    <td><code style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', color: '#0f172a', fontWeight: 600 }}>{esc(u.identifiant)}</code></td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#64748b' }} title="Le mot de passe est chiffré : utilisez « Modifier » pour en définir un nouveau">
                        ••••••••
                      </span>
                    </td>
                    <td>{esc(u.poste || "—")}</td>
                    <td>{esc(u.departement || "—")}</td>
                    <td>{(u.services || []).length ? (u.services || []).map(s => <span key={s} style={{ marginRight: '4px' }}>{pill(s, "p-gris")}</span>) : "—"}</td>
                    <td>{estDirectionUser(u) ? pill("Tous", "p-or") : `${(u.modules || []).length} module(s)`}</td>
                    <td>{estDirectionUser(u) ? pill("Toutes", "p-or") : ACTIONS_PERM.filter(a => u.permissions && u.permissions[a]).join(", ") || "—"}</td>
                    <td>{u.actif ? pill("Actif", "p-vert") : pill("Inactif", "p-rouge")}</td>
                    <td>
                      <div className="acts">
                        <button className="btn mini doux" onClick={() => handleOpenEdit(u)}>Modifier</button>
                        {u.identifiant !== session?.identifiant && (
                          <button className={`btn mini ${u.actif ? "rouge" : ""}`} onClick={() => handleToggleActif(u)}>
                            {u.actif ? "Désactiver" : "Réactiver"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal 
          title={editingCode ? "Modifier un utilisateur" : "Ajouter un utilisateur"} 
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn doux" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn" onClick={handleSave}>Enregistrer</button>
            </>
          }
        >
          <div className="corps">
            {editingCode && (
              <div className="champ"><label>Code</label><input value={editingCode} disabled /></div>
            )}
            <div className="champ">
              <label>Nom complet *</label>
              <input value={formData.nomComplet} onChange={e => setFormData({ ...formData, nomComplet: e.target.value })} />
            </div>
            <div className="champ">
              <label>Identifiant *</label>
              <input value={formData.identifiant} onChange={e => setFormData({ ...formData, identifiant: e.target.value })} />
            </div>

            {/* Mot de passe : toujours saisi en clair puis chiffré (bcrypt) avant stockage */}
            <div className="champ">
              <label>{editingCode ? "Nouveau mot de passe" : "Mot de passe *"}</label>
              <div className="input-wrapper" style={{ position: 'relative' }}>
                <input
                  type={showPasswordModal ? "text" : "password"}
                  value={formData.motDePasse}
                  onChange={e => setFormData({ ...formData, motDePasse: e.target.value })}
                  placeholder={editingCode ? "Laisser vide pour ne pas changer" : ""}
                  style={{ width: '100%', paddingRight: '38px' }}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPasswordModal(!showPasswordModal)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  title={showPasswordModal ? "Masquer le mot de passe" : "Afficher le mot de passe actuel"}
                >
                  {showPasswordModal ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div className="champ">
              <label>Poste</label>
              <input value={formData.poste} onChange={e => setFormData({ ...formData, poste: e.target.value })} />
            </div>
            <div className="champ">
              <label>Département</label>
              <select value={formData.departement} onChange={e => setFormData({ ...formData, departement: e.target.value })}>
                {DEPARTEMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Statut</label>
              <select value={formData.actif ? "1" : "0"} onChange={e => setFormData({ ...formData, actif: e.target.value === "1" })}>
                <option value="1">Actif</option>
                <option value="0">Inactif</option>
              </select>
            </div>

            <div className="champ large">
              <label>Services autorisés</label>
              <div className="grille-cases">
                {USERS.map(s => (
                  <label key={s}>
                    <input
                      type="checkbox"
                      checked={formData.services.includes(s)}
                      onChange={e => {
                        const srv = e.target.checked
                          ? [...formData.services, s]
                          : formData.services.filter(x => x !== s);
                        setFormData({ ...formData, services: srv });
                      }}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            <div className="champ large">
              <label>Modules visibles</label>
              <div className="grille-cases">
                {modulesMetier.map(id => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={formData.modules.includes(id)}
                      onChange={e => {
                        const mods = e.target.checked
                          ? [...formData.modules, id]
                          : formData.modules.filter(x => x !== id);
                        setFormData({ ...formData, modules: mods });
                      }}
                    />
                    {MODS[id].label}
                  </label>
                ))}
              </div>
            </div>

            <div className="champ large">
              <label>Actions autorisées</label>
              <div className="grille-cases" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                {ACTIONS_PERM.map(a => (
                  <label key={a}>
                    <input
                      type="checkbox"
                      checked={!!formData.permissions[a]}
                      onChange={e => {
                        const perms = { ...formData.permissions };
                        if (e.target.checked) perms[a] = 1; else delete perms[a];
                        setFormData({ ...formData, permissions: perms });
                      }}
                    />
                    {a[0].toUpperCase() + a.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { MODS } from '../../data/modules';
import { USERS } from '../../data/constants';
import { pill, esc } from '../../utils/format';

const DEPARTEMENTS = ["Direction", "Commercial", "Études Commerciales", "Opérations Internationales", "Digital", "Administration"];
const ACTIONS_PERM = ["voir", "ajouter", "modifier", "supprimer", "valider", "exporter"];

export default function Utilisateurs() {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { estDirection, session } = useAuth();
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
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
    setFormData({
      nomComplet: '', identifiant: '', motDePasse: '', poste: '', departement: 'Commercial',
      actif: true, services: [], modules: [], permissions: { voir: 1, ajouter: 1, modifier: 1 }
    });
    setShowModal(true);
  };

  const handleOpenEdit = (u) => {
    setEditingCode(u.code);
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

  const handleSave = () => {
    const nom = formData.nomComplet.trim();
    const id = formData.identifiant.trim();
    const mdp = formData.motDePasse;

    if (!nom || !id) {
      toast("Nom complet et identifiant obligatoires.");
      return;
    }

    if (utilisateurs.some(x => x.identifiant === id && x.code !== editingCode)) {
      toast("Cet identifiant existe déjà.");
      return;
    }

    const nextUsers = [...utilisateurs];

    if (editingCode) {
      const idx = nextUsers.findIndex(x => x.code === editingCode);
      if (idx > -1) {
        const u = { ...nextUsers[idx] };
        u.nomComplet = nom;
        u.identifiant = id;
        u.poste = formData.poste;
        u.departement = formData.departement;
        u.actif = formData.actif;
        u.services = formData.services;
        u.modules = formData.modules;
        u.permissions = formData.permissions;

        if (mdp) {
          u.motDePasse = mdp;
          notifier(u.nomComplet, "Votre mot de passe UBOS a été modifié par la Direction.", "Utilisateurs");
        }
        nextUsers[idx] = u;
        audit("Utilisateurs", "Modification", u.code, "compte", "—", nom + " (" + id + ")");
        toast(`${u.code} mis à jour`);
      }
    } else {
      if (!mdp) {
        toast("Mot de passe obligatoire à la création.");
        return;
      }
      const u = {
        code: genCode("USR"),
        nomComplet: nom,
        identifiant: id,
        motDePasse: mdp,
        poste: formData.poste,
        departement: formData.departement,
        services: formData.services,
        modules: formData.modules,
        permissions: formData.permissions,
        actif: formData.actif,
        ts: Date.now()
      };
      nextUsers.push(u);
      audit("Utilisateurs", "Création", u.code, "—", "—", nom + " (" + id + ")");
      toast(`${u.code} créé — ${nom} peut se connecter`);
    }

    updateDB({ ...db, utilisateurs: nextUsers });
    setShowModal(false);
  };

  const handleToggleActif = (u) => {
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
              {utilisateurs.map(u => (
                <tr key={u.code}>
                  <td className="code">{u.code}</td>
                  <td><b>{esc(u.nomComplet)}</b></td>
                  <td>{esc(u.identifiant)}</td>
                  <td>{esc(u.poste || "—")}</td>
                  <td>{esc(u.departement || "—")}</td>
                  <td>{(u.services || []).map(s => pill(s, "p-gris")).length ? (u.services || []).map(s => pill(s, "p-gris")) : "—"}</td>
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
              ))}
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
            <div className="champ">
              <label>Mot de passe {editingCode ? "(vide = inchangé)" : "*"}</label>
              <input type="password" placeholder={editingCode ? "••••••" : ""} value={formData.motDePasse} onChange={e => setFormData({ ...formData, motDePasse: e.target.value })} />
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

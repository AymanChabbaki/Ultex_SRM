import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { PERSONNES } from '../../data/permissions';
import { USERS } from '../../data/constants';
import { esc } from '../../utils/format';

const FILTRES = [
  ['toutes', 'Toutes'], ['nonlues', 'Non lues'], ['aujourdhui', "Aujourd'hui"], ['taches', 'Tâches'],
  ['validations', 'Validations'], ['retards', 'Retards'], ['messages', 'Messages'], ['direction', 'Direction'], ['urgentes', 'Urgentes']
];

const extraireLien = (texte) => {
  const m = String(texte || '').match(/Lien\s*:\s*(#\S+)/);
  return m ? m[1] : null;
};

export default function Notifications() {
  const { db, updateDB, notifier, audit } = useDB();
  const { session, estDirection } = useAuth();
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ dest: 'Tous', mod: 'Général', txt: '' });
  const [filtre, setFiltre] = useState('toutes');

  const destinataireEstMoi = (n) => {
    if (!session) return false;
    return n.dest === "Tous" || (session.services || []).includes(n.dest) || n.dest === session.nomComplet || n.dest === session.identifiant;
  };

  const correspondFiltre = (n) => {
    if (filtre === 'nonlues') return !n.lu;
    if (filtre === 'aujourdhui') return n.date && n.date.startsWith(new Date().toLocaleDateString('fr-FR'));
    if (filtre === 'taches') return n.module === 'Tâches';
    if (filtre === 'validations') return /validation/i.test(n.texte || '');
    if (filtre === 'retards') return /retard|report/i.test(n.texte || '');
    if (filtre === 'messages') return n.module !== 'Tâches';
    if (filtre === 'direction') return n.dest === 'Direction' || n.de === 'Direction';
    if (filtre === 'urgentes') return /critique|urgente?\b/i.test(n.texte || '');
    return true;
  };

  const toutesMiennes = (db.notifs || []).filter(n => destinataireEstMoi(n) || estDirection());
  const miennes = toutesMiennes.filter(correspondFiltre);
  const nbNonLues = toutesMiennes.filter(n => !n.lu).length;
  const nbNouvellesTaches = toutesMiennes.filter(n => !n.lu && n.module === 'Tâches' && /nouvelle tâche/i.test(n.texte || '')).length;
  const nbUrgentes = toutesMiennes.filter(n => !n.lu && /critique|urgente?\b/i.test(n.texte || '')).length;
  const nbTerminees = toutesMiennes.filter(n => !n.lu && /terminée/i.test(n.texte || '')).length;
  const nbValidations = toutesMiennes.filter(n => !n.lu && /attente de votre validation/i.test(n.texte || '')).length;

  const handleMarkAllRead = () => {
    const newNotifs = (db.notifs || []).map(n => {
      if (destinataireEstMoi(n) || estDirection()) {
        return { ...n, lu: true };
      }
      return n;
    });
    updateDB({ ...db, notifs: newNotifs });
    toast("Toutes les notifications marquées comme lues.");
  };

  const handleRead = (code) => {
    const newNotifs = (db.notifs || []).map(n => {
      if (n.code === code) {
        return { ...n, lu: true };
      }
      return n;
    });
    updateDB({ ...db, notifs: newNotifs });
  };

  const handleSend = () => {
    if (!form.txt.trim()) {
      toast("Le message est vide.");
      return;
    }
    
    notifier(form.dest, form.txt.trim(), form.mod || "Général");
    audit("Notifications", "Envoi", "→ " + form.dest, "message", "—", form.txt.slice(0, 80));
    
    setShowModal(false);
    setForm({ dest: 'Tous', mod: 'Général', txt: '' });
    toast(`Notification envoyée à ${form.dest}`);
  };

  const destOptions = ["Tous", ...PERSONNES(db), ...USERS];

  return (
    <>
      <Topbar titre="Notifications" />
      
      {nbNonLues > 0 && (
        <p style={{ color: 'var(--gris)', fontSize: '13px' }}>
          🔔 Notifications non lues : <b>{nbNonLues}</b>
          {nbNouvellesTaches ? ` — ${nbNouvellesTaches} nouvelle(s) tâche(s)` : ''}
          {nbUrgentes ? `, ${nbUrgentes} urgente(s)` : ''}
          {nbTerminees ? `, ${nbTerminees} terminée(s) par l'équipe` : ''}
          {nbValidations ? `, ${nbValidations} validation(s) demandée(s)` : ''}.
        </p>
      )}

      <div className="outils">
        <select value={filtre} onChange={e => setFiltre(e.target.value)}>
          {FILTRES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn doux" onClick={handleMarkAllRead}>Tout marquer comme lu</button>
        <button className="btn or" onClick={() => setShowModal(true)}>Notifier un collègue</button>
      </div>

      <div className="panneau liste-notif">
        {miennes.length > 0 ? (
          miennes.slice(0, 120).map(n => {
            const lien = extraireLien(n.texte);
            return (
              <div key={n.code || n.ts} className={`notif ${n.lu ? 'lu' : 'nonlu'}`}>
                <div className="pt-n"></div>
                <div className="spacer">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{esc(n.texte)}</div>
                  <div className="qui">
                    De {esc(n.de)} → {esc(n.dest)} · {esc(n.module)} · {esc(n.date)}
                  </div>
                </div>
                {lien && <a className="btn mini doux" href={lien}>Ouvrir</a>}
                {!n.lu && (
                  <button className="btn mini doux" onClick={() => handleRead(n.code)}>Lu</button>
                )}
              </div>
            );
          })
        ) : (
          <div className="vide">
            <b>Aucune notification</b>
            Les messages entre services apparaîtront ici.
          </div>
        )}
      </div>

      {showModal && (
        <Modal 
          title="Notifier un collègue" 
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn doux" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn" onClick={handleSend}>Envoyer</button>
            </>
          }
        >
          <div className="corps">
            <div className="champ">
              <label>Destinataire</label>
              <select value={form.dest} onChange={e => setForm({ ...form, dest: e.target.value })}>
                {destOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Module concerné</label>
              <input value={form.mod} onChange={e => setForm({ ...form, mod: e.target.value })} />
            </div>
            <div className="champ large">
              <label>Message</label>
              <textarea value={form.txt} onChange={e => setForm({ ...form, txt: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

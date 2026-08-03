import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { PERSONNES } from '../../data/permissions';
import { USERS } from '../../data/constants';
import { esc } from '../../utils/format';

export default function Notifications() {
  const { db, updateDB, notifier, audit } = useDB();
  const { session, estDirection } = useAuth();
  const { toast } = useToast();
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ dest: 'Tous', mod: 'Général', txt: '' });

  const destinataireEstMoi = (n) => {
    if (!session) return false;
    return n.dest === "Tous" || (session.services || []).includes(n.dest) || n.dest === session.nomComplet || n.dest === session.identifiant;
  };

  const miennes = (db.notifs || []).filter(n => destinataireEstMoi(n) || estDirection());
  
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
      
      <div className="outils">
        <button className="btn doux" onClick={handleMarkAllRead}>Tout marquer comme lu</button>
        <button className="btn or" onClick={() => setShowModal(true)}>Notifier un collègue</button>
      </div>

      <div className="panneau liste-notif">
        {miennes.length > 0 ? (
          miennes.slice(0, 120).map(n => (
            <div key={n.code || n.ts} className={`notif ${n.lu ? 'lu' : 'nonlu'}`}>
              <div className="pt-n"></div>
              <div style={{ flex: 1 }}>
                <div>{esc(n.texte)}</div>
                <div className="qui">
                  De {esc(n.de)} → {esc(n.dest)} · {esc(n.module)} · {esc(n.date)}
                </div>
              </div>
              {!n.lu && (
                <button className="btn mini doux" onClick={() => handleRead(n.code)}>Lu</button>
              )}
            </div>
          ))
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

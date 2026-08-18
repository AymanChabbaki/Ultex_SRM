import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import { useSecurity } from '../../context/SecurityContext';
import { destinataireEstMoi } from '../../data/permissions';
import { MODS, ORDRE_NAV } from '../../data/modules';
import Logo from '../common/Logo';
import { DownloadIcon, UploadIcon } from '../common/Icons';
import { useSidebar } from './Layout';
import { restaurerSecurise } from '../../services/security';

const Sidebar = ({ ouvert }) => {
  const { moduleVisible, session } = useAuth();
  const { db } = useDB();
  const { toast } = useToast();
  const { demanderElevation } = useSecurity();
  const sidebarCtx = useSidebar();
  const isCollapsed = sidebarCtx?.collapsed;

  const [currentHash, setCurrentHash] = useState(window.location.hash.replace('#', '') || 'dashboard');

  useEffect(() => {
    const onHashChange = () => {
      let hash = window.location.hash.replace('#', '');
      if (hash.includes(':')) hash = hash.split(':')[0];
      setCurrentHash(hash || 'dashboard');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const nbNonLues = () => {
    return (db?.notifs || []).filter(n => !n.lu && destinataireEstMoi(session, n)).length;
  };

  // A full data export is exactly the "sauvegarde complète" the security
  // spec asks to gate — OTP-confirmed before the download starts.
  const exporterJSON = async () => {
    if (!db) return;
    try {
      await demanderElevation('Sauvegarde complète (export JSON)');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
      const a = document.createElement('a');
      a.href = dataStr;
      a.download = `UBOS_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch (e) {
      if (e && e.message !== 'Vérification annulée.') toast(e.message || "Échec de la vérification de sécurité.");
    }
  };

  const importerJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!window.confirm('Restaurer va écraser les données actuelles. Un code de sécurité vous sera demandé. Continuer ?')) return;
        const elevationToken = await demanderElevation('Restauration complète (import JSON)');
        // Restore goes through the OTP-gated route (writes straight to
        // PostgreSQL) — then reload so the app re-fetches the now-restored
        // state via the normal auth rehydration path, instead of trusting
        // a local copy of the just-uploaded file.
        await restaurerSecurise(data, elevationToken);
        window.location.reload();
      } catch (err) {
        if (err && err.message === 'Vérification annulée.') return;
        toast(err.message || "Fichier JSON invalide ou restauration refusée.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <aside id="aside" className={`${ouvert ? 'ouvert' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="logo-aside-container">
        <Logo size={isCollapsed ? "small" : "medium"} light />
      </div>
      <nav id="nav">
        {ORDRE_NAV.map(([grp, ids]) => {
          const visibles = ids.filter(id => moduleVisible(id));
          if (!visibles.length) return null;
          
          return (
            <React.Fragment key={grp}>
              <div className="grp">{grp}</div>
              {visibles.map(id => {
                const M = MODS[id];
                if (!M) return null;
                const nb = nbNonLues();
                return (
                  <a key={id} href={`#${id}`} className={currentHash === id ? "on" : ""} title={M.label}>
                    <span className="ic"><M.ic size={16} /></span>
                    <span className="nav-text">{M.label}</span>
                    {id === "notifications" && nb > 0 ? <span className="bulle">{nb}</span> : null}
                  </a>
                );
              })}
            </React.Fragment>
          );
        })}
      </nav>
      <div className="aside-pied">
        <button onClick={exporterJSON} title="Télécharger la sauvegarde complète (JSON)" className="btn-aside-action">
          <DownloadIcon size={14} />
          <span className="btn-text">Sauvegarde</span>
        </button>
        <button onClick={() => document.getElementById('fimport').click()} title="Restaurer une sauvegarde JSON" className="btn-aside-action">
          <UploadIcon size={14} />
          <span className="btn-text">Restaurer</span>
        </button>
        <input type="file" id="fimport" accept=".json" style={{ display: 'none' }} onChange={importerJSON} />
      </div>
      <div className="sauve-info" id="sauveInfo">Sauvegarde automatique active</div>
    </aside>
  );
};

export default Sidebar;

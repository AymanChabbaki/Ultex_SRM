import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import ModuleForm from './ModuleForm';
import { MODS as MODS_DATA } from '../../data/modules';
import { exporterExcel } from '../../utils/export';
import { DownloadIcon } from '../common/Icons';

export default function GenericModule({ moduleId, MODS = MODS_DATA }) {
  const { db, updateDB, audit } = useDB();
  const { peut, moduleVisible } = useAuth();
  const { toast } = useToast();
  
  const [recherche, setRecherche] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCode, setEditCode] = useState(null);

  const M = MODS[moduleId];

  const { lignes, optsStatut } = useMemo(() => {
    if (!M) return { lignes: [], optsStatut: [] };
    
    let l = (db[M.coll] || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    
    if (recherche) {
      const q = recherche.toLowerCase();
      l = l.filter(o => Object.values(o).some(v => String(v ?? "").toLowerCase().includes(q)));
    }
    
    if (filtreStatut && M.statut) {
      l = l.filter(o => o[M.statut] === filtreStatut);
    }
    
    let opts = M.statut ? (M.champs?.find(f => f.k === M.statut)?.opts || []) : [];
    if (typeof opts === "function") opts = opts(db);
    
    return { lignes: l, optsStatut: opts };
  }, [db, M, recherche, filtreStatut]);

  if (!M) return <div>Module introuvable</div>;

  if (!moduleVisible(moduleId)) {
    return (
      <>
        <Topbar titre={M.label} />
        <div className="panneau">
          <div className="note-verrou">
            <b>Module non autorisé</b><br />
            Votre compte n'a pas accès à « {M.label} ».<br />
            La Direction peut vous l'ouvrir dans Utilisateurs & Permissions.
          </div>
        </div>
      </>
    );
  }

  const supprimer = (code) => {
    if (!peut("supprimer")) {
      toast("Permission de suppression refusée.");
      return;
    }
    if (window.confirm(`Supprimer ${code} ?\nL'action restera visible dans le journal d'audit.`)) {
      const collection = db[M.coll] || [];
      const obj = collection.find(x => x.code === code);
      const nextCollection = collection.filter(x => x.code !== code);
      const nextDb = { ...db, [M.coll]: nextCollection };
      updateDB(nextDb);
      audit(M.label, "Suppression", code, "—", obj ? (obj[M.champs?.[0]?.k] || code) : code, "supprimé");
      toast(`${code} supprimé`);
    }
  };

  const handleExport = () => {
    exporterExcel(moduleId, db, MODS);
  };

  const handleActionClick = (a, code) => {
    if (typeof a.fn === 'function') {
      a.fn(code, db);
    } else if (typeof a.fn === 'string') {
      if (a.fn.startsWith('ouvrirFiche')) {
        const type = a.fn.replace('ouvrirFiche', '');
        const target = 'fiche' + type;
        window.location.hash = `#${target}:${code}`;
      } else {
        toast(`Action « ${a.txt} » exécutée sur ${code}`);
      }
    }
  };

  return (
    <>
      <Topbar titre={M.label} />
      
      <div className="outils">
        <input 
          type="search" 
          placeholder={`Rechercher dans ${M.label}…`} 
          value={recherche} 
          onChange={(e) => setRecherche(e.target.value)} 
        />
        {optsStatut.length > 0 && (
          <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {optsStatut.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
        {peut("exporter") && (
          <button className="btn doux" onClick={handleExport} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <DownloadIcon size={14} /> Excel / CSV
          </button>
        )}
        {peut("ajouter") && (
          <button className="btn" onClick={() => { setEditCode(null); setShowForm(true); }}>+ Ajouter</button>
        )}
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                {(M.cols || []).map(c => <th key={c[1]}>{c[1]}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!lignes.length ? (
                <tr>
                  <td colSpan={(M.cols || []).length + 2}>
                    <div className="vide">
                      <b>Aucun enregistrement</b>
                      Ajoutez le premier élément avec le bouton « + Ajouter ».
                    </div>
                  </td>
                </tr>
              ) : (
                lignes.map(o => (
                  <tr key={o.code}>
                    <td className="code">
                      {M.fiche ? <a href={`#${M.fiche}:${o.code}`}>{o.code}</a> : o.code}
                    </td>
                    {(M.cols || []).map(c => {
                      const val = o[c[0]];
                      let content = val ?? "—";
                      if (c[2]) {
                        const formatted = c[2](val, o);
                        if (React.isValidElement(formatted)) {
                          content = formatted;
                        } else if (typeof formatted === 'string' && formatted.includes('<')) {
                          content = <span dangerouslySetInnerHTML={{ __html: formatted }} />;
                        } else {
                          content = formatted ?? "—";
                        }
                      }
                      return <td key={c[0]}>{content}</td>;
                    })}
                    <td>
                      <div className="acts">
                        {M.actions && M.actions.map((a, i) => (
                          (!a.si || a.si(o)) ? (
                            <button key={i} className={a.cls} onClick={() => handleActionClick(a, o.code)}>
                              {a.txt}
                            </button>
                          ) : null
                        ))}
                        {peut("modifier") && (
                          <button className="btn mini doux" onClick={() => { setEditCode(o.code); setShowForm(true); }}>
                            Modifier
                          </button>
                        )}
                        {peut("supprimer") && (
                          <button className="btn mini rouge" onClick={() => supprimer(o.code)}>
                            Suppr.
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {showForm && (
        <ModuleForm 
          moduleId={moduleId} 
          MODS={MODS}
          recordCode={editCode} 
          onClose={() => setShowForm(false)} 
        />
      )}
    </>
  );
}

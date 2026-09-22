import FilterTable from '../common/FilterTable';
import React, { useEffect, useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSecurity } from '../../context/SecurityContext';
import Topbar from '../layout/Topbar';
import ModuleForm from './ModuleForm';
import { MODS as MODS_DATA } from '../../data/modules';
import { exporterExcel } from '../../utils/export';
import { DownloadIcon } from '../common/Icons';
import * as Actions from '../../utils/businessActions';
import { supprimerEnregistrementSecurise } from '../../services/security';
import { formatCreationDate } from '../../utils/creationDate';
import { codeClientAffiche, GROUPES_CODES_CLIENT } from '../../utils/clientCodeGroups';
import { fetchCollectionPage } from '../../services/api';

const PERMISSION_REQUISE = {
  qualifierLead: 'valider',
  convertirContactEnClient: 'valider',
  avancerDossier: 'valider',
  creerFactureDepuisDossier: 'ajouter'
};

export default function GenericModule({ moduleId, MODS = MODS_DATA }) {
  const { db, updateDB, audit, genCode, notifier, userCourant, chargerCollections, hydraterEnregistrements } = useDB();
  const { peut, moduleVisible } = useAuth();
  const { toast } = useToast();
  const { demanderElevation } = useSecurity();
  
  const [recherche, setRecherche] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCode, setEditCode] = useState(null);
  const [groupeClients, setGroupeClients] = useState('L');
  const [remoteRows, setRemoteRows] = useState([]);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [remotePage, setRemotePage] = useState(1);
  const [remotePageSize, setRemotePageSize] = useState(25);
  const [remoteTotalPages, setRemoteTotalPages] = useState(1);
  const [remoteGroupCounts, setRemoteGroupCounts] = useState({ L: 0, A: 0, R: 0, '#': 0 });
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');

  const M = MODS[moduleId];
  const collectionRevision = M ? db[M.coll] : null;

  useEffect(() => {
    if (!M?.coll) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRemoteLoading(true);
      setRemoteError('');
      try {
        const result = await fetchCollectionPage(M.coll, {
          page: remotePage,
          pageSize: remotePageSize,
          q: recherche,
          codeGroup: moduleId === 'clients' ? groupeClients : '',
          filterKey: filtreStatut ? M.statut : '',
          filterValue: filtreStatut
        });
        if (cancelled) return;
        setRemoteRows(result.items || []);
        setRemoteTotal(Number(result.total || 0));
        setRemoteTotalPages(Math.max(1, Number(result.totalPages || 1)));
        if (moduleId === 'clients') setRemoteGroupCounts({ L: 0, A: 0, R: 0, '#': 0, ...(result.groupCounts || {}) });
        if (remotePage > Number(result.totalPages || 1)) setRemotePage(Math.max(1, Number(result.totalPages || 1)));
      } catch (error) {
        if (!cancelled) setRemoteError(error?.message || 'Chargement impossible');
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    }, recherche ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [M?.coll, M?.statut, moduleId, recherche, filtreStatut, groupeClients, remotePage, remotePageSize, collectionRevision]);

  const { lignes, optsStatut } = useMemo(() => {
    if (!M) return { lignes: [], optsStatut: [] };
    
    let l = remoteRows.slice().sort((a, b) => {
      if (moduleId === 'produits') {
        const hsOrder = String(a.hsCode || 'ZZZZZZ').localeCompare(String(b.hsCode || 'ZZZZZZ'), 'fr', { numeric: true });
        if (hsOrder !== 0) return hsOrder;
        return String(a.designation || '').localeCompare(String(b.designation || ''), 'fr');
      }
      return (b.ts || 0) - (a.ts || 0);
    });
    
    let opts = M.statut ? (M.champs?.find(f => f.k === M.statut)?.opts || []) : [];
    if (typeof opts === "function") opts = opts(db);
    
    return { lignes: l, optsStatut: opts };
  }, [db, M, moduleId, remoteRows]);

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

  const supprimer = async (code) => {
    if (!peut("supprimer")) {
      toast("Permission de suppression refusée.");
      return;
    }
    if (!window.confirm(`Supprimer ${code} ?\nL'action restera visible dans le journal d'audit.\nUn code de sécurité vous sera demandé.`)) return;
    try {
      const elevationToken = await demanderElevation(`Suppression : ${M.label} ${code}`);
      await supprimerEnregistrementSecurise(M.coll, code, elevationToken);
      const collection = db[M.coll] || [];
      const obj = collection.find(x => x.code === code);
      const nextCollection = collection.filter(x => x.code !== code);
      const nextDb = { ...db, [M.coll]: nextCollection };
      updateDB(nextDb);
      audit(M.label, "Suppression", code, "—", "—", JSON.stringify(obj || {}));
      toast(`${code} supprimé`);
    } catch (e) {
      if (e && e.message !== 'Vérification annulée.') toast(e.message || "Échec de la suppression.");
    }
  };

  const handleExport = () => {
    chargerCollections([M.coll])
      .then(completeDb => exporterExcel(moduleId, completeDb, MODS, toast))
      .catch(error => toast(error?.message || "Échec du chargement pour l'export."));
  };

  const ouvrirAjout = async () => {
    try {
      await chargerCollections([M.coll]);
      setEditCode(null);
      setShowForm(true);
    } catch (error) {
      toast(error?.message || 'Chargement impossible.');
    }
  };

  const handleActionClick = (a, record) => {
    const code = record.code;
    const current = db[M.coll] || [];
    const actionDb = current.some(item => item.code === code)
      ? db
      : { ...db, [M.coll]: [...current, record] };
    hydraterEnregistrements(M.coll, [record]);
    if (typeof a.fn === 'function') {
      a.fn(code, actionDb);
    } else if (typeof a.fn === 'string') {
      if (a.fn.startsWith('ouvrirFiche')) {
        const type = a.fn.replace('ouvrirFiche', '');
        const target = 'fiche' + type;
        window.location.hash = `#${target}:${code}`;
      } else if (Actions[a.fn]) {
        // Appelle la logique métier réelle
        const permission = PERMISSION_REQUISE[a.fn];
        Actions[a.fn](code, actionDb, genCode, audit, userCourant, updateDB, toast, permission ? peut(permission) : true, notifier);
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
          onChange={(e) => { setRecherche(e.target.value); setRemotePage(1); }}
        />
        {optsStatut.length > 0 && (
          <select value={filtreStatut} onChange={(e) => { setFiltreStatut(e.target.value); setRemotePage(1); }}>
            <option value="">Tous les statuts</option>
            {optsStatut.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
        {peut("exporter") && (
          <button className="btn doux" onClick={handleExport}>
            <DownloadIcon size={14} /> Excel / CSV
          </button>
        )}
        {peut("ajouter") && (
          <button className="btn" onClick={ouvrirAjout}>+ Ajouter</button>
        )}
      </div>

      {moduleId === 'clients' && (
        <div className="onglets" style={{marginBottom:'14px', flexWrap:'wrap'}}>
          {GROUPES_CODES_CLIENT.map(groupe => (
            <button
              key={groupe.id}
              type="button"
              className={`onglet ${groupeClients === groupe.id ? 'actif' : ''}`}
              onClick={() => { setGroupeClients(groupe.id); setRemotePage(1); }}
            >
              {groupe.label} ({remoteGroupCounts[groupe.id]})
            </button>
          ))}
        </div>
      )}

      <div className="panneau">
        {remoteError && <div className="note-verrou">{remoteError}</div>}
        <div className="defile">
          <FilterTable pagination={false}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Date de création</th>
                {(M.cols || []).map(c => <th key={c[1]}>{c[1]}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {remoteLoading ? (
                <tr><td colSpan={(M.cols || []).length + 3}><div className="vide"><b>Chargement…</b></div></td></tr>
              ) : !lignes.length ? (
                <tr>
                  <td colSpan={(M.cols || []).length + 3}>
                    <div className="vide">
                      <b>Aucun enregistrement</b>
                      Ajoutez le premier élément avec le bouton « + Ajouter ».
                    </div>
                  </td>
                </tr>
              ) : (
                lignes.map((o, rowIndex) => (
                  <React.Fragment key={o.code || o.id}>
                  {moduleId === 'produits' && (rowIndex === 0 || (lignes[rowIndex - 1].hsCode || '') !== (o.hsCode || '')) && (
                    <tr className="groupe-hs">
                      <td colSpan={(M.cols || []).length + 3} style={{ fontWeight: 700, background: 'var(--fond-jaune)' }}>
                        Groupe HS : {o.hsCode || 'Sans HS Code'}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="code">
                      {M.fiche ? <a href={`#${M.fiche}:${o.code}`}>{moduleId === 'clients' ? codeClientAffiche(o) : (o.referenceMetier || o.code)}</a> : (o.referenceMetier || o.code)}
                    </td>
                    <td>{formatCreationDate(o)}</td>
                    {(M.cols || []).map(c => {
                      // Column values retain their original formatting.
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
                            <button key={i} className={a.cls} onClick={() => handleActionClick(a, o)}>
                              {a.txt}
                            </button>
                          ) : null
                        ))}
                        {peut("modifier") && (
                          <button className="btn mini doux" onClick={() => { hydraterEnregistrements(M.coll, [o]); setEditCode(o.code); setShowForm(true); }}>
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
                  </React.Fragment>
                ))
              )}
            </tbody>
          </FilterTable>
        </div>
        {!remoteError && remoteTotal > 0 && (
          <nav className="table-pagination" aria-label={`Pagination de ${M.label}`}>
            <div className="table-pagination-summary">
              <strong>{(remotePage - 1) * remotePageSize + 1}–{Math.min(remotePage * remotePageSize, remoteTotal)}</strong> sur <strong>{remoteTotal}</strong>
            </div>
            <label className="table-page-size">
              <span>Lignes</span>
              <select value={remotePageSize} onChange={event => { setRemotePageSize(Number(event.target.value)); setRemotePage(1); }}>
                {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            {remoteTotalPages > 1 && <div className="table-page-buttons">
              <button type="button" className="table-page-nav" onClick={() => setRemotePage(1)} disabled={remotePage === 1} aria-label="Première page">«</button>
              <button type="button" className="table-page-nav" onClick={() => setRemotePage(page => Math.max(1, page - 1))} disabled={remotePage === 1} aria-label="Page précédente">‹</button>
              <span className="table-pagination-summary">Page <strong>{remotePage}</strong> / <strong>{remoteTotalPages}</strong></span>
              <button type="button" className="table-page-nav" onClick={() => setRemotePage(page => Math.min(remoteTotalPages, page + 1))} disabled={remotePage === remoteTotalPages} aria-label="Page suivante">›</button>
              <button type="button" className="table-page-nav" onClick={() => setRemotePage(remoteTotalPages)} disabled={remotePage === remoteTotalPages} aria-label="Dernière page">»</button>
            </div>}
          </nav>
        )}
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

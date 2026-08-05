import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import { MODS } from '../../data/modules';

export default function RechercheGlobale() {
  const { db } = useDB();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState([]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    const q = query.toLowerCase();
    const res = [];
    
    for (const [id, M] of Object.entries(MODS)) {
      if (!M.coll || !db[M.coll]) continue;
      
      const modResults = db[M.coll].filter(o => 
        Object.values(o).some(v => String(v || "").toLowerCase().includes(q))
      );
      
      if (modResults.length > 0) {
        res.push({
          modId: id,
          label: M.label,
          fiche: M.fiche,
          champs: M.champs,
          items: modResults
        });
      }
    }
    
    setResults(res);
    setSearched(true);
  };

  const total = results.reduce((acc, r) => acc + r.items.length, 0);

  return (
    <>
      <Topbar titre="Recherche globale" />

      <div className="outils">
        <form onSubmit={handleSearch} className="spacer" style={{ display: 'flex', gap: 10 }}>
          <input
            type="search"
            placeholder="Rechercher (clients, dossiers, documents...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="spacer"
          />
          <button type="submit" className="btn">Rechercher</button>
        </form>
      </div>

      {!searched ? (
        <div className="panneau">
          <div className="vide">
            <b>Recherche globale</b>
            Tapez un terme en haut de page puis Entrée : clients, dossiers, paiements, documents… tout est parcouru.
          </div>
        </div>
      ) : total === 0 ? (
        <div className="panneau">
          <div className="vide">
            <b>Aucun résultat</b>
            Rien ne correspond à « {query} ».
          </div>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--gris)', marginBottom: 14 }}>
            {total} résultat{total > 1 ? 's' : ''} pour « {query} »
          </p>
          {results.map(r => (
            <div key={r.modId} className="res-grp">
              <h3>{r.label} — {r.items.length} résultat{r.items.length > 1 ? 's' : ''}</h3>
              <div className="panneau">
                <div className="defile">
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Résumé</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.items.slice(0, 12).map(o => {
                        const resume = r.champs.slice(0, 3).map(f => o[f.k]).filter(Boolean).join(" · ").slice(0, 90);
                        return (
                          <tr key={o.code}>
                            <td className="code">
                              {r.fiche ? (
                                <a href={`#${r.fiche}:${o.code}`}>{o.code}</a>
                              ) : o.code}
                            </td>
                            <td>{resume || "—"}</td>
                            <td>
                              <a className="btn mini doux" href={`#${r.modId}`}>Ouvrir dans {r.label}</a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

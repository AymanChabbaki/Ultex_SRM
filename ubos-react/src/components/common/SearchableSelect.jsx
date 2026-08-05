import React, { useState, useRef, useEffect } from 'react';

/**
 * Type-to-search replacement for a plain <select> over a large collection
 * (clients, dossiers, fournisseurs…). Used by FormField's "ref" field type —
 * fixing it here fixes every ref dropdown in the app at once.
 */
export default function SearchableSelect({ id, options, value, onChange, labelKey = 'nom', placeholder, disabled }) {
  const list = options || [];
  const selected = list.find(o => o.code === value) || null;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const displayLabel = (o) => (o[labelKey] || o.code) + ' · ' + o.code;

  const filtered = query.trim()
    ? list.filter(o => displayLabel(o).toLowerCase().includes(query.trim().toLowerCase()))
    : list;

  const handleSelect = (o) => {
    onChange(o.code);
    setQuery('');
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  const inputValue = open
    ? query
    : (selected ? displayLabel(selected) : (value ? `Code : ${value} (introuvable)` : ''));

  return (
    <div className="ref-select" ref={wrapRef}>
      <input
        id={id}
        type="text"
        value={inputValue}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        placeholder={placeholder || 'Rechercher…'}
        autoComplete="off"
        disabled={disabled}
      />
      {value && !open && (
        <button type="button" className="ref-select-clear" onClick={handleClear} title="Effacer la sélection">×</button>
      )}
      {open && (
        <div className="ref-select-dropdown">
          {filtered.length ? filtered.slice(0, 50).map(o => (
            <div
              key={o.code}
              className={`ref-select-option ${o.code === value ? 'actif' : ''}`}
              onMouseDown={() => handleSelect(o)}
            >
              {displayLabel(o)}
            </div>
          )) : (
            <div className="ref-select-empty">Aucun résultat.</div>
          )}
          {filtered.length > 50 && (
            <div className="ref-select-empty">{filtered.length - 50} résultat(s) de plus — affinez la recherche.</div>
          )}
        </div>
      )}
    </div>
  );
}

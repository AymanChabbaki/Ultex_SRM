import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { INCOTERMS_2020, PAYS_MONDE, PORTS_MONDE, AEROPORTS_MONDE } from '../../data/constants';
import SearchableSelect from './SearchableSelect';
import { localDateTime } from '../../utils/dataFollowup';

const BulleAide = ({ texte }) => {
  if (!texte) return null;
  return (
    <span className="aide-champ">
      ?<span className="bulle">{texte}</span>
    </span>
  );
};

const FormField = ({ fieldConfig, f, value, onChange, disabled, label, type, options, formData = {} }) => {
  const { db } = useDB();

  // Normalize field definition object
  const fieldDef = f || fieldConfig || {
    k: label ? label.toLowerCase().replace(/\s+/g, '') : 'field',
    l: label || '',
    t: type || 'text',
    opts: options || []
  };

  const val = value ?? '';
  const [refSearch, setRefSearch] = useState('');

  const handleChange = (e) => {
    const v = e && e.target !== undefined ? e.target.value : e;
    if (typeof onChange === 'function') {
      onChange(v);
    }
  };

  let inputEl = null;
  const originalFieldType = fieldDef.t || 'text';
  const fieldType = originalFieldType === 'date' && /echeance/i.test(fieldDef.k) ? 'datetime-local' : originalFieldType;

  if (fieldType === "select") {
    let opts = typeof fieldDef.opts === "function" ? fieldDef.opts(db) : (fieldDef.opts || []);
    if (!Array.isArray(opts)) opts = [];
    inputEl = (
      <select id={`f_${fieldDef.k}`} value={val} onChange={handleChange} disabled={disabled}>
        <option value="">—</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
        {val && !opts.includes(val) && <option value={val}>{val}</option>}
      </select>
    );
  } else if (fieldType === "incoterm") {
    inputEl = (
      <select id={`f_${fieldDef.k}`} value={val} onChange={handleChange} disabled={disabled}>
        <option value="">—</option>
        {INCOTERMS_2020.map(i => (
          <option key={i.code} value={i.code}>{i.code} — {i.nom.split(" — ")[1]}</option>
        ))}
      </select>
    );
  } else if (fieldType === "pays") {
    inputEl = (
      <>
        <input 
          id={`f_${fieldDef.k}`} 
          list="dl_pays" 
          value={val} 
          onChange={handleChange} 
          placeholder="Rechercher un pays…" 
          autoComplete="off" 
          disabled={disabled}
        />
        <datalist id="dl_pays">
          {PAYS_MONDE.map(p => <option key={p.c} value={p.n} />)}
        </datalist>
      </>
    );
  } else if (fieldType === "port" || fieldType === "aeroport") {
    const listData = fieldType === "port" ? PORTS_MONDE : AEROPORTS_MONDE;
    const datalistId = `dl_${fieldDef.k}`;
    inputEl = (
      <>
        <input
          id={`f_${fieldDef.k}`}
          list={datalistId}
          value={val}
          onChange={handleChange}
          placeholder={`Rechercher un ${fieldType}…`}
          autoComplete="off"
          disabled={disabled}
        />
        <datalist id={datalistId}>
          {listData.map((p, i) => <option key={(typeof p === 'string' ? p : (p.l || p.i)) || i} value={typeof p === 'string' ? p : p.n} />)}
        </datalist>
      </>
    );
  } else if (fieldType === "multiref") {
    const allOptions = db && fieldDef.coll && db[fieldDef.coll] ? db[fieldDef.coll] : [];
    const options = typeof fieldDef.filterOptions === 'function'
      ? allOptions.filter(item => fieldDef.filterOptions(item, formData, db))
      : allOptions;
    const selected = Array.isArray(value) ? value : [];
    const optionLabel = item => typeof fieldDef.formatOption === 'function'
      ? fieldDef.formatOption(item, db)
      : item[fieldDef.cle] || item.code;
    const recherche = refSearch.trim().toLocaleLowerCase('fr');
    const visibles = options.filter(item => !recherche || `${item.code} ${optionLabel(item)} ${item.statut || ''}`.toLocaleLowerCase('fr').includes(recherche));
    const toggle = (code, checked) => {
      handleChange(checked ? [...new Set([...selected, code])] : selected.filter(item => item !== code));
    };
    inputEl = (
      <div style={{ border: '1px solid var(--bord)', borderRadius: '10px', padding: '12px', background: 'var(--fond)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
          <input
            type="search"
            value={refSearch}
            onChange={event => setRefSearch(event.target.value)}
            placeholder="Rechercher une commande, un client ou un statut…"
            disabled={disabled}
            style={{ flex: 1 }}
          />
          <span className="pill p-or">{selected.length} sélectionnée(s)</span>
        </div>
        <div style={{ display: 'grid', gap: '7px', maxHeight: '240px', overflowY: 'auto' }}>
          {visibles.length ? visibles.map(item => (
            <div key={item.code} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 10px', border: '1px solid var(--bord)', borderRadius: '8px', background: selected.includes(item.code) ? 'var(--fond-jaune)' : 'white' }}>
              <input type="checkbox" checked={selected.includes(item.code)} onChange={event => toggle(item.code, event.target.checked)} disabled={disabled} />
              <button type="button" onClick={() => toggle(item.code, !selected.includes(item.code))} disabled={disabled} style={{ flex: 1, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                <b>{optionLabel(item)}</b>
                <small style={{ display: 'block', color: 'var(--gris)', marginTop: '2px' }}>{item.statut || 'Statut non défini'}</small>
              </button>
              {fieldDef.coll === 'commandes' && <a className="btn mini doux" href={`#ficheCommande:${item.code}`}>Ouvrir</a>}
            </div>
          )) : <div className="vide">Aucune commande disponible.</div>}
        </div>
      </div>
    );
  } else if (fieldType === "ref") {
    const allOptions = db && fieldDef.coll && db[fieldDef.coll] ? db[fieldDef.coll] : [];
    const options = typeof fieldDef.filterOptions === 'function'
      ? allOptions.filter(item => fieldDef.filterOptions(item, formData, db))
      : allOptions;
    inputEl = (
      <SearchableSelect
        id={`f_${fieldDef.k}`}
        options={options}
        value={val}
        onChange={handleChange}
        labelKey={fieldDef.cle}
        placeholder={`Rechercher ${fieldDef.l ? fieldDef.l.toLowerCase() : 'un élément'}…`}
        disabled={disabled}
      />
    );
  } else if (fieldType === "file") {
    const handleFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
          reader.readAsDataURL(file);
        });
        handleChange(dataUrl);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Erreur de lecture du fichier joint:", err);
      }
    };
    inputEl = (
      <div className="champ-file">
        <input id={`f_${fieldDef.k}`} type="file" onChange={handleFile} disabled={disabled} />
        {val && (
          <div className="champ-file-apercu">
            <a href={val} target="_blank" rel="noreferrer">Voir la pièce jointe</a>
            <button type="button" onClick={() => handleChange('')}>Retirer</button>
          </div>
        )}
      </div>
    );
  } else if (fieldType === "textarea") {
    inputEl = (
      <textarea id={`f_${fieldDef.k}`} value={val} onChange={handleChange} disabled={disabled} />
    );
  } else {
    inputEl = (
      <input type={fieldType} id={`f_${fieldDef.k}`} value={fieldType === 'datetime-local' ? localDateTime(val) : val} onChange={handleChange} disabled={disabled} />
    );
  }

  return (
    <div className={`champ ${fieldDef.large ? "large" : ""}`}>
      <label>
        {fieldDef.l}{fieldDef.req ? " *" : ""}
        <BulleAide texte={fieldDef.aide} />
      </label>
      {inputEl}
    </div>
  );
};

export default FormField;

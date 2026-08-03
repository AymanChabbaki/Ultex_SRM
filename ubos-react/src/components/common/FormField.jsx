import React from 'react';
import { useDB } from '../../context/DBContext';
import { INCOTERMS_2020, PAYS_MONDE, PORTS_MONDE, AEROPORTS_MONDE } from '../../data/constants';

const BulleAide = ({ texte }) => {
  if (!texte) return null;
  return (
    <span className="aide-champ">
      ?<span className="bulle">{texte}</span>
    </span>
  );
};

const FormField = ({ fieldConfig, f, value, onChange, disabled, label, type, options }) => {
  const { db } = useDB();

  // Normalize field definition object
  const fieldDef = f || fieldConfig || {
    k: label ? label.toLowerCase().replace(/\s+/g, '') : 'field',
    l: label || '',
    t: type || 'text',
    opts: options || []
  };

  const val = value ?? '';

  const handleChange = (e) => {
    const v = e && e.target !== undefined ? e.target.value : e;
    if (typeof onChange === 'function') {
      onChange(v);
    }
  };

  let inputEl = null;
  const fieldType = fieldDef.t || 'text';

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
    inputEl = (
      <>
        <input 
          id={`f_${fieldDef.k}`} 
          list={`dl_${fieldDef.t}s`} 
          value={val} 
          onChange={handleChange} 
          placeholder={`Rechercher un ${fieldType}…`} 
          autoComplete="off"
          disabled={disabled}
        />
        <datalist id={`dl_${fieldDef.t}s`}>
          {listData.map(p => <option key={p.c || p} value={typeof p === 'string' ? p : p.n} />)}
        </datalist>
      </>
    );
  } else if (fieldType === "ref") {
    const options = db && fieldDef.coll && db[fieldDef.coll] ? db[fieldDef.coll] : [];
    inputEl = (
      <select id={`f_${fieldDef.k}`} value={val} onChange={handleChange} disabled={disabled}>
        <option value="">—</option>
        {options.map(o => (
          <option key={o.code} value={o.code}>
            {(o[fieldDef.cle] || o.code) + " · " + o.code}
          </option>
        ))}
      </select>
    );
  } else if (fieldType === "textarea") {
    inputEl = (
      <textarea id={`f_${fieldDef.k}`} value={val} onChange={handleChange} disabled={disabled} />
    );
  } else {
    inputEl = (
      <input type={fieldType} id={`f_${fieldDef.k}`} value={val} onChange={handleChange} disabled={disabled} />
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

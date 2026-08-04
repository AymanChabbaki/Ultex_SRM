import React from 'react';

const KVDisplay = ({ data, fields }) => {
  if (!data) return null;

  // 1. Array of { label, value } or { l, v }
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    return (
      <div className="kv">
        {data.map((item, idx) => (
          <div key={idx}>
            <label>{item.label || item.l}</label>
            <span>{item.value !== undefined && item.value !== null ? item.value : (item.v || "—")}</span>
          </div>
        ))}
      </div>
    );
  }

  // 2. Object with explicit fields configuration array [{ k, l, render }]
  if (typeof data === 'object' && Array.isArray(fields)) {
    return (
      <div className="kv">
        {fields.map((f, idx) => {
          let val = data[f.k];
          if (typeof f.render === 'function') {
            val = f.render(val, data);
          }
          return (
            <div key={f.k || idx}>
              <label>{f.l || f.label || f.k}</label>
              <span>{val !== undefined && val !== null && val !== "" ? val : "—"}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Raw Object key-value display fallback
  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) return null;
    return (
      <div className="kv">
        {entries.map(([k, v], idx) => (
          <div key={k || idx}>
            <label>{k}</label>
            <span>{typeof v === 'object' ? JSON.stringify(v) : (v !== undefined && v !== null && v !== "" ? String(v) : "—")}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
};

export default KVDisplay;

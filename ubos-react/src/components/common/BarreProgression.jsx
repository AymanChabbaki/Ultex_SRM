import React from 'react';

export default function BarreProgression({ val, obj, label }) {
  const pct = obj ? Math.min(100, Math.round((val / obj) * 100)) : 0;
  const cls = pct >= 100 ? '' : pct >= 50 ? 'attention' : 'alerte';
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
        <span>{label}</span><b>{val} / {obj || '—'}</b>
      </div>
      <div className={`barre-progression ${cls}`}><div style={{ width: `${pct}%` }}></div></div>
    </div>
  );
}

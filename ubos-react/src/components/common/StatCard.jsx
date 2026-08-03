import React from 'react';

export default function StatCard({ value, val, label, alerte }) {
  const displayVal = value !== undefined ? value : val;
  return (
    <div className={`stat ${alerte ? 'alerte' : ''}`}>
      <b>{displayVal ?? 0}</b>
      <span>{label}</span>
    </div>
  );
}

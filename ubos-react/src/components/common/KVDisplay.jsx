import React from 'react';

const KVDisplay = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="kv">
      {data.map((item, idx) => (
        <div key={idx}>
          <label>{item.label}</label>
          <span>{item.value || "—"}</span>
        </div>
      ))}
    </div>
  );
};

export default KVDisplay;

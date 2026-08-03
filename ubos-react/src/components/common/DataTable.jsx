import React from 'react';
import EmptyState from './EmptyState';

const DataTable = ({ columns, data, actions, onRowClick }) => {
  if (!data || data.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="panneau">
      <div className="defile">
        <table>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i}>{col.label}</th>
              ))}
              {actions && actions.length > 0 && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={row.code || rowIndex} onClick={onRowClick ? () => onRowClick(row) : undefined} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
                {columns.map((col, colIndex) => (
                  <td key={colIndex}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] || "—")}
                  </td>
                ))}
                {actions && actions.length > 0 && (
                  <td onClick={(e) => e.stopPropagation()}>
                    {actions.map((act, actIndex) => (
                      <button 
                        key={actIndex} 
                        className={`btn mini ${act.danger ? 'rouge' : ''}`} 
                        onClick={() => act.onClick(row)}
                        title={act.title}
                        style={{ marginRight: '4px' }}
                      >
                        {act.icon || act.label}
                      </button>
                    ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;

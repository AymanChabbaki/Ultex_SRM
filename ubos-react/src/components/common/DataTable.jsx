import React from 'react';
import EmptyState from './EmptyState';

const DataTable = ({ columns, data, actions, onRowClick }) => {
  const listData = Array.isArray(data) ? data : [];
  const listCols = Array.isArray(columns) ? columns : [];
  const listActions = Array.isArray(actions) ? actions : [];

  if (listData.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="panneau">
      <div className="defile">
        <table>
          <thead>
            <tr>
              {listCols.map((col, i) => (
                <th key={i}>{col.label}</th>
              ))}
              {listActions.length > 0 && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {listData.map((row, rowIndex) => (
              <tr key={row.code || row.id || rowIndex} onClick={onRowClick ? () => onRowClick(row) : undefined} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
                {listCols.map((col, colIndex) => (
                  <td key={colIndex}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] !== undefined && row[col.key] !== null && row[col.key] !== "" ? row[col.key] : "—")}
                  </td>
                ))}
                {listActions.length > 0 && (
                  <td onClick={(e) => e.stopPropagation()}>
                    {listActions.map((act, actIndex) => (
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

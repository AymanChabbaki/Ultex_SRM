import React from 'react';

const Modal = ({ isOpen = true, onClose, title, titre, large, children, footer }) => {
  if (!isOpen) return null;

  const displayTitle = title || titre || "";

  return (
    <div className="voile on" id="voile" onClick={(e) => { if (e.target.id === 'voile') onClose(); }}>
      <div className={`modale ${large ? 'large' : ''}`} id="modale" onClick={e => e.stopPropagation()}>
        <header>
          <h3>{displayTitle}</h3>
          <button onClick={onClose}>✕</button>
        </header>
        {children}
        {footer && (
          <footer>
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

export default Modal;

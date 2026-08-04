import React from 'react';

export default function Logo({ size = 'medium', light = false }) {
  const logoSrc = light ? '/Ultex Logo white.svg' : '/logo.svg';
  const width = size === 'large' ? 180 : size === 'medium' ? 140 : 110;

  return (
    <div className={`ultex-logo-brand ${size} ${light ? 'light-theme' : 'dark-theme'}`}>
      <img 
        src={logoSrc} 
        alt="ULTEx Logo" 
        style={{ width: `${width}px`, height: 'auto', display: 'block' }}
        className="ultex-brand-img"
        onError={(e) => {
          // Fallback to /logo.svg if white svg fails
          e.target.src = '/logo.svg';
        }}
      />
    </div>
  );
}

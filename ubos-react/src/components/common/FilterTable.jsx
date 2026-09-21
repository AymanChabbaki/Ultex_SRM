import React, { useState } from 'react';

function flatten(children, prefix = '') {
  return React.Children.toArray(children).flatMap((child, index) => {
    const key = `${prefix}${child?.key ?? index}:`;
    return child?.type === React.Fragment ? flatten(child.props.children, key) : [React.isValidElement(child) ? React.cloneElement(child, {key}) : child];
  });
}

function text(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(text).join(' ');
  if (React.isValidElement(value)) {
    const props = value.props;
    if (props.dangerouslySetInnerHTML) {
      if (typeof document === 'undefined') return props.dangerouslySetInnerHTML.__html.replace(/<[^>]+>/g, '');
      const element = document.createElement('span');
      element.innerHTML = props.dangerouslySetInnerHTML.__html;
      return element.textContent || '';
    }
    return text(props.children ?? props.texte ?? props.label ?? props.value ?? props.type);
  }
  return String(value);
}

export default function FilterTable({ children, ...props }) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ index: -1, direction: 1 });
  const sections = flatten(children);
  const head = sections.find(section => section?.type === 'thead');
  const headerRow = head && flatten(head.props.children).find(row => row.type === 'tr');
  const headers = headerRow ? flatten(headerRow.props.children) : [];
  const valueAt = (row, index) => text(flatten(row.props.children)[index]);
  const compare = (a, b) => {
    const av = valueAt(a, sort.index), bv = valueAt(b, sort.index);
    const number = value => /^[-+\d\s.,]+(?:\s*(?:MAD|kg|pcs|%))?$/i.test(value.trim())
      ? Number(value.replace(/\s|MAD|kg|pcs|%/gi, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) : NaN;
    const an = number(av), bn = number(bv);
    const frenchDate = value => {
      const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
      return match ? `${match[3]}-${match[2]}-${match[1]}${match[4]}` : value;
    };
    return sort.direction * (Number.isFinite(an) && Number.isFinite(bn) ? an - bn : frenchDate(av).localeCompare(frenchDate(bv), 'fr', { numeric: true }));
  };
  const filteredRows = rows => {
    const matches = rows.filter(row => Object.entries(filters).every(([index, value]) => valueAt(row, Number(index)).toLocaleLowerCase('fr').includes(value.toLocaleLowerCase('fr'))));
    return sort.index >= 0 ? [...matches].sort(compare) : matches;
  };
  return <table {...props}>{sections.map((section, sectionIndex) => {
    if (section?.type === 'thead' && headers.length) return React.cloneElement(section, { key: sectionIndex }, <>
      {flatten(section.props.children).map((row, index) => index !== 0 ? row : React.cloneElement(row, { key:index }, headers.map((header, column) => {
        const label = text(header);
        const enabled = !/^(Actions?|Fichier)$/i.test(label.trim()) && !header.props.colSpan;
        return React.cloneElement(header, { key:column }, <>
          {enabled ? <><span className="table-print-label">{header.props.children}</span><button type="button" className="btn mini doux" onClick={() => setSort({ index:column, direction: sort.index === column ? -sort.direction : 1 })} aria-label={`Trier par ${label}`}>{header.props.children} {sort.index === column ? sort.direction === 1 ? '↑' : '↓' : '↕'}</button></> : header.props.children}
          {enabled && <input className="table-column-filter" type="search" aria-label={`Filtrer ${label}`} placeholder="Filtrer…" value={filters[column] || ''} onChange={e => setFilters({ ...filters, [column]:e.target.value })} style={{display:'block', minWidth:90, width:'100%', marginTop:5}} />}
        </>);
      })))}
    </>);
    if (section?.type !== 'tbody') return section;
    // Keep section/group headings in place and sort their own rows only.
    const rows = flatten(section.props.children).filter(row => row?.type === 'tr');
    const blocks = []; let block = [];
    for (const row of rows) {
      if (flatten(row.props.children).some(cell => cell.props?.colSpan > 1)) {
        blocks.push(...filteredRows(block), row); block = [];
      } else block.push(row);
    }
    blocks.push(...filteredRows(block));
    return React.cloneElement(section, { key:sectionIndex }, blocks);
  })}</table>;
}

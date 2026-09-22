import React, { useEffect, useState } from 'react';

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function flatten(children, prefix = '') {
  return React.Children.toArray(children).flatMap((child, index) => {
    const key = `${prefix}${child?.key ?? index}:`;
    return child?.type === React.Fragment ? flatten(child.props.children, key) : [React.isValidElement(child) ? React.cloneElement(child, { key }) : child];
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

function normalizedPageSize(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PAGE_SIZE;
}

function pageButtons(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach(page => pages.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach(page => pages.add(page));
  const sorted = [...pages].filter(page => page > 0 && page <= total).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) result.push(`gap-${page}`);
    result.push(page);
  });
  return result;
}

function isGroupHeading(row) {
  return flatten(row.props.children).some(cell => cell.props?.colSpan > 1);
}

function rowGroups(rows, filterAndSort) {
  const groups = [{ heading: null, rows: [] }];
  for (const row of rows) {
    if (isGroupHeading(row)) groups.push({ heading: row, rows: [] });
    else groups.at(-1).rows.push(row);
  }
  return groups.map(group => ({ ...group, rows: filterAndSort(group.rows) })).filter(group => group.rows.length);
}

export default function FilterTable({
  children,
  pagination = true,
  pageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  ...props
}) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ index: -1, direction: 1 });
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(normalizedPageSize(pageSize));
  const sections = flatten(children);
  const head = sections.find(section => section?.type === 'thead');
  const headerRow = head && flatten(head.props.children).find(row => row.type === 'tr');
  const headers = headerRow ? flatten(headerRow.props.children) : [];
  const actionColumns = new Set(headers.map((header, index) => (/^(Actions?|Fichier)$/i.test(text(header).trim()) ? index : -1)).filter(index => index >= 0));
  const valueAt = (row, index) => text(flatten(row.props.children)[index]);

  useEffect(() => {
    setRowsPerPage(normalizedPageSize(pageSize));
    setPage(1);
  }, [pageSize]);

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

  let bodyOffset = 0;
  const bodyModels = sections.filter(section => section?.type === 'tbody').map(section => {
    const rows = flatten(section.props.children).filter(row => row?.type === 'tr');
    const groups = rowGroups(rows, filteredRows);
    const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
    const model = { section, groups, offset: bodyOffset, count };
    bodyOffset += count;
    return model;
  });

  const totalRows = bodyModels.reduce((sum, model) => sum + model.count, 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const currentPage = pagination ? Math.min(page, totalPages) : 1;
  const firstIndex = pagination ? (currentPage - 1) * rowsPerPage : 0;
  const lastIndex = pagination ? Math.min(firstIndex + rowsPerPage, totalRows) : totalRows;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const decorateRow = row => React.cloneElement(row, {}, flatten(row.props.children).map((cell, column) => {
    if (!React.isValidElement(cell)) return cell;
    const fullText = text(cell).replace(/\s+/g, ' ').trim();
    const className = [cell.props.className, actionColumns.has(column) ? 'table-actions-cell' : 'table-cell-truncate'].filter(Boolean).join(' ');
    return React.cloneElement(cell, {
      className,
      title: cell.props.title || (!actionColumns.has(column) && fullText.length > 24 ? fullText : undefined),
    });
  }));

  const renderBody = model => {
    const localStart = Math.max(0, firstIndex - model.offset);
    const localEnd = Math.min(model.count, lastIndex - model.offset);
    if (localEnd <= localStart) return React.cloneElement(model.section, { key: model.section.key }, []);
    const visible = [];
    let groupOffset = 0;
    model.groups.forEach(group => {
      const start = Math.max(0, localStart - groupOffset);
      const end = Math.min(group.rows.length, localEnd - groupOffset);
      if (end > start) {
        if (group.heading) visible.push(group.heading);
        visible.push(...group.rows.slice(start, end).map(decorateRow));
      }
      groupOffset += group.rows.length;
    });
    return React.cloneElement(model.section, { key: model.section.key }, visible);
  };

  let bodyIndex = 0;
  const tableSections = sections.map((section, sectionIndex) => {
    if (section?.type === 'thead' && headers.length) return React.cloneElement(section, { key: sectionIndex }, <>
      {flatten(section.props.children).map((row, index) => index !== 0 ? row : React.cloneElement(row, { key: index }, headers.map((header, column) => {
        const label = text(header);
        const enabled = !/^(Actions?|Fichier)$/i.test(label.trim()) && !header.props.colSpan;
        return React.cloneElement(header, { key: column, title: header.props.title || label }, <>
          {enabled ? <><span className="table-print-label">{header.props.children}</span><button type="button" className="table-sort-button" onClick={() => {
            setSort({ index: column, direction: sort.index === column ? -sort.direction : 1 });
            setPage(1);
          }} aria-label={`Trier par ${label}`}>{header.props.children} <span aria-hidden="true">{sort.index === column ? sort.direction === 1 ? '↑' : '↓' : '↕'}</span></button></> : header.props.children}
          {enabled && <input className="table-column-filter" type="search" aria-label={`Filtrer ${label}`} placeholder="Filtrer…" value={filters[column] || ''} onChange={event => {
            setFilters(previous => ({ ...previous, [column]: event.target.value }));
            setPage(1);
          }} />}
        </>);
      })))}
    </>);
    if (section?.type !== 'tbody') return section;
    const rendered = renderBody(bodyModels[bodyIndex]);
    bodyIndex += 1;
    return rendered;
  });

  if (!totalRows) {
    const firstBody = tableSections.findIndex(section => section?.type === 'tbody');
    const emptyBody = <tbody key="empty"><tr><td className="table-empty-row" colSpan={Math.max(1, headers.length)}>Aucun résultat</td></tr></tbody>;
    if (firstBody >= 0) tableSections[firstBody] = emptyBody;
    else tableSections.push(emptyBody);
  }

  const showPagination = pagination && totalRows > 0;
  const options = [...new Set([...pageSizeOptions.map(normalizedPageSize), rowsPerPage])].sort((a, b) => a - b);
  const tableClassName = ['filter-table-table', props.className].filter(Boolean).join(' ');
  const tableStyle = { ...props.style, '--table-columns': Math.max(1, headers.length) };
  const { className: _className, style: _style, ...tableProps } = props;

  return <div className="filter-table-shell">
    <div className="filter-table-scroll">
      <table {...tableProps} className={tableClassName} style={tableStyle}>{tableSections}</table>
    </div>
    {showPagination && <nav className="table-pagination" aria-label="Pagination du tableau">
      <div className="table-pagination-summary">
        <strong>{totalRows ? firstIndex + 1 : 0}–{lastIndex}</strong> sur <strong>{totalRows}</strong>
      </div>
      <label className="table-page-size">
        <span>Lignes</span>
        <select value={rowsPerPage} onChange={event => {
          setRowsPerPage(normalizedPageSize(event.target.value));
          setPage(1);
        }} aria-label="Nombre de lignes par page">
          {options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      {totalPages > 1 && <div className="table-page-buttons">
        <button type="button" className="table-page-nav" onClick={() => setPage(1)} disabled={currentPage === 1} aria-label="Première page">«</button>
        <button type="button" className="table-page-nav" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Page précédente">‹</button>
        {pageButtons(currentPage, totalPages).map(item => typeof item === 'string'
          ? <span className="table-page-gap" key={item}>…</span>
          : <button type="button" key={item} className={`table-page-number${item === currentPage ? ' active' : ''}`} aria-current={item === currentPage ? 'page' : undefined} onClick={() => setPage(item)}>{item}</button>)}
        <button type="button" className="table-page-nav" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} aria-label="Page suivante">›</button>
        <button type="button" className="table-page-nav" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} aria-label="Dernière page">»</button>
      </div>}
    </nav>}
  </div>;
}

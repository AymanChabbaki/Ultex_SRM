// Database identity is authoritative. Some older JSON payloads still contain
// stale `id`/`code` values from a previous client association; spreading the
// JSON after the columns made the dashboard display one code while linking to
// another. Keep business fields from JSON, then overwrite identity from the
// actual collection_items row.
export function serializeCollectionRows(rows = []) {
  return rows.map(item => ({
    ...(item.data && typeof item.data === 'object' ? item.data : {}),
    id: item.id,
    code: item.code,
    createdAt: item.createdAt instanceof Date
      ? item.createdAt.toISOString()
      : item.createdAt,
  }));
}

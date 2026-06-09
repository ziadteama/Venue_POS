import { EmptyState } from './EmptyState.jsx';

/**
 * Modern data table.
 *
 * columns: [{ key, header, align?: 'start'|'end'|'center', numeric?, render?(row), headerClassName?, cellClassName?, width? }]
 * rows: array of records
 * rowKey: (row) => string
 * Provides: sticky header, hover rows, right-aligned numerics (tabular-nums),
 * loading skeleton rows, empty state, optional row click, optional footer.
 */
export function DataTable({
  columns,
  rows = [],
  rowKey = (_, i) => i,
  loading = false,
  skeletonRows = 6,
  onRowClick,
  isRowActive,
  empty,
  footer,
  className = '',
}) {
  const alignClass = (col) =>
    col.numeric || col.align === 'end'
      ? 'text-end'
      : col.align === 'center'
        ? 'text-center'
        : 'text-start';

  return (
    <div className={`scrollbar-slim overflow-x-auto ${className}`}>
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={`whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${alignClass(
                  col,
                )} ${col.headerClassName ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, r) => (
              <tr key={`sk-${r}`}>
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3.5">
                    <div className="skeleton h-4 w-full max-w-[120px] rounded" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? <EmptyState title="No records" />}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const active = isRowActive?.(row);
              return (
                <tr
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${active ? 'bg-accent-50/60' : 'hover:bg-slate-50/80'}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-5 py-3.5 text-slate-700 ${alignClass(col)} ${
                        col.numeric ? 'tabular-nums' : ''
                      } ${col.cellClassName ?? ''}`}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
        {footer ? <tfoot className="border-t border-slate-200 bg-slate-50/60">{footer}</tfoot> : null}
      </table>
    </div>
  );
}

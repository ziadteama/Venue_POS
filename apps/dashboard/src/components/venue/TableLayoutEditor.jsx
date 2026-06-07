import { useCallback, useEffect, useRef, useState } from 'react';

export function TableLayoutEditor({ tables, onChange, t }) {
  const canvasRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);

  function updateTable(id, patch) {
    onChange(tables.map((table) => (table.id === id ? { ...table, ...patch } : table)));
  }

  function addTable() {
    const next = tables.length + 1;
    onChange([
      ...tables,
      {
        id: `table-${Date.now()}`,
        label: String(next),
        x: 10 + (next % 5) * 18,
        y: 10 + Math.floor(next / 5) * 18,
        seats: 4,
      },
    ]);
  }

  function removeTable(id) {
    onChange(tables.filter((table) => table.id !== id));
  }

  const onPointerMove = useCallback(
    (event) => {
      if (!draggingId || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      updateTable(draggingId, { x: Math.round(x), y: Math.round(y) });
    },
    [draggingId, tables, onChange],
  );

  useEffect(() => {
    if (!draggingId) return undefined;
    const stop = () => setDraggingId(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stop);
    };
  }, [draggingId, onPointerMove]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-secondary">{t('venueConfig.tableLayoutHint')}</p>
        <button
          type="button"
          onClick={addTable}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          {t('venueConfig.addTable')}
        </button>
      </div>

      <div
        ref={canvasRef}
        className="relative h-72 rounded-xl border border-slate-200 bg-slate-50"
      >
        {tables.map((table) => (
          <button
            key={table.id}
            type="button"
            onPointerDown={() => setDraggingId(table.id)}
            className="absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center justify-center rounded-full border-2 border-primary-to bg-white text-xs font-semibold shadow-sm active:cursor-grabbing"
            style={{ left: `${table.x}%`, top: `${table.y}%` }}
          >
            <span>{table.label}</span>
            <span className="text-[10px] font-normal text-secondary">{table.seats}p</span>
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {tables.map((table) => (
          <li
            key={table.id}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3"
          >
            <label className="text-sm">
              <span className="mb-1 block text-xs text-secondary">{t('venueConfig.tableLabel')}</span>
              <input
                className="w-24 rounded border px-2 py-1"
                value={table.label}
                onChange={(e) => updateTable(table.id, { label: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-secondary">{t('venueConfig.tableSeats')}</span>
              <input
                type="number"
                min="1"
                max="20"
                className="w-20 rounded border px-2 py-1"
                value={table.seats}
                onChange={(e) => updateTable(table.id, { seats: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              onClick={() => removeTable(table.id)}
              className="rounded border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
            >
              {t('venueConfig.removeTable')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

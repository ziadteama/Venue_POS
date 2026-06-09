import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { InboxIcon } from './icons.jsx';

function CustomTooltip({ active, payload, locale, currencyLabel }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const value = payload[0].value;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-card-hover">
      <p className="text-xs font-medium text-slate-400">{point?.date ?? point?.weekday}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">
        {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} {currencyLabel}
      </p>
    </div>
  );
}

export function MiniBarChart({ data, locale, currencyLabel, emptyLabel }) {
  if (!data?.length) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <InboxIcon className="h-6 w-6" />
        </span>
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#eef1f6" />
          <XAxis
            dataKey="weekday"
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => new Intl.NumberFormat(locale, { notation: 'compact' }).format(v)}
          />
          <Tooltip
            cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={<CustomTooltip locale={locale} currencyLabel={currencyLabel} />}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#059669"
            strokeWidth={2.5}
            fill="url(#revenueFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: '#059669' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

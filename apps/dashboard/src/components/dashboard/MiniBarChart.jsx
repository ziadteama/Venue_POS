import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function MiniBarChart({ data, locale, currencyLabel, emptyLabel }) {
  if (!data?.length) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-slate-500">{emptyLabel}</p>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="weekday" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            formatter={(value) =>
              new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value) +
              ` ${currencyLabel}`
            }
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
            contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
          />
          <Bar dataKey="revenue" fill="#1d4ed8" radius={[6, 6, 0, 0]} maxBarSize={42} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

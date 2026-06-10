import { Link } from 'react-router-dom';

/** Lightweight trail for Shifts → Cheques → Orders hub navigation. */
export function OpsBreadcrumb({ items }) {
  if (!items?.length) return null;
  return (
    <nav
      aria-label="Operations"
      className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500"
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
          {index > 0 ? <span className="text-slate-300">/</span> : null}
          {item.to ? (
            <Link to={item.to} className="font-medium text-accent-700 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

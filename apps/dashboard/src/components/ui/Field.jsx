import { ChevronDownIcon } from '../dashboard/icons.jsx';

/** Label + hint + error wrapper for any form control. */
export function Field({ label, hint, error, htmlFor, required, children, className = '' }) {
  return (
    <label htmlFor={htmlFor} className={`block ${className}`}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="text-red-500">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = '', invalid = false, ...props }) {
  return (
    <input
      className={`premium-input ${invalid ? 'border-red-300 focus:border-red-400 focus:ring-red-500/15' : ''} ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = '', rows = 3, ...props }) {
  return <textarea rows={rows} className={`premium-input resize-none ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <div className="relative">
      <select
        className={`premium-input appearance-none pe-9 ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

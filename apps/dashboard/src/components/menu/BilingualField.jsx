import { isMissingTranslation } from '../../utils/menuTranslations.js';

export function BilingualField({
  labelEn,
  labelAr,
  nameEn,
  nameAr,
  onNameEnChange,
  onNameArChange,
  disabled,
  requiredEn,
  missingLabel,
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm">
        <span className="mb-1 flex items-center gap-2 font-medium text-slate-700">
          {labelEn}
          {requiredEn ? <span className="text-red-500">*</span> : null}
        </span>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-2"
          value={nameEn}
          onChange={(e) => onNameEnChange(e.target.value)}
          disabled={disabled}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 flex items-center gap-2 font-medium text-slate-700">
          {labelAr}
          {isMissingTranslation(nameAr) ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {missingLabel}
            </span>
          ) : null}
        </span>
        <input
          dir="rtl"
          className="w-full rounded-lg border border-slate-200 px-3 py-2"
          value={nameAr}
          onChange={(e) => onNameArChange(e.target.value)}
          disabled={disabled}
        />
      </label>
    </div>
  );
}

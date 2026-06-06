import { useTranslation } from 'react-i18next';

function currentLang(i18n) {
  return (i18n.resolvedLanguage ?? i18n.language).split('-')[0];
}

export function LanguageToggle({ onDark = false }) {
  const { i18n } = useTranslation();
  const active = currentLang(i18n);

  function btnClass(code) {
    const isActive = active === code;
    if (onDark) {
      return isActive
        ? 'min-w-[2.75rem] rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-primary-from'
        : 'min-w-[2.75rem] rounded-md border border-white/35 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20';
    }
    return isActive
      ? 'min-w-[2.75rem] rounded-md bg-primary-gradient px-3 py-1.5 text-sm font-semibold text-white'
      : 'min-w-[2.75rem] rounded-md border border-secondary/40 bg-white px-3 py-1.5 text-sm font-medium text-slate-700';
  }

  return (
    <div className="flex gap-1">
      <button type="button" onClick={() => i18n.changeLanguage('en')} className={btnClass('en')}>
        EN
      </button>
      <button
        type="button"
        lang="ar"
        onClick={() => i18n.changeLanguage('ar')}
        className={btnClass('ar')}
      >
        ع
      </button>
    </div>
  );
}

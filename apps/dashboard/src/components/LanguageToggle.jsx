import { useTranslation } from 'react-i18next';

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">{t('nav.language')}:</span>
      <button
        type="button"
        onClick={() => i18n.changeLanguage('en')}
        className={`rounded px-2 py-1 text-sm ${i18n.language === 'en' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => i18n.changeLanguage('ar')}
        className={`rounded px-2 py-1 text-sm ${i18n.language === 'ar' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
      >
        ع
      </button>
    </div>
  );
}

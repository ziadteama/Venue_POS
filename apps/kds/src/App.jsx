import { useTranslation } from 'react-i18next';

export default function App() {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex items-center justify-between bg-primary-gradient px-6 py-4">
        <h1 className="text-3xl font-bold text-white">{t('kds.title')}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => i18n.changeLanguage('en')}
            className="rounded bg-white/15 px-4 py-2 text-lg ring-1 ring-white/30 hover:bg-white/25"
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => i18n.changeLanguage('ar')}
            className="rounded bg-white/15 px-4 py-2 text-lg ring-1 ring-white/30 hover:bg-white/25"
          >
            ع
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-2xl text-secondary">{t('kds.noOrders')}</p>
      </main>
    </div>
  );
}

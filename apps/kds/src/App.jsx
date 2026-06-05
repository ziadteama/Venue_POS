import { useTranslation } from 'react-i18next';

export default function App() {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex items-center justify-between bg-zinc-900 px-6 py-4">
        <h1 className="text-3xl font-bold">{t('kds.title')}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => i18n.changeLanguage('en')}
            className="rounded bg-zinc-700 px-4 py-2 text-lg"
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => i18n.changeLanguage('ar')}
            className="rounded bg-zinc-700 px-4 py-2 text-lg"
          >
            ع
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-2xl text-zinc-400">{t('kds.noOrders')}</p>
      </main>
    </div>
  );
}

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, getDirection } from '@venue-pos/i18n';

const saved = localStorage.getItem('locale') ?? 'en';
i18n.use(initReactI18next).init({ resources, lng: saved, fallbackLng: 'en' });
document.documentElement.dir = getDirection(saved);

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('locale', lng);
  document.documentElement.dir = getDirection(lng);
});

export default i18n;

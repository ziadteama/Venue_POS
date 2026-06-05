import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, getDirection } from '@venue-pos/i18n';

i18n.use(initReactI18next).init({ resources, lng: 'en', fallbackLng: 'en' });
document.documentElement.dir = getDirection('en');
export default i18n;

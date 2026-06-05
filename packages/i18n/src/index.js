import en from '../locales/en.json';
import ar from '../locales/ar.json';

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

export const supportedLocales = ['en', 'ar'];

export function getDirection(locale) {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

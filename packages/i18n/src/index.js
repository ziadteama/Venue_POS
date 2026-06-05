import en from '../locales/en.json' with { type: 'json' };
import ar from '../locales/ar.json' with { type: 'json' };

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

export const supportedLocales = ['en', 'ar'];

export function getDirection(locale) {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

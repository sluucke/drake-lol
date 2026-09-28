import en_US from './en_US.json';
import es_MX from './es_MX.json';
import pt_BR from './pt_BR.json';
import ru_RU from './ru_RU.json';
import sv_SE from './sv_SE.json';
import tr_TR from './tr_TR.json';

export const DICTS = { en_US, es_MX, pt_BR, ru_RU, sv_SE, tr_TR };

export const AVAILABLE_LOCALES = Object.keys(DICTS);

export const LOCALE_NAMES = {
  en_US: 'English',
  es_MX: 'Español (Latinoamérica)',
  pt_BR: 'Português (Brasil)',
  ru_RU: 'Русский',
  sv_SE: 'Svenska',
  tr_TR: 'Türkçe',
};

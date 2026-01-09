import { useTranslation } from 'react-i18next';
import { GlobeIcon } from './Icons';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ja' : 'en';
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="
        flex items-center gap-2 px-3.5 py-2 text-sm font-medium
        rounded-full border border-slate-200 bg-white/80 backdrop-blur-sm
        hover:bg-slate-50 hover:border-slate-300
        text-slate-600 hover:text-slate-800
        transition-all duration-200 shadow-sm hover:shadow
      "
    >
      <GlobeIcon className="w-4 h-4" />
      <span>{i18n.language === 'en' ? t('language.ja') : t('language.en')}</span>
    </button>
  );
}

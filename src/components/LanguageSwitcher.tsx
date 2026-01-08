import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ja' : 'en';
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-100 transition-colors"
    >
      {i18n.language === 'en' ? t('language.ja') : t('language.en')}
    </button>
  );
}

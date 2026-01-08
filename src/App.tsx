import { useTranslation } from 'react-i18next';
import {
  DropZone,
  FileList,
  SettingsPanel,
  ResultsPanel,
  ActionButtons,
  LanguageSwitcher,
} from './components';
import { useAppStore } from './store/useAppStore';
import './i18n';
import './App.css';

function App() {
  const { t } = useTranslation();
  const { error, setError } = useAppStore();

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">{t('app.title')}</h1>
          <LanguageSwitcher />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="absolute top-0 bottom-0 right-0 px-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column */}
          <div className="space-y-4">
            <DropZone />
            <FileList />
            <ResultsPanel />
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <SettingsPanel />
          </div>
        </div>

        {/* Action Buttons */}
        <ActionButtons />
      </div>
    </div>
  );
}

export default App;

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
import { AlertCircleIcon, XIcon } from './components/Icons';
import './i18n';
import './App.css';

function App() {
  const { t } = useTranslation();
  const { error, setError } = useAppStore();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/50 p-6">
      <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src="/favicon.png"
              alt="Image Crunch"
              className="rounded-xl shadow-lg shadow-indigo-500/25"
              style={{ width: '40px', height: '40px' }}
            />
            <h1 className="text-2xl font-bold gradient-text">{t('app.title')}</h1>
          </div>
          <LanguageSwitcher />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-3 animate-fadeIn">
            <AlertCircleIcon className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <span className="flex-1 text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="p-1.5 hover:bg-rose-100 rounded-lg transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <DropZone />
            <FileList />
            <ResultsPanel />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
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

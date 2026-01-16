import { useTranslation } from 'react-i18next';

interface WelcomeScreenProps {
    onSelectFolder: () => void;
}

export function WelcomeScreen({ onSelectFolder }: WelcomeScreenProps) {
    const { t } = useTranslation();

    return (
        <div className="welcome-screen">
            <div className="welcome-content">
                <svg className="welcome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <h2>{t('welcome.title')}</h2>
                <p>{t('welcome.description')}</p>
                <button className="btn-primary btn-large" onClick={onSelectFolder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    {t('welcome.selectFolder')}
                </button>
                <p className="hint">{t('welcome.hint')}</p>
            </div>
        </div>
    );
}

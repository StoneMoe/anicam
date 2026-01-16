import { useTranslation } from 'react-i18next';

interface HeaderProps {
    onSelectFolder: () => void;
    onToggleSidebar: () => void;
}

export function Header({ onSelectFolder, onToggleSidebar }: HeaderProps) {
    const { t } = useTranslation();

    return (
        <header className="app-header">
            <div className="header-left">
                <button
                    className="btn-icon mobile-menu-btn"
                    onClick={onToggleSidebar}
                    aria-label="Toggle menu"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
                <h1>AniCam</h1>
            </div>
            <div className="header-right">
                <button className="btn-primary" onClick={onSelectFolder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    <span>{t('common.selectTeslaCamFolder')}</span>
                </button>
            </div>
        </header>
    );
}

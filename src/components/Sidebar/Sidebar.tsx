import { useTranslation } from 'react-i18next';
import type { ClipInfo, ClipsByCategory } from '../../types';
import { ClipCategorySection } from './ClipCategory';
import { CLIP_CATEGORIES } from '../../utils/constants';

interface SidebarProps {
    clips: ClipsByCategory;
    currentClip: ClipInfo | null;
    onSelectClip: (clip: ClipInfo) => void;
    hasClips: boolean;
    isOpen?: boolean;
    onClose?: () => void;
}

export function Sidebar({ clips, currentClip, onSelectClip, hasClips, isOpen, onClose }: SidebarProps) {
    const { t } = useTranslation();
    // Determine collapsed state based on isOpen prop
    // open = expanded, closed = collapsed
    const isCollapsed = !isOpen;

    // Find first category with clips for default expansion
    const firstCategoryWithClips = CLIP_CATEGORIES.find(
        (cat) => clips[cat].length > 0
    );

    return (
        <>
            {/* Mobile backdrop */}
            {isOpen && (
                <div className="sidebar-backdrop" onClick={onClose} />
            )}
            <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${hasClips ? 'has-clips' : ''} ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <h2>{t('common.clips')}</h2>
                    {/* Internal toggle removed in favor of Header toggle */}
                </div>

                <div className="clip-categories">
                    {CLIP_CATEGORIES.map((category) => (
                        <ClipCategorySection
                            key={category}
                            category={category}
                            clips={clips[category]}
                            currentClip={currentClip}
                            onSelectClip={onSelectClip}
                            defaultExpanded={category === firstCategoryWithClips}
                        />
                    ))}
                </div>

                <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    <p>{t('common.noClips')}</p>
                </div>
            </aside>
        </>
    );
}

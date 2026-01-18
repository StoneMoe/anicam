
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClipCategory, ClipInfo } from '../../types';
import { ClipItem } from './ClipItem';

interface ClipCategoryProps {
    category: ClipCategory;
    clips: ClipInfo[];
    currentClip: ClipInfo | null;
    onSelectClip: (clip: ClipInfo) => void;
    defaultExpanded?: boolean;
}

const CATEGORY_KEYS: Record<ClipCategory, string> = {
    SavedClips: 'common.savedClips',
    SentryClips: 'common.sentryClips',
    RecentClips: 'common.recentClips',
};

const CATEGORY_ICONS: Record<ClipCategory, JSX.Element> = {
    SavedClips: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            <polyline points="17,21 17,13 7,13 7,21" />
            <polyline points="7,3 7,8 15,8" />
        </svg>
    ),
    SentryClips: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    ),
    RecentClips: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
        </svg>
    ),
};

export function ClipCategorySection({
    category,
    clips,
    currentClip,
    onSelectClip,
    defaultExpanded = false,
}: ClipCategoryProps) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className={`category ${isExpanded ? 'expanded' : ''}`} data-category={category}>
            <div className="category-header" onClick={() => setIsExpanded(!isExpanded)}>
                {CATEGORY_ICONS[category]}
                <span>{t(CATEGORY_KEYS[category])}</span>
                <span className="count">{clips.length}</span>
            </div>
            <div className="category-clips">
                {clips.length === 0 ? (
                    <div className="category-empty">{t('common.noClipsFound')}</div>
                ) : (
                    clips.map((clip) => (
                        <ClipItem
                            key={clip.name}
                            clip={clip}
                            isActive={currentClip?.name === clip.name}
                            onClick={() => onSelectClip(clip)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

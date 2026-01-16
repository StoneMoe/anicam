import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClipInfo } from '../../types';
import { formatClipDate } from '../../utils/time-utils';
import { REASON_LABELS } from '../../utils/constants';
import { loadThumbnailUrl } from '../../utils/clip-scanner';

interface ClipItemProps {
    clip: ClipInfo;
    isActive: boolean;
    onClick: () => void;
}

export function ClipItem({ clip, isActive, onClick }: ClipItemProps) {
    const { t } = useTranslation();
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

    useEffect(() => {
        if (clip.thumbnailHandle) {
            loadThumbnailUrl(clip.thumbnailHandle).then(setThumbnailUrl);
        }

        return () => {
            if (thumbnailUrl) {
                URL.revokeObjectURL(thumbnailUrl);
            }
        };
    }, [clip.thumbnailHandle]);

    const dateStr = formatClipDate(clip.name);
    const reason = clip.event?.reason
        ? (REASON_LABELS[clip.event.reason] ? t(REASON_LABELS[clip.event.reason]) : clip.event.reason)
        : '';

    return (
        <div
            className={`clip-item ${isActive ? 'active' : ''}`}
            onClick={onClick}
        >
            {thumbnailUrl ? (
                <img
                    className="clip-item-thumb"
                    src={thumbnailUrl}
                    alt="Thumbnail"
                />
            ) : (
                <div className="clip-item-thumb" />
            )}
            <div className="clip-item-info">
                <div className="clip-item-date">{dateStr}</div>
                {reason && <div className="clip-item-reason">{reason}</div>}
            </div>
        </div>
    );
}

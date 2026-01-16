import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClipInfo } from '../../types';
import { formatClipDate, formatEventDate } from '../../utils/time-utils';
import { REASON_LABELS } from '../../utils/constants';
import { loadThumbnailUrl } from '../../utils/clip-scanner';

interface EventInfoBarProps {
    clip: ClipInfo;
}

export function EventInfoBar({ clip }: EventInfoBarProps) {
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

    const timestamp = clip.event?.timestamp
        ? formatEventDate(clip.event.timestamp)
        : formatClipDate(clip.name);
    const location = [clip.event?.city, clip.event?.street]
        .filter(Boolean)
        .join(', ') || t('common.unknownLocation');
    const reason = clip.event?.reason
        ? (REASON_LABELS[clip.event.reason] ? t(REASON_LABELS[clip.event.reason]) : clip.event.reason)
        : '';

    return (
        <div className="event-info-bar">
            <div className="event-thumbnail">
                {thumbnailUrl && <img src={thumbnailUrl} alt="Event thumbnail" />}
            </div>
            <div className="event-details">
                <div className="event-timestamp">{timestamp}</div>
                <div className="event-location">{location}</div>
                {reason && <div className="event-reason">{reason}</div>}
            </div>
        </div>
    );
}

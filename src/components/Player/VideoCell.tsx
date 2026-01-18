import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Camera } from '../../types';
import { CAMERA_LABELS } from '../../utils/constants';

interface VideoCellProps {
    camera: Camera;
    hasVideo: boolean;
    isFocused: boolean;
    showBackButton?: boolean;
    onBack?: () => void;
    onClick: () => void;
}

export const VideoCell = forwardRef<HTMLVideoElement | null, VideoCellProps>(
    function VideoCell({ camera, hasVideo, isFocused, showBackButton, onBack, onClick }, ref) {
        const { t } = useTranslation();

        const handleBack = (e: React.MouseEvent | React.TouchEvent) => {
            e.stopPropagation();
            onBack?.();
        };

        return (
            <div
                className={`video-cell ${!hasVideo ? 'no-video' : ''} ${isFocused ? 'focused' : ''}`}
                data-camera={camera}
                onClick={onClick}
            >
                <video ref={ref} muted playsInline />

                {showBackButton && (
                    <button
                        className="video-back-btn"
                        onClick={handleBack}
                        onTouchEnd={handleBack}
                        title={t('controls.backToGrid')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}

                <div className="camera-label">{t(CAMERA_LABELS[camera])}</div>
            </div>
        );
    }
);

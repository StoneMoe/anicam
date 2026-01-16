import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SegmentTiming } from '../../types';
import { formatTime } from '../../utils/time-utils';

interface PlaybackControlsProps {
    // Unified timeline state
    currentTime: number;
    totalDuration: number;
    segmentTimings: SegmentTiming[];
    currentSegmentIndex: number;

    // Playback state
    isPlaying: boolean;
    playbackRate: number;

    // Controls
    onPlayPause: () => void;
    onSeekPercent: (percent: number) => void;
    onSkip: (seconds: number) => void;
    onPlaybackRateChange: (rate: number) => void;
    onToggleLayout: () => void;
    onToggleTelemetry: () => void;

    // Display options
    showSegments?: boolean;
}

export function PlaybackControls({
    currentTime,
    totalDuration,
    segmentTimings,
    currentSegmentIndex,
    isPlaying,
    playbackRate,
    onPlayPause,
    onSeekPercent,
    onSkip,
    onPlaybackRateChange,
    onToggleLayout,
    onToggleTelemetry,
    showSegments = false,
}: PlaybackControlsProps) {

    const { t } = useTranslation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                isMenuOpen &&
                menuRef.current &&
                !menuRef.current.contains(event.target as Node) &&
                btnRef.current &&
                !btnRef.current.contains(event.target as Node)
            ) {
                setIsMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <div className="playback-controls">
            <div className="progress-container">
                {/* Unified timeline with segment markers */}
                {showSegments && (
                    <div className="clip-timeline">
                        {segmentTimings.map((timing) => (
                            <div
                                key={timing.index}
                                className={`clip-segment ${timing.index === currentSegmentIndex ? 'active' : ''}`}
                                title={`${t('common.segment')} ${timing.index + 1}`}
                                style={{
                                    flex: timing.duration,
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Single unified progress bar */}
                <input
                    type="range"
                    className="progress-bar"
                    min="0"
                    max="100"
                    value={progressPercent}
                    step="0.1"
                    onChange={(e) => onSeekPercent(parseFloat(e.target.value))}
                />

                <div className="time-display">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(totalDuration)}</span>
                </div>
            </div>

            <div className="control-buttons">
                <div className="main-controls">
                    {/* Skip back */}
                    <button className="btn-control" onClick={() => onSkip(-10)} title={t('controls.skipBack', { seconds: 10 })}>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                            <text x="12" y="15" fontSize="6" textAnchor="middle">10</text>
                        </svg>
                    </button>

                    {/* Play/Pause */}
                    <button
                        className={`btn-control btn-play ${isPlaying ? 'playing' : ''}`}
                        onClick={onPlayPause}
                        title={t('controls.playPause')}
                    >
                        <svg className="play-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        <svg className="pause-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                    </button>

                    {/* Skip forward */}
                    <button className="btn-control" onClick={() => onSkip(10)} title={t('controls.skipForward', { seconds: 10 })}>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
                            <text x="12" y="15" fontSize="6" textAnchor="middle">10</text>
                        </svg>
                    </button>
                </div>

                <div className="secondary-controls">


                    {/* Mobile "More" Button */}
                    <div className="more-options-container">
                        <button
                            ref={btnRef}
                            className={`btn-control btn-mobile-more ${isMenuOpen ? 'active' : ''}`}
                            onClick={toggleMenu}
                            title={t('common.more')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="1" />
                                <circle cx="12" cy="5" r="1" />
                                <circle cx="12" cy="19" r="1" />
                            </svg>
                        </button>

                        {/* Dropdown Menu */}
                        <div ref={menuRef} className={`controls-menu ${isMenuOpen ? 'open' : ''}`}>
                            <button className="menu-item" onClick={() => { onToggleLayout(); setIsMenuOpen(false); }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="7" height="7" />
                                    <rect x="14" y="3" width="7" height="7" />
                                    <rect x="3" y="14" width="7" height="7" />
                                    <rect x="14" y="14" width="7" height="7" />
                                </svg>
                                <span>{t('controls.toggleLayout')}</span>
                            </button>

                            <button className="menu-item" onClick={() => { onToggleTelemetry(); setIsMenuOpen(false); }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 20V10" />
                                    <path d="M18 20V4" />
                                    <path d="M6 20v-4" />
                                </svg>
                                <span>{t('controls.toggleTelemetry')}</span>
                            </button>

                            <div className="menu-item" onClick={(e) => e.stopPropagation()}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                                <select
                                    value={playbackRate}
                                    onChange={(e) => {
                                        onPlaybackRateChange(parseFloat(e.target.value));
                                        setIsMenuOpen(false);
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'inherit',
                                        width: '100%',
                                        cursor: 'pointer',
                                        fontSize: 'inherit'
                                    }}
                                >
                                    <option value="0.25">0.25x {t('common.speed')}</option>
                                    <option value="0.5">0.5x {t('common.speed')}</option>
                                    <option value="1">1x {t('common.speed')}</option>
                                    <option value="1.5">1.5x {t('common.speed')}</option>
                                    <option value="2">2x {t('common.speed')}</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

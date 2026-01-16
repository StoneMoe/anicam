import { useState, useEffect, useCallback } from 'react';
import type { ClipInfo, LayoutMode } from '../../types';
import { useUnifiedTimeline } from '../../hooks/useUnifiedTimeline';
import { useVideoPlayer } from '../../hooks/useVideoPlayer';
import { useSeiData } from '../../hooks/useSeiData';
import { EventInfoBar } from './EventInfoBar';
import { VideoGrid } from './VideoGrid';
import { PlaybackControls } from './PlaybackControls';
import { TelemetryPanel } from './TelemetryPanel';

interface PlayerProps {
    clip: ClipInfo;
}

export function Player({ clip }: PlayerProps) {
    const [layout, setLayout] = useState<LayoutMode>('3x2');
    const [isTelemetryHidden, setIsTelemetryHidden] = useState(false);

    // Unified timeline hook
    const {
        totalDuration,
        currentTime,
        currentSegmentIndex,
        segmentTimings,
        videoRefs,
        seekToPercent,
        skip,
        loadClip,
        getCurrentSegment,
    } = useUnifiedTimeline();

    // Video player hook
    const {
        isPlaying,
        playbackRate,
        play,
        togglePlayPause,
        setPlaybackRate,
    } = useVideoPlayer(videoRefs);

    // SEI data hook
    const {
        hasData: hasSeiData,
        frameCount: seiFrameCount,
        getTelemetryAtTime,
        loadSegment: loadSeiSegment,
        reset: resetSei,
    } = useSeiData();

    // Load clip when it changes
    useEffect(() => {
        loadClip(clip);
        resetSei();
        play();
    }, [clip, loadClip, resetSei, play]);

    // Load SEI data when segment changes
    const currentSegment = getCurrentSegment();
    useEffect(() => {
        if (currentSegment) {
            loadSeiSegment(currentSegment);
        }
    }, [currentSegment, loadSeiSegment]);

    const currentLocalTime = currentSegment
        ? currentTime - (segmentTimings[currentSegmentIndex]?.startTime || 0)
        : 0;

    const currentTelemetry = getTelemetryAtTime(currentLocalTime);

    // Layout cycling
    const cycleLayout = useCallback(() => {
        const layouts: LayoutMode[] = ['3x2', '2x2'];
        const currentIndex = layouts.indexOf(layout);
        setLayout(layouts[(currentIndex + 1) % layouts.length]);
    }, [layout]);

    // Toggle telemetry panel
    const toggleTelemetry = useCallback(() => {
        setIsTelemetryHidden((prev) => !prev);
    }, []);

    return (
        <div className="player-area active">
            <EventInfoBar clip={clip} />

            <VideoGrid
                clip={clip}
                segment={currentSegment}
                videoRefs={videoRefs}
                layout={layout}
                onLayoutChange={setLayout}
            />

            <TelemetryPanel
                telemetry={currentTelemetry}
                hasData={hasSeiData}
                frameCount={seiFrameCount}
                isHidden={isTelemetryHidden}
            />

            <PlaybackControls
                currentTime={currentTime}
                totalDuration={totalDuration}
                segmentTimings={segmentTimings}
                currentSegmentIndex={currentSegmentIndex}
                isPlaying={isPlaying}
                playbackRate={playbackRate}
                onPlayPause={togglePlayPause}
                onSeekPercent={(percent) => {
                    seekToPercent(percent);
                    play();
                }}
                onSkip={skip}
                onPlaybackRateChange={setPlaybackRate}
                onToggleLayout={cycleLayout}
                onToggleTelemetry={toggleTelemetry}
                showSegments={clip.category === 'RecentClips'}
            />
        </div>
    );
}

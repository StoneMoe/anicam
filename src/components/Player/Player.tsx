import { useState, useEffect, useCallback } from 'react';
import type { ClipInfo, LayoutMode } from '../../types';
import { useUnifiedTimeline } from '../../hooks/useUnifiedTimeline';
import { useVideoPlayer } from '../../hooks/useVideoPlayer';
import { useSeiData } from '../../hooks/useSeiData';
import { useVideoExport } from '../../hooks/useVideoExport';
import { EventInfoBar } from './EventInfoBar';
import { VideoGrid } from './VideoGrid';
import { PlaybackControls } from './PlaybackControls';
import { TelemetryPanel } from './TelemetryPanel';
import { ExportDialog } from '../ExportDialog/ExportDialog';

interface PlayerProps {
    clip: ClipInfo;
}

export function Player({ clip }: PlayerProps) {
    const [layout, setLayout] = useState<LayoutMode>('3x2');
    const [lastGridLayout, setLastGridLayout] = useState<LayoutMode>('3x2');
    const [isTelemetryHidden, setIsTelemetryHidden] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

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
    } = useUnifiedTimeline({
        onEnded: () => {
            pause();
        }
    });

    // Video player hook
    const {
        isPlaying,
        playbackRate,
        play,
        pause,
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

    // Video export hook
    const {
        isExporting,
        progress: exportProgress,
        startExport,
        cancelExport,
        isWebCodecsAvailable,
        logs,
    } = useVideoExport();

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

    // Wrapper to handle layout changes and preference tracking
    const handleLayoutChange = useCallback((newLayout: LayoutMode) => {
        setLayout(newLayout);
        if (newLayout !== 'single') {
            setLastGridLayout(newLayout);
        }
    }, []);

    // Layout cycling
    const cycleLayout = useCallback(() => {
        const layouts: LayoutMode[] = ['3x2', '2x2'];
        const currentIndex = layouts.indexOf(layout);
        // If current layout is single (index -1), default to switching to first available grid or just toggle preference?
        // Logic: if in single view, this button usually isn't visible or if it is, maybe it should switch grid behind the scenes or exit single view?
        // Assuming behavior: if in single view, go to last grid layout. If in grid view, toggle.

        if (layout === 'single') {
            // If in single view, return to grid (toggle from last known preference if appropriate, or just restore)
            // For now, let's just cycle the preference and set it
            const lastIndex = layouts.indexOf(lastGridLayout);
            const newLayout = layouts[(lastIndex + 1) % layouts.length];
            handleLayoutChange(newLayout);
        } else {
            const newLayout = layouts[(currentIndex + 1) % layouts.length];
            handleLayoutChange(newLayout);
        }
    }, [layout, lastGridLayout, handleLayoutChange]);

    // Toggle telemetry panel
    const toggleTelemetry = useCallback(() => {
        setIsTelemetryHidden((prev) => !prev);
    }, []);

    // Handle export button click
    const handleExport = useCallback(() => {
        pause(); // Pause playback to save resources
        setIsExportDialogOpen(true);
    }, [pause]);

    // Handle dialog start export
    const onStartExport = useCallback((exportLayout: LayoutMode, scope: 'segment' | 'full') => {
        // Get the current segment's duration for exporting just the current segment
        const segmentDuration = currentSegment?.duration || segmentTimings[currentSegmentIndex]?.duration || 60;

        startExport({
            clip,
            segment: scope === 'segment' ? (currentSegment || undefined) : undefined, // Undefined segment = full export
            layout: exportLayout,
            videoRefs,
            getTelemetryAtTime,
            totalDuration: segmentDuration,
            currentSegmentIndex,
        });
    }, [startExport, clip, currentSegment, videoRefs, getTelemetryAtTime, currentSegmentIndex, segmentTimings]);

    return (
        <div className="player-area active">
            <EventInfoBar clip={clip} />

            <VideoGrid
                clip={clip}
                segment={currentSegment}
                videoRefs={videoRefs}
                layout={layout}
                onLayoutChange={handleLayoutChange}
                preferredLayout={lastGridLayout}
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
                onExport={handleExport}
                showSegments={clip.category === 'RecentClips'}
            />

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={() => setIsExportDialogOpen(false)}
                onStartExport={onStartExport}
                onCancelExport={cancelExport}
                isExporting={isExporting}
                progress={exportProgress}
                logs={logs || []}
                layout={layout}
                hasMultipleSegments={(clip.segments?.length || 0) > 1}
                isWebCodecsAvailable={isWebCodecsAvailable}
            />
        </div>
    );
}

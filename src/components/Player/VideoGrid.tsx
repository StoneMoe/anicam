import { useEffect, useState, useCallback, useRef } from 'react';
import type { Camera, ClipInfo, LayoutMode, Segment } from '../../types';
import { CAMERAS } from '../../utils/constants';
import { VideoCell } from './VideoCell';
import { loadVideoUrl } from '../../utils/clip-scanner';

interface VideoGridProps {
    clip: ClipInfo;
    segment: Segment | null;
    videoRefs: Record<Camera, React.RefObject<HTMLVideoElement | null>>;
    layout: LayoutMode;
    onLayoutChange: (layout: LayoutMode) => void;
    preferredLayout?: LayoutMode;
}

export function VideoGrid({
    clip,
    segment,
    videoRefs,
    layout,
    onLayoutChange,
    preferredLayout = '3x2',
}: VideoGridProps) {
    const [focusedCamera, setFocusedCamera] = useState<Camera>('front');
    // Use ref to track URLs for proper cleanup without causing infinite loops
    const loadedUrlsRef = useRef<Record<Camera, string>>({} as Record<Camera, string>);
    // State only for triggering re-renders if needed (currently unused but kept for future use)
    const [, setLoadedUrlsVersion] = useState(0);

    // Load videos when segment changes
    // Use ref to track which segment we're loading for race condition prevention
    const currentSegmentRef = useRef<Segment | null>(null);

    useEffect(() => {
        if (!segment) return;

        // Track which segment this effect is loading for
        currentSegmentRef.current = segment;
        let isCancelled = false;

        const loadVideos = async () => {
            // Capture current URLs before clearing
            const oldUrls = { ...loadedUrlsRef.current };

            // First, clear all video sources to stop them from using revoked URLs
            // This is critical to avoid ERR_FILE_NOT_FOUND when revoking
            for (const cam of CAMERAS) {
                const video = videoRefs[cam]?.current;
                if (video) {
                    video.removeAttribute('src');
                    video.load();
                }
            }

            // Revoke old URLs after clearing sources
            Object.values(oldUrls).forEach((url) => {
                if (url) URL.revokeObjectURL(url);
            });

            // Clear the ref
            loadedUrlsRef.current = {} as Record<Camera, string>;

            const newUrls: Partial<Record<Camera, string>> = {};

            // Load all URLs in parallel
            await Promise.all(
                CAMERAS.map(async (cam) => {
                    const fileHandle = segment.files[cam];
                    if (fileHandle) {
                        try {
                            const url = await loadVideoUrl(fileHandle);
                            // Check both cancellation flag AND segment ref to prevent race conditions
                            if (!isCancelled && currentSegmentRef.current === segment) {
                                newUrls[cam] = url;
                                const video = videoRefs[cam]?.current;
                                if (video) {
                                    video.src = url;
                                    video.load();
                                }
                            } else {
                                URL.revokeObjectURL(url);
                            }
                        } catch (err) {
                            console.error(`Error loading ${cam} video:`, err);
                        }
                    }
                })
            );

            if (!isCancelled && currentSegmentRef.current === segment) {
                loadedUrlsRef.current = newUrls as Record<Camera, string>;
                setLoadedUrlsVersion((v) => v + 1);
            }
        };

        loadVideos();

        // Cleanup on unmount or segment change - revoke all current URLs
        return () => {
            isCancelled = true;
            // Revoke URLs on cleanup to prevent memory leaks
            const urlsToRevoke = { ...loadedUrlsRef.current };
            for (const cam of CAMERAS) {
                const video = videoRefs[cam]?.current;
                if (video) {
                    video.removeAttribute('src');
                    video.load();
                }
            }
            Object.values(urlsToRevoke).forEach((url) => {
                if (url) URL.revokeObjectURL(url);
            });
            loadedUrlsRef.current = {} as Record<Camera, string>;
        };
    }, [segment, videoRefs]);

    const handleClick = useCallback(
        (camera: Camera) => {
            if (layout === 'single') {
                // Return to preferred grid layout
                onLayoutChange(preferredLayout);
            } else {
                setFocusedCamera(camera);
                onLayoutChange('single');
            }
        },
        [layout, onLayoutChange, preferredLayout]
    );

    // Auto-switch to 2x2 if no pillar cameras
    useEffect(() => {
        if (!clip.cameras.has('left_pillar') && !clip.cameras.has('right_pillar')) {
            if (layout === '3x2') {
                onLayoutChange('2x2');
            }
        }
    }, [clip.cameras, layout, onLayoutChange]);

    const layoutClass = layout === '3x2' ? '' : `layout-${layout}`;

    // Determine target layout for back button
    // Always respect preferred layout unless there are no pillars and it's set to 3x2 (handled by effect above usually but good to be safe)
    const backLayout = preferredLayout;

    return (
        <div className={`video-grid ${layoutClass}`}>
            {CAMERAS.map((cam) => (
                <VideoCell
                    key={cam}
                    ref={videoRefs[cam]}
                    camera={cam}
                    hasVideo={clip.cameras.has(cam)}
                    isFocused={focusedCamera === cam}
                    showBackButton={layout === 'single'}
                    onBack={() => onLayoutChange(backLayout)}
                    onClick={() => handleClick(cam)}
                />
            ))}
        </div>
    );
}

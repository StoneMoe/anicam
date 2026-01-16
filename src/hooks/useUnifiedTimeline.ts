import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ClipInfo, Segment, SegmentTiming, Camera } from '../types';
import { CAMERAS } from '../utils/constants';

interface UseUnifiedTimelineReturn {
    // Timeline state
    totalDuration: number;
    currentTime: number;
    currentSegmentIndex: number;
    segmentTimings: SegmentTiming[];
    isReady: boolean;

    // Video refs for each camera
    videoRefs: Record<Camera, React.RefObject<HTMLVideoElement | null>>;

    // Controls
    seekTo: (time: number) => void;
    seekToPercent: (percent: number) => void;
    skip: (seconds: number) => void;
    loadClip: (clip: ClipInfo) => Promise<void>;

    // Segment info at current time
    getCurrentSegment: () => Segment | null;
}

export function useUnifiedTimeline(): UseUnifiedTimelineReturn {
    const [clip, setClip] = useState<ClipInfo | null>(null);
    const [segmentDurations, setSegmentDurations] = useState<number[]>([]);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isReady, setIsReady] = useState(false);

    // Create refs for all cameras
    const videoRefs = useMemo(() => {
        const refs: Record<Camera, React.RefObject<HTMLVideoElement | null>> = {} as Record<Camera, React.RefObject<HTMLVideoElement | null>>;
        for (const cam of CAMERAS) {
            refs[cam] = { current: null };
        }
        return refs;
    }, []);

    // Stable refs that persist across renders
    const videoRefHolders = useRef<Record<Camera, React.RefObject<HTMLVideoElement | null>>>(videoRefs);
    const pendingSeekTimeRef = useRef<number | null>(null);

    // Calculate segment timings based on durations
    const segmentTimings = useMemo((): SegmentTiming[] => {
        if (!clip || segmentDurations.length === 0) return [];

        let cumulativeTime = 0;
        return clip.segments.map((_, index) => {
            const duration = segmentDurations[index] || 0;
            const timing: SegmentTiming = {
                index,
                startTime: cumulativeTime,
                endTime: cumulativeTime + duration,
                duration,
            };
            cumulativeTime += duration;
            return timing;
        });
    }, [clip, segmentDurations]);

    // Total duration of all segments
    const totalDuration = useMemo(() => {
        return segmentDurations.reduce((sum, d) => sum + d, 0);
    }, [segmentDurations]);

    /**
     * Get segment index and local time for a given unified timeline position
     */
    const getSegmentAtTime = useCallback(
        (time: number): { index: number; localTime: number } => {
            if (segmentTimings.length === 0) {
                return { index: 0, localTime: 0 };
            }

            // Clamp time to valid range
            const clampedTime = Math.max(0, Math.min(time, totalDuration));

            for (const timing of segmentTimings) {
                if (clampedTime >= timing.startTime && clampedTime < timing.endTime) {
                    return {
                        index: timing.index,
                        localTime: clampedTime - timing.startTime,
                    };
                }
            }

            // If at end, return last segment
            const lastTiming = segmentTimings[segmentTimings.length - 1];
            return {
                index: lastTiming.index,
                localTime: lastTiming.duration,
            };
        },
        [segmentTimings, totalDuration]
    );

    /**
     * Load a clip and calculate all segment durations
     */
    const loadClip = useCallback(async (newClip: ClipInfo) => {
        setIsReady(false);
        setClip(newClip);
        setCurrentSegmentIndex(0);
        setCurrentTime(0);

        // Calculate durations for all segments by loading front camera videos
        const durations: number[] = [];

        for (const segment of newClip.segments) {
            const frontHandle = segment.files.front;
            if (frontHandle) {
                try {
                    const file = await frontHandle.getFile();
                    const url = URL.createObjectURL(file);

                    // Create temp video to get duration
                    const duration = await new Promise<number>((resolve) => {
                        const tempVideo = document.createElement('video');
                        tempVideo.preload = 'metadata';
                        tempVideo.onloadedmetadata = () => {
                            URL.revokeObjectURL(url);
                            resolve(tempVideo.duration || 60); // Default 60s if unknown
                        };
                        tempVideo.onerror = () => {
                            URL.revokeObjectURL(url);
                            resolve(60); // Default on error
                        };
                        tempVideo.src = url;
                    });

                    durations.push(duration);
                } catch {
                    durations.push(60); // Default duration
                }
            } else {
                durations.push(60); // Default if no front camera
            }
        }

        setSegmentDurations(durations);
        setIsReady(true);
    }, []);

    /**
     * Seek to a specific time in the unified timeline
     */
    const seekTo = useCallback(
        (time: number) => {
            const { index, localTime } = getSegmentAtTime(time);
            const segmentChanged = index !== currentSegmentIndex;

            setCurrentTime(time);
            pendingSeekTimeRef.current = localTime;

            if (segmentChanged) {
                setCurrentSegmentIndex(index);
            } else {
                // Seek all videos to the local time within the segment
                for (const cam of CAMERAS) {
                    const video = videoRefHolders.current[cam]?.current;
                    if (video && video.src && video.duration) {
                        video.currentTime = localTime;
                    }
                }
            }
        },
        [getSegmentAtTime, currentSegmentIndex]
    );

    /**
     * Seek to a percentage of the total timeline
     */
    const seekToPercent = useCallback(
        (percent: number) => {
            const time = (percent / 100) * totalDuration;
            seekTo(time);
        },
        [totalDuration, seekTo]
    );

    /**
     * Skip forward or backward by seconds
     */
    const skip = useCallback(
        (seconds: number) => {
            const newTime = Math.max(0, Math.min(currentTime + seconds, totalDuration));
            seekTo(newTime);
        },
        [currentTime, totalDuration, seekTo]
    );

    /**
     * Get the current segment
     */
    const getCurrentSegment = useCallback((): Segment | null => {
        if (!clip || currentSegmentIndex >= clip.segments.length) {
            return null;
        }
        return clip.segments[currentSegmentIndex];
    }, [clip, currentSegmentIndex]);

    /**
     * Update currentTime based on video timeupdate events
     */
    useEffect(() => {
        const frontVideo = videoRefHolders.current.front?.current;
        if (!frontVideo || !isReady) return;

        // High-frequency time update function used by requestAnimationFrame
        const updateTime = () => {
            // Skip updating currentTime while a seek is pending to avoid race conditions
            // that cause the progress UI to jump incorrectly during cross-segment seeks
            if (pendingSeekTimeRef.current !== null) {
                return;
            }

            const localTime = frontVideo.currentTime;

            // Only update the UI time state
            const segmentStartTime = segmentTimings[currentSegmentIndex]?.startTime || 0;
            const unifiedTime = segmentStartTime + localTime;
            setCurrentTime(unifiedTime);
        };

        const handleEnded = () => {
            // Auto-advance to next segment
            if (clip && currentSegmentIndex < clip.segments.length - 1) {
                const nextSegmentStart = segmentTimings[currentSegmentIndex + 1]?.startTime;
                if (nextSegmentStart !== undefined) {
                    pendingSeekTimeRef.current = 0; // Explicitly start at 0 for next segment
                    setCurrentSegmentIndex(currentSegmentIndex + 1);
                }
            }
        };

        const syncVideo = (video: HTMLVideoElement, isMaster: boolean) => {
            // Basic sync for slave cameras
            if (!isMaster && frontVideo) {
                if (Math.abs(video.currentTime - frontVideo.currentTime) > 0.5) {
                    video.currentTime = frontVideo.currentTime;
                }
            }
        };

        const listeners = new Map<HTMLVideoElement, { load: () => void; play: () => void }>();

        for (const cam of CAMERAS) {
            const video = videoRefHolders.current[cam]?.current;
            if (!video) continue;

            const isMaster = cam === 'front';
            const loadHandler = () => syncVideo(video, isMaster);
            const playHandler = () => syncVideo(video, isMaster);

            video.addEventListener('loadedmetadata', loadHandler);
            video.addEventListener('canplay', playHandler);

            listeners.set(video, { load: loadHandler, play: playHandler });
        }

        frontVideo.addEventListener('ended', handleEnded);

        // High-frequency update loop using requestAnimationFrame
        let animationFrameId: number;
        let frameCount = 0;

        // Track stall state for all cameras
        const lastTimes: Record<string, number> = {};
        const stallCounts: Record<string, number> = {};
        for (const cam of CAMERAS) {
            lastTimes[cam] = 0;
            stallCounts[cam] = 0;
        }

        const STALL_THRESHOLD = 18; // ~500ms at 36Hz - consider stalled after this many frames without progress

        const frameLoop = () => {
            const frontVid = videoRefHolders.current.front?.current;
            // Update time at high frequency for smooth telemetry display
            updateTime();

            // Robust seek enforcer - ensures we reach target time across segment changes
            if (pendingSeekTimeRef.current !== null) {
                const frontVideo = videoRefHolders.current.front?.current;
                if (frontVideo && frontVideo.readyState >= 1) { // HAVE_METADATA
                    const diff = Math.abs(frontVideo.currentTime - pendingSeekTimeRef.current);
                    if (diff > 0.5) {
                        // Seek all videos to the target time
                        for (const cam of CAMERAS) {
                            const video = videoRefHolders.current[cam]?.current;
                            if (video && video.src && video.readyState >= 1) {
                                video.currentTime = pendingSeekTimeRef.current;
                            }
                        }
                    } else {
                        // Seek completed - sync all other cameras to front
                        for (const cam of CAMERAS) {
                            if (cam === 'front') continue;
                            const video = videoRefHolders.current[cam]?.current;
                            if (video && video.src && video.readyState >= 1) {
                                if (Math.abs(video.currentTime - frontVideo.currentTime) > 0.1) {
                                    video.currentTime = frontVideo.currentTime;
                                }
                            }
                        }
                        pendingSeekTimeRef.current = null;

                        // Reset stall counters after seek
                        for (const cam of CAMERAS) {
                            stallCounts[cam] = 0;
                            const video = videoRefHolders.current[cam]?.current;
                            if (video) lastTimes[cam] = video.currentTime;
                        }
                    }
                }
            }

            // Check if front camera is progressing or stalled
            if (frontVid && !frontVid.paused && pendingSeekTimeRef.current === null) {
                const currentFrontTime = frontVid.currentTime;
                const LastFrontTime = lastTimes['front'] || 0;
                const isFrontProgressing = Math.abs(currentFrontTime - LastFrontTime) > 0.001;

                lastTimes['front'] = currentFrontTime;

                if (isFrontProgressing) {
                    stallCounts['front'] = 0;

                    // Check and handle stall for slave cameras
                    for (const cam of CAMERAS) {
                        if (cam === 'front') continue;
                        const video = videoRefHolders.current[cam]?.current;

                        // Check if slave is stalled (not paused, but not moving)
                        if (video && !video.paused && video.readyState >= 2) {
                            const currentTime = video.currentTime;
                            const lastTime = lastTimes[cam] || 0;

                            if (Math.abs(currentTime - lastTime) > 0.001) {
                                stallCounts[cam] = 0;
                            } else {
                                stallCounts[cam] = (stallCounts[cam] || 0) + 1;
                                if (stallCounts[cam] >= STALL_THRESHOLD) {
                                    // play() sometimes fails to recover, try nudging time slightly
                                    if (video.duration && video.currentTime < video.duration - 0.1) {
                                        video.currentTime += 0.01;
                                    } else {
                                        video.play().catch(() => { });
                                    }
                                    stallCounts[cam] = 0;
                                }
                            }
                            lastTimes[cam] = currentTime;
                        } else {
                            stallCounts[cam] = 0;
                        }
                    }

                    // Only sync slave cameras when front is actively progressing
                    // Throttle to run every ~18 frames to avoid excessive seeks
                    if (frameCount % 18 === 0) {
                        for (const cam of CAMERAS) {
                            if (cam === 'front') continue;
                            const video = videoRefHolders.current[cam]?.current;
                            if (video && video.src && video.readyState >= 2) {
                                // Sync time if drift is more than 0.3 seconds
                                if (Math.abs(video.currentTime - currentFrontTime) > 0.3) {
                                    video.currentTime = currentFrontTime;
                                }
                                // Resume paused slave cameras when front is playing
                                if (video.paused) {
                                    video.play().catch(() => { });
                                }
                            }
                        }
                    }
                } else {
                    // Front stalled logic
                    const count = (stallCounts['front'] || 0) + 1;
                    stallCounts['front'] = count;

                    // Front camera appears stalled - try to recover
                    if (count >= STALL_THRESHOLD) {
                        // Attempt to resume front camera
                        if (frontVid.duration && frontVid.currentTime < frontVid.duration - 0.1) {
                            frontVid.currentTime += 0.01;
                        } else {
                            frontVid.play().catch(() => { });
                        }
                        // Reset stall counter to avoid spamming play() calls
                        stallCounts['front'] = 0;
                    }
                }
                frameCount++;
            } else if (frontVid && frontVid.paused) {
                // Reset stall detection when paused
                for (const cam of CAMERAS) {
                    stallCounts[cam] = 0;
                    const video = videoRefHolders.current[cam]?.current;
                    if (video) lastTimes[cam] = video.currentTime;
                }
            }

            animationFrameId = requestAnimationFrame(frameLoop);
        };
        animationFrameId = requestAnimationFrame(frameLoop);

        return () => {
            cancelAnimationFrame(animationFrameId);
            frontVideo.removeEventListener('ended', handleEnded);
            for (const [video, handlers] of listeners) {
                video.removeEventListener('loadedmetadata', handlers.load);
                video.removeEventListener('canplay', handlers.play);
            }
        };
    }, [clip, currentSegmentIndex, segmentTimings, isReady]);

    return {
        totalDuration,
        currentTime,
        currentSegmentIndex,
        segmentTimings,
        isReady,
        videoRefs: videoRefHolders.current,
        seekTo,
        seekToPercent,
        skip,
        loadClip,
        getCurrentSegment,
    };
}

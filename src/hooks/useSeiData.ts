import { useState, useCallback, useRef, useEffect } from 'react';
import type { SeiData, Segment } from '../types';
import type { SeiWorkerMessage, SeiWorkerResponse } from '../workers/sei-worker';

interface UseSeiDataReturn {
    seiData: SeiData[];
    isLoading: boolean;
    hasData: boolean;
    frameCount: number;
    progress: number;
    getTelemetryAtTime: (currentTime: number) => SeiData | null;
    loadSegment: (segment: Segment) => void;
    reset: () => void;
}

export function useSeiData(): UseSeiDataReturn {
    const [seiData, setSeiData] = useState<SeiData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [segmentDuration, setSegmentDuration] = useState<number | null>(null);

    // Worker reference
    const workerRef = useRef<Worker | null>(null);

    // Frame cache - Map for O(1) lookup by frame index
    const frameCacheRef = useRef<Map<number, SeiData>>(new Map());

    // Track current segment to avoid duplicate loads
    const currentSegmentRef = useRef<string | null>(null);

    // Initialize worker
    useEffect(() => {
        // Create worker using Vite's worker import syntax
        workerRef.current = new Worker(
            new URL('../workers/sei-worker.ts', import.meta.url),
            { type: 'module' }
        );

        workerRef.current.onmessage = (event: MessageEvent<SeiWorkerResponse>) => {
            const { type, frame, frameIndex, progress: workerProgress, totalFrames, error } = event.data;

            switch (type) {
                case 'frame':
                    if (frame !== undefined && frameIndex !== undefined) {
                        frameCacheRef.current.set(frameIndex, frame);
                        // Update state periodically (every 18 frames) to avoid too many re-renders
                        if (frameIndex % 18 === 0) {
                            setSeiData(Array.from(frameCacheRef.current.values()));
                        }
                    }
                    break;

                case 'progress':
                    if (workerProgress !== undefined) {
                        setProgress(workerProgress);
                    }
                    break;

                case 'complete':
                    setIsLoading(false);
                    setProgress(100);
                    // Final sync of all frames
                    setSeiData(Array.from(frameCacheRef.current.values()));
                    console.info(`SEI: Parsed ${totalFrames} frames`);
                    break;

                case 'error':
                    console.warn('SEI Worker error:', error);
                    setIsLoading(false);
                    break;
            }
        };

        workerRef.current.onerror = (error) => {
            console.error('SEI Worker error:', error);
            setIsLoading(false);
        };

        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    const loadSegment = useCallback((segment: Segment) => {
        const frontHandle = segment.files.front;
        if (!frontHandle) {
            setSeiData([]);
            setProgress(0);
            return;
        }

        // Avoid reloading the same segment - use timeStr + front file name for uniqueness
        // This prevents collision when different clips have segments with the same timeStr
        const segmentKey = `${segment.timeStr}:${frontHandle.name}`;
        if (currentSegmentRef.current === segmentKey) {
            return;
        }
        currentSegmentRef.current = segmentKey;

        // Clear previous data
        frameCacheRef.current.clear();
        setSeiData([]);
        setIsLoading(true);
        setProgress(0);
        setSegmentDuration(segment.duration || null);

        // Abort previous parsing if any
        workerRef.current?.postMessage({ type: 'abort' } as SeiWorkerMessage);

        // Start parsing the new file
        frontHandle.getFile().then((file) => {
            workerRef.current?.postMessage({
                type: 'start',
                file,
            } as SeiWorkerMessage);
        }).catch((err) => {
            console.warn('Error getting file for SEI parsing:', err);
            setIsLoading(false);
        });
    }, []);

    const getTelemetryAtTime = useCallback(
        (currentTime: number): SeiData | null => {
            const cache = frameCacheRef.current;
            if (cache.size === 0) return null;

            // Calculate effective FPS
            let effectiveFps = 36; // Default to 36 FPS

            if (segmentDuration !== null && segmentDuration > 0 && cache.size > 0) {
                effectiveFps = cache.size / segmentDuration;
            }

            // Calculate frame index
            const frameIndex = Math.floor(currentTime * effectiveFps);

            // Look up in cache
            const frame = cache.get(frameIndex);
            if (frame) return frame;

            // Fallback: find nearest frame
            const maxIndex = cache.size - 1;
            const clampedIndex = Math.min(frameIndex, maxIndex);
            return cache.get(clampedIndex) || null;
        },
        [segmentDuration]
    );

    const reset = useCallback(() => {
        // Abort any ongoing parsing
        workerRef.current?.postMessage({ type: 'abort' } as SeiWorkerMessage);

        frameCacheRef.current.clear();
        setSeiData([]);
        setProgress(0);
        setIsLoading(false);
        currentSegmentRef.current = null;
    }, []);

    return {
        seiData,
        isLoading,
        hasData: frameCacheRef.current.size > 0,
        frameCount: frameCacheRef.current.size,
        progress,
        getTelemetryAtTime,
        loadSegment,
        reset,
    };
}

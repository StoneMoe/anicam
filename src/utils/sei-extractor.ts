import type { SeiData } from '../types';
import type { SeiWorkerMessage, SeiWorkerResponse } from '../workers/sei-worker';

export class SeiExtractor {
    /**
     * Extract SEI data from a video file using the worker
     */
    static extract(file: File): Promise<SeiData[]> {
        return new Promise((resolve) => {
            const worker = new Worker(
                new URL('../workers/sei-worker.ts', import.meta.url),
                { type: 'module' }
            );

            const frames: Map<number, SeiData> = new Map();

            worker.onmessage = (event: MessageEvent<SeiWorkerResponse>) => {
                const { type, frame, frameIndex, error } = event.data;

                switch (type) {
                    case 'frame':
                        if (frame && frameIndex !== undefined) {
                            frames.set(frameIndex, frame);
                        }
                        break;

                    case 'complete': {
                        // Sort by frame index
                        const sortedFrames = Array.from(frames.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([, data]) => data);

                        worker.terminate();
                        resolve(sortedFrames);
                        break;
                    }

                    case 'error':
                        console.error('SEI extraction error:', error);
                        worker.terminate();
                        resolve([]); // Return empty data on error to allow export to continue
                        break;
                }
            };

            worker.onerror = (err) => {
                console.error('SEI Worker fatal error:', err);
                worker.terminate();
                resolve([]);
            };

            worker.postMessage({ type: 'start', file } as SeiWorkerMessage);
        });
    }

    /**
     * Get telemetry at a specific time from extracted data
     */
    static getTelemetryAtTime(data: SeiData[], time: number, totalDuration: number): SeiData | null {
        if (!data || data.length === 0) return null;

        // Calculate effective FPS
        let effectiveFps = 36;
        if (totalDuration > 0 && data.length > 0) {
            effectiveFps = data.length / totalDuration;
        }

        const frameIndex = Math.floor(time * effectiveFps);

        if (frameIndex < 0) return null;
        if (frameIndex >= data.length) return data[data.length - 1]; // Clamp to last frame

        return data[frameIndex] || null;
    }
}

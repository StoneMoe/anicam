/**
 * Video Exporter
 * 
 * Captures the video grid with telemetry overlay and exports as WebM video.
 * Uses canvas.captureStream() + MediaRecorder API with real-time playback.
 */

import type { Camera, LayoutMode, SeiData, ExportProgress } from '../types';
import { CAMERAS } from './constants';
import { drawTelemetry } from './telemetry-renderer';

// Export configuration
const EXPORT_FPS = 30;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

// Telemetry overlay height (pixels)
const TELEMETRY_HEIGHT = 80;



export interface ExportOptions {
    layout: LayoutMode;
    videoRefs: Record<Camera, React.RefObject<HTMLVideoElement | null>>;
    getTelemetryAtTime: (time: number) => SeiData | null;
    totalDuration: number;
    clipName: string;
    onProgress?: (progress: ExportProgress) => void;
}

/**
 * Export video with merged camera angles and telemetry overlay
 */
export class VideoExporter {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private aborted = false;
    private options: ExportOptions | null = null;
    private animationFrameId: number | null = null;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = EXPORT_WIDTH;
        this.canvas.height = EXPORT_HEIGHT;
        this.ctx = this.canvas.getContext('2d')!;
    }

    /**
     * Start exporting video
     */
    async start(options: ExportOptions): Promise<Blob | null> {
        this.options = options;
        this.aborted = false;
        this.chunks = [];

        // Get video stream from canvas
        const stream = this.canvas.captureStream(EXPORT_FPS);

        // Add audio track from front camera if available
        const frontVideo = options.videoRefs.front?.current;
        if (frontVideo) {
            try {
                const videoStream = (frontVideo as HTMLVideoElement & { captureStream?: () => MediaStream })
                    .captureStream?.();
                const audioTrack = videoStream?.getAudioTracks()[0];
                if (audioTrack) {
                    stream.addTrack(audioTrack);
                }
            } catch {
                // Audio capture not supported, continue without audio
            }
        }

        // Setup MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 8_000_000, // 8 Mbps
        });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        // Start recording
        this.mediaRecorder.start(100); // Collect data every 100ms

        // Prepare all videos for playback
        await this.prepareVideos();

        // Start real-time playback capture
        await this.captureRealTime();

        if (this.aborted) {
            this.cleanup();
            return null;
        }

        // Stop recording and return blob
        return new Promise((resolve) => {
            this.mediaRecorder!.onstop = () => {
                const blob = new Blob(this.chunks, { type: mimeType });
                resolve(blob);
            };
            this.mediaRecorder!.stop();
        });
    }

    /**
     * Cancel export
     */
    abort(): void {
        this.aborted = true;
        this.cleanup();
    }

    /**
     * Cleanup resources
     */
    private cleanup(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Pause all videos
        if (this.options) {
            const { videoRefs } = this.options;
            for (const cam of CAMERAS) {
                const video = videoRefs[cam]?.current;
                if (video) {
                    video.pause();
                }
            }
        }
    }

    /**
     * Prepare all videos for synchronized playback
     */
    private async prepareVideos(): Promise<void> {
        const { videoRefs } = this.options!;

        // Pause and seek all videos to start
        const seekPromises: Promise<void>[] = [];

        for (const cam of CAMERAS) {
            const video = videoRefs[cam]?.current;
            if (video && video.src && video.readyState >= 1) {
                video.pause();
                video.playbackRate = 1; // Ensure normal speed

                seekPromises.push(new Promise<void>((resolve) => {
                    if (video.currentTime === 0) {
                        resolve(); // Already at start
                    } else {
                        const onSeeked = () => {
                            video.removeEventListener('seeked', onSeeked);
                            resolve();
                        };
                        video.addEventListener('seeked', onSeeked);
                        video.currentTime = 0;
                    }
                }));
            }
        }

        await Promise.all(seekPromises);
    }

    /**
     * Capture video in real-time by playing videos and drawing frames
     */
    private async captureRealTime(): Promise<void> {
        const { videoRefs, totalDuration, onProgress } = this.options!;

        // Find the front video as the primary reference
        const primaryVideo = videoRefs.front?.current;
        if (!primaryVideo || !primaryVideo.src) {
            console.error('No primary video found for export');
            return;
        }

        return new Promise<void>((resolve) => {
            // Start all videos playing synchronously
            for (const cam of CAMERAS) {
                const video = videoRefs[cam]?.current;
                if (video && video.src) {
                    video.play().catch(() => {
                        // Ignore play errors
                    });
                }
            }

            const renderLoop = () => {
                if (this.aborted) {
                    this.cleanup();
                    resolve();
                    return;
                }

                const currentTime = primaryVideo.currentTime;

                // Check if we've reached the end
                if (primaryVideo.ended || currentTime >= totalDuration - 0.1) {
                    // Pause all videos
                    for (const cam of CAMERAS) {
                        const video = videoRefs[cam]?.current;
                        if (video) {
                            video.pause();
                        }
                    }
                    resolve();
                    return;
                }

                // Render current frame
                this.renderFrame(currentTime);

                // Report progress
                onProgress?.({
                    phase: 'exporting',
                    percent: Math.min(99, Math.round((currentTime / totalDuration) * 100)),
                    currentTime,
                    totalDuration,
                });

                // Continue render loop
                this.animationFrameId = requestAnimationFrame(renderLoop);
            };

            // Start render loop
            this.animationFrameId = requestAnimationFrame(renderLoop);
        });
    }

    /**
     * Render a single frame to canvas
     */
    private renderFrame(currentTime: number): void {
        const { layout, videoRefs, getTelemetryAtTime } = this.options!;
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

        // Calculate video area (excluding telemetry)
        const videoAreaHeight = EXPORT_HEIGHT - TELEMETRY_HEIGHT;

        // Draw video grid
        this.drawVideoGrid(ctx, layout, videoRefs, videoAreaHeight);

        // Draw telemetry
        const telemetry = getTelemetryAtTime(currentTime);
        if (telemetry) {
            drawTelemetry(this.ctx, telemetry, EXPORT_WIDTH, EXPORT_HEIGHT);
        }
    }

    /**
     * Draw the video grid
     */
    private drawVideoGrid(
        ctx: CanvasRenderingContext2D,
        layout: LayoutMode,
        videoRefs: Record<Camera, React.RefObject<HTMLVideoElement | null>>,
        videoAreaHeight: number
    ): void {
        const cameras = layout === '2x2'
            ? (['front', 'back', 'left_repeater', 'right_repeater'] as Camera[])
            : CAMERAS;

        const cols = layout === 'single' ? 1 : (layout === '2x2' ? 2 : 3);
        const rows = layout === 'single' ? 1 : 2;

        const cellWidth = EXPORT_WIDTH / cols;
        const cellHeight = videoAreaHeight / rows;
        const gap = 2;

        cameras.forEach((cam, index) => {
            const video = videoRefs[cam]?.current;
            if (!video || !video.src || video.readyState < 2) return;

            const col = index % cols;
            const row = Math.floor(index / cols);

            const x = col * cellWidth + gap;
            const y = row * cellHeight + gap;
            const w = cellWidth - gap * 2;
            const h = cellHeight - gap * 2;

            // Draw video frame
            try {
                // Calculate aspect ratio fit
                const videoAspect = video.videoWidth / video.videoHeight;
                const cellAspect = w / h;

                let drawW = w;
                let drawH = h;
                let drawX = x;
                let drawY = y;

                if (videoAspect > cellAspect) {
                    // Video is wider than cell
                    drawH = w / videoAspect;
                    drawY = y + (h - drawH) / 2;
                } else {
                    // Video is taller than cell
                    drawW = h * videoAspect;
                    drawX = x + (w - drawW) / 2;
                }

                ctx.drawImage(video, drawX, drawY, drawW, drawH);
            } catch {
                // Skip if video not ready
            }
        });
    }
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

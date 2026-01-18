import {
    BlobSource,
    BufferTarget,
    Input,
    Output,
    OutputFormat,
    WebMOutputFormat,
    MkvOutputFormat,
    VideoCodec,
    Mp4InputFormat,
    VideoSampleSource,
    VideoSampleSink,
    VideoSample
} from 'mediabunny';

import { drawTelemetry } from './telemetry-renderer';
import type { SeiData, LayoutMode, ExportProgress } from '../types';

export interface WebCodecsExportOptions {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    onProgress: (progress: ExportProgress) => void;
    onLog?: (message: string) => void;
    hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
    codec?: string; // Simple name e.g. 'vp9', 'av1'
    codecString?: string; // Full RFC string e.g. 'vp09.00...'
}



export interface ExportSegment {
    files: Record<string, File>;
    duration: number;
    seiData?: SeiData[];
}

/**
 * Check if WebCodecs is supported suitable for this exporter
 */
export function isWebCodecsSupported(): boolean {
    return typeof VideoDecoder !== 'undefined' &&
        typeof VideoEncoder !== 'undefined' &&
        typeof VideoFrame !== 'undefined' &&
        typeof EncodedVideoChunk !== 'undefined' &&
        typeof OffscreenCanvas !== 'undefined';
}

export class WebCodecsExporter {
    private abortController: AbortController | null = null;
    private options: WebCodecsExportOptions;

    // Mediabunny resources to clean up
    private output?: Output<OutputFormat, BufferTarget>;
    private outputBufferTarget?: BufferTarget;

    // track current segment inputs
    private inputs: Input[] = [];

    constructor(options: WebCodecsExportOptions) {
        this.options = options;
    }

    private log(message: string) {
        console.log(message);
        this.options.onLog?.(message);
    }

    async getMimeType(): Promise<string> {
        return this.output ? this.output.getMimeType() : 'video/webm';
    }

    getFileExtension(): string {
        return this.output ? this.output.format.fileExtension : '.webm';
    }

    static async isConfigSupported(options: Partial<WebCodecsExportOptions>): Promise<boolean> {
        if (!isWebCodecsSupported()) return false;

        try {
            // Check if VideoEncoder.isConfigSupported is available (it should be if isWebCodecsSupported is true)
            if (typeof VideoEncoder !== 'undefined' && VideoEncoder.isConfigSupported) {
                const config: VideoEncoderConfig = {
                    codec: options.codec || 'vp09.00.10.08',
                    width: options.width || 1920,
                    height: options.height || 1080,
                    bitrate: options.bitrate || 4_000_000,
                    framerate: options.fps || 30,
                    hardwareAcceleration: options.hardwareAcceleration || 'no-preference',
                    // latencyMode: 'quality'
                };

                const support = await VideoEncoder.isConfigSupported(config);
                return !!support.supported;
            }
            return true; // Assume supported if we can't check
        } catch (e) {
            console.warn('Error checking config support:', e);
            return false;
        }
    }

    async startExport(
        segments: ExportSegment[],
        layout: LayoutMode = '3x2'
    ): Promise<Blob> {
        this.abortController = new AbortController();
        this.inputs = [];

        try {
            // 1. Setup Output
            this.outputBufferTarget = new BufferTarget(); // Initialize the target
            const codec = (this.options.codec || 'vp9') as VideoCodec;
            const useMkv = codec === 'avc' || codec === 'hevc';

            const outputFormat = useMkv
                ? new MkvOutputFormat({
                    onSegmentHeader: (_data) => {
                        // For streaming/progress if needed vs onFrame? 
                        // MkvOutputFormat options might differ slightly from WebMOutputFormat but basics are same
                        // Removing onCluster hook here as we likely don't need detailed progress from container writing
                        // BufferTarget handles the data collection.
                    }
                })
                : new WebMOutputFormat({
                    // WebM options
                });

            this.output = new Output({
                format: outputFormat,
                target: this.outputBufferTarget, // Use the initialized target
            });

            const width = this.options.width;
            const height = this.options.height;
            const fps = this.options.fps;
            const frameInterval = 1.0 / fps;

            this.log(`Starting export: ${width}x${height} @ ${fps}fps (${(this.options.bitrate / 1000000).toFixed(1)} Mbps)`);
            this.log(`Total segments: ${segments.length}`);

            // Create a VideoSampleSource to feed frames to the output manually
            const videoSource = new VideoSampleSource({
                codec: (this.options.codec || 'vp9') as VideoCodec,
                bitrate: this.options.bitrate,
                hardwareAcceleration: this.options.hardwareAcceleration,
                // @ts-ignore
                fullCodecString: this.options.codecString
            });

            // Add video track to output
            if (this.output) {
                this.output.addVideoTrack(videoSource, {
                    frameRate: fps
                });
            }

            // Start output
            if (this.output) {
                await this.output.start();
            }

            // Re-initialize canvas
            const compositeCanvas = new OffscreenCanvas(width, height);
            const ctx = compositeCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            }) as OffscreenCanvasRenderingContext2D;

            if (!ctx) throw new Error('Failed to get 2D context');

            // 2. Process segments
            let globalTimestamp = 0;


            this.options.onProgress({
                phase: 'encoding',
                percent: 1, // 1%
            });

            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];
                this.log(`Processing segment ${i + 1}/${segments.length} (${segment.duration.toFixed(1)}s)...`);

                // Initialize inputs for this segment
                const cameraSinks: { [key: string]: VideoSampleSink } = {};
                const availableCameras = Object.keys(segment.files);
                this.inputs = []; // New list for this segment

                for (const [camera, file] of Object.entries(segment.files)) {
                    if (this.abortController.signal.aborted) throw new Error('Aborted');

                    const source = new BlobSource(file);
                    const input = new Input({ source, formats: [new Mp4InputFormat()] });
                    this.inputs.push(input);

                    const videoTracks = await input.getVideoTracks();
                    if (videoTracks.length > 0) {
                        const sink = new VideoSampleSink(videoTracks[0]);
                        cameraSinks[camera] = sink;
                    }
                }

                // Process timeline for segment
                const segmentFrames = Math.ceil(segment.duration * fps);
                // Pre-calculate timestamps for efficient iteration
                const timestamps = Array.from({ length: segmentFrames }, (_, i) => i * frameInterval);

                // Initialize iterators for each camera
                const cameraIterators: { [key: string]: AsyncGenerator<VideoSample | null, void, unknown> } = {};
                for (const [camera, sink] of Object.entries(cameraSinks)) {
                    cameraIterators[camera] = sink.samplesAtTimestamps(timestamps);
                }

                for (let frameBy = 0; frameBy < segmentFrames; frameBy++) {
                    if (this.abortController.signal.aborted) throw new Error('Aborted');

                    const localTime = timestamps[frameBy];

                    // Clear canvas
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, width, height);

                    // Fetch frames in parallel
                    const frameMap: { [key: string]: ImageBitmap | HTMLCanvasElement | OffscreenCanvas | VideoFrame } = {};
                    const parsedSamples: VideoSample[] = [];

                    /* eslint-disable no-await-in-loop */
                    // We need to fetch next sample from each iterator
                    await Promise.all(availableCameras.map(async (camera) => {
                        const iterator = cameraIterators[camera];
                        if (iterator) {
                            try {
                                const result = await iterator.next();
                                if (!result.done && result.value) {
                                    const sample = result.value;
                                    parsedSamples.push(sample);
                                    const frame = sample.toCanvasImageSource();
                                    if (frame) {
                                        frameMap[camera] = frame;
                                    }
                                }
                            } catch (e) {
                                // Ignore frame errors
                            }
                        }
                    }));

                    // Draw layout
                    this.drawLayout(ctx, frameMap, layout, width, height);

                    // Cleanup input samples immediately after drawing
                    parsedSamples.forEach(s => s.close());

                    // Draw telemetry
                    if (segment.seiData && segment.seiData.length > 0) {
                        // Calculate effective FPS of the telemetry data
                        // Fallback to 36fps if duration is invalid, but it should be valid here
                        const effectiveFps = segment.duration > 0 ? segment.seiData.length / segment.duration : 36;
                        const seiIndex = Math.floor(localTime * effectiveFps);

                        const sei = segment.seiData[seiIndex];
                        if (sei) {
                            drawTelemetry(ctx, sei, width, height);
                        }
                    }

                    // ENCODE FRAME
                    const timestamp = (globalTimestamp + localTime) * 1_000_000; // microseconds
                    const frame = new VideoFrame(compositeCanvas, { timestamp, duration: frameInterval * 1_000_000 });
                    const sample = new VideoSample(frame);
                    await videoSource.add(sample);
                    sample.close();

                    // Progress
                    const currentProgress = (i / segments.length) + ((frameBy / segmentFrames) / segments.length);
                    this.options.onProgress({
                        phase: 'encoding',
                        percent: currentProgress * 90, // Map 0-1 to 0-90%
                        processedFrames: i * segmentFrames + frameBy,
                        totalFrames: segments.length * segmentFrames // Approximate total frames
                    });
                }

                globalTimestamp += segment.duration;

                // Cleanup segment inputs
                // Inputs are garbage collected, we just clear reference
                this.inputs.forEach(_input => {
                    // mediabunny inputs are cleaned up by garbage collector mostly, 
                    // but we clear our tracking array
                });
                this.inputs = [];
            }

            this.options.onProgress({
                phase: 'encoding',
                percent: 95
            });
            videoSource.close();

            // 5. Finalize
            if (this.output) {
                await this.output.finalize();
            }

            this.log('Finalizing output...');
            this.options.onProgress({
                phase: 'complete',
                percent: 100
            });

            // canvasSource was removed, nothing to close here for output source (videoSource closes itself)
            // 5. Finalize
            if (this.output) {
                await this.output.finalize();
            }

            // 6. Return Blob
            if (this.outputBufferTarget && this.outputBufferTarget.buffer) {
                const mimeType = await this.getMimeType();
                return new Blob([this.outputBufferTarget.buffer], { type: mimeType });
            } else {
                throw new Error('Export failed: No data produced');
            }

        } catch (error) {
            console.error('Export failed:', error);
            throw error;
        } finally {
            this.cleanup();
        }
    }

    private drawLayout(
        ctx: OffscreenCanvasRenderingContext2D,
        frames: { [key: string]: ImageBitmap | HTMLCanvasElement | OffscreenCanvas | VideoFrame },
        layout: LayoutMode,
        width: number,
        height: number
    ) {
        // Helper to draw frame or placeholder
        const drawFrameOrPlaceholder = (camera: string, x: number, y: number, w: number, h: number, label: string) => {
            if (frames[camera]) {
                ctx.drawImage(frames[camera], x, y, w, h);
            } else {
                // Draw placeholder
                ctx.fillStyle = '#1a1a1f';
                ctx.fillRect(x, y, w, h);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = '36px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`No video (${label})`, x + w / 2, y + h / 2);
            }
        };

        if (layout === '3x2') {
            const cellW = width / 3;
            const cellH = height / 2;

            // Row 1
            drawFrameOrPlaceholder('front', 0, 0, cellW, cellH, 'Front');
            drawFrameOrPlaceholder('left_pillar', cellW, 0, cellW, cellH, 'Left Pillar');
            drawFrameOrPlaceholder('right_pillar', cellW * 2, 0, cellW, cellH, 'Right Pillar');

            // Row 2
            drawFrameOrPlaceholder('back', 0, cellH, cellW, cellH, 'Back');
            drawFrameOrPlaceholder('left_repeater', cellW, cellH, cellW, cellH, 'Left Repeater');
            drawFrameOrPlaceholder('right_repeater', cellW * 2, cellH, cellW, cellH, 'Right Repeater');

        } else if (layout === '2x2') {
            // Simple 2x2 logic:
            const halfW = width / 2;
            const halfH = height / 2;

            // Top Left: Front
            drawFrameOrPlaceholder('front', 0, 0, halfW, halfH, 'Front');
            // Top Right: Back
            drawFrameOrPlaceholder('back', halfW, 0, halfW, halfH, 'Back');
            // Bottom Left: Left Repeater
            drawFrameOrPlaceholder('left_repeater', 0, halfH, halfW, halfH, 'Left Repeater');
            // Bottom Right: Right Repeater
            drawFrameOrPlaceholder('right_repeater', halfW, halfH, halfW, halfH, 'Right Repeater');

        } else {
            // Single view
            const main = frames.front || Object.values(frames)[0];
            if (main) ctx.drawImage(main, 0, 0, width, height);
        }
    }


    private cleanup() {
        for (const input of this.inputs) {
            try { input.dispose(); } catch (e) { /* ignore */ }
        }
        this.inputs = [];
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.cleanup();
    }
}

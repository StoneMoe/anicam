/**
 * useVideoExport Hook
 * 
 * React hook for exporting video with merged camera angles and telemetry overlay.
 * Uses WebCodecs for fast export when available, falls back to real-time MediaRecorder.
 */

import { useState, useCallback, useRef } from 'react';
import type { Camera, ClipInfo, LayoutMode, SeiData, Segment } from '../types';
import { VideoExporter, downloadBlob } from '../utils/video-exporter';
import type { ExportProgress } from '../types';
import {
    WebCodecsExporter,
    isWebCodecsSupported,
    type ExportSegment,
    type WebCodecsExportOptions
} from '../utils/webcodecs-exporter';
import { SeiExtractor } from '../utils/sei-extractor';

export interface UseVideoExportReturn {
    isExporting: boolean;
    progress: ExportProgress | null;
    startExport: (options: StartExportOptions) => Promise<void>;
    cancelExport: () => void;
    isWebCodecsAvailable: boolean;
    logs: string[];
}

export interface StartExportOptions {
    clip: ClipInfo;
    segment?: Segment; // For WebCodecs
    layout: LayoutMode;
    videoRefs: Record<Camera, React.RefObject<HTMLVideoElement | null>>;
    getTelemetryAtTime: (time: number) => SeiData | null;
    totalDuration: number;
    currentSegmentIndex: number;
}

export function useVideoExport(): UseVideoExportReturn {
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState<ExportProgress | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const exporterRef = useRef<VideoExporter | WebCodecsExporter | null>(null);

    const isWebCodecsAvailable = isWebCodecsSupported();

    const startExport = useCallback(async (options: StartExportOptions) => {
        const { clip, segment, layout } = options;

        // Don't start if already exporting
        if (isExporting) return;

        setIsExporting(true);
        setLogs([]);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${clip.name}_${timestamp}.webm`;

        try {
            // Determine segments to export
            // If segment is provided, export only that one. Otherwise export all.
            const segmentsToExport = segment ? [segment] : (clip.segments || []);

            if (segmentsToExport.length === 0) {
                throw new Error('No segments to export');
            }

            // Use WebCodecs if available
            if (isWebCodecsAvailable) {
                // Determine best configuration
                const configsToTry: Partial<WebCodecsExportOptions>[] = [
                    // 1. AVC/H.264 (Hardware) - Most compatible hardware accel
                    { codec: 'avc', codecString: 'avc1.4d002a', bitrate: 8_000_000, hardwareAcceleration: 'prefer-hardware' },
                    // 2. HEVC (Hardware)
                    { codec: 'hevc', codecString: 'hvc1.1.6.L93.B0', bitrate: 8_000_000, hardwareAcceleration: 'prefer-hardware' },
                    // 3. AV1 (High Efficiency)
                    { codec: 'av1', codecString: 'av01.0.08M.08', bitrate: 4_000_000, hardwareAcceleration: 'prefer-hardware' },
                    // 4. VP9 High (Hardware)
                    { codec: 'vp9', codecString: 'vp09.00.41.08', bitrate: 8_000_000, hardwareAcceleration: 'prefer-hardware' },
                    // 5. VP9 Standard (Hardware)
                    { codec: 'vp9', codecString: 'vp09.00.31.08', bitrate: 4_000_000, hardwareAcceleration: 'prefer-hardware' },
                    // 6. VP9 Generic (Hardware) (No string)
                    { codec: 'vp9', bitrate: 4_000_000, hardwareAcceleration: 'prefer-hardware' },
                    // 7. AV1 Generic
                    { codec: 'av1', bitrate: 4_000_000, hardwareAcceleration: 'prefer-hardware' },
                    // 8. VP9 Generic (Auto)
                    { codec: 'vp9', bitrate: 4_000_000, hardwareAcceleration: 'no-preference' },
                    // 9. VP8 Legacy
                    { codec: 'vp8', bitrate: 4_000_000, hardwareAcceleration: 'no-preference' }
                ];

                let bestConfig = configsToTry[configsToTry.length - 1]; // Default to safe fallback

                setLogs(prev => [...prev, 'Checking supported encoder configurations...']);

                for (const config of configsToTry) {
                    const isSupported = await WebCodecsExporter.isConfigSupported({
                        width: 1920,
                        height: 1080,
                        fps: 30,
                        ...config,
                        codec: config.codecString || config.codec // Use detailed string for check if available
                    });

                    const configName = `${config.codecString || config.codec} @ ${((config.bitrate || 0) / 1000000).toFixed(1)}Mbps (${config.hardwareAcceleration || 'auto'})`;

                    if (isSupported) {
                        bestConfig = config;
                        setLogs(prev => [...prev, `[OK] ${configName}`]);
                        break;
                    } else {
                        setLogs(prev => [...prev, `[Unsupported] ${configName}`]);
                    }
                }

                setLogs(prev => [...prev, `Selected: ${bestConfig.codecString || bestConfig.codec} @ ${((bestConfig.bitrate || 0) / 1000000).toFixed(1)}Mbps`]);
                setLogs(prev => [...prev, `Preparing to export ${segmentsToExport.length} segment(s)...`]);

                const exportSegments: ExportSegment[] = [];

                // Prepare each segment
                for (let i = 0; i < segmentsToExport.length; i++) {
                    const seg = segmentsToExport[i];
                    setLogs(prev => [...prev, `Preparing segment ${i + 1}/${segmentsToExport.length}...`]);

                    // Resolve files
                    const fileMap: { [key: string]: File } = {};
                    const entryPromises: Promise<void>[] = [];

                    Object.entries(seg.files).forEach(([cam, entry]) => {
                        if (entry) {
                            entryPromises.push(entry.getFile().then(file => {
                                fileMap[cam] = file;
                            }));
                        }
                    });

                    await Promise.all(entryPromises);

                    // Extract SEI data if front camera is available
                    let seiData: SeiData[] | undefined;
                    if (fileMap.front) {
                        try {
                            setLogs(prev => [...prev, `Parsing telemetry for segment ${i + 1}...`]);
                            seiData = await SeiExtractor.extract(fileMap.front);
                            setLogs(prev => [...prev, `Parsed ${seiData.length} telemetry frames`]);
                        } catch (e) {
                            console.warn('Failed to extract SEI data:', e);
                            setLogs(prev => [...prev, 'Warning: Failed to extract telemetry data']);
                        }
                    }

                    exportSegments.push({
                        files: fileMap,
                        duration: seg.duration || 60, // Default duration if missing
                        seiData
                    });
                }

                // Initialize with specific options
                const exporter = new WebCodecsExporter({
                    width: 1920,
                    height: 1080,
                    fps: 30,
                    bitrate: bestConfig.bitrate || 4_000_000,
                    hardwareAcceleration: bestConfig.hardwareAcceleration,
                    codec: bestConfig.codec,
                    codecString: bestConfig.codecString,
                    onProgress: (p) => {
                        setProgress(p);
                    },
                    onLog: (msg) => setLogs(prev => [...prev, msg])
                });
                exporterRef.current = exporter;

                const blob = await exporter.startExport(exportSegments, layout);

                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `anicam-export-${new Date().getTime()}${exporter.getFileExtension()}`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            } else {
                if (!segment && clip.segments.length > 1) {
                    setLogs(prev => [...prev, 'Error: Full clip export requires WebCodecs support (not available in this browser). Exporting current segment only.']);
                }

                setProgress({
                    phase: 'preparing',
                    percent: 0,
                    currentTime: 0,
                    totalDuration: options.totalDuration
                });

                const exporter = new VideoExporter();
                exporterRef.current = exporter;

                const blob = await exporter.start({
                    layout,
                    videoRefs: options.videoRefs,
                    getTelemetryAtTime: options.getTelemetryAtTime,
                    totalDuration: options.totalDuration,
                    clipName: clip.name,
                    onProgress: setProgress,
                });

                if (blob) {
                    downloadBlob(blob, filename);
                }
            }
        } catch (err) {
            console.error('Export failed:', err);
            setLogs(prev => [...prev, `Error: ${err instanceof Error ? err.message : String(err)}`]);
        } finally {
            setIsExporting(false);
            setProgress(null);
            exporterRef.current = null;
        }
    }, [isExporting, isWebCodecsAvailable]);

    const cancelExport = useCallback(() => {
        if (exporterRef.current) {
            exporterRef.current.abort();
        }
    }, []);

    return {
        isExporting,
        progress,
        startExport,
        cancelExport,
        isWebCodecsAvailable,
        logs,
    };
}

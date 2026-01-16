import type { IFileSystemDirectoryEntry, IFileSystemFileEntry } from './file-system';

// Camera identifiers
export type Camera =
    | 'front'
    | 'left_pillar'
    | 'right_pillar'
    | 'back'
    | 'left_repeater'
    | 'right_repeater';

// Clip categories matching Tesla folder structure
export type ClipCategory = 'SavedClips' | 'SentryClips' | 'RecentClips';

// Video layout modes
export type LayoutMode = '3x2' | '2x2' | 'single';

// File handle types from File System Access API
export interface Segment {
    timeStr: string;
    files: Partial<Record<Camera, IFileSystemFileEntry>>;
    duration?: number; // Duration in seconds, populated after video loads
}

// Event metadata from event.json
export interface EventMetadata {
    timestamp?: string;
    city?: string;
    street?: string;
    reason?: string;
    latitude?: number;
    longitude?: number;
}

// Complete clip information
export interface ClipInfo {
    name: string;
    handle: IFileSystemDirectoryEntry;
    category: ClipCategory;
    segments: Segment[];
    event: EventMetadata | null;
    thumbnailHandle: IFileSystemFileEntry | null;
    cameras: Set<Camera>;
    timestamp: number;
}

// Clips organized by category
export interface ClipsByCategory {
    SavedClips: ClipInfo[];
    SentryClips: ClipInfo[];
    RecentClips: ClipInfo[];
}

// SEI telemetry data from video frames
export interface SeiData {
    vehicle_speed_mps?: number;
    gear_state?: number;
    steering_wheel_angle?: number;
    accelerator_pedal_position?: number;
    brake_applied?: boolean;
    autopilot_state?: number;
    blinker_on_left?: boolean;
    blinker_on_right?: boolean;
    latitude_deg?: number;
    longitude_deg?: number;
    linear_acceleration_mps2_x?: number;
    linear_acceleration_mps2_y?: number;
    linear_acceleration_mps2_z?: number;
}

// Unified timeline segment timing
export interface SegmentTiming {
    index: number;
    startTime: number;  // Start time in unified timeline
    endTime: number;    // End time in unified timeline
    duration: number;   // Segment duration
}

// Video player state
export interface PlayerState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    playbackRate: number;
}

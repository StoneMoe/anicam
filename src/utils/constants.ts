import type { Camera, ClipCategory } from '../types';

// Camera order for display
export const CAMERAS: Camera[] = [
    'front',
    'left_pillar',
    'right_pillar',
    'back',
    'left_repeater',
    'right_repeater',
];

// Legacy cameras (older Tesla models without pillar cameras)
export const LEGACY_CAMERAS: Camera[] = [
    'front',
    'back',
    'left_repeater',
    'right_repeater',
];

// All clip categories
export const CLIP_CATEGORIES: ClipCategory[] = [
    'SavedClips',
    'SentryClips',
    'RecentClips',
];

// Human-readable labels for event reasons
export const REASON_LABELS: Record<string, string> = {
    'user_interaction_dashcam_launcher_action_tapped': 'reasons.manual_save',
    'user_interaction_dashcam_multifunction_selected': 'reasons.quick_save',
    'user_interaction_honk': 'reasons.honk',
    'sentry_aware_object_detection': 'reasons.sentry_object',
    'sentry_aware_accel': 'reasons.sentry_motion',
    'sentry_ion_accel_basic': 'reasons.sentry_impact',
    'sentry_clip': 'reasons.sentry_event',
    'dashcam_collision': 'reasons.collision',
    'vehicle_auto_emergency_braking': 'reasons.aeb',
};

// Human-readable camera labels
export const CAMERA_LABELS: Record<Camera, string> = {
    front: 'cameras.front',
    left_pillar: 'cameras.left_pillar',
    right_pillar: 'cameras.right_pillar',
    back: 'cameras.back',
    left_repeater: 'cameras.left_repeater',
    right_repeater: 'cameras.right_repeater',
};

// Gear state labels
export const GEAR_LABELS: Record<number, string> = {
    0: 'P',
    1: 'D',
    2: 'R',
    3: 'N',
};

// Autopilot state labels
export const AUTOPILOT_LABELS: Record<number, string> = {
    0: 'autopilot.off',
    1: 'autopilot.fsd',
    2: 'autopilot.autosteer',
    3: 'autopilot.tacc',
};

// Video playback constants
// Tesla dashcam videos are recorded at 36.1 fps
export const VIDEO_FPS = 36.1;

// Sync threshold for multi-camera playback (seconds)
// If a camera drifts more than this from the front camera, it will be re-synced
export const SYNC_DRIFT_THRESHOLD = 0.15;

// Stall detection threshold (frames at ~60Hz)
// Consider a video stalled after this many frames without time progress
export const STALL_THRESHOLD_FRAMES = 30; // ~500ms at 60Hz

// Default segment duration when metadata cannot be read (seconds)
export const DEFAULT_SEGMENT_DURATION = 60;

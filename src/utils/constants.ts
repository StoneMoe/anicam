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

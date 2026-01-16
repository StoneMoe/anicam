import type { Camera, ClipInfo, ClipsByCategory, EventMetadata } from '../types';
import type { IFileSystemDirectoryEntry, IFileSystemFileEntry } from '../types/file-system';
import { CLIP_CATEGORIES } from './constants';
import { parseClipTimestamp } from './time-utils';

/**
 * Scan a TeslaCam root folder (or parent/child) for all clips
 */
export async function scanClips(
    rootHandle: IFileSystemDirectoryEntry
): Promise<ClipsByCategory> {
    const clips: ClipsByCategory = {
        SavedClips: [],
        SentryClips: [],
        RecentClips: [],
    };

    // Case 1: Driver selected a parent folder containing "TeslaCam"
    try {
        const teslaCamHandle = await rootHandle.getDirectoryHandle('TeslaCam');
        // If we found it, switch root to this folder and continue
        rootHandle = teslaCamHandle;
    } catch {
        // "TeslaCam" not found, continue assuming we are at root or inside a category
    }

    // Case 2: Driver selected a specific category folder (e.g. "SavedClips")
    if (CLIP_CATEGORIES.includes(rootHandle.name as any)) {
        const category = rootHandle.name as keyof ClipsByCategory;
        await scanCategoryFolder(rootHandle, category, clips);
        return clips;
    }

    // Case 3: Standard behavior (TeslaCam folder selected, or previously switched to)
    for (const folder of CLIP_CATEGORIES) {
        try {
            const folderHandle = await rootHandle.getDirectoryHandle(folder);
            await scanCategoryFolder(folderHandle, folder, clips);
        } catch {
            // Folder not found or empty
        }
    }

    return clips;
}

async function scanCategoryFolder(
    folderHandle: IFileSystemDirectoryEntry,
    category: keyof ClipsByCategory,
    clips: ClipsByCategory
) {
    // Special handling for RecentClips which has a flat structure (no subfolders per event)
    if (category === 'RecentClips') {
        const clipInfo = await scanClipFolder(
            folderHandle,
            'Recent Clips',
            category
        );
        if (clipInfo) {
            clips[category].push(clipInfo);
        }
        return;
    }

    for await (const [name, handle] of folderHandle.entries()) {
        if (handle.kind === 'directory') {
            const clipInfo = await scanClipFolder(
                handle as IFileSystemDirectoryEntry,
                name,
                category
            );
            if (clipInfo) {
                clips[category].push(clipInfo);
            }
        }
    }

    // Sort by date descending
    clips[category].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Scan a single clip folder for video files and metadata
 */
async function scanClipFolder(
    handle: IFileSystemDirectoryEntry,
    name: string,
    category: ClipsByCategory[keyof ClipsByCategory][number]['category']
): Promise<ClipInfo | null> {
    const clipInfo: ClipInfo = {
        name,
        handle,
        category,
        segments: [],
        event: null,
        thumbnailHandle: null,
        cameras: new Set(),
        timestamp: 0,
    };

    const videoFiles: Record<string, Partial<Record<Camera, IFileSystemFileEntry>>> = {};

    for await (const [fileName, fileHandle] of handle.entries()) {
        if (fileHandle.kind !== 'file') continue;

        if (fileName === 'event.json') {
            try {
                const file = await (fileHandle as IFileSystemFileEntry).getFile();
                clipInfo.event = JSON.parse(await file.text()) as EventMetadata;
            } catch (err) {
                console.warn('Error reading event.json:', err);
            }
        } else if (fileName === 'thumb.png') {
            clipInfo.thumbnailHandle = fileHandle as IFileSystemFileEntry;
        } else if (fileName.endsWith('.mp4')) {
            // Parse filename: YYYY-MM-DD_HH-MM-SS-camera.mp4
            const match = fileName.match(/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-(.+)\.mp4$/);
            if (match) {
                const [, timeStr, camera] = match;
                if (!videoFiles[timeStr]) {
                    videoFiles[timeStr] = {};
                }
                videoFiles[timeStr][camera as Camera] = fileHandle as IFileSystemFileEntry;
                clipInfo.cameras.add(camera as Camera);
            }
        }
    }

    // Build segments from video files sorted by time
    const timeStrings = Object.keys(videoFiles).sort();
    for (const timeStr of timeStrings) {
        clipInfo.segments.push({
            timeStr,
            files: videoFiles[timeStr],
        });
    }

    if (clipInfo.segments.length === 0) {
        return null;
    }

    // Parse timestamp from folder name
    let timestamp = parseClipTimestamp(name);

    // If folder name doesn't have a timestamp (e.g. "Recent Clips"), use the latest segment's time
    if (timestamp === 0 && clipInfo.segments.length > 0) {
        const lastSegment = clipInfo.segments[clipInfo.segments.length - 1];
        timestamp = parseClipTimestamp(lastSegment.timeStr);
    }
    clipInfo.timestamp = timestamp;

    return clipInfo;
}

/**
 * Load a video file and return its object URL
 */
export async function loadVideoUrl(
    fileHandle: IFileSystemFileEntry
): Promise<string> {
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
}

/**
 * Load thumbnail image and return its object URL
 */
export async function loadThumbnailUrl(
    fileHandle: IFileSystemFileEntry
): Promise<string | null> {
    try {
        const file = await fileHandle.getFile();
        return URL.createObjectURL(file);
    } catch {
        return null;
    }
}

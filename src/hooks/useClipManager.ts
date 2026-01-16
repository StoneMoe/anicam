import { useState, useCallback, useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClipInfo, ClipsByCategory } from '../types';
import { scanClips } from '../utils/clip-scanner';
import {
    NativeFileSystemDirectoryEntry,
    createVirtualFileSystemFromFiles,
    type FileProcessingProgress,
} from '../utils/file-system-adapters';
import type { IFileSystemDirectoryEntry } from '../types/file-system';

export interface LoadingProgress {
    phase: 'filtering' | 'building' | 'scanning';
    processed: number;
    total: number;
    message: string;
}

interface UseClipManagerReturn {
    clips: ClipsByCategory;
    currentClip: ClipInfo | null;
    isLoading: boolean;
    loadingProgress: LoadingProgress | null;
    error: string | null;
    warning: string | null;
    dismissWarning: () => void;
    selectFolder: () => Promise<void>;
    selectClip: (clip: ClipInfo) => void;
    hasClips: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

const EMPTY_CLIPS: ClipsByCategory = {
    SavedClips: [],
    SentryClips: [],
    RecentClips: [],
};

export function useClipManager(): UseClipManagerReturn {
    const { t } = useTranslation();
    const [clips, setClips] = useState<ClipsByCategory>(EMPTY_CLIPS);
    const [currentClip, setCurrentClip] = useState<ClipInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    // Fallback file input ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadClipsFromHandle = useCallback(async (rootHandle: IFileSystemDirectoryEntry) => {
        try {
            setIsLoading(true);
            setLoadingProgress({
                phase: 'scanning',
                processed: 0,
                total: 0,
                message: t('loading.scanningClips'),
            });
            setError(null);
            setWarning(null);

            // Check if user selected a category folder directly
            if (['SavedClips', 'SentryClips', 'RecentClips'].includes(rootHandle.name)) {
                setWarning(t('warnings.singleCategoryFolder'));
            }

            const scannedClips = await scanClips(rootHandle);
            setClips(scannedClips);
            setCurrentClip(null);
        } catch (err) {
            console.error('Error scanning folder:', err);
            setError(t('errors.folderAccess', { error: (err as Error).message }));
        } finally {
            setIsLoading(false);
            setLoadingProgress(null);
        }
    }, [t]);

    const selectFolder = useCallback(async () => {
        // Check for File System Access API support
        if ('showDirectoryPicker' in window) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const handle = await (window as any).showDirectoryPicker({
                    mode: 'read',
                });
                const rootHandle = new NativeFileSystemDirectoryEntry(handle);
                await loadClipsFromHandle(rootHandle);
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    console.error('Error selecting folder:', err);
                    setError(t('errors.folderAccess', { error: (err as Error).message }));
                }
            }
        } else {
            // Fallback: Trigger hidden file input
            fileInputRef.current?.click();
        }
    }, [loadClipsFromHandle, t]);

    const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        try {
            setIsLoading(true);
            setError(null);

            // Progress callback for file processing
            const onProgress = (progress: FileProcessingProgress) => {
                const percent = progress.total > 0
                    ? Math.round((progress.processed / progress.total) * 100)
                    : 0;

                setLoadingProgress({
                    phase: progress.phase,
                    processed: progress.processed,
                    total: progress.total,
                    message: progress.phase === 'filtering'
                        ? t('loading.filteringFiles', { percent })
                        : t('loading.buildingStructure', { percent }),
                });
            };

            const rootHandle = await createVirtualFileSystemFromFiles(files, onProgress);
            await loadClipsFromHandle(rootHandle);
        } catch (err) {
            console.error('Error reading files:', err);
            setError(t('errors.folderAccess', { error: (err as Error).message }));
            setIsLoading(false);
            setLoadingProgress(null);
        } finally {
            // Reset input so same folder can be selected again if needed
            event.target.value = '';
        }
    }, [loadClipsFromHandle, t]);

    const selectClip = useCallback((clip: ClipInfo) => {
        setCurrentClip(clip);
    }, []);

    const hasClips =
        clips.SavedClips.length > 0 ||
        clips.SentryClips.length > 0 ||
        clips.RecentClips.length > 0;

    const dismissWarning = useCallback(() => {
        setWarning(null);
    }, []);

    return {
        clips,
        currentClip,
        isLoading,
        loadingProgress,
        error,
        warning,
        selectFolder,
        selectClip,
        dismissWarning,
        hasClips,
        fileInputRef,
        handleFileChange,
    };
}

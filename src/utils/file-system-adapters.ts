import {
    IFileSystemDirectoryEntry,
    IFileSystemEntry,
    IFileSystemFileEntry,
} from '../types/file-system';

// --- Native File System Access API Adapters ---

export class NativeFileSystemFileEntry implements IFileSystemFileEntry {
    kind: 'file' = 'file';

    constructor(private handle: FileSystemFileHandle) { }

    get name(): string {
        return this.handle.name;
    }

    async getFile(): Promise<File> {
        return this.handle.getFile();
    }
}

export class NativeFileSystemDirectoryEntry implements IFileSystemDirectoryEntry {
    kind: 'directory' = 'directory';

    constructor(private handle: FileSystemDirectoryHandle) { }

    get name(): string {
        return this.handle.name;
    }

    async *entries(): AsyncIterableIterator<[string, IFileSystemEntry]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const [name, handle] of (this.handle as any).entries()) {
            if (handle.kind === 'file') {
                yield [name, new NativeFileSystemFileEntry(handle as FileSystemFileHandle)];
            } else if (handle.kind === 'directory') {
                yield [name, new NativeFileSystemDirectoryEntry(handle as FileSystemDirectoryHandle)];
            }
        }
    }

    async getDirectoryHandle(name: string): Promise<IFileSystemDirectoryEntry> {
        const handle = await this.handle.getDirectoryHandle(name);
        return new NativeFileSystemDirectoryEntry(handle);
    }
}

// --- Virtual File System (from <input type="file">) Adapters ---

export class VirtualFileSystemFileEntry implements IFileSystemFileEntry {
    kind: 'file' = 'file';

    constructor(public file: File) { }

    get name(): string {
        return this.file.name;
    }

    async getFile(): Promise<File> {
        return this.file;
    }
}

export class VirtualFileSystemDirectoryEntry implements IFileSystemDirectoryEntry {
    kind: 'directory' = 'directory';
    private _entries: Map<string, IFileSystemEntry> = new Map();

    constructor(public name: string) { }

    addEntry(entry: IFileSystemEntry) {
        this._entries.set(entry.name, entry);
    }

    async *entries(): AsyncIterableIterator<[string, IFileSystemEntry]> {
        for (const entry of this._entries.entries()) {
            yield entry;
        }
    }

    async getDirectoryHandle(name: string): Promise<IFileSystemDirectoryEntry> {
        const entry = this._entries.get(name);
        if (entry && entry.kind === 'directory') {
            return entry as IFileSystemDirectoryEntry;
        }
        throw new Error(`Directory not found: ${name}`);
    }
}

// --- File Filtering and Progress ---

/**
 * File extensions and names that are relevant to TeslaCam clips
 */
const TESLACAM_FILE_PATTERNS = {
    extensions: ['.mp4'],
    names: ['event.json', 'thumb.png'],
};

/**
 * Check if a filename is relevant to TeslaCam clips
 */
function isTeslaCamFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();

    // Check exact names
    if (TESLACAM_FILE_PATTERNS.names.includes(lowerName)) {
        return true;
    }

    // Check extensions
    return TESLACAM_FILE_PATTERNS.extensions.some(ext => lowerName.endsWith(ext));
}

/**
 * Progress callback type for file processing
 */
export type FileProcessingProgress = {
    processed: number;
    total: number;
    phase: 'filtering' | 'building';
};

/**
 * Batch size for processing files to avoid blocking the UI thread
 */
const BATCH_SIZE = 100;

/**
 * Yield to the main thread to keep UI responsive
 */
function yieldToMain(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Creates a virtual directory structure from a flat list of files
 * populated via <input type="file" webkitdirectory>
 * 
 * This async version filters for TeslaCam-relevant files and processes
 * in batches to avoid overwhelming mobile browsers.
 */
export async function createVirtualFileSystemFromFiles(
    files: FileList,
    onProgress?: (progress: FileProcessingProgress) => void
): Promise<IFileSystemDirectoryEntry> {
    if (files.length === 0) {
        throw new Error('No files selected');
    }

    // Phase 1: Filter for TeslaCam-relevant files
    const relevantFiles: File[] = [];
    const totalFiles = files.length;

    for (let i = 0; i < totalFiles; i++) {
        const file = files[i];

        if (isTeslaCamFile(file.name)) {
            relevantFiles.push(file);
        }

        // Report progress and yield to main thread periodically
        if (i % BATCH_SIZE === 0) {
            onProgress?.({
                processed: i,
                total: totalFiles,
                phase: 'filtering',
            });
            await yieldToMain();
        }
    }

    // Report filtering complete
    onProgress?.({
        processed: totalFiles,
        total: totalFiles,
        phase: 'filtering',
    });

    if (relevantFiles.length === 0) {
        throw new Error('No TeslaCam video files found in the selected folder');
    }

    // Determine root name from the first file's path
    const firstPath = relevantFiles[0].webkitRelativePath;
    const rootName = firstPath ? firstPath.split('/')[0] : 'root';

    const root = new VirtualFileSystemDirectoryEntry(rootName);
    const totalRelevant = relevantFiles.length;

    // Phase 2: Build directory structure
    for (let i = 0; i < totalRelevant; i++) {
        const file = relevantFiles[i];
        const pathParts = file.webkitRelativePath.split('/');

        // Start from root
        let currentDir = root;

        // Iterate through path parts, excluding the root name (index 0) and filename (last index)
        for (let j = 1; j < pathParts.length - 1; j++) {
            const part = pathParts[j];
            let nextDir = currentDir['_entries'].get(part);

            if (!nextDir) {
                nextDir = new VirtualFileSystemDirectoryEntry(part);
                currentDir.addEntry(nextDir);
            } else if (nextDir.kind !== 'directory') {
                throw new Error(`Path conflict: ${part} is a file but expected a directory`);
            }

            currentDir = nextDir as VirtualFileSystemDirectoryEntry;
        }

        // Add file to the leaf directory
        const fileEntry = new VirtualFileSystemFileEntry(file);
        currentDir.addEntry(fileEntry);

        // Report progress and yield periodically
        if (i % BATCH_SIZE === 0) {
            onProgress?.({
                processed: i,
                total: totalRelevant,
                phase: 'building',
            });
            await yieldToMain();
        }
    }

    // Report complete
    onProgress?.({
        processed: totalRelevant,
        total: totalRelevant,
        phase: 'building',
    });

    return root;
}

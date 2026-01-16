export interface IFileSystemEntry {
    name: string;
    kind: 'file' | 'directory';
}

export interface IFileSystemFileEntry extends IFileSystemEntry {
    kind: 'file';
    getFile(): Promise<File>;
}

export interface IFileSystemDirectoryEntry extends IFileSystemEntry {
    kind: 'directory';
    entries(): AsyncIterableIterator<[string, IFileSystemEntry]>;
    getDirectoryHandle(name: string): Promise<IFileSystemDirectoryEntry>;
}

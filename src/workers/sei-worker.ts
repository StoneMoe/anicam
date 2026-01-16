/**
 * SEI Parser Web Worker
 * 
 * Parses Tesla dashcam SEI metadata in chunks without blocking the main thread.
 * Uses streaming approach to handle large video files on memory-constrained devices.
 */

import type { SeiData } from '../types';

// Re-export types for worker messages
export interface SeiWorkerMessage {
    type: 'start' | 'abort';
    file?: File;
}

export interface SeiWorkerResponse {
    type: 'progress' | 'frame' | 'complete' | 'error';
    frame?: SeiData;
    frameIndex?: number;
    progress?: number;
    totalFrames?: number;
    error?: string;
}

// NAL unit types
const NAL_ID_SEI = 6;
const NAL_SEI_ID_USER_DATA_UNREGISTERED = 5;

// Chunk size for streaming (1MB chunks)
const CHUNK_SIZE = 1024 * 1024;

// SEI field definitions
type SeiFieldType = 'uint32' | 'uint64' | 'float' | 'double' | 'bool' | 'enum';

interface SeiFieldDef {
    name: string;
    type: SeiFieldType;
}

const SEI_FIELDS: Record<number, SeiFieldDef> = {
    1: { name: 'version', type: 'uint32' },
    2: { name: 'gear_state', type: 'enum' },
    3: { name: 'frame_seq_no', type: 'uint64' },
    4: { name: 'vehicle_speed_mps', type: 'float' },
    5: { name: 'accelerator_pedal_position', type: 'float' },
    6: { name: 'steering_wheel_angle', type: 'float' },
    7: { name: 'blinker_on_left', type: 'bool' },
    8: { name: 'blinker_on_right', type: 'bool' },
    9: { name: 'brake_applied', type: 'bool' },
    10: { name: 'autopilot_state', type: 'enum' },
    11: { name: 'latitude_deg', type: 'double' },
    12: { name: 'longitude_deg', type: 'double' },
    13: { name: 'heading_deg', type: 'double' },
    14: { name: 'linear_acceleration_mps2_x', type: 'double' },
    15: { name: 'linear_acceleration_mps2_y', type: 'double' },
    16: { name: 'linear_acceleration_mps2_z', type: 'double' },
};

let aborted = false;

self.onmessage = async (event: MessageEvent<SeiWorkerMessage>) => {
    const { type, file } = event.data;

    if (type === 'abort') {
        aborted = true;
        return;
    }

    if (type === 'start' && file) {
        aborted = false;
        await parseFileStreaming(file);
    }
};

/**
 * Parse a file in streaming chunks
 */
async function parseFileStreaming(file: File): Promise<void> {
    const fileSize = file.size;
    let offset = 0;
    let frameIndex = 0;
    let mdatOffset = 0;
    let mdatSize = 0;

    // Buffer for handling NAL units that span chunk boundaries
    let pendingBuffer: Uint8Array | null = null;

    try {
        // First pass: Find mdat atom location (read first 100KB to find header)
        const headerChunk = await readChunk(file, 0, Math.min(100 * 1024, fileSize));
        const mdatInfo = findMdatInChunk(headerChunk, 0);

        if (mdatInfo.offset === -1) {
            // mdat not in header, likely after moov - scan further
            const scanResult = await scanForMdat(file);
            if (scanResult.offset === -1) {
                postResponse({ type: 'complete', totalFrames: 0 });
                return;
            }
            mdatOffset = scanResult.offset;
            mdatSize = scanResult.size;
        } else {
            mdatOffset = mdatInfo.offset;
            mdatSize = mdatInfo.size;
        }

        offset = mdatOffset;
        const mdatEnd = mdatSize > 0 ? mdatOffset + mdatSize : fileSize;

        // Parse mdat content in chunks
        while (offset < mdatEnd && !aborted) {
            const chunkEnd = Math.min(offset + CHUNK_SIZE, mdatEnd);
            let chunk = await readChunk(file, offset, chunkEnd);

            // Prepend pending buffer from previous chunk
            if (pendingBuffer) {
                const combined = new Uint8Array(pendingBuffer.length + chunk.length);
                combined.set(pendingBuffer);
                combined.set(chunk, pendingBuffer.length);
                chunk = combined;
                pendingBuffer = null;
            }

            // Parse NAL units in this chunk
            const parseResult = parseNalUnitsInChunk(chunk, frameIndex);

            // Send parsed frames to main thread
            for (const frame of parseResult.frames) {
                postResponse({
                    type: 'frame',
                    frame: frame.data,
                    frameIndex: frame.index,
                });
            }

            frameIndex = parseResult.nextFrameIndex;

            // Keep incomplete NAL for next iteration
            if (parseResult.remaining && parseResult.remaining.length > 0) {
                pendingBuffer = parseResult.remaining;
            }

            // Report progress
            const progress = Math.round(((offset - mdatOffset) / (mdatEnd - mdatOffset)) * 100);
            postResponse({ type: 'progress', progress });

            offset = chunkEnd;
        }

        postResponse({ type: 'complete', totalFrames: frameIndex });

    } catch (err) {
        postResponse({
            type: 'error',
            error: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}

/**
 * Read a chunk of the file
 */
async function readChunk(file: File, start: number, end: number): Promise<Uint8Array> {
    const slice = file.slice(start, end);
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
}

/**
 * Scan for mdat atom in file (streaming)
 */
async function scanForMdat(file: File): Promise<{ offset: number; size: number }> {
    let pos = 0;
    const fileSize = file.size;

    while (pos < fileSize - 8) {
        const headerChunk = await readChunk(file, pos, Math.min(pos + 16, fileSize));
        const view = new DataView(headerChunk.buffer);

        const size32 = view.getUint32(0, false);
        const atomType = String.fromCharCode(
            headerChunk[4], headerChunk[5], headerChunk[6], headerChunk[7]
        );

        let atomSize: number;
        let headerSize: number;

        if (size32 === 1) {
            atomSize = Number(view.getBigUint64(8, false));
            headerSize = 16;
        } else if (size32 === 0) {
            atomSize = fileSize - pos;
            headerSize = 8;
        } else {
            atomSize = size32;
            headerSize = 8;
        }

        if (atomType === 'mdat') {
            return { offset: pos + headerSize, size: atomSize - headerSize };
        }

        if (atomSize < headerSize) break;
        pos += atomSize;
    }

    return { offset: -1, size: 0 };
}

/**
 * Find mdat atom in a chunk
 */
function findMdatInChunk(chunk: Uint8Array, baseOffset: number): { offset: number; size: number } {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    let pos = 0;

    while (pos < chunk.length - 8) {
        const size32 = view.getUint32(pos, false);
        const atomType = String.fromCharCode(
            chunk[pos + 4], chunk[pos + 5], chunk[pos + 6], chunk[pos + 7]
        );

        let atomSize: number;
        let headerSize: number;

        if (size32 === 1 && pos + 16 <= chunk.length) {
            atomSize = Number(view.getBigUint64(pos + 8, false));
            headerSize = 16;
        } else if (size32 === 0) {
            atomSize = chunk.length - pos;
            headerSize = 8;
        } else {
            atomSize = size32;
            headerSize = 8;
        }

        if (atomType === 'mdat') {
            return { offset: baseOffset + pos + headerSize, size: atomSize - headerSize };
        }

        if (atomSize < headerSize) break;
        pos += atomSize;
    }

    return { offset: -1, size: 0 };
}

interface ParsedFrame {
    index: number;
    data: SeiData;
}

interface ParseResult {
    frames: ParsedFrame[];
    nextFrameIndex: number;
    remaining: Uint8Array | null;
}

/**
 * Parse NAL units in a chunk
 */
function parseNalUnitsInChunk(chunk: Uint8Array, startFrameIndex: number): ParseResult {
    const frames: ParsedFrame[] = [];
    let frameIndex = startFrameIndex;
    let pos = 0;
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);

    while (pos + 4 < chunk.length) {
        // Check if we have enough bytes for NAL size
        if (pos + 4 > chunk.length) {
            return { frames, nextFrameIndex: frameIndex, remaining: chunk.slice(pos) };
        }

        const nalSize = view.getUint32(pos, false);

        // Validate NAL size
        if (nalSize < 2 || nalSize > 10 * 1024 * 1024) {
            pos += 4;
            continue;
        }

        // Check if complete NAL is in this chunk
        if (pos + 4 + nalSize > chunk.length) {
            return { frames, nextFrameIndex: frameIndex, remaining: chunk.slice(pos) };
        }

        // Read NAL type
        const firstByte = chunk[pos + 4];
        const secondByte = chunk[pos + 5];
        const nalType = firstByte & 0x1f;
        const seiPayloadType = secondByte;

        // Check for SEI NAL with user data
        if (nalType === NAL_ID_SEI && seiPayloadType === NAL_SEI_ID_USER_DATA_UNREGISTERED) {
            const nalData = chunk.slice(pos + 4, pos + 4 + nalSize);
            const payload = extractProtoPayload(nalData);

            if (payload) {
                try {
                    const metadata = decodeProtobuf(payload);
                    if (metadata && Object.keys(metadata).length > 0) {
                        frames.push({ index: frameIndex, data: metadata as SeiData });
                        frameIndex++;
                    }
                } catch {
                    // Skip invalid data
                }
            }
        }

        pos += 4 + nalSize;
    }

    return { frames, nextFrameIndex: frameIndex, remaining: null };
}

/**
 * Extract protobuf payload from SEI NAL unit
 */
function extractProtoPayload(nal: Uint8Array): Uint8Array | null {
    if (!nal || nal.length < 2) return null;

    for (let i = 3; i < nal.length - 1; i++) {
        const byte = nal[i];
        if (byte === 0x42) continue;
        if (byte === 0x69 && i > 2) {
            const rawPayload = nal.slice(i + 1, nal.length - 1);
            return stripEmulationPreventionBytes(rawPayload);
        }
        break;
    }

    return null;
}

/**
 * Remove H.264 emulation prevention bytes
 */
function stripEmulationPreventionBytes(data: Uint8Array): Uint8Array {
    const stripped: number[] = [];
    let zeroCount = 0;

    for (const byte of data) {
        if (zeroCount >= 2 && byte === 0x03) {
            zeroCount = 0;
            continue;
        }
        stripped.push(byte);
        zeroCount = byte === 0 ? zeroCount + 1 : 0;
    }

    return new Uint8Array(stripped);
}

/**
 * Decode protobuf message
 */
function decodeProtobuf(data: Uint8Array): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let pos = 0;

    while (pos < data.length) {
        const { value: header, bytesRead: headerBytes } = readVarint(data, pos);
        if (headerBytes === 0) break;
        pos += headerBytes;

        const fieldNumber = header >>> 3;
        const wireType = header & 0x07;
        const fieldDef = SEI_FIELDS[fieldNumber];

        let fieldValue: unknown;
        let valueBytesRead: number;

        switch (wireType) {
            case 0: {
                const varintResult = readVarint(data, pos);
                fieldValue = varintResult.value;
                valueBytesRead = varintResult.bytesRead;
                break;
            }
            case 1:
                if (pos + 8 > data.length) return result;
                if (fieldDef?.type === 'double') {
                    fieldValue = readDouble(data, pos);
                } else {
                    fieldValue = readFixed64(data, pos);
                }
                valueBytesRead = 8;
                break;
            case 5:
                if (pos + 4 > data.length) return result;
                if (fieldDef?.type === 'float') {
                    fieldValue = readFloat(data, pos);
                } else {
                    fieldValue = readFixed32(data, pos);
                }
                valueBytesRead = 4;
                break;
            case 2: {
                const lenResult = readVarint(data, pos);
                pos += lenResult.bytesRead;
                valueBytesRead = lenResult.value;
                fieldValue = data.slice(pos, pos + valueBytesRead);
                break;
            }
            default:
                return result;
        }

        if (valueBytesRead === 0 && wireType !== 2) break;
        pos += valueBytesRead;

        if (fieldDef) {
            if (fieldDef.type === 'bool') {
                result[fieldDef.name] = fieldValue !== 0;
            } else {
                result[fieldDef.name] = fieldValue;
            }
        }
    }

    return result;
}

function readVarint(data: Uint8Array, pos: number): { value: number; bytesRead: number } {
    let result = 0;
    let shift = 0;
    let bytesRead = 0;

    while (pos + bytesRead < data.length) {
        const byte = data[pos + bytesRead];
        bytesRead++;
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
        if (shift >= 64) break;
    }

    return { value: result >>> 0, bytesRead };
}

function readFloat(data: Uint8Array, pos: number): number {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    for (let i = 0; i < 4; i++) view.setUint8(i, data[pos + i]);
    return view.getFloat32(0, true);
}

function readDouble(data: Uint8Array, pos: number): number {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    for (let i = 0; i < 8; i++) view.setUint8(i, data[pos + i]);
    return view.getFloat64(0, true);
}

function readFixed32(data: Uint8Array, pos: number): number {
    return data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24);
}

function readFixed64(data: Uint8Array, pos: number): number {
    const low = readFixed32(data, pos);
    const high = readFixed32(data, pos + 4);
    return low + high * 0x100000000;
}

function postResponse(response: SeiWorkerResponse): void {
    self.postMessage(response);
}

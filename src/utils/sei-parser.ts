/**
 * Tesla Dashcam SEI Metadata Parser
 *
 * Extracts embedded telemetry data from Tesla dashcam MP4 files.
 * Based on Tesla's official sei_extractor.py and dashcam.proto
 *
 * SEI data is only present in:
 * - Firmware 2025.44.25 or later
 * - HW3 or above vehicles
 * - May not be present if car is parked
 */

import type { SeiData } from '../types';

// SEI field type definitions
type SeiFieldType = 'uint32' | 'uint64' | 'float' | 'double' | 'bool' | 'enum';

interface SeiFieldDef {
    name: keyof SeiData | 'version' | 'frame_seq_no' | 'heading_deg';
    type: SeiFieldType;
}

// SEI Metadata field definitions from dashcam.proto
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

// NAL unit types
const NAL_ID_SEI = 6;
const NAL_SEI_ID_USER_DATA_UNREGISTERED = 5;

/**
 * Extract all SEI metadata frames from an MP4 file
 */
export async function extractSeiMetadata(arrayBuffer: ArrayBuffer): Promise<SeiData[]> {
    const dataView = new DataView(arrayBuffer);
    const results: SeiData[] = [];

    try {
        // Find mdat atom
        const { offset, size } = findMdat(dataView);

        if (offset === -1) {
            console.warn('mdat atom not found');
            return results;
        }

        // Iterate through NAL units and extract SEI data
        for (const nal of iterNals(dataView, offset, size)) {
            const payload = extractProtoPayload(nal);
            if (!payload) continue;

            try {
                const metadata = decodeProtobuf(payload);
                if (metadata && Object.keys(metadata).length > 0) {
                    results.push(metadata);
                }
            } catch {
                // Skip invalid protobuf data
                continue;
            }
        }
    } catch (err) {
        console.error('Error extracting SEI metadata:', err);
    }

    return results;
}

/**
 * Find the mdat atom in the MP4 file
 */
function findMdat(dataView: DataView): { offset: number; size: number } {
    let pos = 0;
    const length = dataView.byteLength;

    while (pos < length - 8) {
        const size32 = dataView.getUint32(pos, false); // Big endian
        const atomType = readString(dataView, pos + 4, 4);

        let atomSize: number;
        let headerSize: number;

        if (size32 === 1) {
            // Extended size (64-bit)
            if (pos + 16 > length) break;
            atomSize = readUint64(dataView, pos + 8);
            headerSize = 16;
        } else if (size32 === 0) {
            // Atom extends to end of file
            atomSize = length - pos;
            headerSize = 8;
        } else {
            atomSize = size32;
            headerSize = 8;
        }

        if (atomType === 'mdat') {
            const payloadSize = atomSize - headerSize;
            return { offset: pos + headerSize, size: payloadSize };
        }

        if (atomSize < headerSize) {
            break;
        }

        pos += atomSize;
    }

    return { offset: -1, size: 0 };
}

/**
 * Iterate through SEI NAL units in the mdat atom
 */
function* iterNals(
    dataView: DataView,
    offset: number,
    size: number
): Generator<Uint8Array> {
    let consumed = 0;
    const end = size === 0 ? dataView.byteLength : offset + size;

    while (offset + consumed + 4 < end) {
        const pos = offset + consumed;

        // Read NAL size (4 bytes, big endian)
        const nalSize = dataView.getUint32(pos, false);

        if (nalSize < 2 || pos + 4 + nalSize > end) {
            consumed += 4 + (nalSize < 2 ? nalSize : 0);
            continue;
        }

        // Read first two bytes to check NAL type
        const firstByte = dataView.getUint8(pos + 4);
        const secondByte = dataView.getUint8(pos + 5);

        const nalType = firstByte & 0x1f;
        const seiPayloadType = secondByte;

        // Check if this is an SEI NAL with user data unregistered
        if (nalType !== NAL_ID_SEI || seiPayloadType !== NAL_SEI_ID_USER_DATA_UNREGISTERED) {
            consumed += 4 + nalSize;
            continue;
        }

        // Extract full NAL unit
        const nalData = new Uint8Array(dataView.buffer, pos + 4, nalSize);
        yield nalData;

        consumed += 4 + nalSize;
    }
}

/**
 * Extract protobuf payload from SEI NAL unit
 * Tesla's SEI data has a marker pattern: 0x42...0x42 0x69 followed by protobuf
 */
function extractProtoPayload(nal: Uint8Array): Uint8Array | null {
    if (!nal || nal.length < 2) {
        return null;
    }

    // Look for the marker pattern: 0x42 bytes followed by 0x69
    for (let i = 3; i < nal.length - 1; i++) {
        const byte = nal[i];

        if (byte === 0x42) {
            continue;
        }

        if (byte === 0x69 && i > 2) {
            // Found marker, extract and clean payload
            // Skip the trailing byte (usually 0x80 RBSP trailing bits)
            const rawPayload = nal.slice(i + 1, nal.length - 1);
            return stripEmulationPreventionBytes(rawPayload);
        }

        // Not a valid marker pattern
        break;
    }

    return null;
}

/**
 * Remove H.264 emulation prevention bytes (0x03 following 0x00 0x00)
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
 * Decode protobuf message according to SEI schema
 */
function decodeProtobuf(data: Uint8Array): SeiData {
    const result: Record<string, unknown> = {};
    let pos = 0;

    while (pos < data.length) {
        // Read field header (varint)
        const { value: header, bytesRead: headerBytes } = readVarint(data, pos);
        if (headerBytes === 0) break;
        pos += headerBytes;

        const fieldNumber = header >>> 3;
        const wireType = header & 0x07;

        const fieldDef = SEI_FIELDS[fieldNumber];

        // Read field value based on wire type
        let fieldValue: unknown;
        let valueBytesRead: number;

        switch (wireType) {
            case 0: {
                // Varint
                const varintResult = readVarint(data, pos);
                fieldValue = varintResult.value;
                valueBytesRead = varintResult.bytesRead;
                break;
            }

            case 1: // 64-bit (fixed64, double)
                if (pos + 8 > data.length) return result as SeiData;
                if (fieldDef && fieldDef.type === 'double') {
                    fieldValue = readDouble(data, pos);
                } else {
                    fieldValue = readFixed64(data, pos);
                }
                valueBytesRead = 8;
                break;

            case 5: // 32-bit (fixed32, float)
                if (pos + 4 > data.length) return result as SeiData;
                if (fieldDef && fieldDef.type === 'float') {
                    fieldValue = readFloat(data, pos);
                } else {
                    fieldValue = readFixed32(data, pos);
                }
                valueBytesRead = 4;
                break;

            case 2: {
                // Length-delimited (string, bytes, embedded message)
                const lenResult = readVarint(data, pos);
                pos += lenResult.bytesRead;
                valueBytesRead = lenResult.value;
                fieldValue = data.slice(pos, pos + valueBytesRead);
                break;
            }

            default:
                // Unknown wire type, try to skip
                return result as SeiData;
        }

        if (valueBytesRead === 0 && wireType !== 2) break;
        pos += valueBytesRead;

        // Store field if we know its definition
        if (fieldDef) {
            // Handle boolean types
            if (fieldDef.type === 'bool') {
                result[fieldDef.name] = fieldValue !== 0;
            } else {
                result[fieldDef.name] = fieldValue;
            }
        }
    }

    return result as SeiData;
}

/**
 * Read a varint from the data
 */
function readVarint(
    data: Uint8Array,
    pos: number
): { value: number; bytesRead: number } {
    let result = 0;
    let shift = 0;
    let bytesRead = 0;

    while (pos + bytesRead < data.length) {
        const byte = data[pos + bytesRead];
        bytesRead++;

        result |= (byte & 0x7f) << shift;

        if ((byte & 0x80) === 0) {
            break;
        }

        shift += 7;

        if (shift >= 64) {
            // Overflow protection
            break;
        }
    }

    return { value: result >>> 0, bytesRead };
}

/**
 * Read a 32-bit float
 */
function readFloat(data: Uint8Array, pos: number): number {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    for (let i = 0; i < 4; i++) {
        view.setUint8(i, data[pos + i]);
    }
    return view.getFloat32(0, true); // Little endian
}

/**
 * Read a 64-bit double
 */
function readDouble(data: Uint8Array, pos: number): number {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    for (let i = 0; i < 8; i++) {
        view.setUint8(i, data[pos + i]);
    }
    return view.getFloat64(0, true); // Little endian
}

/**
 * Read a fixed 32-bit integer
 */
function readFixed32(data: Uint8Array, pos: number): number {
    return (
        data[pos] |
        (data[pos + 1] << 8) |
        (data[pos + 2] << 16) |
        (data[pos + 3] << 24)
    );
}

/**
 * Read a fixed 64-bit integer (as Number, may lose precision)
 */
function readFixed64(data: Uint8Array, pos: number): number {
    const low = readFixed32(data, pos);
    const high = readFixed32(data, pos + 4);
    return low + high * 0x100000000;
}

/**
 * Read a string from DataView
 */
function readString(dataView: DataView, offset: number, length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
        str += String.fromCharCode(dataView.getUint8(offset + i));
    }
    return str;
}

/**
 * Read 64-bit unsigned integer from DataView
 */
function readUint64(dataView: DataView, offset: number): number {
    const high = dataView.getUint32(offset, false);
    const low = dataView.getUint32(offset + 4, false);
    return high * 0x100000000 + low;
}

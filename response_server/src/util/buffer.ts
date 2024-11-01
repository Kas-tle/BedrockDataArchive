import { NBT } from './nbt';

export class BufferReader {
    private buffer: Buffer;
    private offset: number;
    private static nbt = NBT.nbtify();

    constructor(buffer: Buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    getOffset(): number {
        return this.offset;
    }

    setOffset(value: number) {
        if (value < 0 || value > this.buffer.length) {
            throw new Error("Offset out of bounds");
        }
        this.offset = value;
    }

    shiftOffset(value: number) {
        if (this.offset + value < 0 || this.offset + value > this.buffer.length) {
            throw new Error("Offset out of bounds");
        }
        this.offset += value;
    }

    readVarInt(inp: { bigEndian?: boolean } = {}): number {
        let bytes: number[] = [];
        let numRead = 0;
        let byte: number;

        do {
            if (this.offset >= this.buffer.length) {
                throw new Error("Buffer overrun while reading VarInt");
            }

            byte = this.buffer[this.offset++];
            bytes.push(byte);

            numRead++;
            if (numRead > 5) {
                throw new Error("VarInt exceeds 5 bytes");
            }
        } while ((byte & 0x80) !== 0);

        let result = 0;
        if (inp.bigEndian) {
            const totalBytes = bytes.length;
            for (let i = 0; i < bytes.length; i++) {
                byte = bytes[i];
                result |= (byte & 0x7F) << (7 * (totalBytes - i - 1));
            }
        } else {
            for (let i = 0; i < bytes.length; i++) {
                byte = bytes[i];
                result |= (byte & 0x7F) << (7 * i);
            }
        }
        return result;
    }

    readSignedVarInt(inp: { bigEndian?: boolean } = {}): number {
        const raw = this.readVarInt(inp);
        const temp = (raw >>> 1) ^ -(raw & 1);
        return temp;
    }

    readVarLong(inp: { bigEndian?: boolean } = {}): bigint {
        let bytes: number[] = [];
        let numRead = 0;
        let byte: number;
        const initialOffset = this.offset;

        do {
            if (this.offset >= this.buffer.length) {
                this.offset = initialOffset;
                throw new Error("Buffer overrun while reading VarLong");
            }

            byte = this.buffer[this.offset++];
            bytes.push(byte);

            numRead++;
            if (numRead > 10) {
                this.offset = initialOffset;
                throw new Error("VarLong exceeds 10 bytes");
            }
        } while ((byte & 0x80) !== 0);

        let result = BigInt(0);
        if (inp.bigEndian) {
            const totalBytes = bytes.length;
            for (let i = 0; i < bytes.length; i++) {
                byte = bytes[i];
                result |= BigInt(byte & 0x7F) << BigInt(7 * (totalBytes - i - 1));
            }
        } else {
            for (let i = 0; i < bytes.length; i++) {
                byte = bytes[i];
                result |= BigInt(byte & 0x7F) << BigInt(7 * i);
            }
        }

        return result;
    }

    readSignedVarLong(inp: { bigEndian?: boolean } = {}): bigint {
        const raw = this.readVarLong(inp);
        const temp = (raw >> BigInt(1)) ^ -(raw & BigInt(1));
        return temp;
    }

    readString(inp: { bigEndian?: boolean } = {}): string {
        const length = this.readVarInt(inp);

        if (this.offset + length > this.buffer.length) {
            throw new Error("Buffer overrun while reading string");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + length);
        this.offset += length;
        return new TextDecoder().decode(bytes);
    }

    readByte(): number {
        if (this.offset >= this.buffer.length) {
            throw new Error("Buffer overrun while reading byte");
        }

        return this.buffer[this.offset++];
    }

    readBoolean(): boolean {
        return this.readByte() !== 0;
    }

    readShort(inp: { bigEndian?: boolean } = {}): number {
        if (this.offset + 2 > this.buffer.length) {
            throw new Error("Buffer overrun while reading short");
        }

        let value: number;
        if (inp.bigEndian) {
            value = (this.buffer[this.offset] << 8) | this.buffer[this.offset + 1];
        } else {
            value = this.buffer[this.offset] | (this.buffer[this.offset + 1] << 8);
        }
        this.offset += 2;

        return value > 0x7FFF ? value - 0x10000 : value;
    }

    readUnsignedShort(inp: { bigEndian?: boolean } = {}): number {
        if (this.offset + 2 > this.buffer.length) {
            throw new Error("Buffer overrun while reading unsigned short");
        }

        let value: number;
        if (inp.bigEndian) {
            value = (this.buffer[this.offset] << 8) | this.buffer[this.offset + 1];
        } else {
            value = this.buffer[this.offset] | (this.buffer[this.offset + 1] << 8);
        }
        this.offset += 2;

        return value;
    }

    readInt(inp: { bigEndian?: boolean } = {}): number {
        if (this.offset + 4 > this.buffer.length) {
            throw new Error("Buffer overrun while reading int");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + 4);

        let result = 0;
        if (inp.bigEndian) {
            for (let i = 0; i < 4; i++) {
                result = (result << 8) | bytes[i]
            }
        } else {
            for (let i = 3; i >= 0; i--) {
                result = (result << 8) | bytes[i]
            }
        }

        if (result > 0x7FFFFFFF) {
            result -= 0x100000000;
        }

        this.offset += 4;
        return result;
    }

    readUnsignedInt(inp: { bigEndian?: boolean } = {}): number {
        if (this.offset + 4 > this.buffer.length) {
            throw new Error("Buffer overrun while reading unsigned int");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + 4);

        let result = 0;
        if (inp.bigEndian) {
            for (let i = 0; i < 4; i++) {
                result = (result << 8) | bytes[i]
            }
        } else {
            for (let i = 3; i >= 0; i--) {
                result = (result << 8) | bytes[i]
            }
        }

        this.offset += 4;
        return result;
    }

    readLong(inp: { bigEndian?: boolean } = {}): bigint {
        if (this.offset + 8 > this.buffer.length) {
            throw new Error("Buffer overrun while reading long");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + 8);

        let result = BigInt(0);
        if (inp.bigEndian) {
            for (let i = 0; i < 8; i++) {
                result = (result << BigInt(8)) | BigInt(bytes[i]);
            }
        } else {
            for (let i = 7; i >= 0; i--) {
                result = (result << BigInt(8)) | BigInt(bytes[i]);
            }
        }

        if (result > BigInt("0x7FFFFFFFFFFFFFFF")) {
            result -= BigInt("0x10000000000000000");
        }

        this.offset += 8;
        return result;
    }

    readUnsignedLong(inp: { bigEndian?: boolean } = {}): bigint {
        if (this.offset + 8 > this.buffer.length) {
            throw new Error("Buffer overrun while reading unsigned long");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + 8);

        let result = BigInt(0);
        if (inp.bigEndian) {
            for (let i = 0; i < 8; i++) {
                result = (result << BigInt(8)) | BigInt(bytes[i]);
            }
        } else {
            for (let i = 7; i >= 0; i--) {
                result = (result << BigInt(8)) | BigInt(bytes[i]);
            }
        }

        this.offset += 8;
        return result;
    }

    readFloat(inp: { bigEndian?: boolean } = {}): number {
        if (this.offset + 4 > this.buffer.length) {
            throw new Error("Buffer overrun while reading float");
        }

        const value = new DataView(
            this.buffer.buffer,
            this.buffer.byteOffset + this.offset,
            4
        ).getFloat32(0, inp.bigEndian ? false : true);

        this.offset += 4;
        return value;
    }

    readDouble(inp: { bigEndian?: boolean } = {}): number {
        if (this.offset + 8 > this.buffer.length) {
            throw new Error("Buffer overrun while reading double");
        }

        const value = new DataView(
            this.buffer.buffer,
            this.buffer.byteOffset + this.offset,
            8
        ).getFloat64(0, inp.bigEndian ? false : true);

        this.offset += 8;
        return value;
    }

    readVec2(inp: { bigEndian?: boolean } = {}): { x: number; y: number } {
        const x = this.readFloat(inp);
        const y = this.readFloat(inp);
        return { x, y };
    }

    readVec3(inp: { bigEndian?: boolean } = {}): { x: number; y: number; z: number } {
        const x = this.readFloat(inp);
        const y = this.readFloat(inp);
        const z = this.readFloat(inp);
        return { x, y, z };
    }

    readByteArray(inp: { bigEndian?: boolean } = {}): Buffer {
        const length = this.readVarInt(inp);

        if (this.offset + length > this.buffer.length) {
            throw new Error("Buffer overrun while reading byte array");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    readBlockCoordinates(inp: { bigEndian?: boolean } = {}): { x: number; y: number; z: number } {
        const x = this.readSignedVarInt(inp);
        const y = this.readVarInt(inp);
        const z = this.readSignedVarInt(inp);
        return { x, y, z };
    }

    readPlayerLocation(): {
        x: number;
        y: number;
        z: number;
        pitch: number;
        headYaw: number;
        yaw: number;
    } {
        const x = this.readFloat();
        const y = this.readFloat();
        const z = this.readFloat();

        const pitchByte = this.readByte();
        const headYawByte = this.readByte();
        const yawByte = this.readByte();

        const pitch = pitchByte / 0.71;
        const headYaw = headYawByte / 0.71;
        const yaw = yawByte / 0.71;

        return { x, y, z, pitch, headYaw, yaw };
    }

    readUUID(inp: { bigEndian?: boolean } = {}): string {
        const mostSigBits = this.readUnsignedLong(inp);
        const leastSigBits = this.readUnsignedLong(inp);

        function toHex(value: bigint, length: number): string {
            return value.toString(16).padStart(length, '0');
        }

        const hexMost = toHex(mostSigBits, 16);
        const hexLeast = toHex(leastSigBits, 16);
        const uuid = hexMost + hexLeast;

        return uuid;
    }

    readPacketHeader(): { packetId: number; senderId: number; recipientId: number } {
        const header = this.readVarInt();
        const packetId = header & 0x3FF;
        const senderId = (header >> 10) & 0x3;
        const recipientId = (header >> 12) & 0x3;

        return { packetId, senderId, recipientId };
    }

    async readNbt(inp: Parameters<Awaited<typeof BufferReader.nbt>['read']>[1] = { endian: 'little', strict: false }) {
        if (this.buffer[this.offset] === 0) {
            this.offset++;
            return null;
        }
        
        const initialOffset = this.offset;
        const nbt = await BufferReader.nbt;

        if (inp.strict === undefined) {
            inp.strict = false;
        }

        if (inp.endian === undefined) {
            inp.endian = 'little';
        }

        try {
            const value = await nbt.read(this.buffer.subarray(this.offset), inp);
            if (value.byteOffset) {
                this.offset += value.byteOffset;
            }

            return value;
        } catch (error) {
            this.offset = initialOffset;
            console.log(this.buffer.subarray(this.offset))
            throw new Error(`Error reading NBT: ${error}`, { cause: error });
        }
    }

    setPositionAfter(sequence: Buffer): boolean {
        const index = this.buffer.indexOf(sequence, this.offset);

        if (index !== -1) {
            this.offset = index + sequence.length;
            return true;
        } else {
            return false;
        }
    }
}
import nbt from 'prismarine-nbt'

export class BufferReader {
    private buffer: Buffer;
    private offset: number;

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

    readVarInt(): number {
        let numRead = 0;
        let result = 0;
        let byte: number;

        do {
            if (this.offset >= this.buffer.length) {
                throw new Error("Buffer overrun while reading VarInt");
            }

            byte = this.buffer[this.offset++];
            result |= (byte & 0x7F) << (7 * numRead);

            numRead++;
            if (numRead > 5) {
                throw new Error("VarInt exceeds 5 bytes");
            }
        } while ((byte & 0x80) !== 0);

        return result;
    }

    readSignedVarInt(): number {
        const raw = this.readVarInt();
        const temp = (raw >>> 1) ^ -(raw & 1);
        return temp;
    }

    readVarLong(): bigint {
        let numRead = 0;
        let result = BigInt(0);
        let byte: number;
        const initialOffset = this.offset;

        do {
            if (this.offset >= this.buffer.length) {
                this.offset = initialOffset;
                throw new Error("Buffer overrun while reading VarLong");
            }

            byte = this.buffer[this.offset++];
            result |= BigInt(byte & 0x7F) << BigInt(7 * numRead);

            numRead++;
            if (numRead > 10) {
                this.offset = initialOffset;
                throw new Error("VarLong exceeds 10 bytes");
            }
        } while ((byte & 0x80) !== 0);

        return result;
    }

    readSignedVarLong(): bigint {
        const raw = this.readVarLong();
        const temp = (raw >> BigInt(1)) ^ -(raw & BigInt(1));
        return temp;
    }

    readString(): string {
        const length = this.readVarInt();

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

    readShort(inp: { bigEndian?: boolean }): number {
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

    readUnsignedShort(inp: { bigEndian?: boolean }): number {
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

    readLong(inp: { bigEndian?: boolean }): bigint {
        if (this.offset + 8 > this.buffer.length) {
            throw new Error("Buffer overrun while reading long");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + 8);
        this.offset += 8;

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

        return result;
    }

    readUnsignedLong(inp: { bigEndian?: boolean } = {}): bigint {
        if (this.offset + 8 > this.buffer.length) {
            throw new Error("Buffer overrun while reading unsigned long");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + 8);
        this.offset += 8;

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

    readByteArray(): Buffer {
        const length = this.readVarInt();

        if (this.offset + length > this.buffer.length) {
            throw new Error("Buffer overrun while reading byte array");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    readBlockCoordinates(): { x: number; y: number; z: number } {
        const x = this.readSignedVarInt();
        const y = this.readVarInt();
        const z = this.readSignedVarInt();
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

    readNbt() {
        const initialOffset = this.offset;

        const type = this.readByte();
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
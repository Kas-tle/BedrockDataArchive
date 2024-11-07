import * as nbt from 'nbtify';
import { logger } from './console.js';
import PacketParserError from './error.js';

export class BufferReader {
    private buffer: Buffer;
    private offset: number;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    getBuffer(): Buffer {
        return this.buffer;
    }

    getOffset(): number {
        return this.offset;
    }

    setOffset(value: number) {
        if (value < 0 || value > this.buffer.length) {
            throw new PacketParserError(this, 'Offset out of bounds while setting offset');
        }
        this.offset = value;
    }

    shiftOffset(value: number) {
        if (this.offset + value < 0 || this.offset + value > this.buffer.length) {
            throw new PacketParserError(this, 'Offset out of bounds while shifting offset');
        }
        this.offset += value;
    }

    getBytesRemaining(): number {
        return this.buffer.length - this.offset;
    }

    readUnsignedVarInt(inp: { bigEndian?: boolean } = {}): number {
        let bytes: number[] = [];
        let numRead = 0;
        let byte: number;

        do {
            if (this.offset >= this.buffer.length) {
                throw new PacketParserError(this, "Buffer overrun while reading VarInt");
            }

            byte = this.buffer[this.offset++];
            bytes.push(byte);

            numRead++;
            if (numRead > 5) {
                throw new PacketParserError(this, "VarInt exceeds 5 bytes");
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

    readVarInt(inp: { bigEndian?: boolean } = {}): number {
        const raw = this.readUnsignedVarInt(inp);
        const temp = (raw >>> 1) ^ -(raw & 1);
        return temp;
    }

    readUnsignedVarInt64(inp: { bigEndian?: boolean } = {}): bigint {
        let bytes: number[] = [];
        let numRead = 0;
        let byte: number;
        const initialOffset = this.offset;

        do {
            if (this.offset >= this.buffer.length) {
                this.offset = initialOffset;
                throw new PacketParserError(this, "Buffer overrun while reading VarLong");
            }

            byte = this.buffer[this.offset++];
            bytes.push(byte);

            numRead++;
            if (numRead > 10) {
                this.offset = initialOffset;
                throw new PacketParserError(this, "VarLong exceeds 10 bytes");
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

    readVarInt64(inp: { bigEndian?: boolean } = {}): bigint {
        const raw = this.readUnsignedVarInt64(inp);
        const temp = (raw >> BigInt(1)) ^ -(raw & BigInt(1));
        return temp;
    }

    readString(inp: { bigEndian?: boolean } = {}): string {
        const length = this.readUnsignedVarInt(inp);

        if (this.offset + length > this.buffer.length) {
            throw new PacketParserError(this, "Buffer overrun while reading string");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + length);
        this.offset += length;
        return length > 0 ? new TextDecoder().decode(bytes) : '';
    }

    readByte(): number {
        if (this.offset >= this.buffer.length) {
            throw new PacketParserError(this, "Buffer overrun while reading byte");
        }

        return this.buffer[this.offset++];
    }

    readBoolean(): boolean {
        return this.readByte() !== 0;
    }

    readShort(inp: { bigEndian?: boolean } = {}): number {
        if (this.offset + 2 > this.buffer.length) {
            throw new PacketParserError(this, "Buffer overrun while reading short");
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
            throw new PacketParserError(this, "Buffer overrun while reading unsigned short");
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
            throw new PacketParserError(this, "Buffer overrun while reading int");
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
            throw new PacketParserError(this, "Buffer overrun while reading unsigned int");
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

    readInt64(inp: { bigEndian?: boolean } = {}): bigint {
        if (this.offset + 8 > this.buffer.length) {
            throw new PacketParserError(this, "Buffer overrun while reading long");
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

    readUnsignedInt64(inp: { bigEndian?: boolean } = {}): bigint {
        if (this.offset + 8 > this.buffer.length) {
            throw new PacketParserError(this, "Buffer overrun while reading unsigned long");
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
            throw new PacketParserError(this, "Buffer overrun while reading float");
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
            throw new PacketParserError(this, "Buffer overrun while reading double");
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
        const length = this.readUnsignedVarInt(inp);

        if (this.offset + length > this.buffer.length) {
            throw new PacketParserError(this, "Buffer overrun while reading byte array");
        }

        const bytes = this.buffer.subarray(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    readBlockPosition(inp: { bigEndian?: boolean } = {}): { x: number; y: number; z: number } {
        const x = this.readVarInt(inp);
        const y = this.readUnsignedVarInt(inp);
        const z = this.readVarInt(inp);
        return { x, y, z };
    }

    readChunkPosition(inp: { bigEndian?: boolean } = {}): { x: number; z: number } {
        const x = this.readVarInt(inp);
        const z = this.readVarInt(inp);
        return { x, z };
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
        const mostSigBits = this.readUnsignedInt64(inp);
        const leastSigBits = this.readUnsignedInt64(inp);

        function toHex(value: bigint, length: number): string {
            return value.toString(16).padStart(length, '0');
        }

        const hexMost = toHex(mostSigBits, 16);
        const hexLeast = toHex(leastSigBits, 16);
        const uuid = hexMost + hexLeast;

        return uuid;
    }

    readPacketHeader(): { packetId: number; senderId: number; recipientId: number } {
        const header = this.readUnsignedVarInt();
        const packetId = header & 0x3FF;
        const senderId = (header >> 10) & 0x3;
        const recipientId = (header >> 12) & 0x3;

        return { packetId, senderId, recipientId };
    }

    async readNbt(inp: Partial<nbt.ReadOptions & { rootlessCompound: boolean }> = { endian: 'little', strict: false }) {
        if (this.buffer[this.offset] === 0) {
            this.offset++;
            return null;
        }

        const initialOffset = this.offset;

        if (inp.strict === undefined) {
            inp.strict = false;
        }

        if (inp.endian === undefined) {
            inp.endian = 'little';
        }

        let subarray = this.buffer.subarray(this.offset);

        let rootlessOffset = 0;
        if (inp.rootlessCompound) {
            const header = [0x0A, 0x00];
            if (inp.endian !== 'little-varint') header.push(0x00);
            subarray = Buffer.concat([Buffer.from(header), subarray]);
            rootlessOffset = header.length;
        }

        try {
            const value = await nbt.read(subarray, inp);
            if (value.byteOffset) {
                this.offset += value.byteOffset - rootlessOffset;
            }

            return value;
        } catch (error) {
            this.offset = initialOffset;
            throw new PacketParserError(this, `Error reading NBT`, error);
        }
    }

    async readDataItem() {
        const id = this.readUnsignedVarInt();
        const type = this.readUnsignedVarInt();

        let value;
        switch (type) {
            case 0:
                value = this.readByte();
                break;
            case 1:
                value = this.readShort();
                break;
            case 2:
                value = this.readVarInt();
                break;
            case 3:
                value = this.readFloat();
                break;
            case 4:
                value = this.readString();
                break;
            case 5:
                value = await this.readNbt({ endian: 'little-varint' });
                break;
            case 6:
                value = this.readBlockPosition();
                break;
            case 7:
                value = this.readVarInt64();
                break;
            case 8:
                value = this.readVec3();
                break;
            default:
                throw new PacketParserError(this, `Unrecognized data item type: ${type}`);
        }

        return {
            id,
            type,
            value
        };
    }

    readAnimatedImage() {
        const imageWidth = this.readUnsignedInt();
        const imageHeight = this.readUnsignedInt();
        const imageBytes = this.readString();
        const animationType = this.readUnsignedInt();
        const frameCount = this.readFloat();
        const animationExpression = this.readUnsignedInt();

        return {
            imageWidth,
            imageHeight,
            imageBytes,
            animationType,
            frameCount,
            animationExpression
        }
    }

    readPersonaPiece() {
        const pieceId = this.readString();
        const pieceType = this.readString();
        const packId = this.readString();
        const isDefaultPiece = this.readBoolean();
        const productId = this.readString();

        return {
            pieceId,
            pieceType,
            packId,
            isDefaultPiece,
            productId
        };
    }

    readTintColor() {
        const tintType = this.readString();
        const colors = this.readArray(
            this.readUnsignedInt.bind(this),
            this.readString.bind(this)
        );

        return { tintType, colors };
    }

    readSerializedSkin() {
        const skinId = this.readString();
        const playFabId = this.readString();
        const skinResourcePatch = this.readString();
        const skinImageWidth = this.readUnsignedInt();
        const skinImageHeight = this.readUnsignedInt();
        const skinImageImageBytes = this.readString();

        const animations = this.readArray(
            this.readUnsignedInt.bind(this),
            this.readAnimatedImage.bind(this)
        );

        const capeImageWidth = this.readUnsignedInt();
        const capeImageHeight = this.readUnsignedInt();
        const capeImageBytes = this.readString();
        const geometryData = this.readString();
        const geometryDataEngineVersion = this.readString();
        const animationData = this.readString();
        const capeId = this.readString();
        const fullId = this.readString();
        const armSize = this.readString();
        const skinColor = this.readString();

        const personaPieces = this.readArray(
            this.readUnsignedInt.bind(this),
            this.readPersonaPiece.bind(this)
        );

        const tintColors = this.readArray(
            this.readUnsignedInt.bind(this),
            this.readTintColor.bind(this)
        );

        const isPremiumSkin = this.readBoolean();
        const isPersonaSkin = this.readBoolean();
        const isPersonaCapeOnClassicSkin = this.readBoolean();
        const isPrimaryUser = this.readBoolean();
        const mOverridesPlayerAppearance = this.readBoolean();

        return {
            skinId,
            playFabId,
            skinResourcePatch,
            skinImageWidth,
            skinImageHeight,
            skinImageImageBytes,
            animations,
            capeImageWidth,
            capeImageHeight,
            capeImageBytes,
            geometryData,
            geometryDataEngineVersion,
            animationData,
            capeId,
            fullId,
            armSize,
            skinColor,
            personaPieces,
            tintColors,
            isPremiumSkin,
            isPersonaSkin,
            isPersonaCapeOnClassicSkin,
            isPrimaryUser,
            mOverridesPlayerAppearance
        }
    }

    readResourcePackEntry() {
        const id = this.readString();
        const version = this.readString();
        const size = this.readUnsignedInt64();
        const contentKey = this.readString();
        const subPackName = this.readString();
        const contentIdentity = this.readString();
        const hasScripts = this.readBoolean();
        const isAddonPack = this.readBoolean();
        const isRaytracingCapable = this.readBoolean();
        const downloadUrl = this.readString();

        return {
            id,
            version,
            size,
            contentKey,
            subPackName,
            contentIdentity,
            hasScripts,
            isAddonPack,
            isRaytracingCapable,
            downloadUrl
        }
    }

    readAddPlayerListEntry() {
        const uuid = this.readUUID();
        const actorUniqueId = this.readUnsignedVarInt64();
        const playerName = this.readString();
        const xblXuid = this.readString();
        const platformChatId = this.readString();
        const buildPlatform = this.readInt();
        const serializedSkin = this.readSerializedSkin();
        const isTeacher = this.readBoolean();
        const isHost = this.readBoolean();
        const isSubClient = this.readBoolean();

        return {
            uuid,
            actorUniqueId,
            playerName,
            xblXuid,
            platformChatId,
            buildPlatform,
            serializedSkin,
            isTeacher,
            isHost,
            isSubClient
        }
    }

    readAbilityLayer() {
        const serializedLayer = this.readUnsignedShort();
        const abilitiesSet = this.readUnsignedInt();
        const abilityValues = this.readUnsignedInt();
        const flySpeed = this.readFloat();
        const walkSpeed = this.readFloat();

        return {
            serializedLayer,
            abilitiesSet,
            abilityValues,
            flySpeed,
            walkSpeed
        }
    }

    async readItemComponent() {
        const name = this.readString();
        const nbt = await this.readNbt({ endian: 'little-varint' });

        return {
            name,
            data: nbt ? nbt.data : null
        };
    }

    async readLevelEventData() {
        const nbt = await this.readNbt({ rootlessCompound: true, endian: 'little-varint' })
        return nbt ? nbt.data : null;
    }

    readPlayerListAction() {
        const type = this.readByte();
        let action;
        switch (type) {
            case 0:
                action = this.readArray(
                    this.readUnsignedVarInt.bind(this),
                    this.readAddPlayerListEntry.bind(this)
                );
                const isTrustedSkin = this.readBoolean();
                return { action, isTrustedSkin };
            case 1:
                action = this.readArray(
                    this.readUnsignedVarInt.bind(this),
                    this.readUUID.bind(this)
                );
                return { action };
            default:
                throw new PacketParserError(this, `Unrecognized player list action type: ${type}`);
        }
    }

    readGameRule() {
        const name = this.readString();
        const canBeModifiedByPlayer = this.readBoolean();
        const ruleType = this.readUnsignedVarInt();
        switch (ruleType) {
            case 1:
                return { name, canBeModifiedByPlayer, ruleType, value: this.readBoolean() };
            case 2:
                return { name, canBeModifiedByPlayer, ruleType, value: this.readUnsignedVarInt() };
            case 3:
                return { name, canBeModifiedByPlayer, ruleType, value: this.readFloat() };
            default:
                throw new PacketParserError(this, `Unrecognized game rule type: ${ruleType}`);
        }
    }

    readCameraPreset() {
        const name = this.readString();
        const inhetitFrom = this.readString();
        const posX = this.readOptional(this.readFloat.bind(this));
        const posY = this.readOptional(this.readFloat.bind(this));
        const posZ = this.readOptional(this.readFloat.bind(this));
        const rotX = this.readOptional(this.readFloat.bind(this));
        const rotY = this.readOptional(this.readFloat.bind(this));
        const rotationSpeed = this.readOptional(this.readFloat.bind(this));
        const snapToTarget = this.readOptional(this.readBoolean.bind(this));
        const horizontalRotationLimit = this.readOptional(this.readVec2.bind(this));
        const verticalRotationLimit = this.readOptional(this.readVec2.bind(this));
        const continueTargeting = this.readOptional(this.readBoolean.bind(this));
        const viewOffset = this.readOptional(this.readVec2.bind(this));
        const entityOffset = this.readOptional(this.readVec3.bind(this));
        const radius = this.readOptional(this.readFloat.bind(this));
        const audioListener = this.readOptional(this.readByte.bind(this));
        const playerEffects = this.readOptional(this.readBoolean.bind(this));
        const alignTargetAndCameraForward = this.readOptional(this.readBoolean.bind(this));
        const dummyByte = this.readOptional(this.readByte.bind(this));

        return {
            name,
            inhetitFrom,
            posX,
            posY,
            posZ,
            rotX,
            rotY,
            rotationSpeed,
            snapToTarget,
            horizontalRotationLimit,
            verticalRotationLimit,
            continueTargeting,
            viewOffset,
            entityOffset,
            radius,
            audioListener,
            playerEffects,
            alignTargetAndCameraForward,
            dummyByte
        }
    }

    readAttributeModifier() {
        const id = this.readString();
        const name = this.readString();
        const amount = this.readFloat();
        const operation = this.readInt();
        const operand = this.readInt();
        const isSerializeable = this.readBoolean();

        return {
            id,
            name,
            amount,
            operation,
            operand,
            isSerializeable
        };
    }

    readAttribute() {
        const minValue = this.readFloat();
        const maxValue = this.readFloat();
        const currentValue = this.readFloat();
        const defaultMinValue = this.readFloat();
        const defaultMaxValue = this.readFloat();
        const defaultValue = this.readFloat();
        const attributeName = this.readString();
        const attributeModifiers = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readAttributeModifier.bind(this)
        );

        return {
            minValue,
            maxValue,
            currentValue,
            defaultMinValue,
            defaultMaxValue,
            defaultValue,
            attributeName,
            attributeModifiers
        }
    }

    async readUserDataBuffer(buffer: Buffer) {
        if (buffer.length === 0) return undefined;
        const reader = new BufferReader(buffer);

        const data: {
            serializationMarker?: number;
            serializationVersion?: number;
            compoundTag?: nbt.CompoundTag;
            canPlaceOnBlocks?: { size: number; elements: string[] };
            canDestroyBlocks?: { size: number; elements: string[] };
        } = {};

        try {
            data.serializationMarker = reader.readShort();
            data.serializationVersion = reader.readByte();
            const tag = await reader.readNbt();
            data.compoundTag = tag ? tag.data as nbt.CompoundTag : undefined;
            data.canPlaceOnBlocks = reader.readArray(
                reader.readUnsignedInt.bind(reader),
                reader.readString.bind(reader)
            ) as { size: number; elements: string[] };
            data.canDestroyBlocks = reader.readArray(
                reader.readUnsignedInt.bind(reader),
                reader.readString.bind(reader)
            ) as { size: number; elements: string[] };
        } catch {
            // The bedrock client simply stops reading when this happens...
        } finally {
            return data;
        }
    };

    async readItemStack() {
        const id = this.readUnsignedVarInt();

        if (id === 0) return { id };

        const stackSize = this.readUnsignedShort();
        const auxValue = this.readUnsignedVarInt();
        const blockHash = this.readVarInt();
        const userDataArray = this.readByteArray();
        const userData = await this.readUserDataBuffer(userDataArray);

        return {
            id,
            stackSize,
            auxValue,
            blockHash,
            userData
        };
    }

    async readCreativeItemWriteEntry() {
        const creativeNetId = this.readUnsignedVarInt();
        const itemInstance = await this.readItemStack();

        return {
            creativeNetId,
            itemInstance
        };
    }

    readTrimPattern() {
        const itemName = this.readString();
        const patternId = this.readString();

        return {
            itemName,
            patternId
        };
    }

    readTrimMaterial() {
        const materialId = this.readString();
        const color = this.readString();
        const itemName = this.readString();

        return {
            materialId,
            color,
            itemName
        };
    }

    readFullContainerName() {
        const containerName = this.readByte();
        const dynamicContainerId = this.readOptional(this.readUnsignedInt.bind(this));

        return {
            containerName,
            dynamicContainerId
        };
    }

    readRecipeIngredientType() {
        const type = this.readByte();
        switch (type) {
            case 0: // Invalid
                return { type };
            case 1: // Int ID
                const networkId = this.readShort();
                if (networkId === 0) {
                    return { type, networkId };
                } else {
                    return { type, networkId, auxValue: this.readShort() };
                }
            case 2: // Molang
                const expression = this.readString();
                const version = this.readByte();
                return { type, expression, version };
            case 3: // Tag
                const tag = this.readString();
                return { type, tag };
            case 4: // String ID Meta
                const name = this.readString();
                const auxValue = this.readShort();
                return { type, name, auxValue };
            case 5: // Complex Alias
                const alias = this.readString();
                return { type, alias };
            default:
                throw new PacketParserError(this, `Unrecognized recipe ingredient type: ${type}`);
        }
    }

    readRecipeIngredient() {
        const internalType = this.readRecipeIngredientType();
        const stackSize = this.readVarInt();

        return {
            internalType,
            stackSize
        }
    }

    readUnlockingRequirement() {
        const unlockingContext = this.readByte();
        switch (unlockingContext) {
            case 0:
                const unlockingIngredients = this.readArray(
                    this.readUnsignedVarInt.bind(this),
                    this.readRecipeIngredient.bind(this)
                );
                return { unlockingContext, unlockingIngredients };
            case 1:
            case 2:
            case 3:
                return { unlockingContext };
            default:
                logger.critical(`Unrecognized unlocking context: ${unlockingContext}`);
        }
    }

    async readShapelessRecipe() {
        const recipeUniqueId = this.readString();
        const ingredientList = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readRecipeIngredient.bind(this)
        );
        const productionList = await this.readArrayAsync(
            this.readUnsignedVarInt.bind(this),
            this.readItemStack.bind(this)
        );
        const recipeId = this.readUUID();
        const recipeTag = this.readString();
        const priority = this.readVarInt();
        const unlockingRequirement = this.readUnlockingRequirement();

        return {
            recipeUniqueId,
            ingredientList,
            productionList,
            recipeId,
            recipeTag,
            priority,
            unlockingRequirement
        }
    }

    async shapedRecipe() {
        const recipeUniqueId = this.readString();
        const recipeWidth = this.readVarInt();
        const recipeHeight = this.readVarInt();
        const ingredientGrid = this.readArray(
            () => recipeWidth,
            () => this.readArray(
                () => recipeHeight,
                this.readRecipeIngredient.bind(this)
            )
        );
        const productionList = await this.readArrayAsync(
            this.readUnsignedVarInt.bind(this),
            this.readItemStack.bind(this)
        );
        const recipeId = this.readUUID();
        const recipeTag = this.readString();
        const priority = this.readVarInt();
        const assumeSymmetry = this.readBoolean();
        const unlockingRequirement = this.readUnlockingRequirement();

        return {
            recipeUniqueId,
            recipeWidth,
            recipeHeight,
            ingredientGrid,
            productionList,
            recipeId,
            recipeTag,
            priority,
            assumeSymmetry,
            unlockingRequirement
        }
    }

    async readShulkerBoxRecipe() {
        const recipeUniqueId = this.readString();
        const ingredientList = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readRecipeIngredient.bind(this)
        );
        const productionList = await this.readArrayAsync(
            this.readUnsignedVarInt.bind(this),
            this.readItemStack.bind(this)
        );
        const recipeId = this.readUUID();
        const recipeTag = this.readString();
        const priority = this.readVarInt();
        const unlockingRequirement = this.readUnlockingRequirement();

        return {
            recipeUniqueId,
            ingredientList,
            productionList,
            recipeId,
            recipeTag,
            priority,
            unlockingRequirement
        }
    }

    async readShapelessChemistryRecipe() {
        const recipeUniqueId = this.readString();
        const ingredientList = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readRecipeIngredient.bind(this)
        );
        const results = await this.readArrayAsync(
            this.readUnsignedVarInt.bind(this),
            this.readItemStack.bind(this)
        );
        const recipeId = this.readUUID();
        const recipeTag = this.readString();
        const priority = this.readVarInt();

        return {
            recipeUniqueId,
            ingredientList,
            results,
            recipeId,
            recipeTag,
            priority
        }
    }

    async shapedChemistryRecipe() {
        const recipeId = this.readString();
        const recipeWidth = this.readVarInt();
        const recipeHeight = this.readVarInt();
        const ingredient = this.readRecipeIngredient();
        const resultItems = await this.readArrayAsync(
            this.readUnsignedVarInt.bind(this),
            this.readItemStack.bind(this)
        );
        const id = this.readUUID();
        const tag = this.readString();
        const priority = this.readVarInt();
        const assumeSymmetry = this.readBoolean();

        return {
            recipeId,
            recipeWidth,
            recipeHeight,
            ingredient,
            resultItems,
            id,
            tag,
            priority,
            assumeSymmetry
        }
    }

    async readSmithingTransformRecipe() {
        const recipeId = this.readString();
        const templateIngredient = this.readRecipeIngredient();
        const baseIngredient = this.readRecipeIngredient();
        const additionIngredient = this.readRecipeIngredient();
        const result = await this.readItemStack();
        const tag = this.readString();

        return {
            recipeId,
            templateIngredient,
            baseIngredient,
            additionIngredient,
            result,
            tag
        }
    }

    smithingTrimRecipe() {
        const recipeId = this.readString();
        const templateIngredient = this.readRecipeIngredient();
        const baseIngredient = this.readRecipeIngredient();
        const additionIngredient = this.readRecipeIngredient();
        const tag = this.readString();

        return {
            recipeId,
            templateIngredient,
            baseIngredient,
            additionIngredient,
            tag
        }
    }

    async readCraftingDataEntry() {
        const craftingType = this.readVarInt();

        let netId: number;
        let itemData: number;
        let resultItem: Awaited<ReturnType<BufferReader['readItemStack']>>;
        let recipeTag: string;
        switch (craftingType) {
            case 0:
                const shapelessRecipe = await this.readShapelessRecipe();
                netId = this.readUnsignedVarInt();
                return { craftingType, shapelessRecipe, netId };
            case 1:
                const shapedRecipe = await this.shapedRecipe();
                netId = this.readUnsignedVarInt();
                return { craftingType, shapedRecipe, netId };
            case 2:
                itemData = this.readVarInt();
                resultItem = await this.readItemStack();
                recipeTag = this.readString();
                return { craftingType, itemData, resultItem, recipeTag };
            case 3:
                itemData = this.readVarInt();
                const auxiliaryItemData = this.readVarInt();
                resultItem = await this.readItemStack();
                recipeTag = this.readString();
                return { craftingType, itemData, auxiliaryItemData, resultItem, recipeTag };
            case 4:
                const multiRecipe = this.readUUID();
                netId = this.readUnsignedVarInt();
                return { craftingType, multiRecipe, netId };
            case 5:
                const shulkerBoxRecipe = await this.readShulkerBoxRecipe();
                netId = this.readUnsignedVarInt();
                return { craftingType, shulkerBoxRecipe, netId };
            case 6:
                const shapelessChemistryRecipe = await this.readShapelessChemistryRecipe();
                netId = this.readUnsignedVarInt();
                return { craftingType, shapelessChemistryRecipe, netId };
            case 7:
                const shapedChemistryRecipe = await this.shapedChemistryRecipe();
                netId = this.readUnsignedVarInt();
                return { craftingType, shapedChemistryRecipe, netId };
            case 8:
                const smithingTransformRecipe = await this.readSmithingTransformRecipe();
                netId = this.readUnsignedVarInt();
                return { craftingType, smithingTransformRecipe, netId };
            case 9:
                const smithingTrimRecipe = this.smithingTrimRecipe();
                netId = this.readUnsignedVarInt();
                return { craftingType, smithingTrimRecipe, netId };
            default:
                throw new PacketParserError(this, `Unrecognized crafting type: ${craftingType}`);
        }
    }

    readPotionMixDataEntry() {
        const fromPotionId = this.readVarInt();
        const fromItemAux = this.readVarInt();
        const reagentItemId = this.readVarInt();
        const reagentItemAux = this.readVarInt();
        const toPotionId = this.readVarInt();
        const toItemAux = this.readVarInt();

        return {
            fromPotionId,
            fromItemAux,
            reagentItemId,
            reagentItemAux,
            toPotionId,
            toItemAux
        }
    }

    readContainerMixDataEntry() {
        const fromItemId = this.readVarInt();
        const reagentItemId = this.readVarInt();
        const toItemId = this.readVarInt();

        return {
            fromItemId,
            reagentItemId,
            toItemId
        }
    }

    readItemIdAndCount() {
        const itemId = this.readVarInt();
        const itemCount = this.readVarInt();

        return {
            itemId,
            itemCount
        }
    }

    readMaterialReducerDataEntry() {
        const input = this.readVarInt();
        const itemIdsAndCounts = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readItemIdAndCount.bind(this)
        );

        return {
            input,
            itemIdsAndCounts
        }
    }

    readCommandEnumDataElementValue(size: number) {
        if (size <= 256) {
            return { value: this.readByte() }
        } else if (size <= 65536) {
            return { value: this.readUnsignedShort() }
        } else {
            return { value: this.readUnsignedInt() }
        }
    }

    readCommandEnumDataElement(size: number) {
        const name = this.readString();
        const value = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readCommandEnumDataElementValue.bind(this),
            [],
            [size]
        );

        return {
            name,
            value
        }
    }

    readChainedSubCommandElementValue() {
        const index = this.readUnsignedShort();
        const value = this.readUnsignedShort();

        return {
            index,
            value
        }
    }

    readChainedSubCommandElement() {
        const name = this.readString();
        const values = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readChainedSubCommandElementValue.bind(this)
        )

        return {
            name,
            values
        }
    }

    readCommandElementOverloadParameterData() {
        const name = this.readString();
        const parseSymbol = this.readUnsignedInt();
        const isOptional = this.readBoolean();
        const options = this.readByte();

        return {
            name,
            parseSymbol,
            isOptional,
            options
        }
    }

    readCommandElementOverload() {
        const isChaining = this.readBoolean();
        const parameterData = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readCommandElementOverloadParameterData.bind(this)
        );

        return {
            isChaining,
            parameterData
        }
    }

    readCommandElement() {
        const name = this.readString();
        const description = this.readString();
        const flags = this.readUnsignedShort();
        const permissionLevel = this.readByte();
        const aliasEnum = this.readInt();
        const chainedSubCommandIndexes = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readUnsignedShort.bind(this)
        );

        const overloads = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readCommandElementOverload.bind(this)
        );

        return {
            name,
            description,
            flags,
            permissionLevel,
            aliasEnum,
            chainedSubCommandIndexes,
            overloads
        }
    }

    readSoftEnumElement() {
        const enumName = this.readString();
        const enumOptions = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readString.bind(this)
        );

        return {
            enumName,
            enumOptions
        }
    }

    readConstraintElement() {
        const enumValueSymbol = this.readUnsignedInt();
        const enumSymbol = this.readUnsignedInt();
        const contraintIndicies = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readByte.bind(this)
        );

        return {
            enumValueSymbol,
            enumSymbol,
            contraintIndicies
        }
    }

    readIntProperty() {
        const propertyIndex = this.readUnsignedVarInt();
        const data = this.readVarInt();

        return {
            propertyIndex,
            data
        }
    }

    readFloatProperty() {
        const propertyIndex = this.readUnsignedVarInt();
        const data = this.readFloat();

        return {
            propertyIndex,
            data
        }
    }

    readPropertySyncData() {
        const intEntriesList = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readIntProperty.bind(this)
        );
        const floatEntriesList = this.readArray(
            this.readUnsignedVarInt.bind(this),
            this.readFloatProperty.bind(this)
        );

        return {
            intEntriesList,
            floatEntriesList
        }
    }

    readBlockChangedElement() {
        const pos = this.readBlockPosition();
        const blockHash = this.readUnsignedVarInt();
        const updateFlags = this.readUnsignedVarInt();
        const entityUniqueId = this.readUnsignedVarInt64();
        const message = this.readUnsignedVarInt();

        return {
            pos,
            blockHash,
            updateFlags,
            entityUniqueId,
            message
        }
    }

    readAttributesListElement() {
        const attributeName = this.readString();
        const minValue = this.readFloat();
        const currentValue = this.readFloat();
        const maxValue = this.readFloat();

        return {
            attributeName,
            minValue,
            currentValue,
            maxValue
        }
    }

    readActorLink() {
        const actorUniqueIdA = this.readUnsignedVarInt64();
        const actorUniqueIdB = this.readUnsignedVarInt64();
        const linkType = this.readByte();
        const immediate = this.readBoolean();
        const passengerInitiated = this.readBoolean();
        const vehicleAngularVelocity = this.readFloat();

        return {
            actorUniqueIdA,
            actorUniqueIdB,
            linkType,
            immediate,
            passengerInitiated,
            vehicleAngularVelocity
        }
    }

    readMoveActorDelta() {
        const actorRuntimeId = this.readUnsignedVarInt64();
        const header = this.readUnsignedShort();
        const headerBits = [...Array(16)].map((_x, i) => (header >> i) & 1);

        let newPositionX;
        let newPositionY;
        let newPositionZ;
        let rotationX;
        let rotationY;
        let rotationYHead;
        let onGround;
        let teleport;
        let forceToMove;

        if (headerBits[0]) {
            newPositionX = this.readFloat();
        }
        if (headerBits[1]) {
            newPositionY = this.readFloat();
        }
        if (headerBits[2]) {
            newPositionZ = this.readFloat();
        }
        if (headerBits[3]) {
            rotationX = this.readByte();
        }
        if (headerBits[4]) {
            rotationY = this.readByte();
        }
        if (headerBits[5]) {
            rotationYHead = this.readByte();
        }

        return {
            actorRuntimeId,
            header,
            newPositionX,
            newPositionY,
            newPositionZ,
            rotationX,
            rotationY,
            rotationYHead
        }
    }

    readSerializedChunkSectionV1() {
        const header = this.readByte();
        const bitArrayVersion = header >> 1;
        const isRuntime = (header & 1) !== 0;

        if (bitArrayVersion === 0x7F) return;
    }

    readSerializedChunkDataSection() {
        const version = this.readByte();
        let storages = 1;

        switch (version) {
            case 8:
                storages = this.readVarInt();
            case 1:
                for (let i = 0; i < storages; i++) {
                    this.readSerializedChunkSectionV1();
                }
        }
    }
    async readSerializedChunkData() {}

    readOptional<T, A extends any[]>(reader: (...args: A) => T, ...args: A): T | null {
        const hasValue = this.readBoolean();
        return hasValue ? reader(...args) : null;
    }

    readArray<
        T,
        S extends number | bigint,
        SA extends any[],
        EA extends any[]
    >(
        sizeReader: (...sa: SA) => S,
        elementReader: (...ea: EA) => T,
        sizeReaderArgs: SA = [] as any,
        elementReaderArgs: EA = [] as any
    ): { size: S; elements: T[] } {
        const size = sizeReader(...sizeReaderArgs);
        const elements: T[] = [];

        for (let i = 0; i < Number(size); i++) {
            elements.push(elementReader(...elementReaderArgs));
        }

        return { size, elements };
    }

    async readArrayAsync<
        T,
        S extends number | bigint,
        SA extends any[],
        EA extends any[]
    >(
        sizeReader: (...sa: SA) => S,
        elementReader: (...ea: EA) => Promise<T>,
        sizeReaderArgs: SA = [] as any,
        elementReaderArgs: EA = [] as any
    ): Promise<{ size: S; elements: T[] }> {
        const size = sizeReader(...sizeReaderArgs);
        const elements: T[] = [];

        for (let i = 0; i < Number(size); i++) {
            elements.push(await elementReader(...elementReaderArgs));
        }

        return { size, elements };
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
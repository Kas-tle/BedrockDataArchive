import { cleanServer, runServer } from './data.js';
import fs from 'fs';
import DirectoryManager from '../util/directory.js';
import { Version } from './bedrock.js';
import { MessageType, statusMessage } from '../util/console.js';
import * as nbt from 'nbtify';
import { BufferReader } from '../util/buffer.js';
import { bedrock } from '../util/protocol.cjs';
import AdmZip from 'adm-zip';
import PacketParserError from '../util/error.js';

interface PacketReportEntry {
    packetId: number;
    name: string;
    fileName: string;
    parsingTried: boolean;
    parsingPassed: boolean;
    parsingError?: Error;
    fields?: Record<string, any>;
}

interface PacketReport {
    [key: string]: PacketReportEntry;
}

interface ItemData {
    name: string;
    id: number;
    isComponentBased: boolean;
}

interface CreativeContentData extends nbt.CompoundTag {
    creativeNetId: bigint;
    itemInstance: {
        id: nbt.IntTag;
        stackSize?: nbt.ShortTag;
        auxValue?: nbt.IntTag;
        blockHash?: nbt.IntTag;
        userData?: {
            serializationMarker?: nbt.ShortTag;
            serializationVersion?: nbt.ByteTag;
            compoundTag?: nbt.CompoundTag;
            canPlaceOnBlocks?: string[];
            canDestroyBlocks?: string[];
        }
    }
}

export async function captureClientData(inp: { version: Version }) {
    const server = await runServer();

    await new Promise(resolve => setTimeout(resolve, 5000));

    const ping = await bedrock.ping({
        host: 'localhost',
        port: 19132
    });

    const client = bedrock.createClient({
        host: 'localhost',
        port: 19132,
        username: 'Client',
        offline: true,
        delayedInit: false,
        protocolVersion: ping.protocol
    } as any);

    const zip = new AdmZip();
    const report = {} as PacketReport;
    const receivedIds = new Set<number>();
    let sequence = 0;

    client.on('packet', async (packet) => {
        const buffer = packet.fullBuffer as Buffer;

        const reader = new BufferReader(buffer);
        const { packetId } = reader.readPacketHeader();

        const name = packet.data ? packet.data.name : 'unknown';
        const fileName = `${String(sequence++).padStart(4, '0')}-${String(packetId).padStart(3, '0')}-0x${String(packetId.toString(16)).padStart(3, '0')}-${name}.hex`;
        zip.addFile(fileName, buffer);

        if (!receivedIds.has(packetId)) {
            receivedIds.add(packetId);
        } else {
            return;
        };

        switch (packetId) { // In order of reception
            case 0x8F: // Network Settings
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.compressionThreshold = reader.readUnsignedShort();
                    fields.compressionAlgorithm = reader.readUnsignedShort();
                    fields.clientThrottleEnabled = reader.readBoolean();
                    fields.clientThrottleThreshold = reader.readByte();
                    fields.clientThrottleScalar = reader.readFloat();
                }, name, fileName);
                break;

            case 0x03: // Server to Client Handshake
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.handshakeWebToken = reader.readString();
                }, name, fileName);
                break;

            case 0x02: // Play Status
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.status = reader.readInt({ bigEndian: true });
                }, name, fileName);
                break;

            case 0x06: // Resource Packs Info
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.resourcePackRequired = reader.readBoolean();
                    fields.hasAddonPacks = reader.readBoolean();
                    fields.hasScripts = reader.readBoolean();
                    fields.resourcePacks = reader.readArray(
                        reader.readUnsignedShort.bind(reader),
                        reader.readResourcePackEntry.bind(reader)
                    );
                }, name, fileName);
                break;

            case 0x7C: // Level Event Generic
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    fields.eventId = reader.readUnsignedVarInt();
                    fields.eventData = await reader.readLevelEventData();
                }, name, fileName);
                break;

            case 0x3F: // Player List
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.type = reader.readPlayerListAction();
                }, name, fileName);
                break;

            case 0x0A: // Set Time
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.time = reader.readUnsignedVarInt();
                }, name, fileName);
                break;

            case 0x7B: // Level Sound Event
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.eventId = reader.readUnsignedVarInt();
                    fields.position = reader.readVec3();
                    fields.data = reader.readVarInt();
                    fields.actorIdentifier = reader.readString();
                    fields.isBabyMob = reader.readBoolean();
                    fields.isGlobal = reader.readBoolean();
                }, name, fileName);
                break;

            case 0x0B: // Start Game
                statusMessage(MessageType.Info, 'Logged StartGamePacket');

                // If possible, skip to after level name (Bedrock level)
                const hasBerockLevelString = reader.setPositionAfter(Buffer.from([
                    0x0D, 0x42, 0x65, 0x64, 0x72, 0x6F, 0x63, 0x6B, 0x20, 0x6C, 0x65, 0x76, 0x65, 0x6C,
                    0x0D, 0x42, 0x65, 0x64, 0x72, 0x6F, 0x63, 0x6B, 0x20, 0x6C, 0x65, 0x76, 0x65, 0x6C,
                ]));

                if (hasBerockLevelString) {
                    reader.readString(); // Template Content Identity
                    reader.readBoolean(); // Is Trial?
                    reader.readUnsignedVarInt(); // SyncedPlayerMovementSettings Authority Mode
                    reader.readUnsignedVarInt(); // SyncedPlayerMovementSettings Rewind History Size
                    reader.readBoolean(); // SyncedPlayerMovementSettings Server Authoritative Block Breaking
                    reader.readUnsignedInt64(); // Current Level Time
                    reader.readVarInt(); // Enchantment Seed

                    const blockPropertieslLength = reader.readUnsignedVarInt(); // Block Properties Length
                    for (let i = 0; i < blockPropertieslLength; i++) {
                        const blockName = reader.readString();
                        const blockDefinition = (await reader.readNbt());
                    }

                    const itemsListLength = reader.readUnsignedVarInt(); // Items List Length
                    const items: ItemData[] = [];
                    for (let i = 0; i < itemsListLength; i++) {
                        const name = reader.readString();
                        const id = reader.readShort();
                        const isComponentBased = reader.readBoolean();

                        items.push({ name, id, isComponentBased });
                    }

                    fs.writeFileSync(DirectoryManager.export('items.json'), JSON.stringify(items, null, 4));
                }

                break;

            case 0xA5: // Sync Actor Property
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    fields.compoundTag = await reader.readNbt({ endian: 'little-varint' });
                }, name, fileName);
                break;

            case 0xA2: // Item Component
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    const itemsArray = await reader.readArrayAsync(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readItemComponent.bind(reader)
                    );
                    fields.itemsArray = itemsArray.elements;

                    if (itemsArray.elements.length > 0) {
                        const result = await nbt.write({ items: itemsArray.elements }, { endian: 'little', rootName: '' });
                        fs.writeFileSync(DirectoryManager.export('item_components.nbt'), result);
                    }
                }, name, fileName);
                break;

            case 0x2B: // Set Spawn Position
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.spawnPositionType = reader.readVarInt();
                    fields.blockPosition = reader.readBlockPosition();
                    fields.dimensionType = reader.readVarInt();
                    fields.spawnBlockPosition = reader.readBlockPosition();
                }, name, fileName);
                break;

            case 0x3C: // Set Difficulty
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.difficulty = reader.readUnsignedVarInt();
                }, name, fileName);
                break;

            case 0x3B: // Set Commands Enabled
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.commandsEnabled = reader.readBoolean();
                }, name, fileName);
                break;

            case 0xBC: // Update Adventure Settings
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.noPvM = reader.readBoolean();
                    fields.noMvP = reader.readBoolean();
                    fields.immutableWorld = reader.readBoolean();
                    fields.showNameTags = reader.readBoolean();
                    fields.autoJump = reader.readBoolean();
                }, name, fileName);
                break;

            case 0xBB: // Update Abilities
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.targetPlayerRawId = reader.readInt64();
                    fields.mPlayerPermissions = reader.readByte();
                    fields.mCommandPermissions = reader.readByte();
                    fields.layers = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader), 
                        reader.readAbilityLayer.bind(reader)
                    );
                }, name, fileName);
                break;
            case 0x48: // Game Rules Changed
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.gameRules = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readGameRule.bind(reader)
                    );
                }, name, fileName);
                break;

            case 0x7A: // Biome Definition List
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    const biomeDefinitionData = await reader.readNbt({ endian: 'little-varint' });
                    if (biomeDefinitionData) {
                        fields.biomeDefinitionData = biomeDefinitionData.data;
                        const result = await nbt.write(biomeDefinitionData, { endian: 'little', rootName: '' });
                        fs.writeFileSync(DirectoryManager.export('biome_definitions.nbt'), result);
                    }
                }, name, fileName);
                break;

            case 0x77: // Available Entity Identifiers
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    const actorInfoList = await reader.readNbt({ endian: 'little-varint' });
                    if (actorInfoList) {
                        fields.entityIdentifiers = actorInfoList.data;
                        const result = await nbt.write(actorInfoList, { endian: 'little', rootName: '' });
                        fs.writeFileSync(DirectoryManager.export('entity_identifiers.nbt'), result);
                    }
                }, name, fileName);
                break;

            case 0xA0: //Player Fog
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.fogStack = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readString.bind(reader)
                    );
                }, name, fileName);
                break;

            case 0xC6: // Camera Presets
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.cameraPresets = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readCameraPreset.bind(reader)
                    );
                }, name, fileName);
                break;

            case 0x1D: // Update Attributes
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.targetRuntimeId = reader.readUnsignedVarInt64();
                    fields.attributes = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readAttribute.bind(reader)
                    );
                    fields.ticksSinceSimulationStarted = reader.readUnsignedVarInt64();
                }, name, fileName);
                break;

            case 0x91: // Creative Content
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    const creativeContents = await reader.readArrayAsync(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readCreativeItemWriteEntry.bind(reader)
                    )
                    fields.writeEntries = creativeContents;

                    const result = await nbt.write({ contents: creativeContents.elements }, { endian: 'little', rootName: '' });
                    fs.writeFileSync(DirectoryManager.export('creative_content.nbt'), result);
                }, name, fileName);
                break;

            case 0x12E: // Trim Data
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.trimPatterns = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readTrimPattern.bind(reader)
                    );
                    fields.trimMaterials = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readTrimMaterial.bind(reader)
                    );
                }, name, fileName);
                break;

            case 0x31: // Inventory Content
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    fields.inventoryId = reader.readUnsignedVarInt();
                    fields.slots = await reader.readArrayAsync(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readItemStack.bind(reader)
                    );
                    fields.fullContainerName = reader.readFullContainerName();
                    fields.dynamicContainerSize = reader.readUnsignedVarInt();
                }, name, fileName);
                break;

            case 0x30: // Player Hotbar
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.selectedSlot = reader.readUnsignedVarInt();
                    fields.containerId = reader.readByte();
                    fields.shouldSelectSlot = reader.readBoolean();
                }, name, fileName);
                break;
            
            case 0x34: // Crafting Data
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    fields.craftingEntries = await reader.readArrayAsync(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readCraftingDataEntry.bind(reader)
                    );
                    fields.potionMixes = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readPotionMixDataEntry.bind(reader)
                    );
                    fields.containerMixes = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readContainerMixDataEntry.bind(reader)
                    );
                    fields.materialReducers = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readMaterialReducerDataEntry.bind(reader)
                    );
                    fields.clearRecipes = reader.readBoolean();

                    const result = await nbt.write({ data: fields }, { endian: 'little', rootName: '' });
                    fs.writeFileSync(DirectoryManager.export('crafting_data.nbt'), result);
                }, name, fileName);
                break;
            case 0x4C: // Available Commands
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    const enumValues = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readString.bind(reader)
                    );
                    fields.enumValues = enumValues;
                    fields.chainedSubCommandValues = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readString.bind(reader)
                    );
                    fields.postFixes = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readString.bind(reader)
                    );
                    fields.enumData = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readCommandEnumDataElement.bind(reader),
                        [],
                        [enumValues.size as number]
                    );
                    fields.chainedSubcommandData = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readChainedSubCommandElement.bind(reader)
                    );
                    fields.commands = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readCommandElement.bind(reader)
                    );
                    fields.softEnums = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readSoftEnumElement.bind(reader)
                    );
                    fields.constraints = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readConstraintElement.bind(reader)
                    );

                    fs.writeFileSync(DirectoryManager.export('commands.json'), JSON.stringify(fields, null, 4));
                }, name, fileName);
                break;

            case 0x2D: // Respawn
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.position = reader.readVec3();
                    fields.state = reader.readByte();
                    fields.playerRuntimeId = reader.readUnsignedVarInt64();
                }, name, fileName);
                break;

            case 0x79: // Network Chunk Publisher Update
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.newPositionForView = reader.readBlockPosition();
                    fields.newRadiusForView = reader.readUnsignedVarInt();
                    fields.serverBuiltChunksList = reader.readArray(
                        reader.readInt.bind(reader),
                        reader.readChunkPosition.bind(reader)
                    );
                }, name, fileName);
                break;
            
            case 0x27: // Set Actor Data
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    fields.runtimeId = reader.readUnsignedVarInt64();
                    fields.metadata = await reader.readArrayAsync(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readDataItem.bind(reader)
                    );
                    fields.syncedProperties = reader.readPropertySyncData();
                    fields.tick = reader.readUnsignedVarInt64();
                }, name, fileName);
                break;

            case 0x13A: // Current Structure Feature
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.currentStructureFeature = reader.readString();
                }, name, fileName);
                break;

            case 0x46: // Chunk Radius Update
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.chunkRadius = reader.readVarInt();
                }, name, fileName);
                break;
            
            case 0x3a: // Level Chunk
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.chunkPostion = reader.readChunkPosition();
                    fields.dimensionId = reader.readVarInt();
                    fields.subChunksCount = reader.readUnsignedVarInt();
                    fields.subChunkCountWhenClientRequesting = reader.readUnsignedShort();
                    fields.cacheEnabled = reader.readBoolean();
                    fields.chunkData = reader.readByteArray();
                }, name, fileName);
                break;

            case 0xAC: // Update SubChunk Blocks
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.position = reader.readBlockPosition();
                    fields.blocksChangedStandards = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readBlockChangedElement.bind(reader)
                    );
                    fields.blocksChangedExtras = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readBlockChangedElement.bind(reader)
                    );
                }, name, fileName);
                break;

            case 0x15: // Update Block
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.position = reader.readBlockPosition();
                    fields.blockHash = reader.readUnsignedVarInt();
                    fields.flags = reader.readUnsignedVarInt();
                    fields.layer = reader.readUnsignedVarInt();
                }, name, fileName);
                break;

            case 0x19: // Level Event
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.eventId = reader.readVarInt();
                    fields.position = reader.readVec3();
                    fields.data = reader.readVarInt();
                }, name, fileName);
                break;

            case 0x2A: // Set Health
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.health = reader.readVarInt();
                }, name, fileName);
                break;

            case 0xC7: // Unlocked Recipes
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.packetType = reader.readUnsignedInt();
                    fields.unlockedRecipesList = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readString.bind(reader)
                    );
                }, name, fileName);
                break;

            case 0x0D: // Add Actor
                await parsePacketAsync(packetId, reader, report, async (reader, fields = {}) => {
                    fields.targetActorId = reader.readUnsignedVarInt64();
                    fields.targetRuntimeId = reader.readUnsignedVarInt64();
                    fields.actorType = reader.readString();
                    fields.position = reader.readVec3();
                    fields.velocity = reader.readVec3();
                    fields.rotation = reader.readVec2();
                    fields.yHeadRotation = reader.readFloat();
                    fields.yBodyRotation = reader.readFloat();
                    fields.attributesList = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readAttributesListElement.bind(reader)
                    );
                    fields.actorData = await reader.readArrayAsync(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readDataItem.bind(reader)
                    );
                    fields.syncedProperties = reader.readPropertySyncData();
                    fields.actorLinks = reader.readArray(
                        reader.readUnsignedVarInt.bind(reader),
                        reader.readActorLink.bind(reader)
                    );
                }, name, fileName);
                break;

            case 0x6F: // Move Actor Delta
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.moveData = reader.readMoveActorDelta();
                }, name, fileName);
                break;

            case 0x28: // Set Actor Motion
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.targetRuntimeId = reader.readUnsignedVarInt64();
                    fields.motion = reader.readVec3();
                    fields.serverTick = reader.readUnsignedVarInt64();
                }, name, fileName);
                break;

            case 0x1B: // Actor Event
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.targetRuntimeId = reader.readUnsignedVarInt64();
                    fields.eventId = reader.readByte();
                    fields.data = reader.readVarInt();
                }, name, fileName);
                break;

            case 0x0E: // Remove Actor
                parsePacket(packetId, reader, report, (reader, fields = {}) => {
                    fields.targetActorId = reader.readUnsignedVarInt64();
                }, name, fileName);
                break;
        }
    })

    await new Promise(resolve => setTimeout(resolve, 15000));
    client.disconnect();
    cleanServer(server);

    zip.writeZip(DirectoryManager.export('packets.zip'));

    console.log(report);
}

function parsePacket(
    packetId: number,
    reader: BufferReader,
    report: PacketReport,
    parsingFunction: (reader: BufferReader, entry: PacketReportEntry['fields']) => void,
    name: string,
    fileName: string
): void {
    const entry: PacketReportEntry = {
        packetId,
        name,
        fileName,
        parsingTried: true,
        parsingPassed: false,
        fields: {}
    };

    try {
        parsingFunction(reader, entry.fields);
        if (reader.getBytesRemaining() === 0) {
            entry.parsingPassed = true;
        } else {
            throw new PacketParserError(reader, 'Unexpected data remaining in packet!');
        }
    } catch (error) {
        entry.parsingError = error as Error;
    }

    report[packetId] = entry;
}

async function parsePacketAsync(
    packetId: number,
    reader: BufferReader,
    report: PacketReport,
    parsingFunction: (reader: BufferReader, entry: PacketReportEntry['fields']) => Promise<void>,
    name: string,
    fileName: string
): Promise<void> {
    const entry: PacketReportEntry = {
        packetId,
        name,
        fileName,
        parsingTried: true,
        parsingPassed: false,
        fields: {}
    };

    try {
        await parsingFunction(reader, entry.fields);
        if (reader.getBytesRemaining() === 0) {
            entry.parsingPassed = true;
        } else {
            throw new PacketParserError(reader, 'Unexpected data remaining in packet!');
        }
    } catch (error) {
        entry.parsingError = error as Error;
    }

    report[packetId] = entry;
}
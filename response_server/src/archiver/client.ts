import bedrock from 'bedrock-protocol';
import { cleanServer, runServer } from './data';
import fs from 'fs';
import DirectoryManager from '../util/directory';
import { Version } from './bedrock';
import { MessageType, statusMessage } from '../util/console';
import { NBT } from '../util/nbt';
import { BufferReader } from '../util/buffer';

interface ItemData {
    name: string;
    id: number;
    isComponentBased: boolean;
}

interface CreativeContentData {
    id: number;
    stackSize: number;
    auxValue: number;
    blockHash: number;
    itemUserData?: {
        serializationMarker: number;
        serializationVersion: number;
        compoundTag: string;
        canPlaceOnBlocks?: string[];
        canDestroyBlocks?: string[];
    }
}

const optionsModule = require('bedrock-protocol/src/options');
optionsModule.validateOptions = function (options: { version: string | number; protocolVersion: number; useNativeRaknet: boolean; raknetBackend: string; }) {
    if (!optionsModule.Versions[options.version]) {
        console.warn(`Unsupported version ${options.version}. Bypassing validation.`);
    }

    if (options.protocolVersion < optionsModule.MIN_VERSION) {
        console.warn(`Version ${options.version} is below minimum supported version. Proceeding may cause issues.`);
    }

    if (options.useNativeRaknet === true) options.raknetBackend = 'raknet-native';
    if (options.useNativeRaknet === false) options.raknetBackend = 'jsp-raknet';
};

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
        protocolVersion: ping.protocol
    } as any);


    client.on('packet', async (packet) => {
        const buffer = packet.fullBuffer as Buffer;

        const reader = new BufferReader(buffer);
        const nbt = await NBT.nbtify();
        const { packetId } = reader.readPacketHeader();

        switch (packetId) {
            case 0x0B:
                fs.writeFileSync(DirectoryManager.export('start_game.hex'), buffer)
                statusMessage(MessageType.Info, 'Logged StartGamePacket');

                // If possible, skip to after level name (Bedrock level)
                const hasBerockLevelString = reader.setPositionAfter(Buffer.from([
                    0x0D, 0x42, 0x65, 0x64, 0x72, 0x6F, 0x63, 0x6B, 0x20, 0x6C, 0x65, 0x76, 0x65, 0x6C, 
                    0x0D, 0x42, 0x65, 0x64, 0x72, 0x6F, 0x63, 0x6B, 0x20, 0x6C, 0x65, 0x76, 0x65, 0x6C, 
                ]));

                if (hasBerockLevelString) {
                    reader.readString(); // Template Content Identity
                    reader.readBoolean(); // Is Trial?
                    reader.readVarInt(); // SyncedPlayerMovementSettings Authority Mode
                    reader.readVarInt(); // SyncedPlayerMovementSettings Rewind History Size
                    reader.readBoolean(); // SyncedPlayerMovementSettings Server Authoritative Block Breaking
                    reader.readUnsignedLong(); // Current Level Time
                    reader.readSignedVarInt(); // Enchantment Seed

                    const blockPropertieslLength = reader.readVarInt(); // Block Properties Length
                    for (let i = 0; i < blockPropertieslLength; i++) {
                        const blockName = reader.readString();
                        const blockDefinition = (await reader.readNbt());
                    }

                    const itemsListLength = reader.readVarInt(); // Items List Length
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
            case 0x91:
                fs.writeFileSync(DirectoryManager.export('creative_content.hex'), buffer)
                statusMessage(MessageType.Info, 'Logged CreativeContentPacket');
                
                const writeEntriesSize = reader.readVarInt();
                for (let i = 0; i < writeEntriesSize; i++) {
                    const creativeNetId = reader.readVarInt();
                    const id = reader.readVarInt();

                    if (id === 0) continue; // invalid item

                    const stackSize = reader.readUnsignedShort();
                    const auxValue = reader.readVarInt();
                    const blockHash = reader.readSignedVarInt();

                    const creativeContent: CreativeContentData = { id, stackSize, auxValue, blockHash };

                    const userDataBuffer = reader.readByteArray();
                    if (userDataBuffer.length > 0) {
                        try {
                            const userReader = new BufferReader(userDataBuffer);
                        
                            const serializationMarker = userReader.readShort();
                            const serializationVersion = userReader.readByte();
                            const tags = await userReader.readNbt();
                            
                            const canPlaceOnBlocksLength = userReader.readUnsignedInt();
                            const canPlaceOnBlocks: string[] = [];
                            for (let i = 0; i < canPlaceOnBlocksLength; i++) {
                                canPlaceOnBlocks.push(userReader.readString());
                            }
    
                            const canDestroyBlocksLength = userReader.readUnsignedInt();
                            const canDestroyBlocks: string[] = [];
                            for (let i = 0; i < canDestroyBlocksLength; i++) {
                                canDestroyBlocks.push(userReader.readString());
                            }
                        } catch (_error) {
                            // The bedrock client simply stops reading when this happens...
                        }
                    }
                }
                
                break;
            case 0x7A:
                fs.writeFileSync(DirectoryManager.export('biome_list.hex'), buffer)
                statusMessage(MessageType.Info, 'Logged BiomeDefinitionListPacket');
                // await reader.readNbt();
                // const biomeNbt = await reader.readNbt();
                // console.log(biomeNbt);
                // if (biomeNbt) {
                //     const result = await nbt.write(biomeNbt);
                //     await fs.promises.writeFile(DirectoryManager.export('biome_list.nbt'), result);
                // }

                break;
        }
    })

    await new Promise(resolve => setTimeout(resolve, 5000));

    client.disconnect();

    cleanServer(server);
}
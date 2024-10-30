import bedrock from 'bedrock-protocol';
import { cleanServer, runServer } from './data';
import fs from 'fs';
import DirectoryManager from '../util/directory';
import { Version } from './bedrock';
import { console } from 'inspector';
import { MessageType, statusMessage } from '../util/console';
import { BufferReader } from '../util/buffer';

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


    client.on('packet', (packet) => {
        const buffer = packet.fullBuffer as Buffer;

        const packetId = buffer.readUInt8(0);

        switch (packetId) {
            case 0x0B:
                fs.writeFileSync(DirectoryManager.export('start_game.hex'), buffer)
                statusMessage(MessageType.Info, 'Logged StartGamePacket');
                
                const reader = new BufferReader(buffer);

                // If possible, skip to after level name (Bedrock level)
                if (reader.setPositionAfter(Buffer.from([
                    0x0D, 0x42, 0x65, 0x64, 0x72, 0x6F, 0x63, 0x6B, 0x20, 0x6C, 0x65, 0x76, 0x65, 0x6C, 
                    0x0D, 0x42, 0x65, 0x64, 0x72, 0x6F, 0x63, 0x6B, 0x20, 0x6C, 0x65, 0x76, 0x65, 0x6C, 
                ]))) {
                    console.log(reader.readUUID()); // Template Content Identity
                    console.log(reader.readBoolean()); // Is Trial?
                    console.log(reader.readVarInt()); // SyncedPlayerMovementSettings Authority Mode
                    console.log(reader.readVarInt()); // SyncedPlayerMovementSettings Rewind History Size
                    console.log(reader.readBoolean()); // SyncedPlayerMovementSettings Server Authoritative Block Breaking
                    console.log(reader.readUnsignedLong()) // Current Level Time
                    console.log(reader.readSignedVarInt()); // Enchantment Seed
                    const blockPropertieslLength = reader.readVarInt(); // Block Properties Length
                    if (blockPropertieslLength > 0) {
                        
                    }
                }

                break;
            case 0x91:
                fs.writeFileSync(DirectoryManager.export('creative_content.hex'), buffer)
                statusMessage(MessageType.Info, 'Logged CreativeContentPacket');
                break;
            case 0x7A:
                fs.writeFileSync(DirectoryManager.export('biome_list.hex'), buffer)
                statusMessage(MessageType.Info, 'Logged BiomeDefinitionListPacket');
                break;
        }
    })

    await new Promise(resolve => setTimeout(resolve, 5000));

    client.disconnect();

    cleanServer(server);
}
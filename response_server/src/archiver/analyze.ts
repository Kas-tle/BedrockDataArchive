import nbt, { List, Tags, TagType } from 'prismarine-nbt';
import fs from 'fs';
import path from 'path';
import DirectoryManager from '../util/directory';

interface BlockEntry {
    name: { type: TagType.String, value: string };
    name_hash: { type: TagType.Long, value: [number, number] };
    network_id: { type: TagType.Int, value: number };
    states: { type: TagType.Compound, value: Record<string, undefined | Tags[TagType]> };
}

interface BlockPalette {
    type: TagType.Compound;
    value: {
        blocks: {
            type: TagType.List, value: {
                type: TagType.Compound;
                value: BlockEntry[];
            }
        };
    }
}

export async function analyze() {
    const buffer = fs.readFileSync(path.join(process.cwd(), 'block_palette.nbt'));
    const { parsed } = await nbt.parse(buffer) as unknown as { parsed: BlockPalette };

    let currentBlockName = parsed.value.blocks.value.value[0].name.value;
    let currentBaseBlockStates = parsed.value.blocks.value.value[0].states.value;
    let keys: string[] = [];
    const stateKeys: Set<string> = new Set();
    for (const block of parsed.value.blocks.value.value) {
        if (currentBlockName !== block.name.value) {
            stateKeys.add(JSON.stringify(keys));
            keys = [];

            currentBaseBlockStates = block.states.value;
            currentBlockName = block.name.value;
        }

        out: for (const key in block.states.value) {
            if (currentBaseBlockStates[key]?.value !== block.states.value[key]?.value) {
                let keyString = key;
                const type = block.states.value[key]!.type;

                switch (type) {
                    case TagType.Byte:
                        keyString += '[b]';
                        break;
                    case TagType.String:
                        keyString += '[s]';
                        break;
                    case TagType.Int:
                        keyString += '[i]';
                        break;
                }
                keyString += `=${currentBaseBlockStates[key]?.value}`;

                console.log(keys);
                if (keys.includes(keyString)) continue out;

                keys.push(keyString);
                break out;
            }
        }
    }
    
    const stateKeysArray: string[][] = [];
    stateKeys.forEach(key => stateKeysArray.push(JSON.parse(key)));
    fs.writeFileSync(DirectoryManager.export('palette_states.json'), JSON.stringify(stateKeysArray, null, 4));
}
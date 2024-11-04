import { BlockData, ResponseData } from "behavior_pack";
import fs from "fs";
import nbt, { List, Tags, TagType } from "prismarine-nbt";
import DirectoryManager from "../util/directory.js";
import { util } from "../util/util.js";

interface BlockEntry {
    name: { type: TagType.String, value: string };
    name_hash: { type: TagType.Long, value: [number, number] };
    network_id: { type: TagType.Int, value: number };
    states: { type: TagType.Compound, value: Record<string, undefined | Tags[TagType]> };
}

export async function processData(inp: { data: ResponseData }) {
    const data = inp.data;

    const states: BlockEntry[] = [];

    const blockEntriesWithHash = Object.entries(data.blocks.data).map(([key, value]) => {
        const hash = util.fnv1_64(key);
        return { key, value, hash };
    });

    blockEntriesWithHash.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));

    const blockMap = new Map<string, BlockData>();
    for (const entry of blockEntriesWithHash) {
        blockMap.set(entry.key, entry.value);
    }


    for (const [block, blockData] of blockMap.entries()) {
        const paletteStates = blockData.palleteStates;

        const stateNames = Object.keys(paletteStates);
        const stateValuesList = stateNames.map(stateName => paletteStates[stateName]);

        const combinations = generateCombinations(stateNames, stateValuesList);

        for (const combination of combinations) {
            const values: Record<string, undefined | Tags[TagType]> = {};

            for (const stateName in combination) {
                const value = combination[stateName];
                values[stateName] = typeof value === 'string' ? nbt.string(value) : typeof value === 'number' ? nbt.int(value) : nbt.byte(value ? 1 : 0);
            }

            const keys = Object.keys(values).sort();
            const sortedValues: Record<string, undefined | Tags[TagType]> = {};
            for (const key of keys) {
                sortedValues[key] = values[key];
            }

            const network_id = util.uint32ToInt32(Number(util.fnv1a_32(nbt.writeUncompressed(nbt.comp({
                name: nbt.string(block),
                states: nbt.comp(sortedValues)
            }) as nbt.NBT, 'little'))));

            states.push({
                name: nbt.string(block),
                name_hash: nbt.long(util.bigIntToLong(util.fnv1_64(block)).map(util.uint32ToInt32) as [number, number]),
                network_id: nbt.int(network_id),
                states: nbt.comp(sortedValues)
            });
        }
    }

    const palette = nbt.comp({
        blocks: nbt.list(nbt.comp(states))
    }) as unknown as nbt.NBT;

    fs.createWriteStream(DirectoryManager.export('block_palette.nbt')).write(nbt.writeUncompressed(palette, 'little'));
}

function generateCombinations(stateNames: string[], stateValuesList: any[][]) {
    const combinations: Record<string, any>[] = [];

    function helper(index: number, currentCombination: Record<string, any>) {
        if (index === stateNames.length) {
            combinations.push({ ...currentCombination });
            return;
        }

        const stateName = stateNames[index];
        const values = stateValuesList[index];

        for (const value of values) {
            currentCombination[stateName] = value;
            helper(index + 1, currentCombination);
        }
    }

    helper(0, {});
    return combinations;
}
import {
    BlockStates,
    BlockTypes,
    BlockPermutation,
    BlockStateType,
    ItemTypes,
    ItemStack,
    ItemType,
    DimensionType,
    DimensionTypes,
    EffectTypes,
    EnchantmentType,
    EnchantmentTypes,
    EntityTypes
} from "@minecraft/server";

import {
    http,
    HttpRequest,
    HttpRequestMethod
} from "@minecraft/server-net";

import * as net from "@minecraft/server-net";

export type BlockData = {
    blockId: string;
    possibleProperties: string[];
    defaultPermutation: Record<string, string | number | boolean>;
    states: {
        [stateName: string]: BlockStateType['validValues'];
    };
    palleteStates: {
        [stateName: string]: BlockStateType['validValues'];
    }
    tags?: string[];
};

export type ItemData = {
    id: ItemType['id'];
    tags?: ReturnType<ItemStack['getTags']>;
};

export type ResponseData = {
    blocks: {
        data: Record<string, BlockData>;
        properties: string[];
        palleteProperties: string[];
    };
    dimensions: DimensionType[];
    effects: string[];
    enchantments: EnchantmentType[];
    entities: string[];
    items: ItemData[];
    packets?: string[];
};

const data: ResponseData = {
    blocks: {
        data: {},
        properties: BlockStates.getAll().map(state => state.id),
        palleteProperties: []
    },
    dimensions: [],
    effects: [],
    enchantments: [],
    entities: [],
    items: []
}

const possibleCrossDeprecations: Record<string, string[]> = {};
for (const block of BlockTypes.getAll()) {
    const permutation = BlockPermutation.resolve(block.id);
    const defaultPermutation = permutation.getAllStates();
    const tags = permutation.getTags();

    const blockData: BlockData = {
        blockId: block.id,
        defaultPermutation,
        possibleProperties: Object.keys(defaultPermutation),
        states: {},
        palleteStates: {},
        tags: tags.length > 0 ? tags : undefined
    };

    const stateNames = Object.keys(defaultPermutation);

    const stateLengths: Record<string, number> = {};
    for (const stateName of stateNames) {
        const state = BlockStates.get(stateName);

        if (!state) continue;

        blockData.states[stateName] = state.validValues;
        blockData.palleteStates[stateName] = state.validValues;
        stateLengths[stateName] = state.validValues.length;

        let valid = true;
        for (let i = 0; i < state.validValues.length; i++) {
            valid = BlockPermutation.resolve(block.id, {
                [stateName]: state.validValues[i]
            }).matches(block.id);

            if (!valid) {
                if (!possibleCrossDeprecations[block.id]) {
                    possibleCrossDeprecations[block.id] = [];
                }
                possibleCrossDeprecations[block.id].push(stateName);
                break;
            }
        }
    }

    const equalLengthStatePairs: Set<Set<string>> = new Set();
    for (const stateName1 of stateNames) {
        for (const stateName2 of stateNames) {
            if (stateName1 === stateName2) continue;

            if (stateLengths[stateName1] === stateLengths[stateName2]) {
                equalLengthStatePairs.add(new Set([stateName1, stateName2]));
            }
        }
    }

    for (const pair of equalLengthStatePairs) {
        const [stateName1, stateName2] = pair;

        const state1 = blockData.states[stateName1];
        const state2 = blockData.states[stateName2];

        const nonDefaultPermutations: Record<string, string | number | boolean>[] = [];
        for (let i = 0; i < state1.length; i++) {
            for (let j = 0; j < state2.length; j++) {
                const valid = defaultPermutation[stateName1] === state1[i] || defaultPermutation[stateName2] === state2[j];

                if (!valid) {
                    nonDefaultPermutations.push({
                        [stateName1]: state1[i],
                        [stateName2]: state2[j]
                    });
                }
            }
        }

        let unique = 0;
        for (const permutation of nonDefaultPermutations) {
            const states1 = {
                [stateName1]: permutation[stateName1]
            }

            const states2 = {
                [stateName2]: permutation[stateName2]
            }

            const valid = BlockPermutation.resolve(block.id, states1).matches(block.id, states2)

            if (!valid) {
                unique++;
            }
        }
        
        if (unique < nonDefaultPermutations.length) {
            if (stateName1.startsWith('minecraft:')) {
                delete blockData.palleteStates[stateName2];
                continue;
            }

            if (stateName2.startsWith('minecraft:')) {
                delete blockData.palleteStates[stateName1];
                continue;
            }

            const state1Index = blockData.possibleProperties.indexOf(stateName1);
            const state2Index = blockData.possibleProperties.indexOf(stateName2);

            if (state1Index > state2Index) {
                delete blockData.palleteStates[stateName1];
            } else {
                delete blockData.palleteStates[stateName2];
            }
        }
    }

    // Special cases
    if (blockData.palleteStates['minecraft:cardinal_direction']) {
        delete blockData.palleteStates['facing_direction'];
    }

    switch (block.id) {
        case 'minecraft:cobblestone_wall':
            delete blockData.palleteStates['wall_block_type'];
            break;
        case 'minecraft:nether_wart':
        case 'minecraft:frosted_ice':
            blockData.palleteStates['age'] = [0, 1, 2, 3];
            break;
        case 'minecraft:sandstone':
        case 'minecraft:red_sandstone':
            delete blockData.palleteStates['sand_stone_type'];
            break;
        case 'minecraft:cocoa':
            blockData.palleteStates['age'] = [0, 1, 2];
            break;
        case 'minecraft:prismarine':
            delete blockData.palleteStates['prismarine_block_type'];
            break;
        case 'minecraft:sculk_sensor':
            delete blockData.palleteStates['powered_bit'];
            break;
        case 'minecraft:structure_void':
            delete blockData.palleteStates['structure_void_type'];
            break;
        case 'minecraft:chorus_flower':
            blockData.palleteStates['age'] = [0, 1, 2, 3, 4, 5];
            break;
        case 'minecraft:quartz_block':
        case 'minecraft:purpur_block':
            delete blockData.palleteStates['chisel_type'];
            break;
        case 'minecraft:dirt':
        case 'minecraft:coarse_dirt':
            delete blockData.palleteStates['dirt_type'];
            break;
        case 'minecraft:anvil':
            delete blockData.palleteStates['damage'];
            break;
        case 'minecraft:golden_rail':
        case 'minecraft:detector_rail':
        case 'minecraft:activator_rail':
            blockData.palleteStates['rail_direction'] = [ 0, 1, 2, 3, 4, 5 ];
            break;
        case 'minecraft:dead_horn_coral_wall_fan':
        case 'minecraft:horn_coral_wall_fan':
            delete blockData.palleteStates['coral_hang_type_bit'];
            break;
        case 'minecraft:sponge':
        case 'minecraft:wet_sponge':
            delete blockData.palleteStates['sponge_type'];
            break;
        case 'minecraft:sand':
        case 'minecraft:red_sand':
            delete blockData.palleteStates['sand_type'];
            break;
        case 'minecraft:tnt':
        case 'minecraft:underwater_tnt':
            delete blockData.palleteStates['allow_underwater_bit'];
            break;
        case 'minecraft:stone':
            delete blockData.palleteStates['stone_type'];
            break;
    };

    data.blocks.data[blockData.blockId] = blockData;
}

for (const blockId in possibleCrossDeprecations) {
    for (const stateName of possibleCrossDeprecations[blockId]) {
        for (const otherBlockId in possibleCrossDeprecations) {
            if (otherBlockId === blockId) continue;

            if (possibleCrossDeprecations[otherBlockId].includes(stateName)) {
                delete data.blocks.data[blockId].palleteStates[stateName];
            }
        }
    }
}

const palleteProperties = new Set<string>();
for (const blockId in data.blocks.data) {
    const blockData = data.blocks.data[blockId];

    for (const stateName in blockData.palleteStates) {
        palleteProperties.add(stateName);
    }
}
data.blocks.palleteProperties = Array.from(palleteProperties);

for (const type of ItemTypes.getAll()) {
    const stack = new ItemStack(type);
    const tags = stack.getTags();

    data.items.push({
        id: type.id,
        tags: tags.length > 0 ? tags : undefined
    });
}

const anyNet = net as any;
if (anyNet.PacketId) {
    data.packets = Object.keys(anyNet.PacketId);
}

data.dimensions = DimensionTypes.getAll();

for (const effect of EffectTypes.getAll()) {
    data.effects.push(effect.getName());
}

data.enchantments = EnchantmentTypes.getAll();

for (const type of EntityTypes.getAll()) {
    data.entities.push(type.id);
}

// calculate total theoretical permutations
let totalPermutations = 0;
for (const blockId in data.blocks.data) {
    const blockData = data.blocks.data[blockId];
    let permutations = 1;
    for (const stateName in blockData.palleteStates) {
        permutations *= blockData.palleteStates[stateName].length;
    }
    totalPermutations += permutations;
}
console.warn('Total theoretical permutations: ' + totalPermutations);

const request = new HttpRequest("http://localhost:2001");
request.setMethod('Post' as HttpRequestMethod);
request.setBody(JSON.stringify(data));
http.request(request);

// console.warn(JSON.stringify(data));
console.warn('Data sent to response server');
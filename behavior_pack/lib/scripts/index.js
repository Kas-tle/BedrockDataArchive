import { BlockStates, BlockTypes, BlockPermutation, ItemTypes, ItemStack, DimensionTypes, EffectTypes, EnchantmentTypes, EntityTypes } from "@minecraft/server";
import { http, HttpRequest } from "@minecraft/server-net";
import * as net from "@minecraft/server-net";
const data = {
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
};
const possibleCrossDeprecations = {};
for (const block of BlockTypes.getAll()) {
    const permutation = BlockPermutation.resolve(block.id);
    const defaultPermutation = permutation.getAllStates();
    const tags = permutation.getTags();
    const blockData = {
        blockId: block.id,
        defaultPermutation,
        possibleProperties: Object.keys(defaultPermutation),
        states: {},
        palleteStates: {},
        tags: tags.length > 0 ? tags : undefined
    };
    const stateNames = Object.keys(defaultPermutation);
    const stateLengths = {};
    for (const stateName of stateNames) {
        const state = BlockStates.get(stateName);
        if (!state)
            continue;
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
    const equalLengthStatePairs = new Set();
    for (const stateName1 of stateNames) {
        for (const stateName2 of stateNames) {
            if (stateName1 === stateName2)
                continue;
            if (stateLengths[stateName1] === stateLengths[stateName2]) {
                equalLengthStatePairs.add(new Set([stateName1, stateName2]));
            }
        }
    }
    for (const pair of equalLengthStatePairs) {
        const [stateName1, stateName2] = pair;
        const state1 = blockData.states[stateName1];
        const state2 = blockData.states[stateName2];
        const nonDefaultPermutations = [];
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
            };
            const states2 = {
                [stateName2]: permutation[stateName2]
            };
            const valid = BlockPermutation.resolve(block.id, states1).matches(block.id, states2);
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
            }
            else {
                delete blockData.palleteStates[stateName2];
            }
        }
    }
    // Special cases
    if (blockData.palleteStates['minecraft:cardinal_direction']) {
        delete blockData.palleteStates['facing_direction'];
    }
    if (blockData.palleteStates['age']) {
        const ageStates = Array.from(blockData.palleteStates['age']);
        const realAgeStates = [];
        for (const age of ageStates) {
            const testPerm = BlockPermutation.resolve(block.id, {
                'age': age
            });
            if (testPerm.getState('age') === age) {
                realAgeStates.push(age);
            }
        }
        blockData.palleteStates['age'] = realAgeStates;
    }
    if (blockData.palleteStates['rail_direction']) {
        const railStates = Array.from(blockData.palleteStates['rail_direction']);
        const realRailStates = [];
        for (const rail of railStates) {
            const testPerm = BlockPermutation.resolve(block.id, {
                'rail_direction': rail
            });
            if (testPerm.getState('rail_direction') === rail) {
                realRailStates.push(rail);
            }
        }
        blockData.palleteStates['rail_direction'] = realRailStates;
    }
    switch (block.id) {
        // case 'minecraft:cobblestone_wall':
        //     delete blockData.palleteStates['wall_block_type'];
        //     break;
        // case 'minecraft:sandstone':
        // case 'minecraft:red_sandstone':
        //     delete blockData.palleteStates['sand_stone_type'];
        //     break;
        // case 'minecraft:prismarine':
        //     delete blockData.palleteStates['prismarine_block_type'];
        //     break;
        case 'minecraft:sculk_sensor':
            delete blockData.palleteStates['powered_bit'];
            break;
        case 'minecraft:structure_void':
            delete blockData.palleteStates['structure_void_type'];
            break;
        // case 'minecraft:quartz_block':
        // case 'minecraft:purpur_block':
        //     delete blockData.palleteStates['chisel_type'];
        //     break;
        case 'minecraft:dirt':
        case 'minecraft:coarse_dirt':
            delete blockData.palleteStates['dirt_type'];
            break;
        // case 'minecraft:anvil':
        //     delete blockData.palleteStates['damage'];
        //     break;
        // case 'minecraft:dead_horn_coral_wall_fan':
        // case 'minecraft:horn_coral_wall_fan':
        //     delete blockData.palleteStates['coral_hang_type_bit'];
        //     break;
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
        // case 'minecraft:stone':
        //     delete blockData.palleteStates['stone_type'];
        //     break;
    }
    ;
    data.blocks.data[blockData.blockId] = blockData;
}
const deprecatedStates = new Set();
for (const blockId in possibleCrossDeprecations) {
    for (const stateName of possibleCrossDeprecations[blockId]) {
        for (const otherBlockId in possibleCrossDeprecations) {
            if (otherBlockId === blockId)
                continue;
            if (possibleCrossDeprecations[otherBlockId].includes(stateName)) {
                deprecatedStates.add(stateName);
                delete data.blocks.data[blockId].palleteStates[stateName];
            }
        }
    }
}
deprecatedStates.delete('dead_bit'); // still used by sea pickles
for (const stateName of deprecatedStates) {
    for (const blockId in data.blocks.data) {
        if (!data.blocks.data[blockId].palleteStates[stateName])
            continue;
        delete data.blocks.data[blockId].palleteStates[stateName];
    }
}
const palleteProperties = new Set();
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
const anyNet = net;
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
request.setMethod('Post');
request.setBody(JSON.stringify(data));
http.request(request);
// console.warn(JSON.stringify(data));
console.warn('Data sent to response server');
//# sourceMappingURL=index.js.map
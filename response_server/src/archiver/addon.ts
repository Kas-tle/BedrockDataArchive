import fs from 'fs';
import path from 'path';
import { compareVersions } from 'compare-versions';
import { util } from '../util/util.js';
import nbt, { TagType } from 'prismarine-nbt';
import DirectoryManager from '../util/directory.js';
import { Version } from './bedrock.js';
import url from 'url';
import { logger } from '../util/console.js';

export async function deployAddon(inp: { version: Version }) {
    const versions = await getScriptVersions(inp);
    await createAddon({ versions });
}

export function disableAddon() {
    const worldBehaviorPacks = DirectoryManager.workingFile('worlds/Bedrock level/world_behavior_packs.json');
    if (!fs.existsSync(worldBehaviorPacks)) return;
    fs.unlinkSync(worldBehaviorPacks);
}

async function createAddon(inp: { versions: Awaited<ReturnType<typeof getScriptVersions>>}) {
    const { versions } = inp;

    const scriptPath = url.fileURLToPath(import.meta.resolve('behavior_pack/lib/scripts/index.js'));
    const manifestPath = url.fileURLToPath(import.meta.resolve('behavior_pack/manifest.json'));

    const bpDir = DirectoryManager.workingSub('behavior_packs/archive_behavior_pack');
    const scriptsDir = DirectoryManager.workingSub('behavior_packs/archive_behavior_pack/scripts');

    fs.copyFileSync(scriptPath, path.join(scriptsDir, 'index.js'));

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.dependencies = [
        {
            "module_name": "@minecraft/server",
            "version": versions.server
        },
        {
            "module_name": "@minecraft/server-net",
            "version": versions.serverNet
        },
        {
            "module_name": "@minecraft/server-admin",
            "version": versions.serverAdmin
        }
    ]
    fs.writeFileSync(path.join(bpDir, 'manifest.json'), JSON.stringify(manifest, null, 4));

    const levelDir = DirectoryManager.workingSub('worlds/Bedrock level');
    const worldBehaviorPacks = [
        {
            "pack_id": manifest.header.uuid,
            "version": manifest.header.version,
        }
    ]
    fs.writeFileSync(path.join(levelDir, 'world_behavior_packs.json'), JSON.stringify(worldBehaviorPacks, null, 4));

    const permissions = {
        "allowed_modules": [
            "@minecraft/server",
            "@minecraft/server-net",
            "@minecraft/server-admin"
        ]
    }
    fs.writeFileSync(DirectoryManager.workingFile('config/default/permissions.json'), JSON.stringify(permissions, null, 4));

    const buffer = fs.readFileSync(path.join(levelDir, 'level.dat'));
    const { parsed } = await nbt.parse(buffer);
    const experiments = parsed.value.experiments!.value;

    if (!experiments || typeof experiments !== 'object') {
        throw new Error('No experiments found in level.dat');
    }

    parsed.value.experiments!.value! = {
        ...experiments as Record<string, any>,
        experiments_ever_used: { type: TagType.Byte, value: 1 },
        saved_with_toggled_experiments: { type: TagType.Byte, value: 1 },
        gametest: { type: TagType.Byte, value: 1 }
    };

    parsed.value.hasBeenLoadedInCreative = { type: TagType.Byte, value: 1 };

    const nbtBuffer = nbt.writeUncompressed(parsed, 'little');
    const filePath = path.join(levelDir, 'level.dat');
    const writeStream = fs.createWriteStream(filePath);
    writeStream.write(buffer.subarray(0, 4)); // version
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(nbtBuffer.length);
    writeStream.write(lengthBuffer);
    writeStream.end(nbtBuffer);

    const serverPropertiesPath = DirectoryManager.workingFile('server.properties');
    const serverProperties = fs.readFileSync(serverPropertiesPath, 'utf-8');
    const updatedProperties = serverProperties.replace(/online-mode=true/, 'online-mode=false');
    fs.writeFileSync(serverPropertiesPath, updatedProperties);
}

async function getScriptVersions(inp: { version: Version }): Promise<{ server: string; serverNet: string; serverAdmin: string; }> {
    const { version } = inp;

    const foundVersion = await closestVersionBase({ version });

    try {
        await util.downloadFile({ 
            url: `https://github.com/Mojang/bedrock-samples/archive/refs/tags/v${foundVersion}${version.type === 'preview' ? '-preview' : ''}.zip`,
            location: DirectoryManager.cacheSamples(foundVersion)
        });
    } catch (error) {
        throw new Error('Failed to download bedrock-samples');
    }

    const zip = DirectoryManager.cacheSampleZip(foundVersion);
    const roots = util.zipRoots(zip);

    if (roots.size !== 1) {
        throw new Error('Invalid bedrock-samples zip file');
    }
    const root = roots.values().next().value;

    const modulesDir = `${root}/metadata/script_modules/@minecraft/`;
    if (!zip.getEntry(modulesDir)) {
        throw new Error('No script modules found for version ' + foundVersion);
    }

    const moduleEntries = zip.getEntries()
        .filter(entry => entry.entryName.startsWith(modulesDir) && entry.entryName.endsWith('.json'))
        .map(entry => path.basename(entry.entryName));

    return {
        server: getLatestModuleVersion({ moduleEntries, module: 'server' }),
        serverNet: getLatestModuleVersion({ moduleEntries, module: 'server-net' }),
        serverAdmin: getLatestModuleVersion({ moduleEntries, module: 'server-admin' })
    }
}

function getLatestModuleVersion(inp: { moduleEntries: string[], module: string }): string {
    const { moduleEntries: moduleFiles, module } = inp;

    const candidates = moduleFiles.filter(entry => entry.startsWith(module + '_'))
        .map(file => {
            const regexp = new RegExp(`^${module}_(\\d+\\.\\d+\\.\\d(?:-beta)?)\\.json$`);
            return file.match(regexp)![1];
        }
        );

    if (candidates.length === 0) {
        throw new Error('No module files found for module ' + module);
    }

    candidates.sort((a, b) => {
        return compareVersions(b, a);
    });

    return candidates[0];
}

async function closestVersionBase(inp: { version: Version }): Promise<string> {
    const { version } = inp;

    const response = await util.fetchJson<{
        ref: string;
    }[]>('https://api.github.com/repos/Mojang/bedrock-samples/git/refs/tags');

    const tags = response.filter(tag => tag.ref.startsWith('refs/tags/v')).map(tag => tag.ref.slice('refs/tags/v'.length));

    let possibleTags;
    if (version.type === 'preview') {
        possibleTags = tags.filter(tag => tag.endsWith('-preview'));
    } else {
        possibleTags = tags.filter(tag => !tag.endsWith('-preview'));
    }

    possibleTags = possibleTags.map(tag => tag.slice(0, tag.length - (tag.endsWith('-preview') ? '-preview'.length : 0)));

    if (possibleTags.length === 0) {
        throw new Error('No tags found');
    }

    const exactMatch = possibleTags.find(tag => tag === version.client);
    if (exactMatch) {
        logger.info(`Exact version match ${exactMatch} for the Mojang/bedrock-samples repository`);
        return exactMatch;
    }
    const clientVersionSplit = version.client.split('.');

    const closestPatches = possibleTags.filter(tag => tag.startsWith(`${clientVersionSplit[0]}.${clientVersionSplit[1]}.${clientVersionSplit[2]}`));
    if (closestPatches.length > 0) {
        return closestPatches.sort((a, b) => compareVersions(b, a))[0];
    }

    const closestMinors = possibleTags.filter(tag => tag.startsWith(`${clientVersionSplit[0]}.${clientVersionSplit[1]}`));
    if (closestMinors.length > 0) {
        return closestMinors.sort((a, b) => compareVersions(b, a))[0];
    }

    const closestMajors = possibleTags.filter(tag => tag.startsWith(`${clientVersionSplit[0]}`));
    if (closestMajors.length > 0) {
        return closestMajors.sort((a, b) => compareVersions(b, a))[0];
    }

    throw new Error('No closest version found');
}
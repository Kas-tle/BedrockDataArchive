import os from 'os';
import path from 'path';
import fs from 'fs';
import child from 'child_process';
import { util } from '../util/util';
import DirectoryManager from '../util/directory';
import { MessageType, statusMessage } from '../util/console';

export interface Version {
    server: string;
    client: string;
    type: 'stable' | 'preview';
}

export async function setupBedrockServer(): Promise<Version> {
    const platform = checkPlatform();
    const version = process.argv[2] || 'preview';

    const { url, version: calcVersion } = await getUrl({ version, platform });

    await util.downloadFile({ url, location: DirectoryManager.cacheBds(calcVersion.client) });

    const zip = DirectoryManager.cacheBdsVersionZip(calcVersion.client);
    zip.extractAllTo(DirectoryManager.working, true);

    await initialRunServer();

    return calcVersion;
}

function checkPlatform(): string {
    switch (os.arch()) {
        case 'x64':
            break;
        default:
            throw new Error('Bedrock dedicated server is not available for architecture ' + os.arch());
    }

    switch (os.platform()) {
        case 'win32':
            return 'windows';
        case 'linux':
            return 'linux';
        default:
            throw new Error('Bedrock dedicated server is not available for platform ' + os.platform());
    }
}

async function getUrl(inp: { version: string, platform: string }): Promise<{ url: string, version: Version }> {
    let { version, platform } = inp;
    
    await util.downloadFile({ 
        url: 'https://github.com/Bedrock-OSS/BDS-Versions/archive/refs/heads/main.zip',
        location: DirectoryManager.cacheVersions,
        overwriteCache: true
    });

    const zip = DirectoryManager.cacheVersionsZip();
    const roots = util.zipRoots(zip);

    if (roots.size !== 1) {
        throw new Error('Invalid BDS-Versions zip file');
    }
    const root = roots.values().next().value;

    const manifest = JSON.parse(zip.readAsText(`${root}/versions.json`));
    let suffix = '';
    let clientVersion = '';
    let serverVersion = '';

    const formatStableVersion = (version: string): string => {
        const parts = version.split('.');
        if (parts.length !== 4) {
            throw new Error('Invalid version format ' + version);
        }
        const num2 = Number.parseInt(parts[2]);
        return `${parts[0]}.${parts[1]}.${Math.floor(num2 / 10) * 10}.${num2 % 10}`;
    };

    let type = '' as 'stable' | 'preview';
    switch (version) {
        case 'stable':
            version = manifest[platform].stable;
            serverVersion = `${version}-stable`;
            clientVersion = formatStableVersion(version);
            if (!version) {
                throw new Error('No stable version available for platform ' + platform);
            }
            type = 'stable';
            break;
        case 'preview':
            version = manifest[platform].preview;
            serverVersion = `${version}-preview`;
            clientVersion = version;
            if (!version) {
                throw new Error('No preview version available for platform ' + platform);
            }
            suffix = '_preview';
            type = 'preview';
            break;
        default:
            if (manifest[platform].versions.includes(version)) {
                serverVersion = `${version}-stable`;
                clientVersion = formatStableVersion(version);
                type = 'stable';
                break;
            } else if (manifest[platform].preview_versions.includes(version)) {
                suffix = '_preview';
                serverVersion = `${version}-preview`;
                clientVersion = version;
                type = 'preview';
                break;
            } else {
                throw new Error('Version ' + version + ' not found for platform ' + platform);
            }
    }

    const versionManifest = JSON.parse(zip.readAsText(`${root}/${platform}${suffix}/${version}.json`));

    const url = versionManifest.download_url;

    if (!url || typeof url !== 'string') {
        throw new Error('No download URL found for version ' + version);
    }

    return { url, version: {
        server: serverVersion,
        client: clientVersion,
        type
    } };
}

function initialRunServer(): Promise<void> {
    const startupTimeout = 60000;

    return new Promise((resolve, reject) => {
        let server: child.ChildProcessWithoutNullStreams;
        let timeoutHandle: string | number | NodeJS.Timeout | undefined;

        const cleanup = () => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            if (server) {
                server.stdout.removeAllListeners('data');
                server.stderr.removeAllListeners('data');
                server.stdout.pause();
                server.stderr.pause();
                server.kill();
            }
        };

        timeoutHandle = setTimeout(() => {
            cleanup();
            reject(new Error('Server startup timed out'));
        }, startupTimeout);

        if (os.platform() === 'linux') {
            fs.chmodSync(path.join(DirectoryManager.working, 'bedrock_server'), 0o755);
            server = child.spawn(path.join(DirectoryManager.working, 'bedrock_server'), [], { cwd: DirectoryManager.working });
        } else {
            server = child.spawn(path.join(DirectoryManager.working, 'bedrock_server.exe'), [], { cwd: DirectoryManager.working });
        }

        server.stdout.setEncoding('utf-8');
        server.stdout.on('data', chunk => {
            statusMessage(MessageType.Plain, '[BDS] ' + chunk);
            chunk = chunk.toString();

            if (chunk.includes('Server started')) {
                cleanup();
                statusMessage(MessageType.Completion, 'Server setup complete');
                resolve();
            }
        });

        server.stderr.setEncoding('utf-8');
        server.stderr.on('data', chunk => {
            statusMessage(MessageType.Error, '[BDS] ' + chunk);
            cleanup();
            reject(new Error('Failed to start BDS'));
        });

        server.on('error', (err) => {
            cleanup();
            reject(err);
        });
    });
}
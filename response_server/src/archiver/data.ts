import { ResponseData } from 'behavior_pack';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import child from 'child_process';
import DirectoryManager from '../util/directory.js';
import { MessageType, statusMessage } from '../util/console.js';

export async function recieveData(): Promise<ResponseData> {
    try {
        const process = await runServer();
        const data = await getResponseData();

        cleanServer(process);
        
        fs.writeFileSync(DirectoryManager.export('data.json'), JSON.stringify(data, null, 4));
        return data;
    } catch (error) {
        statusMessage(MessageType.Error, 'Failed to recieve data from bedrock server: ' + error);
    }

    throw new Error('Failed to recieve data');
}

async function getResponseData(): Promise<ResponseData> {
    return new Promise<ResponseData>((resolve, reject) => {
        const server = http.createServer();

        const requestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
            let data = '';

            req.on('data', chunk => {
                data += chunk;
            });

            req.on('end', () => {
                res.writeHead(200).end();
                const response = JSON.parse(data) as ResponseData;

                server.close(() => {
                    statusMessage(MessageType.Process, 'HTTP server closed after handling request from bedrock server');
                    resolve(response);
                });
            });

            req.on('error', (err) => {
                reject(err);
            });
        };

        server.once('request', requestHandler);

        server.listen(2001, () => {
            statusMessage(MessageType.Process, 'HTTP server listening for data from bedrock server on port 2001');
        });

        server.on('error', (err) => {
            reject(err);
        });
    });
}

export interface BedrockServerProcess {
    server: child.ChildProcessWithoutNullStreams;
    timeout: NodeJS.Timeout;
}

export function runServer(): Promise<BedrockServerProcess> {
    const startupTimeout = 300_000;

    return new Promise((resolve, reject) => {
        let server: child.ChildProcessWithoutNullStreams;
        let timeout: NodeJS.Timeout;

        const cleanup = () => cleanServer({ server, timeout });

        timeout = setTimeout(() => {
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

        resolve({ server, timeout });
    });
}

export function cleanServer(process: BedrockServerProcess) {
    const { server, timeout } = process;

    if (timeout) {
        clearTimeout(timeout);
    }

    if (server) {
        server.stdout.removeAllListeners('data');
        server.stderr.removeAllListeners('data');
        server.stdout.pause();
        server.stderr.pause();
        server.kill('SIGINT');
    }
}
import { setupBedrockServer } from './src/archiver/bedrock.js';
import { deployAddon, disableAddon } from './src/archiver/addon.js';
import { recieveData } from './src/archiver/data.js';
import { processData } from './src/archiver/process.js';
import { captureClientData } from './src/archiver/client.js';
import { MessageType, statusMessage } from './src/util/console.js';

async function main() {
    statusMessage(MessageType.Process, 'Setting up bedrock server');
    const version = await setupBedrockServer();
    statusMessage(MessageType.Info, `Using client version ${version.client}, server version ${version.server}`);

    statusMessage(MessageType.Process, 'Deploying addon');
    await deployAddon({ version });
    statusMessage(MessageType.Completion, 'Addon deployed');
    
    statusMessage(MessageType.Process, 'Preparing to recieve data from bedrock server');
    const data = await recieveData();
    statusMessage(MessageType.Completion, 'Data recieved');

    disableAddon();
    statusMessage(MessageType.Process, 'Addon disabled');

    await processData({ data });
    statusMessage(MessageType.Completion, 'Data processed');

    await captureClientData({ version });
    statusMessage(MessageType.Completion, 'Client data captured');
}

main();
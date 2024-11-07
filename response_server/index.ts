import { setupBedrockServer } from './src/archiver/bedrock.js';
import { deployAddon, disableAddon } from './src/archiver/addon.js';
import { recieveData } from './src/archiver/data.js';
import { processData } from './src/archiver/process.js';
import { captureClientData } from './src/archiver/client.js';
import { logger } from './src/util/console.js';

async function main() {
    logger.process('Starting response server');
    const version = await setupBedrockServer();
    logger.info(`Using client version ${version.client}, server version ${version.server}`);

    logger.process('Deploying addon');
    await deployAddon({ version });
    logger.completion('Addon deployed');

    logger.process('Preparing to recieve data from bedrock server');
    const data = await recieveData();
    logger.completion('Data recieved');

    disableAddon();
    logger.process('Addon disabled');

    await processData({ data });
    logger.completion('Data processed');

    await captureClientData({ version });
    logger.completion('Client data captured');
}

main();
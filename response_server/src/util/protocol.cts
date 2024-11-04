import bedrock from 'bedrock-protocol';

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

export { bedrock };
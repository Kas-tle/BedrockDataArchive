import chalk from 'chalk';
import DirectoryManager from './directory.js';

// export enum MessageType {
//     Completion = 'completion',
//     Process = 'process',
//     Critical = 'critical',
//     Error = 'error',
//     Info = 'info',
//     Plain = 'plain'
// }

// export function statusMessage(type: MessageType, ...messages: string[]) {
//     switch (type) {
//         case MessageType.Completion:
//             messages.forEach((message) => console.log(chalk.green(`[+] ${chalk.ansi256(246)(message)}`)));
//             break;
//         case MessageType.Process:
//             messages.forEach((message) => console.log(chalk.yellow(`[•] ${chalk.ansi256(246)(message)}`)));
//             break;
//         case MessageType.Critical:
//             messages.forEach((message) => console.log(chalk.red(`[X] ${chalk.ansi256(246)(message)}`)));
//             break;
//         case MessageType.Error:
//             messages.forEach((message) => console.log(chalk.red(`[ERROR] ${chalk.ansi256(246)(message)}`)));
//             break;
//         case MessageType.Info:
//             messages.forEach((message) => console.log(chalk.blue(`[i] ${chalk.ansi256(246)(message)}`)));
//             break;
//         case MessageType.Plain:
//             messages.forEach((message) => console.log(chalk.gray(message)));
//             break;
//         default:
//             messages.forEach((message) => console.log(chalk.gray(message)));
//     }
// }

function completion(...messages: string[]) {
    const dateTime = new Date().toISOString();
    DirectoryManager.log.write(messages.map(message => `[${dateTime}] (+) ${message}`).join('\n') + '\n');
    messages.forEach(message => console.log(chalk.green(`[+] ${chalk.ansi256(246)(message)}`)));
}

function process(...messages: string[]) {
    const dateTime = new Date().toISOString();
    DirectoryManager.log.write(messages.map(message => `[${dateTime}] (-) ${message}`).join('\n') + '\n');
    messages.forEach(message => console.log(chalk.yellow(`[-] ${chalk.ansi256(246)(message)}`)));
}

function critical(...messages: string[]) {
    const dateTime = new Date().toISOString();
    DirectoryManager.log.write(messages.map(message => `[${dateTime}] (X) ${message}`).join('\n') + '\n');
    messages.forEach(message => console.log(chalk.red(`[X] ${chalk.ansi256(246)(message)}`)));
}

function error(...messages: string[]) {
    const dateTime = new Date().toISOString();
    DirectoryManager.log.write(messages.map(message => `[${dateTime}] (ERROR) ${message}`).join('\n') + '\n');
    messages.forEach(message => console.log(chalk.red(`[ERROR] ${chalk.ansi256(246)(message)}`)));
}

function info(...messages: string[]) {
    const dateTime = new Date().toISOString();
    DirectoryManager.log.write(messages.map(message => `[${dateTime}] (i) ${message}`).join('\n') + '\n');
    messages.forEach(message => console.log(chalk.blue(`[i] ${chalk.ansi256(246)(message)}`)));
}

function plain(...messages: string[]) {
    const dateTime = new Date().toISOString();
    DirectoryManager.log.write(messages.map(message => `[${dateTime}] ${message}`).join('\n') + '\n');
    messages.forEach(message => console.log(chalk.gray(message)));
}

function bedrockServer(...messages: string[]) {
    const dateTime = new Date().toISOString();
    DirectoryManager.log.write(messages.map(message => `[${dateTime}] (BDS) ${message}`).join('\n') + '\n');
    messages.forEach(message => console.log(`${chalk.bold.bgBlue('(BDS)')} ${chalk.gray(message)}`));
}

function bedrockServerError(...messages: string[]) {
    const dateTime = new Date().toISOString();
    DirectoryManager.log.write(messages.map(message => `[${dateTime}] (BDS) ${message}`).join('\n') + '\n');
    messages.forEach(message => console.log(`${chalk.bold.bgRed('(BDS)')} ${chalk.red(message)}`));
}

export const logger = {
    completion,
    process,
    critical,
    error,
    info,
    plain,
    bedrockServer,
    bedrockServerError
};
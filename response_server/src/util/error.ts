import chalk from 'chalk';
import { BufferReader } from './buffer.js';

class PacketParserError extends Error {
    buffer: Buffer;
    bytesRemaining: number;
    currentOffset: number;
    cause?: Error;

    constructor(
        reader: BufferReader,
        message: string = 'An error occurred while parsing the packet.',
        cause?: Error | unknown
    ) {
        super(message);
        this.name = 'PacketParserError';
        this.buffer = reader.getBuffer();
        this.bytesRemaining = reader.getBytesRemaining();
        this.currentOffset = reader.getOffset();
        this.cause = cause as Error;

        this.message = this.buildErrorMessage();

        if (cause) {
            // @ts-ignore
            this.cause = cause;
        }
    }


    private buildErrorMessage(): string {
        const lines: string[] = [];

        lines.push(this.message);
        lines.push(`\tBytes remaining:\t${chalk.yellow(this.bytesRemaining.toString())}`);
        lines.push(
            `\tCurrent position:\t${chalk.yellow(this.currentOffset.toString())} (` +
            `${chalk.yellow(`0x${this.currentOffset.toString(16).toUpperCase()}`)})`
        );
        lines.push('');

        lines.push(this.buildHexDump());

        if (this.cause) {
            lines.push('');
            lines.push(chalk.red('Caused by: ') + this.cause.message);
        }

        return lines.join('\n');
    }

    private buildHexDump(): string {
        const bytesPerRow = 32;
        const maxRows = 12;
        const totalBytes = bytesPerRow * maxRows;

        const halfBytes = Math.floor(totalBytes / 2);
        let startOffset = this.currentOffset > halfBytes ? this.currentOffset - halfBytes : 0;
        let endOffset = startOffset + totalBytes;

        if (endOffset > this.buffer.length) {
            endOffset = this.buffer.length;
            startOffset = endOffset - totalBytes;
            if (startOffset < 0) startOffset = 0;
        }

        endOffset = Math.min(endOffset, this.buffer.length);
        startOffset = Math.max(startOffset, 0);

        startOffset = Math.floor(startOffset / bytesPerRow) * bytesPerRow;
        endOffset = startOffset + totalBytes;
        if (endOffset > this.buffer.length) {
            endOffset = this.buffer.length;
        }

        const dumpLines: string[] = [];

        const headerLabels = chalk.blue.bold('Offset'.padEnd(12)) + 
            chalk.blue.bold('Hex'.padEnd(99)) + 
            chalk.blue.bold('ASCII');
        dumpLines.push(headerLabels);
        dumpLines.push('');

        const columnHeaders = this.buildColumnHeaders(bytesPerRow);
        dumpLines.push(columnHeaders);

        for (let offset = startOffset; offset < endOffset; offset += bytesPerRow) {
            const bytes = this.buffer.slice(offset, offset + bytesPerRow);
            const hexParts: string[] = [];
            const asciiParts: string[] = [];

            for (let i = 0; i < bytesPerRow; i++) {
                const byteOffset = offset + i;
                if (i === 16) {
                    hexParts.push('  ');
                }

                if (i < bytes.length) {
                    const byte = bytes[i];
                    const byteHex = byte.toString(16).padStart(2, '0').toUpperCase();

                    const colorRed = byteOffset <= this.currentOffset;
                    if (colorRed) {
                        hexParts.push(chalk.red.bold(byteHex) + ' ');
                    } else {
                        hexParts.push(byteHex + ' ');
                    }

                    const byteChar = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
                    if (colorRed) {
                        asciiParts.push(chalk.red(byteChar));
                    } else {
                        asciiParts.push(byteChar);
                    }
                } else {
                    hexParts.push('   ');
                    asciiParts.push(' ');
                }
            }

            const hexString = hexParts.join('');
            const asciiString = asciiParts.join('');

            const address = `0x${offset.toString(16).padStart(8, '0').toUpperCase()}`;

            const line = `${chalk.green(address)}  ${hexString} |${asciiString}|`;
            dumpLines.push(line);
        }

        return dumpLines.join('\n') + '\n';
    }

    private buildColumnHeaders(bytesPerRow: number): string {
        const headers: string[] = [];
        for (let i = 0; i < bytesPerRow; i++) {
            if (i === 16) {
                headers.push(' '); // Extra space after 16 bytes
            }
            headers.push(i.toString(16).padStart(2, '0').toUpperCase());
        }

        const headerLine = '            ' + headers.join(' ');
        return chalk.blue.bold(headerLine);
    }
}

export default PacketParserError;
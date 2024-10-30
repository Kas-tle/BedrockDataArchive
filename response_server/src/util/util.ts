import path from "path";
import fs from "fs";
import UserAgent from "user-agents";
import AdmZip from 'adm-zip';
import { Readable } from 'stream';
import { finished } from "stream/promises";
import { ReadableStream } from 'stream/web';

const FNV_64_OFFSET_BASIS = BigInt('0xcbf29ce484222325');
const FNV_64_PRIME = BigInt('0x100000001b3');
const FNV_64_MASK = BigInt('0xffffffffffffffff');

function fnv1_64(input: Buffer | string): bigint {
    let hash = FNV_64_OFFSET_BASIS;

    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');

    buffer.forEach(byte => {
        hash = hash * FNV_64_PRIME;
        hash = hash ^ (BigInt(byte) & FNV_64_MASK);
    });

    return hash & FNV_64_MASK;
}

const FNV_32_OFFSET_BASIS = BigInt('0x811c9dc5');
const FNV_32_PRIME = BigInt('0x01000193');
const FNV_32_MASK = BigInt('0xffffffff');

function fnv1a_32(input: Buffer | string): bigint {
    let hash = FNV_32_OFFSET_BASIS;
  
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');

    buffer.forEach(byte => {
        hash = hash ^ (BigInt(byte) & FNV_32_MASK);
        hash = hash * FNV_32_PRIME;
    });
  
    return hash & FNV_32_MASK;
}

async function downloadFile(inp: { url: string, location: string, overwriteCache?: boolean }): Promise<void> {
    if (!inp.overwriteCache && fs.existsSync(inp.location)) {
        return;
    }

    const directory = path.dirname(inp.location);

    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    const stream = fs.createWriteStream(inp.location);
    const userAgent = new UserAgent();
    const headers = {
        'User-Agent': userAgent.toString()
    };

    const { body } = await fetch(inp.url, { headers });

    if (!body) {
        throw new Error(`Failed to download ${inp.url} to ${inp.location}`);
    }

    await finished(Readable.fromWeb(body as ReadableStream<any>).pipe(stream));
}

function zipRoots(zip: AdmZip): Set<string> {
    const roots = new Set<string>();

    zip.getEntries().forEach(entry => {
        if (!entry.isDirectory) return;
        const parts = entry.entryName.split('/');
        if (parts.length < 1) return;
        roots.add(parts[0]);
    });

    return roots;
}

function longToInts(longValue: number | bigint): [number, number] {
    const BIGINT_32 = BigInt(32);
    const BIGINT_MASK = BigInt(0xFFFFFFFF);

    if (typeof longValue === 'bigint') {
        const lowInt = Number(longValue & BIGINT_MASK);
        const highInt = Number((longValue >> BIGINT_32) & BIGINT_MASK);
        return [highInt, lowInt];
    } else {
        const lowInt = longValue & 0xFFFFFFFF;
        const highInt = (longValue >> 32) & 0xFFFFFFFF;
        return [highInt, lowInt];
    }
}

function bigIntToLong(value: bigint): [number, number] {
    const lowBigInt = BigInt.asIntN(32, value);
    const highBigInt = BigInt.asIntN(32, value >> BigInt(32));

    const low = Number(lowBigInt);
    const high = Number(highBigInt);

    return [high, low];
}

function intsToLong(high: number, low: number): bigint {
    const BIGINT_32 = BigInt(32);
    return (BigInt(high) << BIGINT_32) | BigInt(low);
}

function longGreaterThan(a: [number, number], b: [number, number]): boolean {
    return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
}

function uint32ToInt32(uint32: number): number {
    return uint32 > 0x7FFFFFFF ? uint32 - 0x100000000 : uint32;
}


function insertAfterKey<T extends Record<string, any>>(
    obj: T,
    key: keyof T,
    insertKey: string,
    insertValue: any
): T {
    const result: Record<string, any> = {};
    let inserted = false;

    for (const [k, v] of Object.entries(obj)) {
        result[k] = v;

        if (k === key && !inserted) {
            result[insertKey] = insertValue;
            inserted = true;
        }
    }

    if (!inserted) {
        result[insertKey] = insertValue;
    }

    return result as T;
}

export const util = {
    fnv1_64,
    fnv1a_32,
    downloadFile,
    zipRoots,
    longToInts,
    intsToLong,
    bigIntToLong,
    longGreaterThan,
    uint32ToInt32,
    insertAfterKey
};
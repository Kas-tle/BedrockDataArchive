import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

class DirectoryManager {
    private static rootDir = path.join(process.cwd(), 'scratch');

    private static workingDir = path.join(DirectoryManager.rootDir, 'working');
    private static exportDir = path.join(DirectoryManager.rootDir, 'export');

    private static logsDir = path.join(DirectoryManager.rootDir, 'logs');
    private static logFilePath = path.join(DirectoryManager.logsDir, `log-${new Date().toISOString().replace(/:/g, '-')}.log`);
    private static logFile: fs.WriteStream;

    private static cacheDir = path.join(DirectoryManager.rootDir, 'cache');
    private static cacheSamplesDir = path.join(DirectoryManager.cacheDir, 'samples');
    private static cacheBdsDir = path.join(DirectoryManager.cacheDir, 'bds');
    private static cacheVersionsFile = path.join(DirectoryManager.cacheDir, 'versions/bds-versions.zip');

    private static initialized = false;

    private static init() {
        if (this.initialized) return;

        if (fs.existsSync(this.workingDir)) {
            fs.rmSync(this.workingDir, { recursive: true });
        }

        fs.mkdirSync(this.workingDir, { recursive: true });
        fs.mkdirSync(this.exportDir, { recursive: true });

        fs.mkdirSync(this.logsDir, { recursive: true });
        this.logFile = fs.createWriteStream(this.logFilePath, { flags: 'a' });

        fs.mkdirSync(this.cacheSamplesDir, { recursive: true });
        fs.mkdirSync(this.cacheBdsDir, { recursive: true });
        fs.mkdirSync(path.dirname(this.cacheVersionsFile), { recursive: true });

        this.initialized = true;
    }

    static get root(): string {
        this.init();
        return this.rootDir;
    }

    static get working(): string {
        this.init();
        return this.workingDir;
    }

    static workingSub(sub: string): string {
        const subDir = path.join(this.working, sub);
        if (!fs.existsSync(subDir)) {
            fs.mkdirSync(subDir, { recursive: true });
        }

        return subDir;
    }

    static workingFile(sub: string): string {
        return path.join(this.working, sub);
    }

    static get log(): fs.WriteStream {
        this.init();
        return this.logFile;
    }

    static export(file?: string): string {
        this.init();
        if (file) {
            return path.join(this.exportDir, file);
        }
        return this.exportDir;
    }

    static get cache(): string {
        this.init();
        return this.cacheDir;
    }

    static cacheSamples(version?: string): string {
        this.init();
        if (version) {
            return path.join(this.cacheSamplesDir, `${version}.zip`);
        }
        return this.cacheSamplesDir;
    }

    static cacheSampleZip(sample: string): AdmZip {
        this.init();
        return new AdmZip(path.join(this.cacheSamplesDir, `${sample}.zip`));
    }

    static cacheBds(version?: string): string {
        this.init();
        if (version) {
            return path.join(this.cacheBdsDir, `${version}.zip`);
        }
        return this.cacheBdsDir;
    }

    static cacheBdsVersionZip(version: string): AdmZip {
        this.init();
        return new AdmZip(path.join(this.cacheBdsDir, `${version}.zip`));
    }

    static get cacheVersions(): string {
        this.init();
        return this.cacheVersionsFile;
    }

    static cacheVersionsZip(): AdmZip {
        this.init();
        return new AdmZip(this.cacheVersionsFile);
    }
}

export default DirectoryManager;
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

// A stand-in for expo-file-system, backed by the real filesystem in a temp
// directory. Registered as an alias in vitest.config.ts.
//
// It exists because `client.ts` writes a rescue backup before rebuilding the
// database, which drags expo-file-system into every data-layer test. Since that
// path is the one thing standing between a schema change and losing a year of
// history, it is worth being able to test rather than merely stub out — so this
// writes real files and reads them back.
//
// Only the surface the app actually uses is here. Anything missing should be
// added when something needs it, not guessed at in advance.

/** One temp root per module instance, so `vi.resetModules()` gives a clean slate. */
const root = mkdtempSync(join(tmpdir(), 'groove-fs-'));

export class Directory {
  readonly uri: string;

  constructor(...parts: (string | Directory)[]) {
    this.uri = parts.map((part) => (part instanceof Directory ? part.uri : part)).join('/');
  }

  get name(): string {
    return basename(this.uri);
  }

  get exists(): boolean {
    return existsSync(this.uri) && statSync(this.uri).isDirectory();
  }

  create(options?: { intermediates?: boolean }): void {
    mkdirSync(this.uri, { recursive: options?.intermediates ?? false });
  }

  list(): (Directory | File)[] {
    if (!this.exists) return [];
    return readdirSync(this.uri).map((entry) => {
      const full = join(this.uri, entry);
      return statSync(full).isDirectory() ? new Directory(full) : new File(full);
    });
  }
}

export class File {
  readonly uri: string;

  constructor(...parts: (string | Directory)[]) {
    this.uri = parts.map((part) => (part instanceof Directory ? part.uri : part)).join('/');
  }

  get name(): string {
    return basename(this.uri);
  }

  get exists(): boolean {
    return existsSync(this.uri) && statSync(this.uri).isFile();
  }

  get size(): number {
    return this.exists ? statSync(this.uri).size : 0;
  }

  create(): void {
    writeFileSync(this.uri, '');
  }

  write(contents: string): void {
    writeFileSync(this.uri, contents, 'utf8');
  }

  async text(): Promise<string> {
    return readFileSync(this.uri, 'utf8');
  }

  delete(): void {
    rmSync(this.uri, { force: true });
  }
}

export const Paths = {
  get document(): Directory {
    const dir = new Directory(join(root, 'document'));
    if (!dir.exists) dir.create({ intermediates: true });
    return dir;
  },
  get cache(): Directory {
    const dir = new Directory(join(root, 'cache'));
    if (!dir.exists) dir.create({ intermediates: true });
    return dir;
  },
};

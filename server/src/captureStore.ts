import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CaptureRecord, ReplaySource } from "./types.js";

interface StoredCapture {
  record: CaptureRecord;
  replay: ReplaySource;
}

interface PersistedCaptureStore {
  version: 1;
  captures: StoredCapture[];
}

export interface CaptureStore {
  add(record: CaptureRecord, replay: ReplaySource): CaptureRecord;
  list(): CaptureRecord[];
  get(id: string): CaptureRecord | undefined;
  getReplaySource(id: string): ReplaySource | undefined;
}

export class InMemoryCaptureStore implements CaptureStore {
  protected readonly captures: StoredCapture[] = [];
  protected readonly byId = new Map<string, StoredCapture>();
  protected readonly maxCaptures: number;

  constructor(maxCaptures = 500) {
    this.maxCaptures = maxCaptures;
  }

  add(record: CaptureRecord, replay: ReplaySource): CaptureRecord {
    const entry: StoredCapture = { record, replay };
    this.captures.unshift(entry);
    this.byId.set(record.id, entry);
    this.prune();
    return record;
  }

  list(): CaptureRecord[] {
    return this.captures.map((entry) => entry.record);
  }

  get(id: string): CaptureRecord | undefined {
    return this.byId.get(id)?.record;
  }

  getReplaySource(id: string): ReplaySource | undefined {
    return this.byId.get(id)?.replay;
  }

  protected hydrate(entries: StoredCapture[]): void {
    for (const entry of entries) {
      this.captures.push(entry);
      this.byId.set(entry.record.id, entry);
    }
    this.prune();
  }

  protected snapshot(): PersistedCaptureStore {
    return {
      version: 1,
      captures: this.captures.map((entry) => ({
        record: entry.record,
        replay: entry.replay,
      })),
    };
  }

  private prune(): void {
    while (this.captures.length > this.maxCaptures) {
      const removed = this.captures.pop();
      if (removed) {
        this.byId.delete(removed.record.id);
      }
    }
  }
}

export class FileCaptureStore extends InMemoryCaptureStore {
  private readonly filePath: string;

  constructor(filePath: string, maxCaptures = 500) {
    super(maxCaptures);
    this.filePath = filePath;
    this.load();
  }

  override add(record: CaptureRecord, replay: ReplaySource): CaptureRecord {
    const saved = super.add(record, replay);
    this.persist();
    return saved;
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedCaptureStore;
      const entries = Array.isArray(parsed?.captures) ? parsed.captures : [];
      this.hydrate(entries);
    } catch {
      // Ignore malformed store files and start fresh.
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.snapshot(), null, 2), "utf8");
  }
}

import type { CaptureRecord, ReplaySource } from "./types.js";

interface StoredCapture {
  record: CaptureRecord;
  replay: ReplaySource;
}

export class InMemoryCaptureStore {
  private readonly captures: StoredCapture[] = [];
  private readonly byId = new Map<string, StoredCapture>();
  private readonly maxCaptures: number;

  constructor(maxCaptures = 500) {
    this.maxCaptures = maxCaptures;
  }

  add(record: CaptureRecord, replay: ReplaySource): CaptureRecord {
    const entry: StoredCapture = { record, replay };
    this.captures.unshift(entry);
    this.byId.set(record.id, entry);

    if (this.captures.length > this.maxCaptures) {
      const removed = this.captures.pop();
      if (removed) {
        this.byId.delete(removed.record.id);
      }
    }

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
}

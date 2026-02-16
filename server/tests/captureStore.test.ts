import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { FileCaptureStore, InMemoryCaptureStore } from "../src/captureStore.js";
import type { CaptureRecord, ReplaySource } from "../src/types.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const makeCapture = (id: string): CaptureRecord => ({
  id,
  createdAt: "2026-02-01T00:00:00.000Z",
  replayOf: null,
  method: "POST",
  targetUrl: "https://api.example.com/v1/messages",
  path: "/v1/messages",
  statusCode: 200,
  durationMs: 12,
  request: {
    headers: { "content-type": "application/json" },
    body: "{\"ok\":true}",
    size: 11,
  },
  response: {
    headers: { "content-type": "application/json" },
    body: "{\"done\":true}",
    size: 13,
  },
});

const makeReplay = (): ReplaySource => ({
  id: "source-1",
  method: "POST",
  targetUrl: "https://api.example.com/v1/messages",
  path: "/v1/messages",
  headers: { "content-type": "application/json" },
  body: "{\"ok\":true}",
});

describe("capture stores", () => {
  it("applies max capture limit in memory", () => {
    const store = new InMemoryCaptureStore(1);
    store.add(makeCapture("one"), makeReplay());
    store.add(makeCapture("two"), makeReplay());

    expect(store.list()).toHaveLength(1);
    expect(store.get("one")).toBeUndefined();
    expect(store.get("two")?.id).toBe("two");
  });

  it("persists captures to disk and loads on restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "proxylab-store-"));
    dirs.push(dir);
    const filePath = join(dir, "captures.json");

    const first = new FileCaptureStore(filePath, 5);
    first.add(makeCapture("capture-1"), makeReplay());

    const second = new FileCaptureStore(filePath, 5);
    expect(second.list()).toHaveLength(1);
    expect(second.get("capture-1")?.targetUrl).toBe("https://api.example.com/v1/messages");
    expect(second.getReplaySource("capture-1")?.method).toBe("POST");
  });
});

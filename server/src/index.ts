import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { InMemoryCaptureStore } from "./captureStore.js";
import { redactBody, redactHeaders } from "./redaction.js";
import { createCurlSnippet, createFetchSnippet } from "./snippets.js";
import type { CaptureRecord, ReplayRequest, ReplaySource } from "./types.js";

type FetchImpl = typeof fetch;

interface BuildServerOptions {
  captureStore?: InMemoryCaptureStore;
  fetchImpl?: FetchImpl;
}

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
  "x-proxylab-target",
]);

const joinPath = (basePath: string, suffix: string): string => {
  const left = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const right = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (left.length === 0) {
    return right;
  }
  return `${left}${right}`;
};

const normalizeHeaders = (
  headers: Record<string, string | string[] | undefined>
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (hopByHopHeaders.has(key.toLowerCase())) {
      continue;
    }
    if (typeof value === "string") {
      result[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      result[key] = value.join(", ");
    }
  }
  return result;
};

const toRawBody = (body: unknown): string | undefined => {
  if (typeof body === "undefined" || body === null) {
    return undefined;
  }
  if (typeof body === "string") {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }
  if (typeof body === "object") {
    return JSON.stringify(body);
  }
  return String(body);
};

const withCapture = (
  store: InMemoryCaptureStore,
  replay: ReplaySource,
  response: {
    statusCode: number;
    durationMs: number;
    headers: Record<string, string>;
    body: string | undefined;
    replayOf?: string | null;
  }
): CaptureRecord => {
  const requestContentType = replay.headers["content-type"];
  const responseContentType = response.headers["content-type"];
  const responseBody = response.body ?? "";

  const record: CaptureRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    replayOf: response.replayOf ?? null,
    method: replay.method.toUpperCase(),
    targetUrl: replay.targetUrl,
    path: replay.path,
    statusCode: response.statusCode,
    durationMs: response.durationMs,
    request: {
      headers: redactHeaders(replay.headers),
      body: redactBody(replay.body, requestContentType),
      size: replay.body ? Buffer.byteLength(replay.body) : 0,
    },
    response: {
      headers: redactHeaders(response.headers),
      body: redactBody(responseBody, responseContentType),
      size: Buffer.byteLength(responseBody),
    },
  };

  store.add(record, replay);
  return record;
};

const proxyToTarget = async (
  fetchImpl: FetchImpl,
  replay: ReplaySource
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> => {
  const upstream = await fetchImpl(replay.targetUrl, {
    method: replay.method.toUpperCase(),
    headers: replay.headers,
    body:
      replay.method === "GET" || replay.method === "HEAD" ? undefined : replay.body,
  });

  const headers: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    statusCode: upstream.status,
    headers,
    body: await upstream.text(),
  };
};

const buildReplaySourceFromRequest = (request: {
  method: string;
  params: { "*": string };
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): ReplaySource => {
  const requestQuery = new URL(request.url, "http://localhost");
  const targetFromHeader = request.headers["x-proxylab-target"];
  const targetFromQuery = requestQuery.searchParams.get("target");
  const rawTarget =
    typeof targetFromHeader === "string" ? targetFromHeader : targetFromQuery;

  if (!rawTarget) {
    throw new Error("Missing target URL. Set x-proxylab-target header or target query.");
  }

  const baseTarget = new URL(rawTarget);
  baseTarget.pathname = joinPath(baseTarget.pathname, request.params["*"] ?? "");
  requestQuery.searchParams.forEach((value, key) => {
    if (key !== "target") {
      baseTarget.searchParams.append(key, value);
    }
  });

  return {
    id: randomUUID(),
    method: request.method.toUpperCase(),
    path: `/${request.params["*"] ?? ""}`,
    targetUrl: baseTarget.toString(),
    headers: normalizeHeaders(request.headers),
    body: toRawBody(request.body),
  };
};

export const buildServer = (options: BuildServerOptions = {}) => {
  const app = Fastify({ logger: true });
  const captureStore = options.captureStore ?? new InMemoryCaptureStore();
  const fetchImpl = options.fetchImpl ?? fetch;

  app.get("/health", async () => ({
    status: "ok",
    captures: captureStore.list().length,
  }));

  app.get("/api/captures", async () => ({
    items: captureStore.list(),
  }));

  app.get<{ Params: { id: string } }>("/api/captures/:id", async (request, reply) => {
    const record = captureStore.get(request.params.id);
    if (!record) {
      return reply.code(404).send({ error: "Capture not found" });
    }
    return { item: record };
  });

  app.get<{ Params: { id: string } }>(
    "/api/captures/:id/snippets",
    async (request, reply) => {
      const record = captureStore.get(request.params.id);
      if (!record) {
        return reply.code(404).send({ error: "Capture not found" });
      }

      return {
        curl: createCurlSnippet(record),
        fetch: createFetchSnippet(record),
      };
    }
  );

  app.post<{ Body: ReplayRequest }>("/api/replay", async (request, reply) => {
    const payload = request.body;
    if (!payload?.id) {
      return reply.code(400).send({ error: "Replay id is required" });
    }

    const source = captureStore.getReplaySource(payload.id);
    if (!source) {
      return reply.code(404).send({ error: "Capture not found" });
    }

    const replay: ReplaySource = {
      ...source,
      method: payload.overrides?.method?.toUpperCase() ?? source.method,
      targetUrl: payload.overrides?.targetUrl ?? source.targetUrl,
      headers: { ...source.headers, ...(payload.overrides?.headers ?? {}) },
      body:
        payload.overrides?.body === null
          ? undefined
          : payload.overrides?.body ?? source.body,
    };

    const started = Date.now();
    const upstream = await proxyToTarget(fetchImpl, replay);
    const durationMs = Date.now() - started;
    const record = withCapture(captureStore, replay, {
      statusCode: upstream.statusCode,
      headers: upstream.headers,
      body: upstream.body,
      durationMs,
      replayOf: payload.id,
    });

    return {
      item: record,
    };
  });

  app.all<{ Params: { "*": string } }>("/proxy/*", async (request, reply) => {
    let replay: ReplaySource;
    try {
      replay = buildReplaySourceFromRequest({
        method: request.method,
        params: request.params,
        url: request.url,
        headers: request.headers,
        body: request.body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid target URL";
      return reply.code(400).send({ error: message });
    }

    const started = Date.now();

    try {
      const upstream = await proxyToTarget(fetchImpl, replay);
      const durationMs = Date.now() - started;
      withCapture(captureStore, replay, {
        statusCode: upstream.statusCode,
        headers: upstream.headers,
        body: upstream.body,
        durationMs,
      });

      reply.code(upstream.statusCode);
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (!hopByHopHeaders.has(key.toLowerCase())) {
          reply.header(key, value);
        }
      }
      return reply.send(upstream.body);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Failed to reach target API" });
    }
  });

  return app;
};

const registerStatic = async (app: ReturnType<typeof buildServer>) => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const webDist = join(currentDir, "../../dist/web");

  if (process.env.NODE_ENV === "production" && existsSync(webDist)) {
    const { default: fastifyStatic } = await import("@fastify/static");
    app.register(fastifyStatic, { root: webDist });
  }
};

const start = async () => {
  const app = buildServer();
  await registerStatic(app);
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  void start();
}

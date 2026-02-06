import type { CaptureRecord } from "./types.js";

const escapeShell = (value: string): string => value.replace(/'/g, `'\\''`);

const escapeJs = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");

export const createCurlSnippet = (capture: CaptureRecord): string => {
  const headerFlags = Object.entries(capture.request.headers)
    .map(([key, value]) => `-H '${escapeShell(`${key}: ${value}`)}'`)
    .join(" ");

  const bodyPart = capture.request.body
    ? ` \\\n  --data '${escapeShell(capture.request.body)}'`
    : "";

  return `curl -X ${capture.method.toUpperCase()} '${escapeShell(capture.targetUrl)}'${
    headerFlags ? ` \\\n  ${headerFlags}` : ""
  }${bodyPart}`;
};

export const createFetchSnippet = (capture: CaptureRecord): string => {
  const headers = JSON.stringify(capture.request.headers, null, 2);
  const body = capture.request.body
    ? `,\n  body: \`${escapeJs(capture.request.body)}\``
    : "";

  return `await fetch(${JSON.stringify(capture.targetUrl)}, {\n  method: ${JSON.stringify(
    capture.method.toUpperCase()
  )},\n  headers: ${headers}${body}\n});`;
};

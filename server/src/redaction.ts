const REDACTION_TOKEN = "[REDACTED]";

const sensitiveHeaderPatterns = [
  /authorization/i,
  /cookie/i,
  /token/i,
  /api[-_]?key/i,
  /secret/i,
];

const sensitiveFieldPattern =
  /(token|secret|password|authorization|api[-_]?key|session|cookie)/i;

export const redactHeaders = (
  headers: Record<string, string | undefined>
): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }

    const shouldRedact = sensitiveHeaderPatterns.some((pattern) =>
      pattern.test(key)
    );
    result[key] = shouldRedact ? REDACTION_TOKEN : value;
  }

  return result;
};

const redactJsonObject = (value: unknown, parentKey = ""): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonObject(item, parentKey));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(record)) {
      if (sensitiveFieldPattern.test(key) || sensitiveFieldPattern.test(parentKey)) {
        copy[key] = REDACTION_TOKEN;
      } else {
        copy[key] = redactJsonObject(nested, key);
      }
    }

    return copy;
  }

  if (typeof value === "string" && sensitiveFieldPattern.test(parentKey)) {
    return REDACTION_TOKEN;
  }

  return value;
};

const redactText = (body: string): string =>
  body
    .replace(/(bearer\s+)[^\s"']+/gi, `$1${REDACTION_TOKEN}`)
    .replace(
      /(["']?(token|secret|password|api[_-]?key)["']?\s*[:=]\s*["'])[^"']*(["'])/gi,
      `$1${REDACTION_TOKEN}$3`
    );

export const redactBody = (
  body: string | undefined,
  contentType: string | undefined
): string | null => {
  if (!body || body.length === 0) {
    return null;
  }

  const isJsonContentType =
    typeof contentType === "string" && contentType.includes("application/json");

  if (isJsonContentType) {
    try {
      const parsed = JSON.parse(body) as unknown;
      return JSON.stringify(redactJsonObject(parsed), null, 2);
    } catch {
      return redactText(body);
    }
  }

  return redactText(body);
};

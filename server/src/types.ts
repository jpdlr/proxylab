export interface CapturePayload {
  headers: Record<string, string>;
  body: string | null;
  size: number;
}

export interface CaptureRecord {
  id: string;
  createdAt: string;
  replayOf: string | null;
  method: string;
  targetUrl: string;
  path: string;
  statusCode: number;
  durationMs: number;
  request: CapturePayload;
  response: CapturePayload;
}

export interface ReplayRequest {
  id: string;
  overrides?: {
    method?: string;
    targetUrl?: string;
    headers?: Record<string, string>;
    body?: string | null;
  };
}

export interface ReplaySource {
  id: string;
  method: string;
  targetUrl: string;
  path: string;
  headers: Record<string, string>;
  body: string | undefined;
}

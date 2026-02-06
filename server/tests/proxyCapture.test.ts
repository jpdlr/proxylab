import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/index";

const apps: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(
    apps.splice(0).map(async (app) => {
      await app.close();
    })
  );
});

describe("proxy capture flow", () => {
  it("captures redacted request data and supports replay", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const outgoingHeaders = new Headers(init?.headers);
      const outgoingBody = typeof init?.body === "string" ? init.body : "";

      return new Response(
        JSON.stringify({
          ok: true,
          receivedBody: outgoingBody ? JSON.parse(outgoingBody) : null,
          authHeader: outgoingHeaders.get("authorization"),
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-upstream": "mock",
          },
        }
      );
    });

    const app = buildServer({ fetchImpl: fetchMock as typeof fetch });
    apps.push(app);

    const proxyResponse = await app.inject({
      method: "POST",
      url: "/proxy/v1/messages?target=https%3A%2F%2Fapi.example.com",
      headers: {
        authorization: "Bearer very-secret-token",
        "content-type": "application/json",
      },
      payload: {
        prompt: "hello",
        apiKey: "sk-live-key",
      },
    });

    expect(proxyResponse.statusCode).toBe(200);
    expect(proxyResponse.json()).toEqual({
      ok: true,
      receivedBody: {
        prompt: "hello",
        apiKey: "sk-live-key",
      },
      authHeader: "Bearer very-secret-token",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/captures",
    });

    expect(listResponse.statusCode).toBe(200);
    const listPayload = listResponse.json() as {
      items: Array<{
        id: string;
        request: { headers: Record<string, string>; body: string | null };
      }>;
    };
    expect(listPayload.items).toHaveLength(1);

    const captured = listPayload.items[0];
    expect(captured.request.headers.authorization).toBe("[REDACTED]");
    expect(captured.request.body).toContain('"apiKey": "[REDACTED]"');

    const snippetsResponse = await app.inject({
      method: "GET",
      url: `/api/captures/${captured.id}/snippets`,
    });
    expect(snippetsResponse.statusCode).toBe(200);
    expect(snippetsResponse.json()).toEqual(
      expect.objectContaining({
        curl: expect.stringContaining("curl -X POST"),
        fetch: expect.stringContaining("await fetch"),
      })
    );

    const replayResponse = await app.inject({
      method: "POST",
      url: "/api/replay",
      payload: {
        id: captured.id,
      },
    });
    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.json()).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({ replayOf: captured.id }),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const updatedList = await app.inject({
      method: "GET",
      url: "/api/captures",
    });
    expect((updatedList.json() as { items: unknown[] }).items).toHaveLength(2);
  });
});

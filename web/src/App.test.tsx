import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const baseCaptures = [
  {
    id: "capture-1",
    createdAt: "2026-02-01T15:00:00.000Z",
    replayOf: null,
    method: "POST",
    targetUrl: "https://api.example.com/v1/messages",
    path: "/v1/messages",
    statusCode: 200,
    durationMs: 24,
    request: {
      headers: { "content-type": "application/json" },
      body: '{"prompt":"hello"}',
      size: 18,
    },
    response: {
      headers: { "content-type": "application/json" },
      body: '{"ok":true}',
      size: 10,
    },
  },
];

const makeJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("App", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/health")) {
        return makeJsonResponse({ status: "ok", captures: 1 });
      }
      if (url.endsWith("/api/captures")) {
        return makeJsonResponse({ items: baseCaptures });
      }
      if (url.endsWith("/api/captures/capture-1/snippets")) {
        return makeJsonResponse({
          curl: "curl -X POST 'https://api.example.com/v1/messages'",
          fetch: "await fetch('https://api.example.com/v1/messages')",
        });
      }
      if (url.endsWith("/api/replay") && init?.method === "POST") {
        return makeJsonResponse({ item: { ...baseCaptures[0], replayOf: "capture-1" } });
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
    document.documentElement.dataset.theme = "light";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders captures from the API", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: /proxylab/i });
    await screen.findByRole("button", { name: /replay/i });
    expect(screen.getByText("https://api.example.com/v1/messages")).toBeInTheDocument();
    expect(screen.getByText(/captured requests/i)).toBeInTheDocument();
  });

  it("toggles the theme and replays the selected capture", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: /replay/i });

    await user.click(screen.getByRole("button", { name: /theme:/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(screen.getByRole("button", { name: /replay/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/replay",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });
});

import { useCallback, useEffect, useMemo, useState } from "react";

type ThemeName = "light" | "dark";

interface CapturePayload {
  headers: Record<string, string>;
  body: string | null;
  size: number;
}

interface CaptureRecord {
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

interface CaptureListResponse {
  items: CaptureRecord[];
}

interface HealthResponse {
  status: "ok";
  captures: number;
}

interface SnippetsResponse {
  curl: string;
  fetch: string;
}

const getPreferredTheme = (): ThemeName => {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("proxylab-theme");
  if (stored === "dark" || stored === "light") return stored;
  return "light";
};

const fetchJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const emptySnippets: SnippetsResponse = { curl: "", fetch: "" };

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(() => getPreferredTheme());
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snippets, setSnippets] = useState<SnippetsResponse>(emptySnippets);
  const [searchTerm, setSearchTerm] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReplaying, setIsReplaying] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [healthResult, captureResult] = await Promise.all([
        fetchJson<HealthResponse>("/health"),
        fetchJson<CaptureListResponse>("/api/captures"),
      ]);
      setHealth(healthResult);
      setCaptures(captureResult.items);
      setSelectedId((current) => {
        if (current && captureResult.items.some((item) => item.id === current)) {
          return current;
        }
        return captureResult.items[0]?.id ?? null;
      });
      setError(null);
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Unable to load captures";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("proxylab-theme", theme);
  }, [theme]);

  useEffect(() => {
    void loadData();
    const handle = window.setInterval(() => {
      void loadData();
    }, 5000);
    return () => window.clearInterval(handle);
  }, [loadData]);

  useEffect(() => {
    const selected = captures.find((item) => item.id === selectedId);
    if (!selected) {
      setSnippets(emptySnippets);
      return;
    }

    let mounted = true;
    void fetchJson<SnippetsResponse>(`/api/captures/${selected.id}/snippets`)
      .then((result) => {
        if (mounted) {
          setSnippets(result);
        }
      })
      .catch(() => {
        if (mounted) {
          setSnippets(emptySnippets);
        }
      });

    return () => {
      mounted = false;
    };
  }, [captures, selectedId]);

  const methods = useMemo(() => {
    const unique = new Set(captures.map((item) => item.method.toUpperCase()));
    return ["ALL", ...Array.from(unique)];
  }, [captures]);

  const filteredCaptures = useMemo(() => {
    return captures.filter((item) => {
      const byMethod =
        methodFilter === "ALL" || item.method.toUpperCase() === methodFilter;
      const bySearch =
        searchTerm.length === 0 ||
        item.targetUrl.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.path.toLowerCase().includes(searchTerm.toLowerCase());
      return byMethod && bySearch;
    });
  }, [captures, methodFilter, searchTerm]);

  const selectedCapture = filteredCaptures.find((item) => item.id === selectedId);
  const activeCapture = selectedCapture ?? filteredCaptures[0] ?? null;

  useEffect(() => {
    if (activeCapture && activeCapture.id !== selectedId) {
      setSelectedId(activeCapture.id);
    }
    if (!activeCapture) {
      setSelectedId(null);
    }
  }, [activeCapture, selectedId]);

  const replayCapture = async (): Promise<void> => {
    if (!activeCapture) return;
    setIsReplaying(true);
    try {
      await fetchJson<{ item: CaptureRecord }>("/api/replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: activeCapture.id }),
      });
      await loadData();
    } finally {
      setIsReplaying(false);
    }
  };

  const healthState = health?.status === "ok" ? "online" : "offline";
  const successRate =
    captures.length === 0
      ? 0
      : Math.round(
          (captures.filter((item) => item.statusCode < 400).length / captures.length) *
            100
        );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Local API Playground</p>
          <h1>Proxylab</h1>
        </div>
        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            Theme: {theme === "light" ? "Light" : "Dark"}
          </button>
          <button className="ghost" type="button" onClick={() => void loadData()}>
            Refresh
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <p>Proxy</p>
          <h2 className={`status-pill ${healthState}`}>{healthState}</h2>
        </article>
        <article className="stat-card">
          <p>Captured requests</p>
          <h2>{health?.captures ?? captures.length}</h2>
        </article>
        <article className="stat-card">
          <p>Success rate</p>
          <h2>{successRate}%</h2>
        </article>
      </section>

      <section className="workspace">
        <aside className="capture-list">
          <div className="list-toolbar">
            <input
              aria-label="Search captures"
              type="search"
              placeholder="Search URL or path"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <select
              aria-label="Filter method"
              value={methodFilter}
              onChange={(event) => setMethodFilter(event.target.value)}
            >
              {methods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          {loading ? <p className="empty">Loading captures...</p> : null}
          {error ? <p className="empty">{error}</p> : null}
          {!loading && filteredCaptures.length === 0 ? (
            <p className="empty">No captures yet. Send traffic through `/proxy/*`.</p>
          ) : null}
          <ul>
            {filteredCaptures.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`capture-item ${item.id === activeCapture?.id ? "active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className={`method ${item.method.toLowerCase()}`}>
                    {item.method}
                  </span>
                  <strong>{item.path}</strong>
                  <span>{item.statusCode}</span>
                  <span>{item.durationMs} ms</span>
                  <time>{formatDate(item.createdAt)}</time>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <article className="capture-detail">
          {!activeCapture ? (
            <p className="empty">Select a request to inspect details.</p>
          ) : (
            <>
              <header className="detail-header">
                <div>
                  <p className="eyebrow">Capture detail</p>
                  <h2>{activeCapture.path}</h2>
                  <p className="muted">{activeCapture.targetUrl}</p>
                </div>
                <button
                  className="primary"
                  type="button"
                  onClick={() => void replayCapture()}
                  disabled={isReplaying}
                >
                  {isReplaying ? "Replaying..." : "Replay"}
                </button>
              </header>

              <div className="detail-grid">
                <section>
                  <h3>Request</h3>
                  <p className="muted">Headers</p>
                  <pre>{JSON.stringify(activeCapture.request.headers, null, 2)}</pre>
                  <p className="muted">Body</p>
                  <pre>{activeCapture.request.body ?? "(empty)"}</pre>
                </section>
                <section>
                  <h3>Response</h3>
                  <p className="muted">Headers</p>
                  <pre>{JSON.stringify(activeCapture.response.headers, null, 2)}</pre>
                  <p className="muted">Body</p>
                  <pre>{activeCapture.response.body ?? "(empty)"}</pre>
                </section>
              </div>

              <section>
                <h3>Snippets</h3>
                <p className="muted">curl</p>
                <pre>{snippets.curl || "No snippet available."}</pre>
                <p className="muted">fetch</p>
                <pre>{snippets.fetch || "No snippet available."}</pre>
              </section>
            </>
          )}
        </article>
      </section>
    </div>
  );
}

// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGitHub, type FakeFile } from "@/test/fake-github";
import { createTestDb } from "@/test/test-db";
import { handleBadgeRequest } from "./badge";
import type { FetchLike } from "./github-client";
import { clientIp, handleScanRequest, type ScanDeps } from "./http";
import { RateLimiter } from "./rate-limit";
import { ReportStore } from "./report-store";
import type { ReportView } from "./report-view";
import { MAX_TOKEN_LENGTH, verifyTurnstile } from "./turnstile";

const SECRET = "turnstile-secret-value";
const mcpFile = (spec: string): FakeFile => ({
  path: ".mcp.json",
  content: JSON.stringify({ mcpServers: { demo: { command: "npx", args: ["-y", spec] } } }),
});

type World = {
  advisories?: string[];
  registryDown?: boolean;
  turnstile?: "pass" | "fail" | "down" | "bad-secret";
};

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let store: ReportStore;
let outbound: Array<{ url: string; body: string }>;

function network(files: FakeFile[], world: World = {}): FetchLike {
  const github = fakeGitHub([{ owner: "acme", name: "app", files }]);
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

  return async (url, init) => {
    const { hostname, pathname } = new URL(url);
    if (hostname === "api.github.com" || hostname === "raw.githubusercontent.com") {
      return github.fetch(url, init);
    }
    outbound.push({ url, body: typeof init.body === "string" ? init.body : "" });

    if (hostname === "challenges.cloudflare.com") {
      if (world.turnstile === "down") throw new TypeError("network down");
      if (world.turnstile === "bad-secret") {
        return json({ success: false, "error-codes": ["invalid-input-secret"] });
      }
      return world.turnstile === "fail"
        ? json({ success: false, "error-codes": ["invalid-input-response"] })
        : json({ success: true });
    }
    if (world.registryDown) return json({}, 503);
    if (hostname === "registry.npmjs.org") {
      return json({ version: "1.0.0", time: { created: "2020-01-01T00:00:00.000Z" } });
    }
    if (hostname === "api.osv.dev" && pathname === "/v1/querybatch") {
      const ids = world.advisories ?? [];
      return json({ results: [ids.length ? { vulns: ids.map((id) => ({ id })) } : {}] });
    }
    if (hostname === "api.osv.dev") return json({ id: pathname.split("/").pop() });
    throw new Error(`Unexpected host: ${hostname}`);
  };
}

const deps = (fetchImpl: FetchLike, overrides: Partial<ScanDeps> = {}) => {
  const limiter = new RateLimiter(testDb.db, "test-secret");
  return (): ScanDeps => ({ store, limiter, fetch: fetchImpl, ...overrides });
};

const post = (body: unknown, accept = "application/json") =>
  new Request("http://localhost:3000/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json", accept, "x-forwarded-for": "203.0.113.20" },
    body: JSON.stringify(body),
  });

const URL_ = "https://github.com/acme/app";

async function scan(fetchImpl: FetchLike): Promise<ReportView> {
  const response = await handleScanRequest(post({ url: URL_ }), deps(fetchImpl));
  return ((await response.json()) as { report: ReportView }).report;
}

beforeAll(async () => {
  testDb = await createTestDb();
  store = new ReportStore(testDb.db);
});

afterAll(async () => {
  await testDb.client.close();
});

beforeEach(async () => {
  await testDb.reset();
  outbound = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("package checks in a scan", () => {
  it("adds results to the report", async () => {
    const report = await scan(network([mcpFile("some-tool@1.0.0")]));
    expect(report.packages?.checks[0]).toMatchObject({
      name: "some-tool",
      version: "1.0.0",
      verdict: "no_known_issues",
      references: [{ path: ".mcp.json", line: 1 }],
    });
  });

  it("makes a malicious package Dangerous, including on the badge", async () => {
    const report = await scan(
      network([mcpFile("some-tool@1.0.0")], { advisories: ["MAL-2026-5"] }),
    );
    expect(report.status).toBe("dangerous");
    expect(report.packages?.checks[0]?.verdict).toBe("malicious");

    const badge = await handleBadgeRequest(report.id, deps(network([])), "https://x.example");
    expect(await badge.text()).toContain("Dangerous");
    const stored = await store.findById(report.id);
    expect(stored?.packageChecks?.checks[0]?.advisories).toEqual(["MAL-2026-5"]);
  });

  it("does not fail the scan when lookups fail", async () => {
    const response = await handleScanRequest(
      post({ url: URL_ }),
      deps(network([mcpFile("some-tool@1.0.0")], { registryDown: true })),
    );
    expect(response.status).toBe(201);
    const { report } = (await response.json()) as { report: ReportView };
    expect(report.packages?.checks[0]?.verdict).toBe("unavailable");
  });

  it("reports the package stage only when there are packages", async () => {
    const read = async (files: FakeFile[]) => {
      await testDb.reset();
      const response = await handleScanRequest(
        post({ url: URL_ }, "application/x-ndjson"),
        deps(network(files)),
      );
      return (await response.text()).includes('"stage":"packages"');
    };
    expect(await read([mcpFile("some-tool@1.0.0")])).toBe(true);
    expect(await read([{ path: "CLAUDE.md", content: "# notes" }])).toBe(false);
  });

  it("makes no package requests for a repo without packages", async () => {
    await scan(network([{ path: "CLAUDE.md", content: "# notes" }]));
    expect(outbound).toEqual([]);
  });

  it("sends only names and versions, and stores no file content", async () => {
    const content = JSON.stringify({
      mcpServers: {
        demo: {
          command: "npx",
          args: ["-y", "some-tool@1.0.0"],
          env: { SECRET_VALUE: "PRIVATEMARKER" },
        },
      },
    });
    await scan(network([{ path: ".mcp.json", content }]));
    expect(JSON.stringify(outbound)).not.toContain("PRIVATEMARKER");
    expect(JSON.stringify(outbound)).not.toContain("acme");
    expect(await testDb.dump()).not.toContain("PRIVATEMARKER");
  });

  it("reuses fresh results for a cached report", async () => {
    const files = [mcpFile("some-tool@1.0.0")];
    await scan(network(files));
    outbound = [];
    await scan(network(files));
    expect(outbound).toEqual([]);
  });

  it("refreshes results older than a day", async () => {
    const files = [mcpFile("some-tool@1.0.0")];
    const first = await scan(network(files));
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 25 * 60 * 60 * 1000 });

    const second = await scan(network(files, { advisories: ["MAL-2026-6"] }));
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("dangerous");
    expect((await store.findById(first.id))?.packageChecks?.checks[0]?.verdict).toBe("malicious");
  });

  it("keeps the last result when a refresh fails", async () => {
    const files = [mcpFile("some-tool@1.0.0")];
    const first = await scan(network(files, { advisories: ["MAL-2026-7"] }));
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 25 * 60 * 60 * 1000 });

    const second = await scan(network(files, { registryDown: true }));
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("dangerous");
    expect(second.packages?.checks[0]?.verdict).toBe("malicious");
  });
});

describe("hosting request budget", () => {
  const manyFiles = (): FakeFile[] => [
    mcpFile("some-tool@1.0.0"),
    {
      path: ".claude/settings.json",
      content: JSON.stringify({
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: "./setup.sh" }] }] },
      }),
    },
    { path: "setup.sh", content: "echo ready" },
    ...Array.from({ length: 120 }, (_, index) => ({
      path: `.claude/skills/a/b/c/skill-${index}.md`,
      content: "# notes",
    })),
  ];

  it("finishes a large repo within the limit", async () => {
    let requests = 0;
    const base = network(manyFiles());
    const counted: FetchLike = (url, init) => {
      requests += 1;
      return base(url, init);
    };
    const response = await handleScanRequest(
      post({ url: URL_ }),
      deps(counted, { subrequestLimit: 45 }),
    );
    expect(response.status).toBe(201);
    expect(requests).toBeLessThanOrEqual(45);

    const { report } = (await response.json()) as { report: ReportView };
    expect(report.filesScanned).toBeLessThan(40);
    expect(report.packages?.checks[0]?.verdict).toBe("no_known_issues");
    expect(report.skipped.some((s) => s.path === "." && s.reason.includes("hosting limit"))).toBe(
      true,
    );
  });

  it("reads hooks and configurations first", async () => {
    const response = await handleScanRequest(
      post({ url: URL_ }),
      deps(network(manyFiles()), { subrequestLimit: 45 }),
    );
    const { report } = (await response.json()) as { report: ReportView };
    const notRead = report.skipped.map((entry) => entry.path);
    expect(notRead).not.toContain(".mcp.json");
    expect(notRead).not.toContain(".claude/settings.json");
    expect(notRead).not.toContain("setup.sh");
    expect(report.findings.some((finding) => finding.ruleId === "AUTO-001")).toBe(true);
  });

  it("does not limit a small repo", async () => {
    const response = await handleScanRequest(
      post({ url: URL_ }),
      deps(network([mcpFile("some-tool@1.0.0")]), { subrequestLimit: 45 }),
    );
    const { report } = (await response.json()) as { report: ReportView };
    expect(report.skipped).toEqual([]);
  });

  it("has no limit unless one is configured", async () => {
    const response = await handleScanRequest(post({ url: URL_ }), deps(network(manyFiles())));
    const { report } = (await response.json()) as { report: ReportView };
    expect(report.filesScanned).toBeGreaterThan(100);
  });
});

describe("client IP", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/scan", { headers });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses only Cloudflare's header on Workers", () => {
    vi.stubEnv("DEPLOY_TARGET", "cloudflare");
    expect(
      clientIp(
        request({
          "cf-connecting-ip": "198.51.100.7",
          "x-forwarded-for": "203.0.113.1",
          "x-real-ip": "203.0.113.2",
        }),
      ),
    ).toBe("198.51.100.7");
  });

  it("ignores spoofable headers on Workers", () => {
    vi.stubEnv("DEPLOY_TARGET", "cloudflare");
    expect(
      clientIp(request({ "x-forwarded-for": "203.0.113.1", "x-real-ip": "203.0.113.2" })),
    ).toBe("unknown");
  });

  it("does not trust Cloudflare's header elsewhere", () => {
    expect(clientIp(request({ "cf-connecting-ip": "198.51.100.7" }))).toBe("unknown");
  });
});

describe("Turnstile", () => {
  const files = [{ path: "CLAUDE.md", content: "# notes" }];
  const guarded = (world: World) => deps(network(files, world), { turnstileSecret: SECRET });
  const expectBlocked = async (response: Response) => {
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bot_check_failed");
  };

  it("is off without a secret", async () => {
    const response = await handleScanRequest(post({ url: URL_ }), deps(network(files)));
    expect(response.status).toBe(201);
    expect(outbound).toEqual([]);
  });

  it("requires a token when a secret is set", async () => {
    await expectBlocked(await handleScanRequest(post({ url: URL_ }), guarded({})));
    expect(outbound).toEqual([]);
  });

  it("accepts a valid token", async () => {
    const response = await handleScanRequest(
      post({ url: URL_, turnstileToken: "good-token" }),
      guarded({ turnstile: "pass" }),
    );
    expect(response.status).toBe(201);
  });

  it("rejects an invalid token before contacting GitHub", async () => {
    const fetchSpy = vi.fn(network(files, { turnstile: "fail" }));
    const response = await handleScanRequest(
      post({ url: URL_, turnstileToken: "bad-token" }),
      deps(fetchSpy, { turnstileSecret: SECRET }),
    );
    await expectBlocked(response);
    const hosts = fetchSpy.mock.calls.map(([url]) => new URL(url).hostname);
    expect(hosts).toEqual(["challenges.cloudflare.com"]);
  });

  it.each([123, "", "x".repeat(MAX_TOKEN_LENGTH + 1), ["token"]])(
    "rejects the malformed token %#",
    async (turnstileToken) => {
      const response = await handleScanRequest(
        post({ url: URL_, turnstileToken }),
        guarded({ turnstile: "pass" }),
      );
      expect(response.status).toBe(403);
      expect(outbound).toEqual([]);
    },
  );

  it("still rejects other extra fields", async () => {
    const response = await handleScanRequest(
      post({ url: URL_, turnstileToken: "token", admin: true }),
      guarded({ turnstile: "pass" }),
    );
    expect(response.status).toBe(400);
  });

  it("keeps scans running during a Cloudflare outage and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleScanRequest(
      post({ url: URL_, turnstileToken: "token" }),
      guarded({ turnstile: "down" }),
    );
    expect(response.status).toBe(201);
    expect(log.mock.calls.flat().join("")).toContain("turnstile_unavailable");
  });

  it("does not block visitors because of a wrong secret, and never logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await verifyTurnstile(
      "token",
      SECRET,
      network(files, { turnstile: "bad-secret" }),
    );
    expect(result).toBe("unavailable");
    expect(log.mock.calls.flat().join("")).toContain("invalid-input-secret");
    expect(log.mock.calls.flat().join("")).not.toContain(SECRET);
  });

  it("does not send the visitor's IP address", async () => {
    await handleScanRequest(
      post({ url: URL_, turnstileToken: "token" }),
      guarded({ turnstile: "pass" }),
    );
    expect(outbound[0]?.body).not.toContain("203.0.113.20");
    expect(outbound[0]?.body).not.toContain("remoteip");
  });
});

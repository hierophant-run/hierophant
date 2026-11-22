// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGitHub, type FakeFile } from "@/test/fake-github";
import { createTestDb } from "@/test/test-db";
import { badgeAlt, badgeMarkdown, handleBadgeRequest, renderBadge } from "./badge";
import { handleScanRequest, type ScanDeps } from "./http";
import { errorName, logError } from "./log";
import { RateLimiter } from "./rate-limit";
import { ReportStore } from "./report-store";
import type { ReportView } from "./report-view";
import { buildSecurityTxt, SECURITY_TXT_EXPIRES } from "./security-txt";

const SITE = "https://hierophant.example";
const hook: FakeFile = {
  path: ".claude/settings.json",
  content: JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "./setup.sh" }] }] },
  }),
};

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let store: ReportStore;

const deps = (overrides: Partial<ScanDeps> = {}) => {
  const github = fakeGitHub([{ owner: "acme", name: "app", files: [hook] }]);
  return (): ScanDeps => ({
    store,
    limiter: new RateLimiter(testDb.db, "test-secret"),
    fetch: github.fetch,
    ...overrides,
  });
};

async function createReport(): Promise<ReportView> {
  const request = new Request("http://localhost:3000/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://github.com/acme/app" }),
  });
  const response = await handleScanRequest(request, deps());
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
});

describe("badge", () => {
  const base = {
    rulesetVersion: "0.3.0",
    commitSha: "abcdef1234567890",
    reportUrl: `${SITE}/r/${"A".repeat(22)}`,
  };

  it.each([
    ["dangerous", "Dangerous"],
    ["needs_review", "Needs review"],
    ["no_issues_found", "No issues found"],
  ] as const)("shows the real status for %s", (status, label) => {
    const svg = renderBadge({ ...base, status });
    expect(svg).toContain("Checked by Hierophant");
    expect(svg).toContain(`${label} · v0.3.0 · abcdef1`);
    expect(svg).toContain(`href="${base.reportUrl}"`);
    expect(svg).not.toMatch(/\b(?:safe|secure|clean|verified|passed)\b/i);
  });

  it("escapes values placed in the SVG", () => {
    const svg = renderBadge({
      ...base,
      status: "dangerous",
      rulesetVersion: `"><script>alert(1)</script>`,
      reportUrl: `${SITE}/r/"><script>`,
    });
    expect(svg).not.toContain("<script");
  });

  it("serves a stored report with restrictive headers", async () => {
    const report = await createReport();
    const response = await handleBadgeRequest(report.id, deps(), SITE);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const svg = await response.text();
    expect(svg).toContain("Needs review");
    expect(svg).toContain(`${SITE}/r/${report.id}`);
  });

  it("does not show a status for a missing or invalid report", async () => {
    for (const id of ["Z".repeat(22), "' or 1=1 --"]) {
      const response = await handleBadgeRequest(id, deps(), SITE);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toContain("Report not found");
    }
  });

  it("hides database errors", async () => {
    const failing = Object.create(store) as ReportStore;
    failing.findById = async () => {
      throw new Error("connect failed postgresql://user:password@db.example/neondb");
    };
    const response = await handleBadgeRequest("A".repeat(22), deps({ store: failing }), SITE);
    expect(response.status).toBe(503);
    const svg = await response.text();
    expect(svg).toContain("Unavailable");
    expect(svg).not.toContain("password");
  });

  it("gives Markdown that links to the report", () => {
    const id = "A".repeat(22);
    expect(badgeMarkdown(id, SITE)).toBe(
      `[![Checked by Hierophant](${SITE}/api/badge/${id})](${SITE}/r/${id})`,
    );
    expect(badgeAlt("needs_review", "0.3.0")).toContain("Needs review");
  });
});

describe("security.txt", () => {
  it("has the required fields and a future expiry", () => {
    const text = buildSecurityTxt("security@example.com", SITE);
    expect(text).toContain("Contact: mailto:security@example.com");
    expect(text).toContain(`Expires: ${SECURITY_TXT_EXPIRES}`);
    expect(text).toContain(`Canonical: ${SITE}/.well-known/security.txt`);
    expect(new Date(SECURITY_TXT_EXPIRES).getTime()).toBeGreaterThan(
      new Date("2026-11-22").getTime(),
    );
  });
});

describe("error logs", () => {
  it("writes one JSON line with fixed fields", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("api_error", { route: "scan", status: 503 });
    const entry = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: "error", event: "api_error", route: "scan", status: 503 });
    spy.mockRestore();
  });

  it("never logs a failure's message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = Object.create(store) as ReportStore;
    failing.findByCommit = async () => {
      throw new Error("connect failed postgresql://user:password@db.example/neondb");
    };
    const request = new Request("http://localhost:3000/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ url: "https://github.com/acme/app" }),
    });
    const response = await handleScanRequest(
      request,
      deps({ store: failing, githubToken: "tok-x" }),
    );
    expect(response.status).toBe(503);

    const output = spy.mock.calls.flat().join("\n");
    expect(output).toContain("database_unavailable");
    expect(output).not.toMatch(/password|203\.0\.113\.9|tok-x|acme/);
    spy.mockRestore();
  });

  it("names only the error type", () => {
    expect(errorName(new TypeError("secret detail"))).toBe("TypeError");
    expect(errorName("secret detail")).toBe("unknown");
  });
});

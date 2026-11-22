// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeGitHub, type FakeFile, type FakeRepo } from "@/test/fake-github";
import { createTestDb } from "@/test/test-db";
import type { FetchLike } from "./github-client";
import { handleFeedbackRequest, handleScanRequest, type ScanDeps } from "./http";
import { FEEDBACK_LIMITS, RateLimiter } from "./rate-limit";
import { ReportStore } from "./report-store";
import type { ReportView } from "./report-view";

const URL_ = "https://github.com/acme/app";
const TOKEN = "test-token-value";

const hook: FakeFile = {
  path: ".claude/settings.json",
  content: JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "./setup.sh" }] }] },
  }),
};
const repoWith = (files: FakeFile[], extra: Partial<FakeRepo> = {}): FakeRepo => ({
  owner: "acme",
  name: "app",
  files,
  ...extra,
});

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let store: ReportStore;

function deps(fetchImpl: FetchLike, overrides: Partial<ScanDeps> = {}): () => ScanDeps {
  const limiter = new RateLimiter(testDb.db, "test-secret");
  return () => ({ store, limiter, fetch: fetchImpl, githubToken: TOKEN, ...overrides });
}

const postScan = (headers: Record<string, string> = {}, url = URL_) =>
  new Request("http://localhost:3000/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson", ...headers },
    body: JSON.stringify({ url }),
  });

const postFeedback = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000/api/reports/${id}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

type StreamEvent = {
  type: string;
  stage?: string;
  done?: number;
  total?: number;
  report?: ReportView;
  error?: { code: string; message: string };
};

async function readStream(response: Response): Promise<StreamEvent[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StreamEvent);
}

async function createReport(files: FakeFile[] = [hook]): Promise<ReportView> {
  const github = fakeGitHub([repoWith(files)]);
  const response = await handleScanRequest(postScan(), deps(github.fetch));
  const events = await readStream(response);
  return events.find((event) => event.type === "result")!.report!;
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

describe("streamed scan", () => {
  it("reports each real stage in order and ends with the result", async () => {
    const github = fakeGitHub([repoWith([hook, { path: "CLAUDE.md", content: "# ok" }])]);
    const response = await handleScanRequest(postScan(), deps(github.fetch));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const events = await readStream(response);
    const stages = [...new Set(events.flatMap((event) => (event.stage ? [event.stage] : [])))];
    expect(stages).toEqual(["repository", "listing", "downloading", "scanning", "saving"]);

    const downloads = events.filter((event) => event.stage === "downloading");
    expect(downloads.at(0)).toMatchObject({ done: 0, total: 2 });
    expect(downloads.at(-1)).toMatchObject({ done: 2, total: 2 });
    expect(events.at(-1)?.type).toBe("result");
    expect(events.at(-1)?.report?.findings[0]?.position).toBe(0);
  });

  it("skips download stages for a cached report", async () => {
    await createReport();
    const github = fakeGitHub([repoWith([hook])]);
    const events = await readStream(await handleScanRequest(postScan(), deps(github.fetch)));
    expect(events.some((event) => event.stage === "downloading")).toBe(false);
    expect(events.at(-1)?.type).toBe("result");
  });

  it("sends a failure as a final event without internal detail", async () => {
    const secret = "postgresql://user:password@db.example/neondb";
    const failing = Object.create(store) as ReportStore;
    failing.findByCommit = async () => {
      throw new Error(`connect failed ${secret}`);
    };
    const github = fakeGitHub([repoWith([hook])]);
    const response = await handleScanRequest(postScan(), deps(github.fetch, { store: failing }));

    const events = await readStream(response);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: { code: "database_unavailable" },
    });
    expect(JSON.stringify(events)).not.toContain("password");
  });

  it("reports a missing repository in the stream", async () => {
    const events = await readStream(
      await handleScanRequest(postScan(), deps(fakeGitHub([]).fetch)),
    );
    expect(events.at(-1)?.error?.code).toBe("repo_not_found");
  });

  it("rejects bad input before streaming", async () => {
    const github = fakeGitHub([]);
    const response = await handleScanRequest(
      postScan({}, "https://evil.example/a/b"),
      deps(github.fetch),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(github.calls).toHaveLength(0);
  });

  it("keeps plain JSON for clients that do not ask for a stream", async () => {
    const github = fakeGitHub([repoWith([hook])]);
    const response = await handleScanRequest(
      postScan({ accept: "application/json" }),
      deps(github.fetch),
    );
    expect(response.status).toBe(201);
    expect(((await response.json()) as { report: ReportView }).report.id).toBeTruthy();
  });

  it("survives the browser disconnecting mid-scan", async () => {
    const github = fakeGitHub([repoWith([hook])]);
    const response = await handleScanRequest(postScan(), deps(github.fetch));
    const reader = response.body!.getReader();
    await reader.read();
    await expect(reader.cancel()).resolves.toBeUndefined();
  });
});

describe("POST /api/reports/:id/feedback", () => {
  const countRows = async () => {
    const { rows } = await testDb.client.query<{ reason: string; count: number }>(
      "select reason, count from finding_feedback order by reason",
    );
    return rows;
  };

  it("counts a report per reason", async () => {
    const report = await createReport();
    const getDeps = deps(fakeGitHub([]).fetch);
    const body = { position: 0, reason: "expected_behavior" };

    expect(
      (await handleFeedbackRequest(postFeedback(report.id, body), report.id, getDeps)).status,
    ).toBe(201);
    await handleFeedbackRequest(postFeedback(report.id, body), report.id, getDeps);
    await handleFeedbackRequest(
      postFeedback(report.id, { position: 0, reason: "not_a_risk" }),
      report.id,
      getDeps,
    );

    expect(await countRows()).toEqual([
      { reason: "expected_behavior", count: 2 },
      { reason: "not_a_risk", count: 1 },
    ]);
  });

  it("stores no visitor data or free text", async () => {
    const report = await createReport();
    await handleFeedbackRequest(
      postFeedback(
        report.id,
        { position: 0, reason: "wrong_location" },
        { "x-forwarded-for": "203.0.113.55" },
      ),
      report.id,
      deps(fakeGitHub([]).fetch),
    );
    expect(await testDb.dump()).not.toContain("203.0.113.55");
  });

  it.each([
    ["an unknown reason", { position: 0, reason: "because" }],
    ["a prototype key as reason", { position: 0, reason: "constructor" }],
    ["a negative position", { position: -1, reason: "not_a_risk" }],
    ["a fractional position", { position: 0.5, reason: "not_a_risk" }],
    ["a string position", { position: "0", reason: "not_a_risk" }],
    ["extra fields", { position: 0, reason: "not_a_risk", note: "free text" }],
    ["a missing reason", { position: 0 }],
    ["an array", []],
    ["invalid JSON", "{nope"],
  ])("rejects %s", async (_name, body) => {
    const report = await createReport();
    const response = await handleFeedbackRequest(
      postFeedback(report.id, body),
      report.id,
      deps(fakeGitHub([]).fetch),
    );
    expect(response.status).toBe(400);
    expect(await countRows()).toEqual([]);
  });

  it("returns 404 for a finding or report that does not exist", async () => {
    const report = await createReport();
    const getDeps = deps(fakeGitHub([]).fetch);
    const missingFinding = await handleFeedbackRequest(
      postFeedback(report.id, { position: 99, reason: "not_a_risk" }),
      report.id,
      getDeps,
    );
    const missingReport = await handleFeedbackRequest(
      postFeedback("Z".repeat(22), { position: 0, reason: "not_a_risk" }),
      "Z".repeat(22),
      getDeps,
    );
    const badId = await handleFeedbackRequest(
      postFeedback("nope", { position: 0, reason: "not_a_risk" }),
      "' or 1=1 --",
      getDeps,
    );
    expect([missingFinding.status, missingReport.status, badId.status]).toEqual([404, 404, 404]);
  });

  it("blocks cross-site requests", async () => {
    const report = await createReport();
    const response = await handleFeedbackRequest(
      postFeedback(
        report.id,
        { position: 0, reason: "not_a_risk" },
        { origin: "https://evil.example", host: "localhost:3000", "sec-fetch-site": "cross-site" },
      ),
      report.id,
      deps(fakeGitHub([]).fetch),
    );
    expect(response.status).toBe(403);
    expect(await countRows()).toEqual([]);
  });

  it("has its own rate limit", async () => {
    const report = await createReport();
    const limits = [{ ...FEEDBACK_LIMITS[0]!, max: 1 }];
    const feedbackLimiter = new RateLimiter(testDb.db, "secret", limits, () => 1_000_000);
    const getDeps = deps(fakeGitHub([]).fetch, { feedbackLimiter });
    const send = () =>
      handleFeedbackRequest(
        postFeedback(report.id, { position: 0, reason: "not_a_risk" }),
        report.id,
        getDeps,
      );
    expect((await send()).status).toBe(201);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("is removed along with its report", async () => {
    const report = await createReport();
    await handleFeedbackRequest(
      postFeedback(report.id, { position: 0, reason: "not_a_risk" }),
      report.id,
      deps(fakeGitHub([]).fetch),
    );
    await testDb.client.query("delete from reports where id = $1", [report.id]);
    expect(await countRows()).toEqual([]);
  });
});

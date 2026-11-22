import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goToReport } from "@/components/report/navigation";
import type { ReportView } from "@/server/report-view";
import { Footer } from "./Footer";
import { HowItWorks, WhatWeDontClaim } from "./InfoSections";
import { Navbar } from "./Navbar";
import { NetworkDiagram } from "./NetworkDiagram";
import { ProductGrid } from "./ProductGrid";
import { ScanForm } from "./ScanForm";
import { ScanWidget } from "./ScanWidget";
import { SupportedTools } from "./SupportedTools";

vi.mock("@/components/report/navigation", () => ({ goToReport: vi.fn() }));

const report: ReportView = {
  id: "A".repeat(22),
  repository: { owner: "acme", name: "app", url: "https://github.com/acme/app" },
  commit: { sha: "a".repeat(40), shortSha: "aaaaaaa", url: "https://github.com/acme/app/commit/a" },
  scannedAt: "2026-11-22T00:00:00.000Z",
  rulesetVersion: "0.3.0",
  status: "needs_review",
  filesScanned: 2,
  noAgentFiles: false,
  impact: [],
  findings: [
    {
      position: 0,
      ruleId: "AUTO-001",
      severity: "medium",
      title: "Agent hook runs when a session starts",
      why: "why",
      fix: "fix",
      path: ".claude/settings.json",
      line: 8,
      permalink: "https://github.com/acme/app/blob/a/.claude/settings.json#L8",
      excerpt: '"command": "./setup.sh"',
    },
  ],
  skipped: [],
  packages: null,
  disclaimer: "These are automated review signals from static checks. They are not a guarantee.",
};

function ndjson(events: unknown[], delayFirst?: Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [index, event] of events.entries()) {
        if (index === events.length - 1 && delayFirst) await delayFirst;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
}

const typeUrl = (value: string) =>
  fireEvent.change(screen.getByLabelText("Public GitHub repository URL"), {
    target: { value },
  });
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Scan" }));

beforeEach(() => {
  vi.mocked(goToReport).mockClear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScanForm", () => {
  it("rejects an invalid URL without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ScanForm />);
    typeUrl("https://evil.example/acme/app");
    submit();
    expect(screen.getByRole("alert").textContent).toContain("public GitHub repository");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the URL, then opens the report page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ndjson([
        { type: "progress", stage: "listing" },
        { type: "result", report },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScanForm />);
    typeUrl(" https://github.com/acme/app ");
    submit();

    await waitFor(() => expect(goToReport).toHaveBeenCalledWith(report.id));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/scan");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://github.com/acme/app" });
  });

  it("shows real progress while scanning", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((done) => (release = done));
    const events = [
      { type: "progress", stage: "downloading", done: 3, total: 12 },
      { type: "result", report },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjson(events, held)));
    render(<ScanForm />);
    typeUrl("https://github.com/acme/app");
    submit();

    expect(await screen.findByText("Reading agent files, 3 of 12")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBe(43);
    release();
    await waitFor(() => expect(goToReport).toHaveBeenCalled());
  });

  it("keeps excerpts in this tab only", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjson([{ type: "result", report }])));
    render(<ScanForm />);
    typeUrl("https://github.com/acme/app");
    submit();
    await waitFor(() => expect(goToReport).toHaveBeenCalled());
    expect(window.sessionStorage.getItem(`hierophant:excerpts:${report.id}`)).toContain("setup.sh");
  });

  it("shows an error sent during the scan", async () => {
    const events = [
      { type: "progress", stage: "repository" },
      { type: "error", error: { code: "scan_timeout", message: "The scan took too long." } },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjson(events)));
    render(<ScanForm />);
    typeUrl("https://github.com/acme/app");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe("The scan took too long.");
    expect(goToReport).not.toHaveBeenCalled();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows the API error message", async () => {
    const body = { error: { code: "repo_not_found", message: "Repository or branch not found." } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 404 })));
    render(<ScanForm />);
    typeUrl("https://github.com/acme/app");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe("Repository or branch not found.");
  });

  it("fails cleanly when the stream ends early", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjson([{ type: "progress", stage: "listing" }])),
    );
    render(<ScanForm />);
    typeUrl("https://github.com/acme/app");
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("could not be completed");
  });

  it("shows a generic message when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed at 10.0.0.1")));
    render(<ScanForm />);
    typeUrl("https://github.com/acme/app");
    submit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("10.0.0.1");
  });

  it("prevents a double submit", async () => {
    let resolve: (value: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((done) => (resolve = done)));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScanForm />);
    typeUrl("https://github.com/acme/app");
    submit();
    const button = await screen.findByRole("button", { name: "Scanning" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(ndjson([{ type: "result", report }]));
    await waitFor(() => expect(goToReport).toHaveBeenCalledTimes(1));
  });
});

describe("ScanWidget", () => {
  it("is labeled as an example and can be dismissed", () => {
    render(<ScanWidget />);
    expect(screen.getByText("Example")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss example scan" }));
    expect(screen.queryByTestId("scan-widget")).toBeNull();
  });
});

describe("landing copy", () => {
  const renderAll = () =>
    render(
      <>
        <Navbar />
        <ProductGrid />
        <SupportedTools />
        <NetworkDiagram />
        <HowItWorks />
        <WhatWeDontClaim />
        <Footer />
      </>,
    );

  it("makes no safety or certainty claims", () => {
    const { container } = renderAll();
    expect(container.textContent).not.toMatch(/\b(?:safe|secure|guaranteed)\b|100%/i);
  });

  it("marks every sample card as an example", () => {
    render(<ProductGrid />);
    expect(screen.getAllByText("Example")).toHaveLength(4);
  });

  it("does not claim a partnership", () => {
    render(<SupportedTools />);
    expect(screen.getByText("Not affiliated with these products.")).toBeTruthy();
  });

  it("has no links to pages that do not exist yet", () => {
    const { container } = renderAll();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(4);
    const pages = [
      "/docs",
      "/docs/rules",
      "/docs/limitations",
      "/privacy",
      "/terms",
      "/report-policy",
    ];
    expect(hrefs.every((href) => href?.startsWith("/#") || pages.includes(href ?? ""))).toBe(true);
  });
});

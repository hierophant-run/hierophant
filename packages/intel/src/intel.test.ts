import type { PackageRef } from "@hierophant/engine";
import { describe, expect, it } from "vitest";
import {
  checkPackages,
  combineStatus,
  packageDisplayName,
  packageSeverity,
  packageUrl,
  summaryToRefs,
  type FetchLike,
  type PackageSummary,
} from "./index.js";

const NOW = new Date("2026-11-22T00:00:00.000Z");
const OLD = "2020-01-01T00:00:00.000Z";
const RECENT = "2026-11-10T00:00:00.000Z";

const ref = (name: string, requested: string | null = null, ecosystem: "npm" | "PyPI" = "npm") =>
  ({ ecosystem, name, requested, path: ".mcp.json", line: 4 }) satisfies PackageRef;

type Advisory = { cwe?: string[]; withdrawn?: string };
type FakeWorld = {
  npm?: Record<
    string,
    { version: string; scripts?: object; deprecated?: string; created?: string }
  >;
  pypi?: Record<string, { version: string; created?: string; yanked?: boolean }>;
  /** Keys are `name` for any version, or `name@version`. */
  osv?: Record<string, string[]>;
  advisories?: Record<string, Advisory>;
  failOsv?: boolean;
};

function fakeFetch(world: FakeWorld) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const parsed = new URL(url);

    if (parsed.hostname === "api.osv.dev") {
      if (world.failOsv) return json({}, 503);
      if (parsed.pathname === "/v1/querybatch") {
        const { queries } = JSON.parse(init.body as string) as {
          queries: Array<{ package: { name: string }; version?: string }>;
        };
        return json({
          results: queries.map(({ package: pkg, version }) => {
            const ids = version
              ? (world.osv?.[`${pkg.name}@${version}`] ?? [])
              : (world.osv?.[pkg.name] ?? []);
            return ids.length ? { vulns: ids.map((id) => ({ id, modified: OLD })) } : {};
          }),
        });
      }
      const id = decodeURIComponent(parsed.pathname.split("/").pop()!);
      const advisory = world.advisories?.[id] ?? {};
      return json({
        id,
        database_specific: { cwe_ids: advisory.cwe ?? [] },
        ...(advisory.withdrawn ? { withdrawn: advisory.withdrawn } : {}),
      });
    }

    if (parsed.hostname === "registry.npmjs.org") {
      const parts = url.slice("https://registry.npmjs.org/".length).split("/");
      const name = decodeURIComponent(parts[0]!);
      const pkg = world.npm?.[name];
      if (!pkg) return json({ error: "Not found" }, 404);
      if (parts.length === 1) return json({ time: { created: pkg.created ?? OLD } });
      const version = decodeURIComponent(parts[1]!);
      if (version !== "latest" && version !== pkg.version) return json("not found", 404);
      return json({ version: pkg.version, scripts: pkg.scripts, deprecated: pkg.deprecated });
    }

    if (parsed.hostname === "pypi.org") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const pkg = world.pypi?.[parts[1]!];
      if (!pkg) return json({ message: "Not Found" }, 404);
      if (parts.length === 4 && parts[2] !== pkg.version) return json({}, 404);
      return json({
        info: { version: pkg.version, yanked: pkg.yanked === true },
        releases: { [pkg.version]: [{ upload_time_iso_8601: pkg.created ?? OLD }] },
      });
    }
    throw new Error(`Unexpected host: ${parsed.hostname}`);
  };
  return { fetch: fetchImpl, calls };
}

const run = async (refs: PackageRef[], world: FakeWorld) => {
  const fake = fakeFetch(world);
  const summary = await checkPackages(refs, { fetch: fake.fetch, now: NOW });
  return { summary, check: summary.checks[0]!, calls: fake.calls };
};

describe("verdicts", () => {
  it("reports a package with no advisories without calling it harmless", async () => {
    const { check } = await run([ref("clean-pkg")], { npm: { "clean-pkg": { version: "1.0.0" } } });
    expect(check).toMatchObject({ verdict: "no_known_issues", version: "1.0.0", advisories: [] });
  });

  it("flags a MAL- advisory", async () => {
    const { check } = await run([ref("bad-pkg")], {
      npm: { "bad-pkg": { version: "1.0.0" } },
      osv: { "bad-pkg@1.0.0": ["MAL-2026-1"] },
    });
    expect(check.verdict).toBe("malicious");
    expect(check.advisories).toEqual(["MAL-2026-1"]);
  });

  it("flags a GitHub malware advisory by CWE-506", async () => {
    const { check } = await run([ref("bad-pkg")], {
      npm: { "bad-pkg": { version: "1.0.0" } },
      osv: { "bad-pkg@1.0.0": ["GHSA-aaaa-bbbb-cccc"] },
      advisories: { "GHSA-aaaa-bbbb-cccc": { cwe: ["CWE-506"] } },
    });
    expect(check.verdict).toBe("malicious");
  });

  it("flags a package npm replaced with a security holder", async () => {
    const { check } = await run([ref("typosquat")], {
      npm: { typosquat: { version: "0.0.1-security" } },
      osv: { typosquat: ["GHSA-aaaa-bbbb-cccc"] },
      advisories: { "GHSA-aaaa-bbbb-cccc": { cwe: ["CWE-506"] } },
    });
    expect(check.verdict).toBe("malicious");
  });

  it("flags a removed package with a malware advisory", async () => {
    const { check } = await run([ref("gone")], { osv: { gone: ["MAL-2026-2"] } });
    expect(check.verdict).toBe("malicious");
  });

  it("reports a package that does not exist", async () => {
    const { check } = await run([ref("hallucinated-pkg")], {});
    expect(check.verdict).toBe("not_found");
  });

  it("does not flag old advisories for a different version", async () => {
    const { check, calls } = await run([ref("patched", "2.0.0")], {
      npm: { patched: { version: "2.0.0" } },
      osv: { "patched@1.0.0": ["GHSA-old"], patched: ["GHSA-old"] },
    });
    expect(check.verdict).toBe("no_known_issues");
    const batch = calls.find((call) => call.url.endsWith("/querybatch"))!;
    expect(batch.init.body).toContain('"version":"2.0.0"');
  });

  it("reports known vulnerabilities", async () => {
    const { check } = await run([ref("old-pkg", "1.0.0")], {
      npm: { "old-pkg": { version: "1.0.0" } },
      osv: { "old-pkg@1.0.0": ["GHSA-one", "GHSA-two"] },
    });
    expect(check).toMatchObject({ verdict: "vulnerable", advisoryCount: 2 });
  });

  it("ignores a withdrawn advisory", async () => {
    const { check } = await run([ref("pkg")], {
      npm: { pkg: { version: "1.0.0" } },
      osv: { "pkg@1.0.0": ["MAL-2026-3"] },
      advisories: { "MAL-2026-3": { withdrawn: "2026-01-01T00:00:00Z" } },
    });
    expect(check.verdict).toBe("no_known_issues");
  });

  it("flags a package created in the last 30 days", async () => {
    const { check } = await run([ref("fresh")], {
      npm: { fresh: { version: "0.1.0", created: RECENT } },
    });
    expect(check.verdict).toBe("new_package");
  });

  it("does not guess a version range", async () => {
    const { check } = await run([ref("ranged", "^1.0.0")], {
      npm: { ranged: { version: "1.2.0" } },
      osv: { "ranged@1.2.0": ["GHSA-x"] },
    });
    expect(check).toMatchObject({ verdict: "unresolved", version: null });
  });

  it("notes install scripts and deprecation", async () => {
    const { check } = await run([ref("scripted")], {
      npm: {
        scripted: {
          version: "1.0.0",
          scripts: { postinstall: "node x.js", test: "vitest" },
          deprecated: "Use another package",
        },
      },
    });
    expect(check.flags).toEqual(["install_script", "deprecated"]);
    expect(check.verdict).toBe("no_known_issues");
  });
});

describe("PyPI", () => {
  it("checks the latest version", async () => {
    const { check } = await run([ref("mcp-server", null, "PyPI")], {
      pypi: { "mcp-server": { version: "1.2.3" } },
    });
    expect(check).toMatchObject({ verdict: "no_known_issues", version: "1.2.3" });
  });

  it("checks a pinned version and yanked state", async () => {
    const { check } = await run([ref("mcp-server", "1.2.3", "PyPI")], {
      pypi: { "mcp-server": { version: "1.2.3", yanked: true } },
      osv: { "mcp-server@1.2.3": ["PYSEC-2026-1"] },
    });
    expect(check).toMatchObject({ verdict: "vulnerable", flags: ["yanked"] });
  });

  it("reports a missing project", async () => {
    const { check } = await run([ref("nope", null, "PyPI")], {});
    expect(check.verdict).toBe("not_found");
  });

  it("does not guess a Python range", async () => {
    const { check } = await run([ref("mcp-server", ">=1.0", "PyPI")], {
      pypi: { "mcp-server": { version: "1.2.3" } },
    });
    expect(check.verdict).toBe("unresolved");
  });
});

describe("failures", () => {
  it("never treats a failed lookup as clear", async () => {
    const { check } = await run([ref("pkg")], {
      npm: { pkg: { version: "1.0.0" } },
      failOsv: true,
    });
    expect(check.verdict).toBe("unavailable");
  });

  it("survives a network error", async () => {
    const summary = await checkPackages([ref("pkg")], {
      fetch: async () => {
        throw new TypeError("network down");
      },
      now: NOW,
    });
    expect(summary.checks[0]?.verdict).toBe("unavailable");
  });

  it("stops at its time budget", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const started = Date.now();
    const summary = await checkPackages([ref("pkg")], { fetch: hang, timeoutMs: 40, now: NOW });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(summary.checks[0]?.verdict).toBe("unavailable");
  });

  it("rejects an oversized response", async () => {
    const huge: FetchLike = async () =>
      new Response(JSON.stringify({ version: "1.0.0", padding: "x".repeat(2 * 1024 * 1024) }));
    const summary = await checkPackages([ref("pkg")], { fetch: huge, now: NOW });
    expect(summary.checks[0]?.verdict).toBe("unavailable");
  });

  it("does not follow a redirect", async () => {
    const calls: string[] = [];
    const redirecting: FetchLike = async (url) => {
      calls.push(url);
      return new Response(null, { status: 302, headers: { location: "https://evil.example/" } });
    };
    const summary = await checkPackages([ref("pkg")], { fetch: redirecting, now: NOW });
    expect(summary.checks[0]?.verdict).toBe("unavailable");
    expect(calls.every((url) => !url.includes("evil.example"))).toBe(true);
  });

  it("ignores a malformed advisory ID", async () => {
    const { summary } = await run([ref("pkg")], {
      npm: { pkg: { version: "1.0.0" } },
      osv: { "pkg@1.0.0": ['<img src=x onerror="alert(1)">'] },
    });
    expect(JSON.stringify(summary)).not.toContain("<img");
    expect(summary.checks[0]?.verdict).toBe("no_known_issues");
  });
});

describe("requests", () => {
  it("contacts only known hosts, refuses redirects, and sends no credentials", async () => {
    const { calls } = await run([ref("pkg"), ref("py", null, "PyPI")], {
      npm: { pkg: { version: "1.0.0" } },
      pypi: { py: { version: "1.0.0" } },
    });
    for (const { url, init } of calls) {
      expect(["registry.npmjs.org", "pypi.org", "api.osv.dev"]).toContain(new URL(url).hostname);
      expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).has("authorization")).toBe(false);
    }
  });

  it("encodes scoped npm names", async () => {
    const { calls } = await run([ref("@scope/pkg")], {
      npm: { "@scope/pkg": { version: "1.0.0" } },
    });
    expect(calls[0]?.url).toBe("https://registry.npmjs.org/@scope%2Fpkg/latest");
  });

  it("limits how many packages are checked", async () => {
    const refs = Array.from({ length: 25 }, (_, index) => ref(`pkg-${index}`));
    const { summary } = await run(refs, {});
    expect(summary.checks).toHaveLength(20);
    expect(summary.omitted).toBe(5);
  });

  it("merges repeated references", async () => {
    const { summary } = await run(
      [ref("pkg"), { ...ref("pkg"), path: ".cursor/mcp.json", line: 9 }],
      { npm: { pkg: { version: "1.0.0" } } },
    );
    expect(summary.checks).toHaveLength(1);
    expect(summary.checks[0]?.references).toHaveLength(2);
    expect(summaryToRefs(summary)).toHaveLength(2);
  });
});

describe("combineStatus", () => {
  const summary = (verdict: PackageSummary["checks"][number]["verdict"]): PackageSummary => ({
    checkedAt: NOW.toISOString(),
    omitted: 0,
    checks: [
      {
        ecosystem: "npm",
        name: "x",
        requested: null,
        version: "1.0.0",
        verdict,
        advisories: [],
        advisoryCount: 0,
        flags: [],
        createdAt: null,
        references: [],
      },
    ],
  });

  it("raises the verdict for a malicious package", () => {
    expect(combineStatus("no_issues_found", summary("malicious"))).toBe("dangerous");
    expect(combineStatus("needs_review", summary("malicious"))).toBe("dangerous");
  });

  it.each(["not_found", "vulnerable", "new_package"] as const)(
    "asks for review on %s",
    (verdict) => {
      expect(combineStatus("no_issues_found", summary(verdict))).toBe("needs_review");
      expect(packageSeverity(verdict)).toBe("medium");
    },
  );

  it("never lowers the rule verdict", () => {
    expect(combineStatus("dangerous", summary("no_known_issues"))).toBe("dangerous");
    expect(combineStatus("needs_review", summary("no_known_issues"))).toBe("needs_review");
  });

  it.each(["no_known_issues", "unresolved", "unavailable"] as const)(
    "does not change the verdict for %s",
    (verdict) => {
      expect(combineStatus("no_issues_found", summary(verdict))).toBe("no_issues_found");
    },
  );

  it("formats package names", () => {
    const base = { ecosystem: "PyPI" as const, name: "pkg", requested: null, version: null };
    expect(packageDisplayName(base)).toBe("pkg");
    expect(packageDisplayName({ ...base, version: "1.0.0" })).toBe("pkg@1.0.0");
    expect(packageDisplayName({ ...base, requested: ">=1.0" })).toBe("pkg >=1.0");
    expect(packageDisplayName({ ...base, ecosystem: "npm", requested: "^1.0.0" })).toBe(
      "pkg@^1.0.0",
    );
  });

  it("builds registry links", () => {
    expect(packageUrl({ ecosystem: "npm", name: "@a/b" })).toBe(
      "https://www.npmjs.com/package/%40a/b",
    );
    expect(packageUrl({ ecosystem: "PyPI", name: "a-b" })).toBe("https://pypi.org/project/a-b/");
  });
});

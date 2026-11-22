import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (docsUrl?: string) => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hierophanthq.com");
  vi.stubEnv("NEXT_PUBLIC_DOCS_URL", docsUrl ?? "");
  return import("./site");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("site links", () => {
  it("keeps docs under /docs without a subdomain", async () => {
    const { docsHref, siteHref } = await load();
    expect(docsHref()).toBe("/docs");
    expect(docsHref("/rules")).toBe("/docs/rules");
    expect(siteHref("/privacy")).toBe("/privacy");
  });

  it("uses absolute links with a docs subdomain", async () => {
    const { docsHref, siteHref } = await load("https://docs.hierophanthq.com/");
    expect(docsHref()).toBe("https://docs.hierophanthq.com/");
    expect(docsHref("/rules")).toBe("https://docs.hierophanthq.com/rules");
    expect(siteHref("/#scan-url")).toBe("https://hierophanthq.com/#scan-url");
  });
});

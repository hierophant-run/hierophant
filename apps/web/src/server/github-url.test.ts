// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { parseGitHubUrl } from "./github-url";

describe("parseGitHubUrl", () => {
  it.each([
    ["https://github.com/vercel/next.js", { owner: "vercel", repo: "next.js" }],
    ["https://github.com/vercel/next.js/", { owner: "vercel", repo: "next.js" }],
    ["https://github.com/vercel/next.js.git", { owner: "vercel", repo: "next.js" }],
    ["  https://github.com/a-b/c_d  ", { owner: "a-b", repo: "c_d" }],
    ["https://GitHub.com/acme/app", { owner: "acme", repo: "app" }],
    ["https://github.com/acme/app#readme", { owner: "acme", repo: "app" }],
    ["https://github.com/acme/app?tab=readme", { owner: "acme", repo: "app" }],
    ["https://github.com/acme/app/tree/main", { owner: "acme", repo: "app", ref: "main" }],
    [
      "https://github.com/acme/app/tree/feature/login",
      { owner: "acme", repo: "app", ref: "feature/login" },
    ],
    [
      `https://github.com/acme/app/commit/${"a".repeat(40)}`,
      { owner: "acme", repo: "app", ref: "a".repeat(40) },
    ],
  ])("accepts %s", (input, expected) => {
    expect(parseGitHubUrl(input)).toEqual(expected);
  });

  it.each([
    "",
    "not a url",
    "github.com/acme/app",
    "http://github.com/acme/app",
    "ftp://github.com/acme/app",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://github.com",
    "https://github.com/acme",
    "https://www.github.com/acme/app",
    "https://gist.github.com/acme/app",
    "https://github.com.evil.example/acme/app",
    "https://evil.example/github.com/acme/app",
    "https://github.com@evil.example/acme/app",
    "https://user:pass@github.com/acme/app",
    "https://evil.example#@github.com/acme/app",
    "https://evil.example\\@github.com/acme/app",
    "https://github.com:8443/acme/app",
    "https://github.com:443/acme/app",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/acme/app",
    "https://[::1]/acme/app",
    "https://%67ithub.com/acme/app",
    "https://github%2ecom/acme/app",
    "https://g\u0456thub.com/acme/app",
    "https:/github.com/acme/app",
    "https:github.com/acme/app",
    "https:\\\\github.com\\acme\\app",
    "https://github.com/acme/../../etc/passwd",
    "https://github.com/acme/app/../other",
    "https://github.com/acme/./app",
    "https://github.com//acme/app",
    "https://github.com/acme/app%2F..%2Fother",
    "https://github.com/acme/app\nHost: evil.example",
    "https://github.com/acme/app\r\nX: y",
    "https://github.com/-bad/app",
    "https://github.com/acme/..",
    "https://github.com/acme/app/issues/1",
    "https://github.com/acme/app/blob/main/a.js",
    "https://github.com/acme/app/tree/--upload-pack=x",
    "https://github.com/acme/app/commit/not-a-sha",
    `https://github.com/acme/${"a".repeat(400)}`,
  ])("rejects %j", (input) => {
    expect(() => parseGitHubUrl(input)).toThrowError(ApiError);
  });

  it.each([null, undefined, 42, {}, ["https://github.com/acme/app"]])("rejects %j", (input) => {
    expect(() => parseGitHubUrl(input)).toThrowError(ApiError);
  });
});

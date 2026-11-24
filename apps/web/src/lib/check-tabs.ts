export const CHECK_TABS = [
  { id: "repo", label: "Repo", navLabel: "Repos", footerLabel: "Repos" },
  { id: "package", label: "Package", navLabel: "Packages", footerLabel: "Packages" },
  { id: "mcp", label: "MCP", navLabel: "MCP", footerLabel: "MCP servers" },
  { id: "skill", label: "Skill", navLabel: "Skills", footerLabel: "Agent skills" },
  { id: "token", label: "Token", navLabel: "Tokens", footerLabel: "Token metadata" },
  { id: "watch", label: "Watch", navLabel: "Watch", footerLabel: "Monitoring" },
] as const;

export type CheckTabId = (typeof CHECK_TABS)[number]["id"];

export const checkTabHash = (id: CheckTabId) => `#check-${id}`;

export function tabFromHash(hash: string): CheckTabId | null {
  return CHECK_TABS.find((tab) => checkTabHash(tab.id) === hash)?.id ?? null;
}

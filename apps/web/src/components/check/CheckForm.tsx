"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import {
  checkPath,
  targetFromInput,
  TOKEN_CHAINS,
  type CheckFormInput,
  type PackageKind,
  type TokenChain,
} from "@/lib/check-target";

type CheckType = CheckFormInput["type"];

const TABS: Array<{
  type: CheckType;
  label: string;
  field: string;
  placeholder: string;
  help: string;
  error: string;
}> = [
  {
    type: "package",
    label: "Package",
    field: "Package name",
    placeholder: "@scope/package or package@1.2.3",
    help: "Checks known malware, vulnerabilities, package age, and install scripts.",
    error: "Enter a valid package name.",
  },
  {
    type: "mcp",
    label: "MCP server",
    field: "MCP Registry server name",
    placeholder: "io.github.owner/server",
    help: "Checks a server from the official MCP Registry, its launch command, hosts, and secrets.",
    error: "Enter a name like io.github.owner/server.",
  },
  {
    type: "skill",
    label: "Agent skill",
    field: "GitHub URL of the skill folder",
    placeholder: "https://github.com/owner/repo/tree/main/skills/name",
    help: "Checks SKILL.md and the files beside it for hidden instructions and risky commands.",
    error: "Enter a public GitHub URL for a folder that contains SKILL.md.",
  },
  {
    type: "token",
    label: "Token",
    field: "Token contract or mint address",
    placeholder: "0x... or Solana mint address",
    help: "Checks on-chain text for instructions aimed at AI agents. It is not a safety rating or investment advice.",
    error: "Enter a valid token address for the selected chain.",
  },
];

const selectClass =
  "min-h-12 rounded-[3px] border border-line bg-surface/90 px-3 text-sm text-text focus:border-muted";

export function CheckForm() {
  const [type, setType] = useState<CheckType>("package");
  const [value, setValue] = useState("");
  const [ecosystem, setEcosystem] = useState<PackageKind>("npm");
  const [chain, setChain] = useState<TokenChain>("ethereum");
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const tab = TABS.find((item) => item.type === type)!;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = targetFromInput({ type, value, ecosystem, chain });
    if (!target) {
      setError(tab.error);
      return;
    }
    setError(null);
    setIsOpening(true);
    // A full page load gives the result its own strict Content-Security-Policy.
    window.location.assign(checkPath(target));
  };

  return (
    <div className="mt-8 border border-line bg-surface/40 p-4 sm:p-6">
      <div role="group" aria-label="What to check" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.type}
            type="button"
            aria-pressed={item.type === type}
            onClick={() => {
              setType(item.type);
              setValue("");
              setError(null);
            }}
            className={`min-h-10 rounded-[3px] border px-3.5 text-sm transition-colors ${
              item.type === type
                ? "border-accent bg-accent text-on-accent"
                : "border-line text-muted hover:border-muted hover:text-text"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-2 md:flex-row">
        {type === "package" ? (
          <select
            aria-label="Package registry"
            value={ecosystem}
            onChange={(event) => setEcosystem(event.target.value as PackageKind)}
            className={selectClass}
          >
            <option value="npm">npm</option>
            <option value="pypi">PyPI</option>
          </select>
        ) : null}
        {type === "token" ? (
          <select
            aria-label="Blockchain"
            value={chain}
            onChange={(event) => setChain(event.target.value as TokenChain)}
            className={selectClass}
          >
            {(Object.entries(TOKEN_CHAINS) as Array<[TokenChain, { label: string }]>).map(
              ([id, item]) => (
                <option key={id} value={id}>
                  {item.label}
                </option>
              ),
            )}
          </select>
        ) : null}
        <label htmlFor="check-value" className="sr-only">
          {tab.field}
        </label>
        <input
          id="check-value"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder={tab.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "check-error" : "check-help"}
          className="min-h-12 w-full min-w-0 flex-1 rounded-[3px] border border-line bg-surface/90 px-3.5 font-mono text-base text-text placeholder:text-muted focus:border-muted sm:text-sm"
        />
        <Button type="submit" disabled={isOpening} className="min-h-12 md:w-28">
          {isOpening ? "Checking" : "Check"}
        </Button>
      </form>

      {error ? (
        <p id="check-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id="check-help" className="mt-2 text-xs leading-5 text-muted">
          {tab.help}
        </p>
      )}
    </div>
  );
}

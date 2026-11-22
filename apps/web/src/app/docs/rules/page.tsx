import { RULES, RULESET_VERSION, type RuleDefinition } from "@hierophant/engine";
import type { Metadata } from "next";
import { docsHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Rule catalog",
  description: "Every rule in the current Hierophant ruleset, with why it matters and how to fix it.",
  alternates: { canonical: docsHref("/rules") },
};

const GROUPS = [
  { prefix: "AUTO", title: "Automatic execution" },
  { prefix: "EXEC", title: "Remote and concealed code" },
  { prefix: "MCP", title: "MCP servers" },
  { prefix: "INJ", title: "Instruction injection" },
  { prefix: "PERM", title: "Permissions" },
];

const ENTRIES = Object.entries(RULES) as Array<[string, RuleDefinition]>;
const capitalize = (value: string) => `${value[0]!.toUpperCase()}${value.slice(1)}`;

export default function RulesPage() {
  return (
    <>
      <h1>Rule catalog</h1>
      <p>
        Ruleset v{RULESET_VERSION} has {ENTRIES.length} rules. The severity shown is the default.
        Some rules adjust it by context, for example when a command only appears in a documentation
        file.
      </p>

      {GROUPS.map((group) => (
        <section key={group.prefix} aria-labelledby={`group-${group.prefix}`}>
          <h2 id={`group-${group.prefix}`}>{group.title}</h2>
          {ENTRIES.filter(([id]) => id.startsWith(`${group.prefix}-`)).map(([id, rule]) => (
            <div key={id} id={id} className="scroll-mt-24 border-b border-line pb-4">
              <h3>
                <code>{id}</code> {rule.title}
              </h3>
              <p>
                <strong>Default severity:</strong> {capitalize(rule.severity)}
              </p>
              <p>
                <strong>Why it matters:</strong> {rule.why}
              </p>
              <p>
                <strong>How to fix it:</strong> {rule.fix}
              </p>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

import { Eyebrow } from "@/components/ui/Eyebrow";
import { SUPPORTED_TOOLS } from "./content";

export function SupportedTools() {
  return (
    <section id="rules" className="mx-auto w-full max-w-[1240px] px-4 sm:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <Eyebrow>Supported tools</Eyebrow>
          <h2 className="mt-4 text-3xl leading-tight font-medium tracking-tight sm:text-5xl">
            The files that can run or steer an agent.
          </h2>
          <p className="mt-4 max-w-md leading-7 text-muted">
            Hooks, rules, MCP servers, automatic tasks, dev containers, and npm install scripts,
            read as text and never executed.
          </p>
        </div>

        <div>
          <ul className="divide-y divide-line border-y border-line">
            {SUPPORTED_TOOLS.map((tool) => (
              <li
                key={tool.name}
                className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <span className="font-medium">{tool.name}</span>
                <span className="flex flex-wrap gap-1.5 sm:justify-end">
                  {tool.files.map((path) => (
                    <code
                      key={path}
                      className="border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-muted"
                    >
                      {path}
                    </code>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Not affiliated with these products.</p>
        </div>
      </div>
    </section>
  );
}

import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";

const STEPS = [
  {
    number: "01",
    title: "Paste",
    body: "Drop in the URL of a public GitHub repository. No install and no sign-up.",
  },
  {
    number: "02",
    title: "Inspect",
    body: "Hierophant reads agent files and the scripts they launch. Nothing is cloned or executed.",
  },
  {
    number: "03",
    title: "Fix",
    body: "See the impact on each agent, the exact lines, and what to change before you trust it.",
  },
];

const LIMITS = [
  {
    title: "It is not a guarantee.",
    body: "No issues found means our current rules found nothing. It does not prove a repository is harmless.",
  },
  {
    title: "Static checks can be evaded.",
    body: "A determined attacker can reword or hide a payload in ways these rules do not catch.",
  },
  {
    title: "It does not replace a sandbox.",
    body: "Keep running unfamiliar code in an isolated environment, with approval prompts turned on.",
  },
  {
    title: "Unknown stays unknown.",
    body: "When a vendor does not document how its agent behaves, we say so instead of guessing.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="mx-auto w-full max-w-[1240px] px-4 sm:px-8"
    >
      <Eyebrow>How it works</Eyebrow>
      <h2
        id="how-title"
        className="mt-4 max-w-2xl text-3xl leading-tight font-medium tracking-tight sm:text-5xl"
      >
        Three steps before you click Trust.
      </h2>
      <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.number}>
            <Card className="h-full">
              <span className="font-mono text-xs text-dot">{step.number}</span>
              <h3 className="mt-8 text-xl font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function WhatWeDontClaim() {
  return (
    <section aria-labelledby="claims-title" className="mx-auto w-full max-w-[1240px] px-4 sm:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <Eyebrow>Limits</Eyebrow>
          <h2
            id="claims-title"
            className="mt-4 text-3xl leading-tight font-medium tracking-tight sm:text-5xl"
          >
            What we don&apos;t claim.
          </h2>
          <p className="mt-4 max-w-md leading-7 text-muted">
            A security tool that overstates itself is worse than none. Here is where Hierophant
            stops.
          </p>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {LIMITS.map((limit) => (
            <li key={limit.title} className="py-5">
              <h3 className="font-medium">{limit.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{limit.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import { LOGO_PATHS } from "@/components/brand/logo-paths";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";

type Node = { label: string; x: number; y: number; risk?: boolean };
type Layout = {
  width: number;
  height: number;
  center: { x: number; y: number };
  files: Node[];
  agents: Node[];
  links: Array<[number, number]>;
};

const FILE_NAMES = [
  { label: ".claude/settings.json", risk: true },
  { label: "CLAUDE.md" },
  { label: ".cursor/rules" },
  { label: ".vscode/tasks.json", risk: true },
  { label: ".agents/hooks.json", risk: true },
  { label: "GEMINI.md" },
];
const AGENT_NAMES = ["Claude Code", "Cursor", "VS Code", "Antigravity CLI", "Gemini CLI"];
const LINKS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [1, 2],
  [2, 1],
  [3, 2],
  [3, 1],
  [4, 3],
  [5, 3],
  [5, 4],
];

const WIDE: Layout = {
  width: 1120,
  height: 500,
  center: { x: 560, y: 250 },
  files: [
    { ...FILE_NAMES[0]!, x: 345, y: 92 },
    { ...FILE_NAMES[1]!, x: 300, y: 250 },
    { ...FILE_NAMES[2]!, x: 345, y: 408 },
    { ...FILE_NAMES[3]!, x: 775, y: 408 },
    { ...FILE_NAMES[4]!, x: 820, y: 250 },
    { ...FILE_NAMES[5]!, x: 775, y: 92 },
  ],
  agents: [
    { label: AGENT_NAMES[0]!, x: 86, y: 130 },
    { label: AGENT_NAMES[1]!, x: 86, y: 370 },
    { label: AGENT_NAMES[2]!, x: 560, y: 472 },
    { label: AGENT_NAMES[3]!, x: 1034, y: 250 },
    { label: AGENT_NAMES[4]!, x: 1034, y: 60 },
  ],
  links: LINKS,
};

const NARROW: Layout = {
  width: 360,
  height: 620,
  center: { x: 180, y: 308 },
  files: [
    { ...FILE_NAMES[0]!, x: 94, y: 148 },
    { ...FILE_NAMES[1]!, x: 58, y: 232 },
    { ...FILE_NAMES[2]!, x: 76, y: 420 },
    { ...FILE_NAMES[3]!, x: 266, y: 472 },
    { ...FILE_NAMES[4]!, x: 276, y: 216 },
    { ...FILE_NAMES[5]!, x: 306, y: 372 },
  ],
  agents: [
    { label: AGENT_NAMES[0]!, x: 62, y: 40 },
    { label: AGENT_NAMES[1]!, x: 70, y: 572 },
    { label: AGENT_NAMES[2]!, x: 262, y: 572 },
    { label: AGENT_NAMES[3]!, x: 286, y: 92 },
    { label: AGENT_NAMES[4]!, x: 296, y: 30 },
  ],
  links: LINKS,
};

function Pill({ node, mono, fontSize }: { node: Node; mono: boolean; fontSize: number }) {
  const width = node.label.length * fontSize * (mono ? 0.62 : 0.56) + 22;
  const height = fontSize + 15;
  return (
    <g>
      <rect
        x={node.x - width / 2}
        y={node.y - height / 2}
        width={width}
        height={height}
        fill="var(--surface)"
        stroke={node.risk ? "var(--danger)" : "var(--line)"}
      />
      <text
        x={node.x}
        y={node.y}
        dy="0.35em"
        textAnchor="middle"
        fontSize={fontSize}
        fontFamily={mono ? "var(--font-mono)" : "var(--font-sans)"}
        fill={mono ? "var(--muted)" : "var(--text)"}
      >
        {node.label}
      </text>
    </g>
  );
}

function Diagram({
  layout,
  fontSize,
  className,
}: {
  layout: Layout;
  fontSize: number;
  className: string;
}) {
  const { center, files, agents, links, width, height } = layout;
  const hub = fontSize * 3.1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {files.map((file) => (
        <g key={file.label}>
          <line x1={center.x} y1={center.y} x2={file.x} y2={file.y} stroke="var(--line)" />
          <line
            x1={center.x}
            y1={center.y}
            x2={file.x}
            y2={file.y}
            stroke={file.risk ? "var(--danger)" : "var(--dot)"}
            strokeWidth="1.4"
            strokeLinecap="round"
            className={`net-flow ${file.risk ? "net-flow--risk" : ""}`}
          />
        </g>
      ))}
      {links.map(([fileIndex, agentIndex]) => {
        const file = files[fileIndex]!;
        const agent = agents[agentIndex]!;
        return (
          <line
            key={`${fileIndex}-${agentIndex}`}
            x1={file.x}
            y1={file.y}
            x2={agent.x}
            y2={agent.y}
            stroke="var(--muted)"
            strokeOpacity="0.4"
            strokeDasharray="2 4"
          />
        );
      })}

      {files.map((file) => (
        <Pill key={file.label} node={file} mono fontSize={fontSize} />
      ))}
      {agents.map((agent) => (
        <Pill key={agent.label} node={agent} mono={false} fontSize={fontSize} />
      ))}

      <circle cx={center.x} cy={center.y} r={hub} fill="var(--bg)" stroke="var(--muted)" />
      <g
        transform={`translate(${center.x - hub * 0.62} ${center.y - hub * 0.66}) scale(${(hub * 1.24) / 96})`}
      >
        <path fill="var(--text)" d={LOGO_PATHS.standard.blades} />
        <path fill="var(--dot)" d={LOGO_PATHS.standard.dot} />
      </g>
    </svg>
  );
}

export function NetworkDiagram() {
  return (
    <section aria-labelledby="surface-title" className="mx-auto w-full max-w-[1240px] px-4 sm:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow>Attack surface</Eyebrow>
          <h2
            id="surface-title"
            className="mt-4 max-w-xl text-3xl leading-tight font-medium tracking-tight sm:text-5xl"
          >
            One repo. Many ways into your agent.
          </h2>
        </div>
        <p className="max-w-sm leading-7 text-muted">
          A single file can reach several tools. Hierophant maps which agent each one affects.
        </p>
      </div>

      <Card className="mt-8 bg-linear-to-b from-surface to-bg p-3 sm:p-8">
        <p className="sr-only">
          Diagram: a repository at the center connects to agent files such as Claude settings,
          Cursor rules, VS Code tasks, and Antigravity hooks. Each file connects to the agents that
          read it.
        </p>
        <Diagram layout={WIDE} fontSize={14} className="hidden w-full lg:block" />
        <Diagram
          layout={NARROW}
          fontSize={11}
          className="mx-auto block w-full max-w-md lg:hidden"
        />
        <p className="mt-3 text-center font-mono text-xs text-muted">
          Example diagram, not scan data.
        </p>
      </Card>
    </section>
  );
}

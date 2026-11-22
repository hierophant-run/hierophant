export type DetailRow = { label: string; value: string; note?: string };

export function DetailRows({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="mt-6 border-t border-line">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-1 gap-1 border-b border-line py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6"
        >
          <dt className="text-sm text-muted">{row.label}</dt>
          <dd className="min-w-0">
            <span className="font-mono text-sm break-all">{row.value}</span>
            {row.note ? <p className="mt-1 text-xs leading-5 text-muted">{row.note}</p> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

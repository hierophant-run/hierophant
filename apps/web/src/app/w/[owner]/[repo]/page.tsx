import { notFound } from "next/navigation";
import { connection } from "next/server";
import { WatchDocument } from "@/components/watch/WatchDocument";
import { getMonitors } from "@/server/deps";
import { loadWatch } from "@/server/watch-view";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  // Each request needs its own CSP nonce, so this page is never prerendered.
  await connection();

  const { owner, repo } = await params;
  const monitors = getMonitors();
  const data = await loadWatch(owner, repo, monitors);
  if (!data) notFound();

  return <WatchDocument data={data} />;
}

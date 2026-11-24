import { notFound } from "next/navigation";
import { connection } from "next/server";
import { WatchDocument } from "@/components/watch/WatchDocument";
import { getMonitors } from "@/server/deps";
import { loadWatchById } from "@/server/watch-view";

export default async function WatchByIdPage({ params }: { params: Promise<{ id: string }> }) {
  // Each request needs its own CSP nonce, so this page is never prerendered.
  await connection();

  const { id } = await params;
  const data = await loadWatchById(id, getMonitors());
  if (!data) notFound();

  return <WatchDocument data={data} />;
}

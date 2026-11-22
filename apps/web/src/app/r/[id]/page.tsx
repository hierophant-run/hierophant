import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ReportDocument } from "@/components/report/ReportDocument";
import { getDeps } from "@/server/deps";
import { isReportId } from "@/server/report-store";
import { toReportView } from "@/server/report-view";
import { guardDatabase } from "@/server/scan-service";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  // Each request needs its own CSP nonce, so this page is never prerendered.
  await connection();

  const { id } = await params;
  if (!isReportId(id)) notFound();

  // Driver errors can hold connection details, so they never reach the framework logger.
  const { store } = getDeps();
  const report = await guardDatabase(() => store.findById(id));
  if (!report) notFound();

  return <ReportDocument report={toReportView(report)} />;
}

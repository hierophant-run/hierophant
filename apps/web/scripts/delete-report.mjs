// Operator tool for removal requests. Shows the report first and deletes only with --yes.
import pg from "pg";

const [id, flag] = process.argv.slice(2);
if (!id || !/^[A-Za-z0-9_-]{22}$/.test(id)) {
  console.error("Usage: pnpm report:delete <report-id> [--yes]");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const url = new URL(databaseUrl);
const enableChannelBinding = url.searchParams.get("channel_binding") === "require";
url.searchParams.delete("sslmode");
url.searchParams.delete("channel_binding");

const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 15_000,
  ...(enableChannelBinding ? { enableChannelBinding: true } : {}),
});

try {
  await client.connect();
  const { rows } = await client.query(
    "select owner, repo, commit_sha, status from reports where id = $1",
    [id],
  );
  const report = rows[0];
  if (!report) {
    console.log("Report not found.");
    process.exitCode = 1;
  } else {
    console.log(
      `${report.owner}/${report.repo} at ${report.commit_sha.slice(0, 7)} (${report.status})`,
    );
    if (flag === "--yes") {
      await client.query("delete from reports where id = $1", [id]);
      console.log("Report, findings, and feedback deleted.");
    } else {
      console.log("Nothing was deleted. Run again with --yes to delete this report.");
    }
  }
} catch (error) {
  // Driver messages can include connection details.
  console.error("Failed:", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

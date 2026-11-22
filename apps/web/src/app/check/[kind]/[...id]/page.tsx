import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CheckDocument } from "@/components/check/CheckDocument";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { parseCheckPath } from "@/lib/check-target";
import { loadCheck, type CheckResult } from "@/server/checks";
import { getDeps } from "@/server/deps";
import { ApiError } from "@/server/errors";

export const metadata: Metadata = {
  title: "Check result",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ kind: string; id: string[] }>;
  searchParams: Promise<{ ref?: string | string[] }>;
};

export default async function CheckResultPage({ params, searchParams }: PageProps) {
  // Each request needs its own CSP nonce, so this page is never prerendered.
  await connection();

  const [{ kind, id }, query] = await Promise.all([params, searchParams]);
  const ref = typeof query.ref === "string" ? query.ref : null;
  const target = parseCheckPath(kind, id, ref);
  if (!target) notFound();

  let result: CheckResult | null = null;
  let message = "This check could not be completed. Please try again.";
  try {
    result = await loadCheck(target, { headers: await headers() }, getDeps(), {
      includeTokenData: true,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) notFound();
      message = error.message;
    }
  }

  if (result) return <CheckDocument result={result} />;
  return (
    <section className="py-20">
      <Eyebrow>Check unavailable</Eyebrow>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
        This check did not finish.
      </h1>
      <p role="alert" className="mt-4 max-w-lg leading-7 text-muted">
        {message}
      </p>
      <div className="mt-6">
        <Button href="/check">Check something else</Button>
      </div>
    </section>
  );
}

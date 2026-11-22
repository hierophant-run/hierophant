import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";

export default function ReportNotFound() {
  return (
    <section className="py-20">
      <Eyebrow>404</Eyebrow>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">Report not found.</h1>
      <p className="mt-4 max-w-lg leading-7 text-muted">
        This link is wrong, or the report no longer exists. You can scan the repository again.
      </p>
      <div className="mt-6">
        <Button href="/#scan-url">Scan a repo</Button>
      </div>
    </section>
  );
}

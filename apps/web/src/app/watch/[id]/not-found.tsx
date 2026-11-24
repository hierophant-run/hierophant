import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";

export default function WatchByIdNotFound() {
  return (
    <section className="py-20">
      <Eyebrow>404</Eyebrow>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
        Nothing is watched here.
      </h1>
      <p className="mt-4 max-w-lg leading-7 text-muted">
        Check an MCP server or agent skill, then choose Watch for changes on its result.
      </p>
      <div className="mt-6">
        <Button href="/check">Start a check</Button>
      </div>
    </section>
  );
}

import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";

export default function WatchNotFound() {
  return (
    <section className="py-20">
      <Eyebrow>404</Eyebrow>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
        This repository is not watched yet.
      </h1>
      <p className="mt-4 max-w-lg leading-7 text-muted">
        Scan the repository first, then choose Watch this repo on its report.
      </p>
      <div className="mt-6">
        <Button href="/#check-repo">Start a check</Button>
      </div>
    </section>
  );
}

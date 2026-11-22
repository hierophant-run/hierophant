import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";

export default function CheckNotFound() {
  return (
    <section className="py-20">
      <Eyebrow>404</Eyebrow>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
        We could not find that.
      </h1>
      <p className="mt-4 max-w-lg leading-7 text-muted">
        Check the name, URL, or address, and make sure it is public.
      </p>
      <div className="mt-6">
        <Button href="/check">Check something else</Button>
      </div>
    </section>
  );
}

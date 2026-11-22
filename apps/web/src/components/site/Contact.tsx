import { CONTACT_EMAIL } from "@/lib/site";

/** Shows the public contact, or says plainly that none has been published yet. */
export function Contact() {
  if (!CONTACT_EMAIL) return <strong>[contact address to be published before launch]</strong>;
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

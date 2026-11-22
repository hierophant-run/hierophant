import { CONTACT_EMAIL, GITHUB_URL } from "@/lib/site";

/** Uses the public email once one is configured, and GitHub Issues until then. */
export function Contact() {
  if (!CONTACT_EMAIL) return <a href={`${GITHUB_URL}/issues`}>GitHub Issues</a>;
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

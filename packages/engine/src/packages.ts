export type PackageEcosystem = "npm" | "PyPI";

/** A package that an agent file would download and run. */
export type PackageRef = {
  ecosystem: PackageEcosystem;
  name: string;
  /** The version or tag written in the file. Null means the latest version. */
  requested: string | null;
  path: string;
  line: number;
};

const MAX_SPEC_LENGTH = 256;
const NPM_NAME = /^(?:@[A-Za-z0-9~-][A-Za-z0-9._~-]*\/)?[A-Za-z0-9~-][A-Za-z0-9._~-]*$/;
const NPM_VERSION = /^[0-9A-Za-z.+~^*<>=|_-]{1,64}$/;
const PYTHON_SPEC = /^([A-Za-z0-9][A-Za-z0-9._-]{0,127})(?:\[[A-Za-z0-9,._-]{0,64}\])?(.*)$/;
const PYTHON_VERSION = /^[0-9A-Za-z.!+*_-]{1,64}$/;

/** PEP 503 name normalization. */
const normalizePythonName = (name: string) => name.replace(/[-_.]+/g, "-").toLowerCase();

function parseNpmSpec(spec: string) {
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const requested = at > 0 ? spec.slice(at + 1) : null;
  if (name.length > 214 || !NPM_NAME.test(name)) return null;
  if (requested !== null && !NPM_VERSION.test(requested)) return null;
  return { name, requested };
}

function parsePythonSpec(spec: string) {
  const match = PYTHON_SPEC.exec(spec);
  if (!match) return null;
  const name = match[1]!;
  if (!/[A-Za-z0-9]$/.test(name)) return null;

  const rest = match[2]!.trim();
  if (!rest) return { name: normalizePythonName(name), requested: null };
  const requested = rest.replace(/^(?:==|@)\s*/, "");
  // A range like >=1.0 is kept with its operator, so it cannot be mistaken for an exact version.
  const value = requested === rest ? rest.replace(/^[<>=!~]+/, "") : requested;
  if (!PYTHON_VERSION.test(value)) return null;
  return { name: normalizePythonName(name), requested: requested === rest ? rest : value };
}

/** Parses a package argument. Paths, URLs, aliases, and shell variables return null. */
export function parsePackageSpec(ecosystem: PackageEcosystem, spec: string) {
  if (!spec || spec.length > MAX_SPEC_LENGTH) return null;
  if (/^(?:\.{0,2}[/\\]|[a-z+]+:)/i.test(spec) || /[$`{}\s]/.test(spec)) return null;
  return ecosystem === "npm" ? parseNpmSpec(spec) : parsePythonSpec(spec);
}

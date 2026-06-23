import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

// ---------------------------------------------------------------------------
// Conformance harness for @justfortytwo/persona.
//
// Philosophy: this package ships ONLY templates + a field manifest, never the
// owner's real data. Templates and manifest must stay in lockstep, and no
// personal data may leak into anything that ships.
//
// These tests assert exactly that contract. Do not weaken them to make a build
// pass — if a test fails, fix the template or manifest, not the assertion.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEMPLATES_DIR = join(ROOT, "templates");
const MANIFEST_PATH = join(ROOT, "manifest.json");
const COMPAT_PATH = join(ROOT, "fortytwo.compat.json");

const VALID_TYPES = new Set(["string", "text", "list"]);

// Personal-data substrings that must never appear in anything that ships from
// templates/ or the manifest. The README author credit is intentionally NOT
// scanned (it is the public attribution and is exempt by design).
const FORBIDDEN = ["enrico", "deleo", "erriko", "@gmail", "agrigento", "yakkyofy"];

/** Recursively collect every file under `dir`. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const templateFiles = walk(TEMPLATES_DIR).filter((f) => f.endsWith(".tmpl"));

interface ManifestField {
  key: string;
  prompt: string;
  type: string;
  required?: boolean;
  default?: unknown;
}

interface PersonaFileEntry {
  template: string;
  output: string;
  mode: "managed" | "captured";
}

interface Manifest {
  manifestVersion?: number;
  fields: ManifestField[];
  files?: PersonaFileEntry[];
}

const manifestRaw = readFileSync(MANIFEST_PATH, "utf8");
const manifest = JSON.parse(manifestRaw) as Manifest;
const manifestKeys = new Set(manifest.fields.map((f) => f.key));

/** Extract every distinct `{{token}}` identifier used across templates. */
function collectPlaceholders(): Map<string, string[]> {
  const tokenRe = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  // token -> list of template paths (relative) that reference it
  const usage = new Map<string, string[]>();
  for (const file of templateFiles) {
    const text = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);
    for (const m of text.matchAll(tokenRe)) {
      const token = m[1];
      const list = usage.get(token) ?? [];
      list.push(rel);
      usage.set(token, list);
    }
  }
  return usage;
}

const placeholderUsage = collectPlaceholders();

describe("ford conformance", () => {
  it("ships at least one template and a populated manifest", () => {
    expect(templateFiles.length).toBeGreaterThan(0);
    expect(manifest.fields.length).toBeGreaterThan(0);
    expect(placeholderUsage.size).toBeGreaterThan(0);
  });

  it("every {{placeholder}} used in templates has a matching manifest key", () => {
    const orphans: string[] = [];
    for (const [token, files] of placeholderUsage) {
      if (!manifestKeys.has(token)) {
        orphans.push(`${token} (used in ${[...new Set(files)].join(", ")})`);
      }
    }
    expect(
      orphans,
      `Template tokens with no manifest entry:\n  ${orphans.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every manifest entry has a non-empty key and prompt and a valid type", () => {
    const problems: string[] = [];
    manifest.fields.forEach((field, i) => {
      const id = `fields[${i}] (key=${JSON.stringify(field.key)})`;
      if (typeof field.key !== "string" || field.key.trim() === "") {
        problems.push(`${id}: empty/invalid key`);
      }
      if (typeof field.prompt !== "string" || field.prompt.trim() === "") {
        problems.push(`${id}: empty/invalid prompt`);
      }
      if (!VALID_TYPES.has(field.type)) {
        problems.push(
          `${id}: invalid type ${JSON.stringify(field.type)} (expected one of ${[...VALID_TYPES].join(", ")})`,
        );
      }
    });
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("has no duplicate manifest keys", () => {
    const keys = manifest.fields.map((f) => f.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes, `Duplicate keys: ${[...new Set(dupes)].join(", ")}`).toEqual([]);
  });

  it("manifest.json parses as valid JSON", () => {
    expect(() => JSON.parse(manifestRaw)).not.toThrow();
  });

  it("fortytwo.compat.json parses as valid JSON", () => {
    const raw = readFileSync(COMPAT_PATH, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  // The installer's renderer reads this files map to know which template
  // produces which output and whether it is re-rendered (managed) or written
  // once and then user-owned (captured). It must stay in lockstep with the
  // actual templates on disk, or `fortytwo init` would silently skip files.
  it("ships a files map covering every template exactly once", () => {
    expect(manifest.files, "manifest.files is missing").toBeDefined();
    const files = manifest.files!;
    const mapped = files.map((f) => f.template).sort();
    const onDisk = templateFiles
      .map((f) => relative(TEMPLATES_DIR, f))
      .sort();
    expect(mapped, "files map does not match templates on disk").toEqual(onDisk);
  });

  it("every files entry has a valid mode and a derived, contained output path", () => {
    const problems: string[] = [];
    for (const f of manifest.files ?? []) {
      if (f.mode !== "managed" && f.mode !== "captured") {
        problems.push(`${f.template}: invalid mode ${JSON.stringify(f.mode)}`);
      }
      // output is the template path minus the trailing ".tmpl"
      const expectedOutput = f.template.replace(/\.tmpl$/, "");
      if (f.output !== expectedOutput) {
        problems.push(
          `${f.template}: output ${JSON.stringify(f.output)} should be ${JSON.stringify(expectedOutput)}`,
        );
      }
      if (f.output.split("/").includes("..")) {
        problems.push(`${f.template}: output escapes project root`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("leaks NO personal data in templates/ or manifest.json", () => {
    // Scan every shipped template file plus the manifest. README is exempt
    // (public author credit) and is intentionally excluded.
    const scanTargets = [...walk(TEMPLATES_DIR), MANIFEST_PATH];
    const hits: string[] = [];
    for (const file of scanTargets) {
      const text = readFileSync(file, "utf8").toLowerCase();
      const rel = relative(ROOT, file);
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) {
          hits.push(`${rel}: contains forbidden substring "${needle}"`);
        }
      }
    }
    expect(
      hits,
      `Personal-data leak detected:\n  ${hits.join("\n  ")}`,
    ).toEqual([]);
  });
});

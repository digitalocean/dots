#!/usr/bin/env node
/**
 * Post-Kiota compatibility patches for @microsoft/kiota-* preview.114+.
 *
 * Kiota abstractions added HTTP QUERY as RequestsMetadata.query, so
 * KeysToExcludeForNavigationMetadata excludes the key "query". That collides
 * with real API navigation properties named `query` (e.g. /v2/insights/query),
 * and TypeScript rejects the generated NavigationMetadata object literals.
 *
 * Widen those metadata consts to Record<string, NavigationMetadata> so the
 * generated client compiles. Safe at runtime — the proxy only reads string keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dotsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(dotsRoot, "src", "dots");

const TYPE_RE =
  /: Record<Exclude<keyof (\w+), KeysToExcludeForNavigationMetadata>, NavigationMetadata>/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "index.ts") out.push(p);
  }
  return out;
}

let patched = 0;
for (const file of walk(srcRoot)) {
  const src = fs.readFileSync(file, "utf8");
  // Only touch builders that declare a navigation property named `query`
  // and emit NavigationMetadata that includes a `query:` entry.
  if (!/\bget query\(\):/.test(src)) continue;
  if (!/^\s+query:\s*\{/m.test(src)) continue;
  if (!TYPE_RE.test(src)) continue;
  TYPE_RE.lastIndex = 0;

  const next = src.replace(
    TYPE_RE,
    // Keep the builder name in a comment for grep-ability after regen.
    ": Record<string, NavigationMetadata> /* postgen-kiota-compat: query nav vs QUERY method */",
  );
  if (next !== src) {
    fs.writeFileSync(file, next);
    patched += 1;
    console.log(`postgen-kiota-compat: patched ${path.relative(dotsRoot, file)}`);
  }
}

console.log(`postgen-kiota-compat: done (${patched} file(s))`);

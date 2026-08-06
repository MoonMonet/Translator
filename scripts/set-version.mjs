// Sets the app version across every manifest from a single argument so the
// release tag can't drift from the built binary. Usage: node scripts/set-version.mjs v0.1.6
import { readFileSync, writeFileSync } from "node:fs";

const raw = process.argv[2] ?? "";
const version = raw.replace(/^v/, "");

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`set-version: invalid version "${raw}" (expected e.g. v0.1.6)`);
  process.exit(1);
}

const edits = [
  ["package.json", /"version": "[^"]*"/, `"version": "${version}"`],
  ["src-tauri/tauri.conf.json", /"version": "[^"]*"/, `"version": "${version}"`],
  ["src-tauri/Cargo.toml", /^version = "[^"]*"/m, `version = "${version}"`],
  ["src-tauri/Cargo.lock", /(name = "moon-translator"\r?\nversion = ")[^"]*/, `$1${version}`],
];

for (const [file, pattern, replacement] of edits) {
  const text = readFileSync(file, "utf8");
  if (!pattern.test(text)) {
    console.error(`set-version: version pattern not found in ${file}`);
    process.exit(1);
  }
  writeFileSync(file, text.replace(pattern, replacement));
  console.log(`set ${file} -> ${version}`);
}

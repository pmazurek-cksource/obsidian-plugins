// Copies the built plugin into an Obsidian vault and enables it.
// Usage: node install.mjs [vaultPath]   (default: ~/obsidian-notes, or $OBSIDIAN_VAULT)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const vault = process.argv[2] ?? process.env.OBSIDIAN_VAULT ?? path.join(os.homedir(), "obsidian-notes");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const target = path.join(vault, ".obsidian", "plugins", manifest.id);

fs.mkdirSync(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  fs.copyFileSync(file, path.join(target, file));
}

const enabledPath = path.join(vault, ".obsidian", "community-plugins.json");
const enabled = fs.existsSync(enabledPath) ? JSON.parse(fs.readFileSync(enabledPath, "utf8")) : [];
if (!enabled.includes(manifest.id)) {
  enabled.push(manifest.id);
  fs.writeFileSync(enabledPath, JSON.stringify(enabled, null, 2));
}

console.log(`Installed ${manifest.id} to ${target}`);

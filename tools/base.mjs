// Where the deployed backend is: NW_BASE, else the file .base-url next to the project (kept out of git, like the keys:
// the game's servers send to it, so it isn't published with the code).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export function prodBase() {
	if (process.env.NW_BASE) return process.env.NW_BASE.replace(/\/$/, "");
	try {
		return readFileSync(join(root, ".base-url"), "utf8").trim().replace(/\/$/, "");
	} catch {
		console.error("Set NW_BASE or write your Worker's URL in .base-url (e.g. https://nightwheels-analytics.<you>.workers.dev)");
		process.exit(1);
	}
}

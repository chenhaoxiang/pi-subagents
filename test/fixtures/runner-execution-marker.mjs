import * as fs from "node:fs";
import * as path from "node:path";

export async function runConfiguredSubagentExecution(config) {
	fs.writeFileSync(path.join(config.asyncDir, "execution-marker.json"), JSON.stringify({ id: config.id }), { flag: "wx" });
}

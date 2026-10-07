import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { HOST_PEER_ALIASES, resolveHostPeerAliases } from "../../src/runs/background/runner-aliases.ts";

function hostFixture(version: string) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-fork-host-"));
	const host = path.join(root, "host");
	const exportsByPackage = new Map<string, Record<string, string>>();
	for (const alias of HOST_PEER_ALIASES) {
		if (alias.optional) continue;
		const exports = exportsByPackage.get(alias.pkg) ?? {};
		exports[alias.subpath] = "./index.js";
		exportsByPackage.set(alias.pkg, exports);
	}
	exportsByPackage.set("@earendil-works/chord", { ".": "./index.js", "./context": "./index.js" });
	for (const [name, exports] of exportsByPackage) {
		const directory = name === "@earendil-works/pi-coding-agent" ? host : path.join(host, "node_modules", name);
		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(path.join(directory, "index.js"), "export const fixture = true;\n");
		fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name, version: directory === host ? version : "0.0.0-peer", type: "module", exports }));
	}
	return { root, host };
}

for (const version of ["1.0.4", "1.0.4-fork.1", "1.1.0-fork.2", "2.0.0-fork.1"]) {
	test(`recognized stable/fork Pi host can omit the removed node export: ${version}`, () => {
		const f = hostFixture(version);
		try {
			const result = resolveHostPeerAliases(f.host);
			assert.deepEqual(result.missing, []);
			assert.equal(result.aliases["@earendil-works/pi-agent-core/node"], undefined);
			assert.ok(result.aliases["@earendil-works/chord/context"]);
		} finally { fs.rmSync(f.root, { recursive: true, force: true }); }
	});
}

for (const version of ["1.0.4-beta.1", "1.0.4+build.1", "1.0.4-fork.0", "1.0.4-fork.01", "1.0.4-fork.1-beta", "01.0.4-fork.1", "1.00.4-fork.1", "v1.0.4-fork.1", "1.0.4-fork.1000000", "unknown", "0.99.2-fork.1"]) {
	test(`unknown/pre-1.0/malformed fork host remains fail-closed: ${version}`, () => {
		const f = hostFixture(version);
		try { assert.deepEqual(resolveHostPeerAliases(f.host).missing, ["@earendil-works/pi-agent-core/node"]); }
		finally { fs.rmSync(f.root, { recursive: true, force: true }); }
	});
}

for (const version of ["1.0.4", "1.0.4-fork.1"]) {
	test(`declared legacy node export with a missing file remains fail-closed: ${version}`, () => {
		const f = hostFixture(version);
		try {
			const file = path.join(f.host, "node_modules", "@earendil-works", "pi-agent-core", "package.json");
			const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
			manifest.exports["./node"] = "./missing.js";
			fs.writeFileSync(file, JSON.stringify(manifest));
			assert.deepEqual(resolveHostPeerAliases(f.host).missing, ["@earendil-works/pi-agent-core/node"]);
		} finally { fs.rmSync(f.root, { recursive: true, force: true }); }
	});
}

test("fork recognition does not suppress any other missing required peer", () => {
	const f = hostFixture("1.0.4-fork.1");
	try {
		fs.rmSync(path.join(f.host, "node_modules", "@earendil-works", "chord"), { recursive: true });
		assert.deepEqual(resolveHostPeerAliases(f.host).missing, ["@earendil-works/chord", "@earendil-works/chord/context"]);
	} finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

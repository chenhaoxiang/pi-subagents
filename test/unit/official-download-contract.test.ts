import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";

const workflow = parse(fs.readFileSync(new URL("../../.github/workflows/test.yml", import.meta.url), "utf8"));
const job = workflow.jobs["official-standalone"];
const step = job.steps.find((value: { name?: string }) => value.name === "Provision the checksum-pinned official binary");
const run: string = step.run;
const release = JSON.parse(fs.readFileSync(new URL("../smoke/standalone-release.json", import.meta.url), "utf8"));

describe("official standalone download recovery", () => {
	it("uses bounded network retries and only the same official asset for API fallback", () => {
		assert.equal(workflow.permissions.contents, "read");
		assert.equal(step.env.GH_TOKEN, "${{ github.token }}");
		assert.match(run, /curl --fail --location --connect-timeout 30 --max-time 180 --retry 3 --retry-delay 15 --retry-max-time 300/);
		assert.match(run, /timeout --kill-after=10s 180s gh release download "v\$\(node -p 'require\("\.\/test\/smoke\/standalone-release\.json"\)\.version'\)"/);
		assert.match(run, /--repo earendil-works\/pi --pattern pi-linux-x64\.tar\.gz/);
		assert.equal(release.url, `https://github.com/earendil-works/pi/releases/download/v${release.version}/pi-linux-x64.tar.gz`);
	});

	it("keeps hash verification mandatory after either download path and before extraction", () => {
		const cacheGate = run.indexOf('if ! test -f "$archive"');
		const fallback = run.indexOf("if ! curl");
		const endFallback = run.indexOf("\nfi", fallback);
		const hash = run.indexOf("sha256sum --check -");
		const extract = run.indexOf("tar -xzf");
		assert.ok(cacheGate >= 0 && fallback > cacheGate && endFallback > fallback && hash > endFallback && extract > hash);
		assert.match(run, /set -euo pipefail/);
		assert.match(run, /archive="\$RUNNER_TEMP\/pi-official-archive\/release\.tar\.gz"/);
		assert.match(run, /curl[^\n]+--output "\$archive"/);
		assert.match(run, /mv "\$RUNNER_TEMP\/pi-official-archive\/release-api\.tar\.gz" "\$archive"/);
		assert.match(run.slice(endFallback), /"\$sha" "\$archive" \| sha256sum --check -/);
		assert.match(run.slice(extract), /^tar -xzf "\$archive"/);
		const cache = job.steps.find((value: { uses?: string }) => value.uses === "actions/cache@v4");
		assert.equal(cache.with.path, "${{ runner.temp }}/pi-official-archive");
		assert.equal(cache.with.key, "pi-official-${{ steps.release.outputs.sha }}");
		assert.equal(step["continue-on-error"], undefined);
		assert.doesNotMatch(run.slice(hash, extract), /\|\|/);
	});
});

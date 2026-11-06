// Isolated synthetic writer used by mission-concurrency.test.ts; never reads a real mission store.
import assert from "node:assert/strict";
import fsDefault, * as fs from "node:fs";
import * as path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import { tryLease } from "../../src/shared/file-lease.ts";

// Optional read-only baseline modules, used only to prove the corrected race fixture.
const moduleUrl = name => process.env.PI_SUBAGENTS_MISSION_SMOKE_BASELINE
  ? pathToFileURL(path.join(process.env.PI_SUBAGENTS_MISSION_SMOKE_BASELINE, "src/missions", name))
  : new URL("../../src/missions/" + name, import.meta.url);
const { readMission, updateMission } = await import(moduleUrl("store.ts"));
const { syncMissionFromAsyncCompletion } = await import(moduleUrl("lifecycle.ts"));

const [configFile] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
const { location, missionId, action, gate } = config;
const recordPath = path.join(location.missionDir, missionId + ".json");
const originalRead = fsDefault.readFileSync;
if (gate) {
  let intercepted = false;
  fsDefault.readFileSync = function (file, ...args) {
    const value = originalRead.call(this, file, ...args);
    if (!intercepted && String(file) === recordPath) {
      intercepted = true;
      fs.writeFileSync(gate + ".ready", String(process.pid));
      const end = Date.now() + 15000;
      while (!fs.existsSync(gate + ".release")) {
        assert(Date.now() < end, "fixture gate deadline");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
    }
    return value;
  };
  syncBuiltinESMExports();
}
try {
  if (action === "hold-lock") {
    const release = tryLease(recordPath + ".write-lock");
    assert(release);
    fs.writeFileSync(config.held, String(process.pid));
    setInterval(() => {}, 1000);
  } else {
    const record = action === "complete"
      ? syncMissionFromAsyncCompletion(config.event)
      : updateMission(location, missionId, config.update);
    assert(record);
    console.log(JSON.stringify({ state: "written", record: readMission(location, missionId) }));
  }
} catch (error) {
  if (error?.constructor?.name !== "FileLeaseBusyError") throw error;
  console.log(JSON.stringify({ state: "busy", message: error.message }));
} finally {
  fsDefault.readFileSync = originalRead;
  syncBuiltinESMExports();
}

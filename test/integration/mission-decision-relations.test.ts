import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Details } from "../../src/shared/types.ts";
import { makeMinimalCtx } from "../support/helpers.ts";
import { available, installAsyncExecutionHooks, makeAsyncExecutor, mockPi, tempDir } from "../support/async-execution-fixture.ts";

// Native public management executor and independent SessionManager identities.
// No child launch, prompt, provider or real mission store is involved.
describe("typed decision management", { skip: !available ? "pi packages not available" : undefined }, () => {
 installAsyncExecutionHooks();
 it("retains typed originals across fresh-reader identities without granting a new launch or approval", async () => {
  const store=path.join(tempDir,"typed-decision-store");
  const executor=makeAsyncExecutor([],{missions:{directory:store,globalIndex:false}});
  const owner=SessionManager.create(tempDir,path.join(tempDir,"owner-session"));
  const fresh=SessionManager.create(tempDir,path.join(tempDir,"fresh-session"));
  assert.notEqual(owner.getSessionId(),fresh.getSessionId());
  const execute=(params:Record<string,unknown>,manager=owner)=>executor.execute("typed-management",params,new AbortController().signal,undefined,{...makeMinimalCtx(tempDir),sessionManager:manager}) as Promise<{isError?:boolean;details:Details}>;
  const created=await execute({action:"mission.create",mission:{title:"Synthetic typed questions"}});
  const id=created.details.missionId!;
  await execute({action:"mission.update",missionId:id,missionUpdate:{status:"active",decisions:[{title:"A"},{title:"B"}]}});
  const first=await execute({action:"mission.show",missionId:id});const oldId=first.details.mission!.decisions[0]!.id;
  const appended=await execute({action:"mission.update",missionId:id,missionUpdate:{decisions:[{title:"A replacement",supersedes:oldId}]}});
  const newId=appended.details.mission!.decisions[2]!.id;
  assert.equal(appended.details.mission!.decisions[0]!.status,"open");
  const closed=await execute({action:"mission.update",missionId:id,missionUpdate:{closeDecision:{id:oldId,reason:"superseded",supersededBy:newId,resolution:"Explicit owner replacement"}}});
  assert.notEqual(closed.isError,true);
  assert.equal(closed.details.mission!.decisions[0]!.closeReason,"superseded");
  const before=fs.readFileSync(path.join(store,id+".json"));
  const freshRead=await execute({action:"mission.show",missionId:id},fresh);
  assert.deepEqual(freshRead.details.mission!.decisions,closed.details.mission!.decisions);
  assert.equal(freshRead.details.mission!.ownerSessionId,created.details.mission!.ownerSessionId);
  assert.deepEqual(fs.readFileSync(path.join(store,id+".json")),before);
  await assert.rejects(() => execute({action:"mission.resolve-decision",missionId:id,id:oldId,summary:"Late answer for old ID"},fresh), /already resolved/);
  assert.deepEqual(fs.readFileSync(path.join(store,id+".json")),before);
  const resolved=await execute({action:"mission.resolve-decision",missionId:id,id:newId,summary:"Explicit answer for new ID"});
  assert.equal(resolved.details.mission!.decisions[2]!.closeReason,"answered");
  assert.equal(resolved.details.mission!.decisions[1]!.status,"open");
  assert.equal(resolved.details.mission!.status,"needs_decision");
  assert.equal(resolved.details.mission!.runs.length,0);assert.equal(resolved.details.mission!.receipts.length,0);
  assert.equal(mockPi.callCount(),0,"management does not launch or call a child model");
 });
});

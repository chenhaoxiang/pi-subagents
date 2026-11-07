import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { it } from "node:test";
import { handleMissionAction } from "../../src/missions/actions.ts";
import { createMission, missionRecordPath, readMission, resolveMissionStoreLocation, updateMission } from "../../src/missions/store.ts";
import type { MissionUpdateInput } from "../../src/missions/types.ts";

function fixture() {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"decision-relations-"));
 const ctx={cwd:root,agentDir:path.join(root,"agent")};
 const location=resolveMissionStoreLocation({projectRoot:root,agentDir:ctx.agentDir});
 const mission=createMission(location,{title:"Synthetic questions",objective:"Preserve exact lineage",status:"active"});
 const update=(missionUpdate:unknown)=>handleMissionAction("mission.update",{missionId:mission.id,missionUpdate},ctx).details!.mission!;
 const first=update({decisions:[{title:"A"},{title:"Independent B"}]});
 const a=first.decisions[0]!.id,b=first.decisions[1]!.id,file=missionRecordPath(location,mission.id);
 const bytes=()=>fs.readFileSync(file,"utf8");
 const replacement=()=>update({decisions:[{title:"A2",supersedes:a}]}).decisions.at(-1)!.id;
 const close=(id:string,reason:string,supersededBy?:string)=>update({closeDecision:{id,reason,resolution:"Owner lifecycle declaration",...(supersededBy===undefined?{}:{supersededBy})}});
 const answer=(id:string)=>handleMissionAction("mission.resolve-decision",{missionId:mission.id,id,summary:"Explicit synthetic answer"},ctx).details!.mission!;
 const cleanup=()=>fs.rmSync(root,{recursive:true,force:true});
 return {root,ctx,location,mission,a,b,file,update,bytes,replacement,close,answer,cleanup};
}

it("appending replacement preserves old bytes within record and only successful closure retires exact old ID",()=>{
 const h=fixture();try{
  const original=readMission(h.location,h.mission.id).decisions[0],r=h.replacement();
  let current=readMission(h.location,h.mission.id);assert.deepEqual(current.decisions[0],original);assert.equal(current.decisions.at(-1)!.supersedes,h.a);assert.equal(current.status,"needs_decision");
  current=h.close(h.a,"superseded",r);assert.equal(current.decisions[0]!.supersededBy,r);assert.equal(current.decisions[0]!.closeReason,"superseded");assert.equal(current.decisions.at(-1)!.status,"open");
  const before=h.bytes();assert.throws(()=>h.answer(h.a),/already resolved/);assert.equal(h.bytes(),before);assert.equal(h.answer(r).decisions.at(-1)!.closeReason,"answered");
  current=readMission(h.location,h.mission.id);assert.equal(current.decisions[1]!.status,"open");assert.equal(current.status,"needs_decision");assert.equal(current.runs.length,0);assert.equal(current.receipts.length,0);
 }finally{h.cleanup();}
});
it("old ID can still receive an answer during the two-write gap; closing cannot replace that answer",()=>{
 const h=fixture();try{const r=h.replacement();const answered=h.answer(h.a),before=h.bytes();assert.equal(answered.decisions[0]!.closeReason,"answered");assert.throws(()=>h.close(h.a,"superseded",r),/already resolved/);assert.equal(h.bytes(),before);assert.equal(readMission(h.location,h.mission.id).decisions.at(-1)!.status,"open");assert.equal(answered.decisions[0]!.supersededBy,undefined);}finally{h.cleanup();}
});
it("withdrawal closes only exact open question without a replacement or user-approval inference",()=>{
 const h=fixture();try{const b=readMission(h.location,h.mission.id).decisions[1];const withdrawn=h.close(h.a,"withdrawn");assert.equal(withdrawn.decisions[0]!.closeReason,"withdrawn");assert.equal(withdrawn.decisions[0]!.supersededBy,undefined);assert.deepEqual(withdrawn.decisions[1],b);const before=h.bytes();assert.throws(()=>h.answer(h.a),/already resolved/);assert.throws(()=>h.close(h.a,"withdrawn"),/already resolved/);assert.equal(h.bytes(),before);}finally{h.cleanup();}
});
it("bad or cross-mission references and unsupported closures are pre-write errors",()=>{
 const h=fixture();try{
  const other=createMission(h.location,{title:"Other",objective:"No cross mission refs"});const foreign=updateMission(h.location,other.id,{addDecisions:[{title:"Foreign"}]}).decisions[0]!.id;
  for(const patch of [
   {decisions:[{title:"Bad",supersedes:"missing"}]},{decisions:[{title:"Bad",supersedes:foreign}]},{decisions:[{title:"Bad",supersedes:"../unsafe"}]},
   {closeDecision:{id:h.a,reason:"superseded",resolution:"Missing reference"}},{closeDecision:{id:h.a,reason:"superseded",resolution:"Wrong relation",supersededBy:h.b}},
   {closeDecision:{id:h.a,reason:"superseded",resolution:"Wrong mission",supersededBy:foreign}},{closeDecision:{id:h.a,reason:"withdrawn",resolution:"Wrong ref",supersededBy:h.b}},
   {closeDecision:{id:h.a,reason:"approved",resolution:"Not provided"}},{closeDecision:{id:h.a,reason:"withdrawn",resolution:" "}},
   {decisions:[{title:"Bad",status:"resolved"}]},{decisions:[{title:"Bad",closeReason:"withdrawn"}]},
  ]){const before=h.bytes();assert.throws(()=>h.update(patch));assert.equal(h.bytes(),before);}
 }finally{h.cleanup();}
});
it("a closed old target or closed replacement cannot form successful supersession",()=>{
 const h=fixture();try{const r=h.replacement();h.close(r,"withdrawn");let before=h.bytes();assert.throws(()=>h.close(h.a,"superseded",r),/not an open replacement/);assert.equal(h.bytes(),before);h.answer(h.a);before=h.bytes();assert.throws(()=>h.replacement(),/not open/);assert.equal(h.bytes(),before);}finally{h.cleanup();}
});
it("append plus supersession close in the same internal write is rejected, not silently atomic",()=>{
 const h=fixture();try{const r=h.replacement(),before=h.bytes();assert.throws(()=>updateMission(h.location,h.mission.id,{addDecisions:[{title:"A3",supersedes:h.a}],resolveDecision:{id:h.a,resolution:"No one-call replacement",closeReason:"superseded",supersededBy:r}}),/separate operations/);assert.equal(h.bytes(),before);}finally{h.cleanup();}
});
it("read/show and unrelated record mutations preserve typed lineage and original closure time",()=>{
 const h=fixture();try{const r=h.replacement(),closed=h.close(h.a,"superseded",r),expected=closed.decisions;const shown=handleMissionAction("mission.show",{missionId:h.mission.id},h.ctx).details!.mission!;assert.deepEqual(shown.decisions,expected);assert.deepEqual(h.update({summary:"Unrelated update"}).decisions,expected);assert.deepEqual(readMission(h.location,h.mission.id).decisions,expected);}finally{h.cleanup();}
});
it("old resolved records without closeReason remain unclassified instead of being labelled answered",()=>{
 const h=fixture();try{h.answer(h.a);const raw=JSON.parse(h.bytes());delete raw.decisions[0].closeReason;fs.writeFileSync(h.file,JSON.stringify(raw));const r=readMission(h.location,h.mission.id);assert.equal(r.decisions[0]!.status,"resolved");assert.equal(r.decisions[0]!.closeReason,undefined);assert.equal(h.update({summary:"Preserve legacy fact"}).decisions[0]!.closeReason,undefined);}finally{h.cleanup();}
});
it("malformed typed record relations are not read or rewritten as valid facts",()=>{
 const h=fixture();try{const r=h.replacement();h.close(h.a,"superseded",r);const original=h.bytes();
  for(const mutate of [
   (x:any)=>{x.decisions[0].closeReason="approved";},(x:any)=>{x.decisions[0].supersededBy=h.b;},
   (x:any)=>{x.decisions[2].supersedes="missing";},(x:any)=>{x.decisions[2].supersedes=r;},
   (x:any)=>{x.decisions[2].closeReason="answered"},
  ]){const raw=JSON.parse(original);mutate(raw);const bytes=JSON.stringify(raw);fs.writeFileSync(h.file,bytes);assert.throws(()=>readMission(h.location,h.mission.id));assert.throws(()=>h.update({summary:"No laundering"}));assert.equal(h.bytes(),bytes);}
 }finally{h.cleanup();}
});
it("existing lease callback and complete mission lifecycle stay independent of decision closure kind",()=>{
 const h=fixture();try{h.close(h.a,"withdrawn");const before=readMission(h.location,h.mission.id).decisions;const after=updateMission(h.location,h.mission.id,current=>({summary:current.status}));assert.deepEqual(after.decisions,before);h.close(h.b,"withdrawn");assert.equal(readMission(h.location,h.mission.id).status,"active");const terminal=h.update({status:"completed"});assert.equal(terminal.status,"completed");assert.equal(terminal.runs.length,0);}finally{h.cleanup();}
});

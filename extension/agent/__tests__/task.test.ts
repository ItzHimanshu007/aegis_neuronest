import { describe, expect, it, vi } from 'vitest';
import { taskReducer, TASK_STATES, cancellable } from '../../agentHost/task/state';
import { Recovery } from '../recovery';
import { verify } from '../verifier';
import { scene, element } from '../../scene/__tests__/fixtures';
import { RequirementLedger, checkRequirements } from '../requirements';
import { consentRequest } from '../../agentHost/task/consent';
import { PrivacySession } from '../../agentHost/session';
import { TokenVault } from '../../privacy/vault';

// Matches runAgentLoop.ts's real post-approval sequence: awaiting_approval -> observing (a fresh
// capture, "a human may have changed the page while deciding") -> checking (re-check the action
// against it) -> executing, not straight to executing.
const path = ['idle','observing','consenting','observing','planning','checking','awaiting_approval','observing','checking','executing','observing','verifying','checking','verifying','done'] as const;
describe('task state machine',()=>{
  it('runs the consent, approval, execution and verification path',()=>{
    let state:typeof TASK_STATES[number]='idle';
    for(const next of path.slice(1)) state=taskReducer(state,next);
    expect(state).toBe('done');
  });
  it('re-observes after an approval before re-checking the action — runAgentLoop.ts\'s actual sequence, not just a checking round-trip',()=>{
    // Regression: runAgentLoop.ts calls observe(true) (which itself calls move('observing'))
    // directly from 'awaiting_approval' — "a human may have changed the page while deciding,
    // never execute from a stale snapshot" — not move('checking') first. That transition was
    // missing from NEXT, so approving ANY L4/L5 action threw and crashed the whole task to
    // 'failed' immediately after Approve. Found by actually driving an approval through the real
    // agent loop (Stage 3B Part II); the `path` test below predates this and never exercised it.
    expect(taskReducer('awaiting_approval','observing')).toBe('observing');
  });
  it.each(TASK_STATES.filter(s=>!['done','failed','stopped'].includes(s)))('Stop interrupts %s',state=>expect(taskReducer(state,'stopped')).toBe('stopped'));
  it.each(['done','failed','stopped'] as const)('terminal %s cannot restart',state=>expect(()=>taskReducer(state,'observing')).toThrow());
  it('rejects execution without a checked plan',()=>expect(()=>taskReducer('planning','executing')).toThrow());
  it('can recover, ask the user, retry and fail',()=>{
    expect(taskReducer('checking','recovering')).toBe('recovering');
    expect(taskReducer('recovering','asking_user')).toBe('asking_user');
    expect(taskReducer('asking_user','observing')).toBe('observing');
    expect(taskReducer('recovering','failed')).toBe('failed');
  });
  it('does not consume a delayed result after cancellation',async()=>{
    const controller=new AbortController();let finish!:(v:number)=>void;
    const result=cancellable(controller.signal,new Promise<number>(resolve=>{finish=resolve;}));
    controller.abort();finish(42);await expect(result).rejects.toThrow();
  });
});
describe('verification',()=>{
  it.each([
    [{has_value:true,eid:'E1'},'PASS'],[{has_value:false,eid:'E1'},'FAIL'],
    [{visible:true,eid:'E1'},'PASS'],[{enabled:false,eid:'E1'},'FAIL'],
    [{visible:true,eid:'E999'},'FAIL'],[{modal_open:true},'FAIL'],
    [{url_path_prefix:'/impossible'},'FAIL'],[{text_present:'not present'},'FAIL'],
    [undefined,'UNVERIFIABLE'],[{no_validation_error:true},'UNVERIFIABLE'],
  ] as const)('checks structured evidence %j',(expectation,verdict)=>expect(verify(expectation,scene()).verdict).toBe(verdict));
  it('a value mismatch overrides a permissive has_value expectation',()=>expect(verify({has_value:true},scene(),{action:'type',target:{eid:'E1',fp:'fp'}},{ok:true,match:false})).toEqual({verdict:'FAIL',code:'VALUE_MISMATCH'}));
  it('unchanged execution with failed evidence records an untrusted-event rejection',()=>expect(verify({text_present:'missing'},scene(),{action:'click'},{ok:true,changed:false}).verdict).toBe('FAIL'));
  it('validation errors prevent success',()=>expect(verify({no_validation_error:true},scene(),undefined,{ok:true,validationError:true}).verdict).toBe('FAIL'));

  // --- Verification contract: done evidence must not be vacuously satisfiable ---
  // Finding 3 from Stage 4: url_path_prefix:"/" is always true and must not independently prove
  // completion. These are the regression tests for the fix in verifier.ts.

  // Negative: vacuous url_path_prefix alone cannot prove done
  it('done with url_path_prefix:"/" alone is FAIL — vacuous evidence rejected',()=>
    expect(verify({url_path_prefix:'/'},scene(),{action:'done'})).toEqual({verdict:'FAIL',code:'EXPECT_FAILED'}));
  it('done with url_path_prefix:"" alone is FAIL — empty prefix is always true',()=>
    expect(verify({url_path_prefix:''},scene(),{action:'done'})).toEqual({verdict:'FAIL',code:'EXPECT_FAILED'}));
  it('done with url_path_prefix:"/" plus only an eid is FAIL — eid is a reference key, not a state predicate',()=>
    expect(verify({url_path_prefix:'/',eid:'E1'},scene(),{action:'done'})).toEqual({verdict:'FAIL',code:'EXPECT_FAILED'}));
  it('done with missing evidence is UNVERIFIABLE — schema requires evidence but verifier handles undefined defensively',()=>
    expect(verify(undefined,scene(),{action:'done'})).toEqual({verdict:'UNVERIFIABLE',code:'UNVERIFIABLE'}));

  // Negative: ordinary action expect is NOT subject to the done-evidence gate
  it('a non-done action with url_path_prefix:"/" in expect still PASSes — gate applies only to done',()=>
    expect(verify({url_path_prefix:'/'},scene(),{action:'click',target:{eid:'E1',fp:'fp'}}).verdict).toBe('PASS'));

  // Positive: done with meaningful evidence passes.
  // scene() fixture URL is https://example.test/a — prefix '/a' matches and is specific (> 1 char).
  it('done with a specific url_path_prefix is PASS — fixture url pathname is /a',()=>
    expect(verify({url_path_prefix:'/a'},scene(),{action:'done'}).verdict).toBe('PASS'));
  // scene() fixture element (E1) has hasValue:true — element-bound predicate is meaningful.
  it('done with has_value:true bound to a real eid is PASS',()=>
    expect(verify({has_value:true,eid:'E1'},scene(),{action:'done'}).verdict).toBe('PASS'));
  // url_path_prefix:"/" paired with another condition: meaningful_conds = 1, gate does not fire.
  it('done with url_path_prefix:"/" AND has_value:true (eid-bound) is PASS — one meaningful condition is enough',()=>
    expect(verify({url_path_prefix:'/',has_value:true,eid:'E1'},scene(),{action:'done'}).verdict).toBe('PASS'));
});

it('replans twice, then asks; detects repeated no-progress actions',()=>{
  const recovery=new Recovery();
  expect(recovery.decide('STALE_PLAN')).toBe('replan');expect(recovery.decide('TOKEN_TYPE_MISMATCH')).toBe('replan');
  expect(recovery.decide('AMBIGUOUS_TARGET')).toBe('ask_user');
  recovery.retry();expect(recovery.record('click','fp','digest',false)).toBeUndefined();recovery.record('click','fp','digest',false);
  expect(recovery.record('click','fp','digest',false)).toBe('LOOP_DETECTED');
  expect(recovery.decide('BUDGET_EXHAUSTED')).toBe('ask_user');
});
it('consent keeps high-risk types separate and discovers credentials',()=>{
  const session=new PrivacySession();session.taskCategories.add('AADHAAR');session.taskCategories.add('PASSWORD');
  expect(consentRequest(scene(),session)).toMatchObject({medium:['EMAIL'],high:['AADHAAR'],credential:true});
});
it('clearing a vault during an asynchronous token operation cannot restore secrets',async()=>{
  const vault=new TokenVault();await vault.init();
  const sign=crypto.subtle.sign.bind(crypto.subtle);let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const spy=vi.spyOn(crypto.subtle,'sign').mockImplementation(async(...args)=>{await gate;return sign(...args);});
  const pending=vault.tokenize('EMAIL','synthetic@example.test',{source:'task',origin:'https://example.test'});
  vault.clear();release();await expect(pending).rejects.toThrow('ended');expect(vault.allTokens()).toEqual([]);spy.mockRestore();
});

// --- Task requirement ledger: multi-field completion the plan schema cannot express ---
// `plan.v2` gives `done` ONE `evidence` with at most one `eid`, forbids `target` on it, and
// runAgentLoop stops at the first `done`. So for "fill in my name and email", the best claim a
// model can make is `{eid:E1,has_value:true}` — which PASSED while the email beside it was still
// empty (a real false-accept), and every other form is unsatisfiable by construction. Real runs
// ended DONE_UNVERIFIED/falseSuccess after 10 replans. The ledger is the client's own record of
// which supplied values actually landed, checked against a fresh scene.
describe('task requirement ledger',()=>{
  const two=()=>[element({fp:'fpa',nodeRef:'n1',name:'Full name',labelText:'Full name',inputType:'text',value:'',hasValue:false}),
    element({fp:'fpb',nodeRef:'n2',name:'Email',labelText:'Email',value:'',hasValue:false})];
  const filled=(...names:string[])=>two().map(e=>names.includes(e.name!)?{...e,value:'x@example.test',hasValue:true}:e);
  const done={action:'done'} as const, ev={eid:'E1',has_value:true} as const;

  it('empty requirements leave done verification exactly as it was',()=>
    expect(verify(ev,scene(),done,undefined,{required:[],placements:[]}).verdict).toBe('PASS'));

  // The headline bug: this evidence passes on its own merits and must no longer carry the task.
  it('a required value that was never placed fails a done that its own evidence would pass',()=>{
    expect(verify(ev,scene(),done).verdict).toBe('PASS');
    expect(verify(ev,scene(),done,undefined,{required:['tokenA'],placements:[]}))
      .toEqual({verdict:'FAIL',code:'REQUIREMENTS_UNMET'});
  });

  it.each([
    ['both placed and still filled',['Full name','Email'],[['tokenA','E1'],['tokenB','E2']],'PASS'],
    ['one of two placed',['Full name'],[['tokenA','E1']],'FAIL'],
    ['placed but the page reverted it',[],[['tokenA','E1'],['tokenB','E2']],'FAIL'],
  ] as const)('%s',(_name,fill,places,verdict)=>{
    const s=scene(filled(...fill));
    const placements=places.map(([token,eid])=>({token,eid:eid as `E${number}`,screenEpoch:1}));
    expect(verify(ev,s,done,undefined,{required:['tokenA','tokenB'],placements}).verdict).toBe(verdict);
  });

  it('a placement whose element vanished on the SAME screen is unmet',()=>
    expect(verify(ev,scene(filled('Full name')),done,undefined,
      {required:['tokenA'],placements:[{token:'tokenA',eid:'E9',screenEpoch:1}]}).verdict).toBe('FAIL'));

  // EIDs are retired permanently by scene/registry.ts, so after a navigation a good placement
  // points at an EID that can never reappear. Failing there would punish a finished task for the
  // page having moved on.
  it('a placement whose element vanished after the screen changed is satisfied by history',()=>
    expect(verify(ev,scene(filled('Full name'),undefined,{},2),done,undefined,
      {required:['tokenA'],placements:[{token:'tokenA',eid:'E9',screenEpoch:1}]}).verdict).toBe('PASS'));

  it('gates done only — other actions are untouched by an unmet ledger',()=>
    expect(verify({has_value:true,eid:'E1'},scene(),{action:'click'},undefined,{required:['tokenA'],placements:[]}).verdict).toBe('PASS'));

  it('a value mismatch still outranks the ledger',()=>
    expect(verify(ev,scene(),{action:'type',target:{eid:'E1',fp:'fp'}},{ok:true,match:false},{required:['tokenA'],placements:[]}))
      .toEqual({verdict:'FAIL',code:'VALUE_MISMATCH'}));

  it('unmet requirements outrank vacuous evidence, so the reason reported is the real one',()=>
    expect(verify({url_path_prefix:'/'},scene(),done,undefined,{required:['tokenA'],placements:[]}))
      .toEqual({verdict:'FAIL',code:'REQUIREMENTS_UNMET'}));
});

describe('requirement ledger bookkeeping',()=>{
  // Keyed by token, not category: vault.tokenize() de-dupes on (type, normalized value), so two
  // NAME rows with different values are two tokens and one filled field must not satisfy both.
  it('tracks each required token separately',()=>{
    const ledger=new RequirementLedger();ledger.require('a');ledger.require('a');ledger.require('b');
    ledger.place('a','E1',1);
    expect(checkRequirements(ledger.view(()=>true),scene()).verdict).toBe('UNMET');
    expect(ledger.view(()=>true).required).toEqual(['a','b']);
  });
  // Typing a second value into the same field overwrites the first; the first must stop counting.
  it('a re-typed field stops satisfying the value it replaced',()=>{
    const ledger=new RequirementLedger();ledger.require('a');ledger.require('b');
    ledger.place('a','E1',1);ledger.place('b','E1',1);
    const check=checkRequirements(ledger.view(()=>true),scene());
    expect(check).toEqual({verdict:'UNMET',unmet:['a']});
  });
  it('drops requirements the origin has no consent for',()=>{
    const ledger=new RequirementLedger();ledger.require('a');ledger.require('b');ledger.place('a','E1',1);
    expect(checkRequirements(ledger.view(t=>t==='a'),scene()).verdict).toBe('SATISFIED');
  });
  it('a waiver clears every outstanding requirement',()=>{
    const ledger=new RequirementLedger();ledger.require('a');ledger.waiveAll();
    expect(checkRequirements(ledger.view(()=>true),scene()).verdict).toBe('SATISFIED');
  });
});

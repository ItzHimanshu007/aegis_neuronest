import { describe, expect, it, vi } from 'vitest';
import { taskReducer, TASK_STATES, cancellable } from '../../agentHost/task/state';
import { Recovery } from '../recovery';
import { verify } from '../verifier';
import { scene } from '../../scene/__tests__/fixtures';
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

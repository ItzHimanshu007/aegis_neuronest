import { it, expect } from 'vitest';
import { checkAction, checkPlan } from '../../agent/checks';
import { scene, element } from './fixtures';
import { StateTokens, type SealedState } from '../stateTokens';
import type { Action } from '../../shared/schema/plan.v2';
const token='[[PII:EMAIL:abcdefgh]]';
function setup() {
  const s=scene([element(), element({fp:'fpb',nodeRef:'node-b'})]); const states=new StateTokens(); states.commit(s);
  return {s,states,context:states.get(s.state_token)!};
}
it.each(['Szzzzzzzzzz','S2222222222'])('rejects unknown/non-latest state %s',state_token=>{
  const {states}=setup(); expect(checkPlan({schema:'aegis/2',state_token,plan:[{action:'wait',ms:1}]},{stateTokens:states})).toMatchObject({ok:false,reason:'STALE_PLAN'});
});
it('latest echo passes and a subsequently sealed state retires it',()=>{
  const {s,states}=setup(), p={schema:'aegis/2',state_token:s.state_token,plan:[{action:'wait',ms:1}]};
  expect(checkPlan(p,{stateTokens:states}).ok).toBe(true);
  const next=scene(); next.state_token=states.mint(); states.commit(next);
  expect(checkPlan(p,{stateTokens:states})).toMatchObject({ok:false,reason:'STALE_PLAN'});
});
const invalid=[
 {plan:[{action:'done'}]}, {plan:[{action:'done',evidence:{}}]},
 {plan:[{action:'click',target:{eid:'E1',fp:'fpa',selector:'#private'}}]},
 {plan:[{action:'wait',ms:1,text:'hidden text'}]},
 {request_context:{reason:'need context',kind:'more_elements',eid:'E7'}},
 {request_context:{reason:'need context',kind:'scroll_region',region:'hidden'}},
 {answer:{text:'ok'},extract:{data:{}}},
];
it.each(invalid)('rejects malformed response %#',variant=>{
 const {s,states}=setup(); expect(checkPlan({schema:'aegis/2',state_token:s.state_token,...variant},{stateTokens:states})).toMatchObject({ok:false,reason:'INVALID_SCHEMA'});
});
it('plan_steps allowed only before the first plan',()=>{
 const {s,states}=setup(); expect(checkPlan({schema:'aegis/2',state_token:s.state_token,answer:{text:'ok'},plan_steps:['Inspect']},{stateTokens:states,planStepsSeen:true})).toMatchObject({ok:false,reason:'PLAN_STEPS_REPEATED'});
});
it('small DOM changes from typing A leave next action on B valid',()=>{
 const {s,context}=setup(); s.screen={decision:'SAME_SCREEN',reason:'input'}; s.local.stateToken.mutationCounter=4;
 expect(checkAction({action:'type',target:{eid:'E2',fp:'fpb'},text:token},context,s).verdict).toBe('PASS');
});
it.each([
 ['NEW_SCREEN', (s: ReturnType<typeof scene>)=>{s.screenEpoch++}, 'DROP_REMAINING'],
 ['TARGET_MISSING',(s: ReturnType<typeof scene>)=>{s.elements.delete('E1')},'ABORT_BATCH'],
 ['FP_MISMATCH',(s: ReturnType<typeof scene>)=>{s.elements.get('E1')!.fp='changed'},'ABORT_BATCH'],
 ['AMBIGUOUS_TARGET',(s: ReturnType<typeof scene>)=>{s.elements.get('E1')!.ambiguous=true},'ABORT_BATCH'],
 ['NOT_VISIBLE',(s: ReturnType<typeof scene>)=>{s.elements.get('E1')!.visible=false},'ABORT_BATCH'],
 ['NOT_HITTABLE',(s: ReturnType<typeof scene>)=>{s.elements.get('E1')!.hitOk=false},'ABORT_BATCH'],
 ['DISABLED',(s: ReturnType<typeof scene>)=>{s.elements.get('E1')!.states.disabled=true},'ABORT_BATCH'],
 ['TOKEN_TYPE_MISMATCH',(s: ReturnType<typeof scene>)=>{s.elements.get('E1')!.fieldCategory='NAME'},'ABORT_BATCH'],
] as const)('per-action %s -> %s',(reason,mutate,verdict)=>{
 const {s,context}=setup(); mutate(s); expect(checkAction({action:'type',target:{eid:'E1',fp:'fpa'},text:token},context,s)).toMatchObject({reason,verdict});
});
it.each([
 [{action:'navigate',url:'https://example.test/[[PII:EMAIL:abcdefgh]]'},'TOKEN_IN_URL'],
 [{action:'key',key:token},'TOKEN_IN_KEY'],
 [{action:'select',target:{eid:'E1',fp:'fpa'},value:token},'TOKEN_OUTSIDE_TYPE'],
 [{action:'navigate',url:'javascript:alert(1)'},'UNSUPPORTED_URL'],
 [{action:'type',target:{eid:'E1',fp:'fpa'},text:'[[PII:UNKNOWN:abcdefgh]]'},'TOKEN_TYPE_MISMATCH'],
] as Array<[Action,string]>)('rejects unsafe action %#',(action,reason)=>{const {s,context}=setup();expect(checkAction(action,context,s)).toMatchObject({verdict:'ABORT_BATCH',reason});});
it('a new screen remains disqualifying even after later SAME_SCREEN captures',()=>{
 const {s,context}=setup(); s.screenEpoch+=1; s.screen={decision:'SAME_SCREEN',reason:'no-change'};
 expect(checkAction({action:'wait',ms:1},context as SealedState,s)).toMatchObject({verdict:'DROP_REMAINING'});
});

it('origin change drops the batch even when supplied screen metadata is unchanged', () => {
  const {s,context}=setup(); s.page.origin='https://another.test';
  expect(checkAction({action:'wait',ms:1},context,s)).toMatchObject({verdict:'DROP_REMAINING',reason:'NEW_SCREEN'});
});
it('matching tokens embedded in a type action remain type-bound', () => {
  const {s,context}=setup();
  expect(checkAction({action:'type',target:{eid:'E1',fp:'fpa'},text:`Contact ${token}`},context,s).verdict).toBe('PASS');
});

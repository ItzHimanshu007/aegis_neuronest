import { expect, it } from 'vitest';
import { decideContextExpansion, type ContextRequest } from '../contextExpansion';
import { decideSensing, emptyCounters, countSensing } from '..';
import { scene, element } from '../../scene/__tests__/fixtures';
import { SessionPrivacyState, decide } from '../../privacy/policy';
import type { Category } from '../../privacy/categoryTypes';
const budget={remaining:3,elementLimit:2,disclosedEids:new Set<`E${number}`>()};
it('context expansion returns only visible, unredacted, undisclosed EIDs',()=>{
 const s=scene([element(),element({fp:'b',nodeRef:'b'}),element({fp:'c',nodeRef:'c',visible:false,hiddenInteractive:true})]);
 s.elements.get('E1')!.decision='FILL';
 expect(decideContextExpansion({reason:'Need choices',kind:'more_elements'},s,budget)).toEqual({add:['E2'],remaining:2});
 expect(budget.remaining).toBe(3);
});
it.each(['eid','region','hidden_elements'])('context request cannot name %s',key=>{
 expect(decideContextExpansion({reason:'Reveal',kind:'more_elements',[key]:'E1'} as ContextRequest,scene(),budget).deniedReason).toBe('INVALID_REQUEST');
});
it('budget exhausted and no safe elements deny expansion',()=>{
 expect(decideContextExpansion({reason:'Need choices',kind:'more_elements'},scene(),{...budget,remaining:0}).deniedReason).toBe('BUDGET_EXHAUSTED');
 const s=scene();s.elements.get('E1')!.decision='TOKEN';expect(decideContextExpansion({reason:'Need choices',kind:'more_elements'},s,budget).deniedReason).toBe('NO_SAFE_ELEMENTS');
});
it('resolution and scrolling are suggestions; no values or region IDs',()=>{
 expect(decideContextExpansion({reason:'Small text',kind:'higher_resolution'},scene(),budget)).toEqual({add:{kind:'router_resolution_request',requiresRedaction:true},remaining:2});
 expect(decideContextExpansion({reason:'More below',kind:'scroll_region'},scene(),budget).add).toEqual({kind:'scroll',direction:'down'});
});
it.each(['fast','balanced','accurate'] as const)('sensing %s separates server image from inactive detector',mode=>{
 const s=scene(), meta={screen:s.screen,captureId:'c'};
 const first=decideSensing(undefined,meta,mode,{elements:25});
 expect(first).toMatchObject({serverImage:mode,detectorInput:null,runPrivacyDetector:false,runUiDetector:false,runOcr:false,elementBudget:25});
 const second=decideSensing(s,{...meta,screen:{decision:'SAME_SCREEN',reason:'input'}},mode,{elements:25});
 expect(second).toMatchObject({reuse:true,serverImage:'none'});
 expect(countSensing(countSensing(emptyCounters(),first),second)).toEqual({steps:2,domOnly:2,reused:1,visionRequired:0,ocrRequired:0,highResEscalations:0});
});
// The router already withholds the image on SAME_SCREEN, so a task pays for one per screen. A user
// who chooses text-only is asking for none at all — including on the NEW_SCREEN step that would
// otherwise always carry one. Measured: ~1.3s and ~1,000 prompt tokens per screen.
it.each(['fast','balanced','accurate'] as const)('sensing %s withholds the image entirely when asked',mode=>{
 const s=scene(), meta={screen:s.screen,captureId:'c'};
 expect(decideSensing(undefined,meta,mode,{elements:25},false)).toMatchObject({serverImage:'none',reuse:false});
 expect(decideSensing(s,{...meta,screen:{decision:'SAME_SCREEN',reason:'input'}},mode,{elements:25},false)).toMatchObject({serverImage:'none',reuse:true});
 // Default stays vision-on: withholding is a choice, never something a caller gets by omission.
 expect(decideSensing(undefined,meta,mode,{elements:25}).serverImage).toBe(mode);
});
it('linkability accumulates distinct quasi categories per origin and resets at task end',()=>{
 const state=new SessionPrivacyState();
 const det=(category:Category)=>({id:'d',capture_id:'c',source:'field_context' as const,category,confidence:.8,target:{kind:'text_span' as const,ref:'t'},rects:[]});
 state.observeDetections('https://a.test',[det('CITY'),det('CITY')]);
 expect(state.distinctQuasi('https://a.test')).toBe(1);
 state.observeDetections('https://a.test',[det('EMPLOYER'),det('DATE')]);
 expect(state.hasIdentitySeen('https://a.test')).toBe(false); expect(state.hasLinkability('https://a.test')).toBe(true); expect(state.hasLinkability('https://b.test')).toBe(false);
 const d=det('TRACKING_ID');
 expect(decide(d,{necessity:'not_needed',identitySeenOnOrigin:false,linkabilityActive:state.hasLinkability('https://a.test'),userOverrides:{}})).toBe('TOKEN');
 expect(decide(d,{necessity:'not_needed',identitySeenOnOrigin:false,linkabilityActive:false,userOverrides:{}})).toBe('ALLOW');
 state.clear();expect(state.distinctQuasi('https://a.test')).toBe(0);
});

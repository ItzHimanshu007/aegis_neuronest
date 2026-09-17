import { describe, expect, it } from 'vitest';
import { classifyAction, type AuthorityLevel } from '..';
import { AUTHORITY_DEFAULTS } from '../../privacy/policyData';
import type { Action } from '../../shared/schema/plan.v2';
import type { SceneElement } from '../../scene';
import { scene } from '../../scene/__tests__/fixtures';
const base = [...scene().elements.values()][0]!;
const ctx = { origin: 'https://example.test', consentedCategories: new Set<never>() };
const neutral = { ...base, fieldCategory: undefined, inputType: undefined, tag: 'button', role: 'button', labelSanitized: 'Open choices' };
const target = { eid: 'E1', fp: base.fp };
const rows: Array<{ name: string; action: Action; el?: SceneElement; level: AuthorityLevel; user: boolean }> = [
  ...(['wait','scroll','ask_user','done','fail'] as const).map(action => ({ name: action, action: { action }, level:'L0' as const, user:false })),
  { name:'same navigate', action:{ action:'navigate', url:'https://example.test/b' }, level:'L1', user:false },
  { name:'cross navigate', action:{ action:'navigate', url:'https://other.test/' }, level:'L1', user:true },
  { name:'same link', action:{ action:'click', target }, el:{...neutral,role:'link',tag:'a',href:'https://example.test/b'}, level:'L1', user:false },
  { name:'cross link', action:{ action:'click', target }, el:{...neutral,role:'link',tag:'a',href:'https://other.test/'}, level:'L1', user:true },
  ...(['checkbox','radio','switch','tab','combobox'] as const).map(role => ({name:role,action:{action:'click' as const,target},el:{...neutral,role},level:'L2' as const,user:false})),
  { name:'nonsensitive select', action:{ action:'select',target,value:'blue' }, el:neutral,level:'L2',user:false },
  { name:'hover',action:{action:'hover',target},el:neutral,level:'L2',user:false },
  { name:'non-enter key',action:{action:'key',key:'Escape'},el:neutral,level:'L2',user:false },
  { name:'email type',action:{action:'type',target,text:'[[PII:EMAIL:abcdefgh]]'},el:base,level:'L3',user:false },
  { name:'aadhaar type',action:{action:'type',target,text:'[[PII:AADHAAR:abcdefgh]]'},el:{...base,fieldCategory:'AADHAAR'},level:'L3',user:true },
  { name:'token select',action:{action:'select',target,value:'[[PII:NAME:abcdefgh]]'},el:neutral,level:'L3',user:false },
  { name:'password field',action:{action:'type',target,text:'abc'},el:{...base,inputType:'password',fieldCategory:'PASSWORD'},level:'L4',user:true },
  { name:'password token',action:{action:'type',target,text:'[[PII:PASSWORD:abcdefgh]]'},el:neutral,level:'L4',user:true },
  { name:'implicit submit button',action:{action:'click',target},el:{...neutral,inForm:true,buttonType:undefined},level:'L5',user:true },
  ...(['submit','image'] as const).map(inputType=>({name:`input ${inputType}`,action:{action:'click' as const,target},el:{...neutral,tag:'input',inputType},level:'L5' as const,user:true})),
  { name:'formaction',action:{action:'click',target},el:{...neutral,formAction:true},level:'L5',user:true },
  { name:'Enter inside form',action:{action:'key',target,key:'Enter'},el:{...base,inForm:true},level:'L5',user:true },
  { name:'download',action:{action:'click',target},el:{...neutral,role:'link',download:true},level:'L5',user:true },
  { name:'ambiguous form button',action:{action:'click',target},el:{...neutral,inForm:true,buttonType:'button',ambiguous:true},level:'L5',user:true },
  { name:'unknown form intent',action:{action:'click',target},el:{...neutral,inForm:true,buttonType:'button',labelSanitized:'Continue operation'},level:'L5',user:true },
];
describe('authority levels',()=>{
  it.each(rows)('$name -> $level', row => expect(classifyAction(row.action,row.el,ctx)).toMatchObject({level:row.level,requiresUser:row.user}));
  it.each(AUTHORITY_DEFAULTS.commit_words)('English/Hindi commit label: %s',label=>expect(classifyAction({action:'click',target},{...neutral,labelSanitized:label},ctx)).toMatchObject({level:'L5',requiresUser:true}));
  it('high-risk category grant removes only the L3 prompt, never L5',()=>{
    const granted={origin:ctx.origin,consentedCategories:new Set(['AADHAAR' as const])};
    expect(classifyAction({action:'type',target,text:'[[PII:AADHAAR:abcdefgh]]'},{...base,fieldCategory:'AADHAAR'},granted).requiresUser).toBe(false);
    expect(classifyAction({action:'click',target},{...neutral,labelSanitized:'Submit'},granted).requiresUser).toBe(true);
  });
  it('classifies token URLs for rejection',()=>expect(classifyAction({action:'navigate',url:'https://example.test/[[PII:EMAIL:abcdefgh]]'},undefined,ctx).reasons).toContain('TOKEN_IN_URL'));
});

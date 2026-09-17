import { expect, it } from 'vitest';
import { AuditLog, type AuditRecord } from '../log';
import { startReplay } from '../replay';
import { AEGIS_CONFIG } from '../../shared/config';
const record:AuditRecord={ts:1,digest:'a'.repeat(64),categoryCounts:{EMAIL:1},eids:['E1'],action:'type',level:'L3',verdict:'PASS',timings:{actionMs:12}};
it('in-memory ring is bounded, cloned, Judge-only and cleared',()=>{
 const log=new AuditLog(2);log.append(record);log.append({...record,ts:2});log.append({...record,ts:3});
 expect(log.size).toBe(2);expect(()=>log.export('normal')).toThrow();
 expect(log.export('judge').map(r=>r.ts)).toEqual([2,3]);log.export('judge')[0]!.eids.push('E99');expect(log.export('judge')[0]!.eids).toEqual(['E1']);log.clear();expect(log.size).toBe(0);
});
it.each(['text','screenshot','rawValue','label','reason','url'])('rejects extra %s even when cast',key=>{
 const log=new AuditLog();expect(()=>log.append({...record,[key]:'private or sanitized text'} as AuditRecord)).toThrow();expect(log.size).toBe(0);
});
it.each(['digest','eids','action','level','verdict','timings','categoryCounts'])('rejects text hidden in %s',key=>{
 const bad={...record,[key]:key==='eids'?['secret']:key==='timings'?{actionMs:'secret'}:key==='categoryCounts'?{secret:1}:'secret'} as unknown as AuditRecord;
 expect(()=>new AuditLog().append(bad)).toThrow();
});
it('replay flag is false and implementation throws',()=>{
 expect(AEGIS_CONFIG.REPLAY_RECORDING).toBe(false);expect(()=>startReplay({mode:'eval',localDirectory:'/tmp/replay',expiresAt:1})).toThrow('disabled');
});
it('array extension properties and coerced string slots cannot retain text', () => {
  const log=new AuditLog();
  const eids=Object.assign(['E1' as const],{raw:'private text'});
  log.append({...record,eids});
  expect(JSON.stringify(log.export('judge'))).not.toContain('private text');
  expect(()=>log.append({...record,level:['L3']} as unknown as AuditRecord)).toThrow();
  expect(()=>log.append({...record,digest:['a'.repeat(64)]} as unknown as AuditRecord)).toThrow();
});

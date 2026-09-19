import { it, expect } from 'vitest';
import { findKnownValues } from '../knownValues';
import { runDetectionCascade } from '..';
import { element, observation } from '../../../scene/__tests__/fixtures';
import { decide } from '../../policy';

it('previously tokenized malformed ID remains detected after its label disappears', async () => {
  const el = element({ name: 'Reference', labelText: 'Reference', inputType: 'text', value: 'HDFC1001234' });
  const ds = (await runDetectionCascade({ observation: observation([el]), knownValues: [{ value: 'HDFC1001234', type: 'IFSC' }] })).detections;
  expect(ds).toContainEqual(expect.objectContaining({ category: 'IFSC', source: 'vault', target: { kind: 'element', ref: 'E1' } }));
  const d = ds.find(d=>d.category==='IFSC')!;
  expect(decide(d,{necessity:'not_needed',identitySeenOnOrigin:false,userOverrides:{IFSC:'ALLOW'}})).toBe('FILL');
});
it('matches known text without interpreting punctuation as a regex', () => {
  expect(findKnownValues('contact ASHA@example.test', [{value:'asha@example.test',type:'EMAIL'}])).toEqual([{category:'EMAIL',matchedText:'ASHA@example.test',start:8}]);
  expect(findKnownValues('asha@exampleXtest',[{value:'asha@example.test',type:'EMAIL'}])).toEqual([]);
  expect(findKnownValues('word',[{value:'or',type:'NAME'}])).toEqual([]);
});
it('known text occurrences get span lookups for screenshot masks too', async () => {
  const o=observation([]);o.textBlocks=[{blockRef:'t1',text:'HDFC1001234',role:'paragraph',bbox:{x:1,y:1,width:100,height:20},frameId:0,lineRects:[],privacyAttrs:[]}];
  const result=await runDetectionCascade({observation:o,knownValues:[{value:'HDFC1001234',type:'IFSC'}]});
  expect(result.spanLookups).toEqual([expect.objectContaining({blockRef:'t1',start:0,end:11})]);
});

it('protects the numeric form of a known alphanumeric identifier', () => {
  expect(findKnownValues('ref 123-456-789', [{value:'AB123456789IN',type:'TRACKING_ID'}])).toContainEqual({category:'TRACKING_ID',matchedText:'123-456-789',start:4});
});

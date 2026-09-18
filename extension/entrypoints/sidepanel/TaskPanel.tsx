import { useEffect, useRef, useState } from 'react';
import { TaskRunner, type TaskSnapshot, type TaskData } from '../../agent/runAgentLoop';
import type { ConsentRequest, ConsentReply } from '../../agentHost/task/consent';
import type { ApprovalRequest, ApprovalReply } from '../../agent/approval';
import type { Category } from '../../privacy/categoryTypes';
import type { Mode } from '../../privacy/redactor';
import { requestSiteAccess } from '../../shared/permissions';
import { TOKEN_PATTERN } from '../../shared/schema/tokens';
import { unwrapForPanelRender } from '../../privacy/vault';

type Prompt = { kind:'consent'; request:ConsentRequest; resolve:(reply:ConsentReply)=>void } |
  {kind:'approval'; request:ApprovalRequest; resolve:(reply:ApprovalReply)=>void} |
  {kind:'question'; text:string; resolve:(reply:{choice:'retry'|'hint'|'stop';hint?:string})=>void};
interface DisplayPart { text:string; origins?:string[] }
const CATEGORIES:Category[]=['NAME','EMAIL','PHONE','ADDRESS','DOB','AADHAAR','PAN','CARD_NUMBER','BANK_ACCOUNT','UPI_ID','VOTER_ID','PASSPORT','DRIVING_LICENCE','ABHA','UAN','CITY','PIN_CODE','FINANCIAL_VALUE','PRIVATE_GENERIC'];

/** Values and prompts live in this document only. Model text is rendered through React text nodes. */
export function TaskPanel() {
  const runner=useRef<TaskRunner|null>(null);
  const [task,setTask]=useState('');
  const [rows,setRows]=useState<TaskData[]>([{category:'NAME',value:''},{category:'EMAIL',value:''}]);
  const [mode,setMode]=useState<Mode>('balanced');
  const [snapshot,setSnapshot]=useState<TaskSnapshot|null>(null);
  const [prompt,setPrompt]=useState<Prompt|null>(null);
  const [selected,setSelected]=useState<Category[]>([]);
  const [answer,setAnswer]=useState<DisplayPart[]>([]);
  const [answerOrigin,setAnswerOrigin]=useState('');
  const [hint,setHint]=useState('');
  const [error,setError]=useState('');
  const [shownValue,setShownValue]=useState('');
  const credential=useRef<HTMLInputElement>(null);
  const active=snapshot!==null&&!['done','failed','stopped'].includes(snapshot.state);
  useEffect(()=>()=>{runner.current?.stop();},[]);

  const start=async()=>{
    if(active)return;
    setError('');setAnswer([]);setShownValue('');
    try {
      const [access,[tab]]=await Promise.all([requestSiteAccess(),browser.tabs.query({active:true,currentWindow:true})]);
      if(!access.granted||!tab?.id)throw new Error('Screen access is required to start.');
      const pending=<T,>(signal:AbortSignal,create:(resolve:(reply:T)=>void)=>Prompt):Promise<T>=>new Promise((resolve,reject)=>{
        const abort=()=>{setPrompt(null);setShownValue('');reject(new DOMException('Stopped','AbortError'));};
        signal.addEventListener('abort',abort,{once:true});
        setPrompt(create(value=>{signal.removeEventListener('abort',abort);setPrompt(null);setShownValue('');resolve(value);}));
      });
      const current=new TaskRunner(tab.id,task,mode,{
        update:value=>{setSnapshot(value);},
        consent:(request,signal)=>{setSelected(request.medium);return pending(signal,resolve=>({kind:'consent',request,resolve}));},
        approve:(request,signal)=>pending(signal,resolve=>({kind:'approval',request,resolve})),
        ask:(text,signal)=>pending(signal,resolve=>({kind:'question',text,resolve})),
        answer:(text,session,origin)=>{
          const parts:DisplayPart[]=[];let last=0;
          for(const match of text.matchAll(new RegExp(TOKEN_PATTERN.source,'g'))){
            parts.push({text:text.slice(last,match.index)});
            const entry=session.vault.get(match[0]);
            parts.push(entry?{text:unwrapForPanelRender(session.vault.resolveForDisplay(match[0])),origins:[...entry.origins]}:{text:'[unavailable token]'});
            last=match.index!+match[0].length;
          }
          parts.push({text:text.slice(last)});setAnswer(parts);setAnswerOrigin(origin);
        },
      });
      runner.current=current;setSnapshot(current.snapshot());
      const input=rows.map(row=>({...row}));setRows(rows.map(row=>({...row,value:''})));setTask('');
      void current.run(input);
    }catch{setError('Could not start the task. Check the active page and screen-capture permission.');}
  };
  const confirmConsent=async()=>{
    if(prompt?.kind!=='consent'||!runner.current)return;
    // The DOM input is the only place the credential persists; clear it before anything can await.
    // Reassigning the local afterwards would not scrub the string, so it does not pretend to.
    const value=credential.current?.value??'';
    if(credential.current)credential.current.value='';
    try {
      const token=value?await runner.current.credential(prompt.request.origin,value):undefined;
      prompt.resolve({categories:token?[...selected,'PASSWORD']:selected,credentialToken:token});
    }catch{runner.current.stop();}
  };
  return <section aria-label="Run task" className="task-panel">
    <h2>Run a task</h2>
    <label htmlFor="task-input">Task</label>
    <textarea id="task-input" value={task} onChange={e=>setTask(e.target.value)} disabled={active} placeholder="Fill my name and email, then stop before submitting." />
    <fieldset disabled={active}><legend>Task data — kept in memory for this task</legend>
      {rows.map((row,index)=><div className="task-data-row" key={index}>
        <select aria-label={`Data type ${index+1}`} value={row.category} onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,category:e.target.value as Category}:r))}>
          {CATEGORIES.map(c=><option key={c}>{c}</option>)}
        </select>
        <input aria-label={`Data value ${index+1}`} value={row.value} onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,value:e.target.value}:r))} autoComplete="off" />
      </div>)}
      <button onClick={()=>setRows([...rows,{category:'PHONE',value:''}])}>Add task data</button>
      <label>Task mode <select aria-label="Task mode" value={mode} onChange={e=>setMode(e.target.value as Mode)}>{(['fast','balanced','accurate'] as const).map(m=><option key={m}>{m}</option>)}</select></label>
    </fieldset>
    <div className="button-row"><button onClick={start} disabled={active||!task.trim()}>Start</button><button onClick={()=>runner.current?.stop()} disabled={!active}>Stop</button></div>
    {error&&<p role="alert">{error}</p>}
    <p role="status" data-testid="task-status">{snapshot?.state??'idle'}</p>
    {prompt?.kind==='consent'&&<section role="dialog" aria-label="Task consent">
      <h3>Allow this task on {prompt.request.origin}</h3>
      {!!prompt.request.medium.length&&<label><input type="checkbox" checked={prompt.request.medium.every(c=>selected.includes(c))} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,...prompt.request.medium])]:selected.filter(c=>!prompt.request.medium.includes(c)))} /> Medium types: {prompt.request.medium.join(', ')}</label>}
      {prompt.request.high.map(c=><label key={c}><input type="checkbox" checked={selected.includes(c)} onChange={e=>setSelected(e.target.checked?[...selected,c]:selected.filter(v=>v!==c))}/>{c}</label>)}
      {prompt.request.credential&&<label>Credential for {prompt.request.origin}<input aria-label="Credential" ref={credential} type="password" autoComplete="off" placeholder="Optional — only from you, never read from the page"/></label>}
      <p>Grants expire when this task ends. Commits always ask again.</p>
      <button onClick={confirmConsent}>Continue with selected</button><button onClick={()=>prompt.resolve({categories:[]})}>Decline all</button><button onClick={()=>runner.current?.stop()}>Stop task</button>
    </section>}
    {prompt?.kind==='approval'&&<section role="dialog" aria-label="Action approval">
      <h3>Approve {prompt.request.action} · {prompt.request.level}</h3>
      <p>{prompt.request.label} · {prompt.request.category??'No private value'} · {prompt.request.origin}</p>
      <p>Model says… {prompt.request.reason||'No reason provided.'}</p>
      {prompt.request.token&&<button onClick={()=>{const session=runner.current?.session;if(session?.vault.hasToken(prompt.request.token!))setShownValue(unwrapForPanelRender(session.vault.resolveForDisplay(prompt.request.token!)));}}>Show value locally</button>}
      {shownValue&&<pre>{shownValue}</pre>}
      <button onClick={()=>prompt.resolve('approve')}>Approve</button><button onClick={()=>prompt.resolve('skip')}>Skip &amp; replan</button><button onClick={()=>runner.current?.stop()}>Stop task</button>
    </section>}
    {prompt?.kind==='question'&&<section role="dialog" aria-label="Task question">
      <h3>Model says…</h3><p style={{whiteSpace:'pre-wrap'}}>{prompt.text}</p><p>This is untrusted plain text.</p>
      <input aria-label="Your reply" value={hint} onChange={e=>setHint(e.target.value)} autoComplete="off"/>
      <button onClick={()=>prompt.resolve({choice:'retry'})}>Retry</button><button onClick={()=>{prompt.resolve({choice:'hint',hint});setHint('');}}>Send reply</button><button onClick={()=>runner.current?.stop()}>Stop task</button>
    </section>}
    {!!answer.length&&<section aria-label="Model answer"><h3>Model says…</h3><p>Untrusted plain text</p>
      <div style={{whiteSpace:'pre-wrap'}}>{answer.map((part,i)=><span key={i}>{part.text}{part.origins&&<small> [source: {part.origins.join(', ')}{part.origins.some(o=>o!==answerOrigin)?' — different site from this task':''}]</small>}</span>)}</div>
      <button onClick={()=>navigator.clipboard.writeText(answer.map(p=>p.text).join(''))}>Copy answer</button>
    </section>}
    {snapshot&&<details><summary>Task summary and timeline</summary><pre data-testid="task-summary">{JSON.stringify(snapshot,null,2)}</pre>
      <button onClick={()=>{const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='aegis-task-metrics.json';link.click();URL.revokeObjectURL(url);}}>Export Judge metrics</button>
    </details>}
  </section>;
}

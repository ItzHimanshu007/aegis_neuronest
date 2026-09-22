import { useEffect, useRef, useState } from 'react';
import { TaskRunner, type TaskSnapshot, type TaskData } from '../../agent/runAgentLoop';
import type { ProcessResult } from '../../agentHost';
import type { ConsentRequest, ConsentReply } from '../../agentHost/task/consent';
import type { ApprovalRequest, ApprovalReply } from '../../agent/approval';
import type { Category } from '../../privacy/categoryTypes';
import type { Mode } from '../../privacy/redactor';
import { requestSiteAccess } from '../../shared/permissions';
import { health } from '../../net/network';
import type { ModelProvider } from '../../shared/messages';
import { isUsablePageUrl, NO_PAGE_URL } from '../../shared/pageUrl';
import { TOKEN_PATTERN } from '../../shared/schema/tokens';
import { unwrapForPanelRender } from '../../privacy/vault';
import { PrivacyReceipt } from './PrivacyReceipt';
import { StepTimeline } from './StepTimeline';
import { RUN_STATUS, runStatusTone, LEVEL_REASON, approvalQuestion, categoryLabel, levelBand } from './labels';

type Prompt = { kind:'consent'; request:ConsentRequest; resolve:(reply:ConsentReply)=>void } |
  {kind:'approval'; request:ApprovalRequest; resolve:(reply:ApprovalReply)=>void} |
  {kind:'question'; text:string; resolve:(reply:{choice:'retry'|'hint'|'stop';hint?:string})=>void};
interface DisplayPart { text:string; origins?:string[] }
const CATEGORIES:Category[]=['NAME','EMAIL','PHONE','ADDRESS','DOB','AADHAAR','PAN','CARD_NUMBER','BANK_ACCOUNT','UPI_ID','VOTER_ID','PASSPORT','DRIVING_LICENCE','ABHA','UAN','CITY','PIN_CODE','FINANCIAL_VALUE','PRIVATE_GENERIC'];
const MODE_LABELS:Record<Mode,string>={fast:'Fast',balanced:'Balanced',accurate:'Thorough'};

/** Values and prompts live in this document only. Model text is rendered through React text nodes. */
export function TaskPanel() {
  const runner=useRef<TaskRunner|null>(null);
  const [task,setTask]=useState('');
  const [rows,setRows]=useState<TaskData[]>([{category:'NAME',value:''},{category:'EMAIL',value:''}]);
  const [mode,setMode]=useState<Mode>('balanced');
  // Which model to plan with. '' means "let the server rotate", which is the right default: the
  // whole point of rotation is that no single free tier has the per-minute budget for one task.
  const [provider,setProvider]=useState('');
  // Vision on by default: the Set-of-Marks tags drawn on the screenshot are what the model grounds
  // target.eid against, and a page of icon-only controls gives the element list little else.
  const [sendImage,setSendImage]=useState(true);
  const [providers,setProviders]=useState<ModelProvider[]>([]);
  const [modelNote,setModelNote]=useState('');
  const [snapshot,setSnapshot]=useState<TaskSnapshot|null>(null);
  const [receipt,setReceipt]=useState<ProcessResult|null>(null);
  const [prompt,setPrompt]=useState<Prompt|null>(null);
  const [selected,setSelected]=useState<Category[]>([]);
  const [answer,setAnswer]=useState<DisplayPart[]>([]);
  const [answerOrigin,setAnswerOrigin]=useState('');
  const [hint,setHint]=useState('');
  const [error,setError]=useState('');
  const [shownValue,setShownValue]=useState('');
  const credential=useRef<HTMLInputElement>(null);
  const active=snapshot!==null&&!['done','failed','stopped'].includes(snapshot.state);
  const state=snapshot?.state??'idle';
  // The per-step number Part B2 asks for: the most recent completed step's total, not the phase
  // breakdown (that stays in the full record below).
  const lastStep=snapshot?.timeline[snapshot.timeline.length-1];
  const lastStepMs=lastStep?Math.round(Object.values(lastStep.timings).reduce((sum,ms)=>sum+ms,0)):null;
  useEffect(()=>()=>{runner.current?.stop();},[]);

  useEffect(()=>{
    let live=true;
    // The picker is built from what the SERVER says it can reach, never a list hardcoded here —
    // a model this build has never heard of should still be selectable once configured.
    health().then(result=>{
      if(!live)return;
      setProviders(result.providers??[]);
      setModelNote(result.adapter_error??'');
    }).catch(()=>{if(live)setModelNote('Could not reach the Aegis server to list models.');});
    return ()=>{live=false;};
  },[]);

  const start=async()=>{
    if(active)return;
    setError('');setAnswer([]);setShownValue('');setReceipt(null);
    try {
      const [access,[tab]]=await Promise.all([requestSiteAccess(),browser.tabs.query({active:true,currentWindow:true})]);
      if(!access.granted||!tab?.id)throw new Error('Screen access is required to start.');
      // Granted access is not the same as a readable address: `<all_urls>` never covers a new tab
      // or any other browser page, so the tab can arrive with an id and no url. Say so here, in
      // words, rather than letting the loop discover it and report a DOM exception.
      if(!isUsablePageUrl(tab.url))throw new Error(NO_PAGE_URL);
      const pending=<T,>(signal:AbortSignal,create:(resolve:(reply:T)=>void)=>Prompt):Promise<T>=>new Promise((resolve,reject)=>{
        const abort=()=>{setPrompt(null);setShownValue('');reject(new DOMException('Stopped','AbortError'));};
        signal.addEventListener('abort',abort,{once:true});
        setPrompt(create(value=>{signal.removeEventListener('abort',abort);setPrompt(null);setShownValue('');resolve(value);}));
      });
      const current=new TaskRunner(tab.id,task,mode,{
        update:value=>{setSnapshot(value);setReceipt(current.lastProcessResult??null);},
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
      },provider||undefined,sendImage);
      runner.current=current;setSnapshot(current.snapshot());
      const input=rows.map(row=>({...row}));setRows(rows.map(row=>({...row,value:''})));setTask('');
      void current.run(input);
    }catch{setError('Could not start. Check that a page is open in the active tab and that you allowed screen access.');}
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
    {!snapshot&&<p className="lede">Tell Aegis what to do on the page you are looking at. It reads the page here in your browser, swaps anything private for a placeholder before it asks the server for help, and checks with you before it submits anything.</p>}
    <label htmlFor="task-input">Task</label>
    <textarea id="task-input" value={task} onChange={e=>setTask(e.target.value)} disabled={active} placeholder="Fill in my name and email on this form, but do not submit it." />
    <fieldset disabled={active} className="task-values"><legend>Values this task may use</legend>
      <p className="hint">Only these can be typed into the page. They stay in this panel&rsquo;s memory, never reach the server as themselves, and are erased when the task ends.</p>
      <div className="task-data-head" aria-hidden="true"><span>Kind</span><span>Value</span></div>
      {rows.map((row,index)=><div className="task-data-row" key={index}>
        <select aria-label={`Data type ${index+1}`} value={row.category} onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,category:e.target.value as Category}:r))}>
          {CATEGORIES.map(c=><option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <input aria-label={`Data value ${index+1}`} value={row.value} onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,value:e.target.value}:r))} autoComplete="off" />
      </div>)}
      <button className="btn btn-neutral btn-sm" onClick={()=>setRows([...rows,{category:'PHONE',value:''}])}>Add another value</button>
      <label className="inline-field">How carefully to look <select value={mode} onChange={e=>setMode(e.target.value as Mode)}>{(['fast','balanced','accurate'] as const).map(m=><option key={m} value={m}>{MODE_LABELS[m]}</option>)}</select></label>
      {/* Which model plans the task. Disabled while one is running: the model is fixed for the
        * life of a task, so offering a change mid-run would be a control that quietly does
        * nothing. Only names the server already has configured are offered. */}
      <label className="inline-field">Model <select aria-label="Model" value={provider} disabled={active||!providers.length} onChange={e=>setProvider(e.target.value)}>
        <option value="">{providers.length>1?'Auto (rotate)':'Auto'}</option>
        {providers.map(p=><option key={p.name} value={p.name}>{p.name} — {p.model}</option>)}
      </select></label>
      {/* Withholding the screenshot is a speed/accuracy trade, so it is offered as a choice and
        * never taken silently. Measured on a labelled form: ~1.3s and ~1,000 prompt tokens saved
        * per screen, same plan. Capture still happens locally — this only withholds the outbound
        * copy, so screen-change detection and the privacy receipt are unaffected. */}
      <label className="inline-field"><input type="checkbox" checked={sendImage} disabled={active} onChange={e=>setSendImage(e.target.checked)} /> Send a screenshot <span className="hint">(off is faster; the model then works from the page structure alone)</span></label>
      {!!modelNote&&<p className="hint" role="status">{modelNote}</p>}
    </fieldset>
    {/* One obvious primary action, and which one it is depends on where you are: Start until a
      * task is running, Stop once one is. Both keep their exact accessible names — the Playwright
      * and Selenium suites click them by that text. */}
    <div className="button-row start-row">
      <button className={`btn btn-primary${active?'':' btn-start'}`} onClick={start} disabled={active||!task.trim()}>Start</button>
      <button className={`btn ${active?'btn-danger btn-start':'btn-neutral'}`} onClick={()=>runner.current?.stop()} disabled={!active}>Stop</button>
    </div>
    {error&&<p role="alert" className="error">{error}</p>}
    {snapshot?.state==='failed'&&snapshot.failureError&&<p role="alert" className="error" data-testid="failure-error">{snapshot.failureError}</p>}
    {/* The sentence is what a person reads; the span beside it carries the literal TaskState word
      * the e2e suites assert on (Playwright `toHaveText`, Selenium `textContent===`), kept out of
      * sight and out of the accessibility tree rather than out of the DOM. */}
    <p className="run-status" role="status" data-tone={runStatusTone(state)}>
      <span className="run-status-dot" />
      {active&&snapshot&&snapshot.steps>0&&<span className="run-step">Step {snapshot.steps}</span>}
      <span className="run-status-text">{RUN_STATUS[state]}</span>
      {lastStepMs!==null&&<span className="run-time">last step {lastStepMs} ms</span>}
      <span className="sr-only" aria-hidden="true" data-testid="task-status">{state}</span>
    </p>
    {/* The model claiming completion is not completion. When a `done` action's evidence fails
      * verify(), the loop refuses to call the task finished and records falseSuccess; without this
      * the run just ends as "could not finish", which hides the most interesting thing that
      * happened — that a claim was checked and rejected. */}
    {snapshot?.falseSuccess&&<p className="warning" role="status" data-testid="false-success-note">
      The model reported the task was done, but Aegis re-checked the page and could not confirm it. The claim was not accepted.
    </p>}
    {prompt?.kind==='consent'&&<div className="dialog-overlay"><section role="dialog" aria-label="Task consent" className="dialog-card">
      <h3>What may Aegis use on {prompt.request.origin}?</h3>
      <p className="dialog-lead">Tick what this task is allowed to type into this site. Anything you leave unticked is never re-created on the page.</p>
      {!!prompt.request.medium.length&&<label><input type="checkbox" checked={prompt.request.medium.every(c=>selected.includes(c))} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,...prompt.request.medium])]:selected.filter(c=>!prompt.request.medium.includes(c)))} /> Everyday details: {prompt.request.medium.map(categoryLabel).join(', ')}</label>}
      {/* Each of these labels is exactly the category name on purpose: the e2e suites select the
        * checkbox by it, and the name is also what a person recognises (AADHAAR, PAN, UPI ID). */}
      {prompt.request.high.map(c=><label key={c} title={`Sensitive: ${categoryLabel(c)}`}><input type="checkbox" checked={selected.includes(c)} onChange={e=>setSelected(e.target.checked?[...selected,c]:selected.filter(v=>v!==c))}/>{c}</label>)}
      {prompt.request.credential&&<label>Password for {prompt.request.origin}<input aria-label="Credential" ref={credential} type="password" autoComplete="off" placeholder="Optional — typed by you here, never read off the page"/></label>}
      <p className="hint">This permission lasts only until the task ends. Anything that submits the form or changes the site asks you again, every time.</p>
      <div className="dialog-actions">
        <button className="btn btn-primary" onClick={confirmConsent}>Continue with selected</button>
        <button className="btn btn-neutral" onClick={()=>prompt.resolve({categories:[]})}>Decline all</button>
        <button className="btn btn-danger" onClick={()=>runner.current?.stop()}>Stop task</button>
      </div>
    </section></div>}
    {prompt?.kind==='approval'&&<div className="dialog-overlay"><section role="dialog" aria-label="Action approval" className="dialog-card">
      <div className="dialog-header">
        <span className="level-badge" data-level={prompt.request.level} title={`Authority level ${prompt.request.level} — ${levelBand(prompt.request.level)}`}>{prompt.request.level}</span>
        <h3>{approvalQuestion(prompt.request.action,prompt.request.label)}</h3>
      </div>
      <p className="dialog-lead">{LEVEL_REASON[prompt.request.level]}</p>
      <p className="dialog-target">
        {prompt.request.eid&&<span className="eid-chip" title="How Aegis and the server refer to this element">{prompt.request.eid}</span>}
        <span className="category-chip">{prompt.request.category?categoryLabel(prompt.request.category):'No private value'}</span>
        <span className="origin-text">on {prompt.request.origin}</span>
      </p>
      <p className="dialog-reason">The model&rsquo;s reason: {prompt.request.reason||'none given.'}</p>
      {prompt.request.token&&<button className="btn btn-neutral btn-sm" onClick={()=>{const session=runner.current?.session;if(session?.vault.hasToken(prompt.request.token!))setShownValue(unwrapForPanelRender(session.vault.resolveForDisplay(prompt.request.token!)));}}>Show what would be typed</button>}
      {shownValue&&<pre>{shownValue}</pre>}
      <div className="dialog-actions">
        <button className="btn btn-primary" onClick={()=>prompt.resolve('approve')}>Approve</button>
        <button className="btn btn-neutral" onClick={()=>prompt.resolve('skip')}>Do something else</button>
        <button className="btn btn-danger" onClick={()=>runner.current?.stop()}>Stop task</button>
      </div>
    </section></div>}
    {prompt?.kind==='question'&&<div className="dialog-overlay"><section role="dialog" aria-label="Task question" className="dialog-card">
      <h3>Aegis needs an answer</h3><p style={{whiteSpace:'pre-wrap'}}>{prompt.text}</p>
      <p className="hint">This question came from the remote model. It is plain text and cannot make anything happen on its own — do not paste anything secret into the reply.</p>
      <label htmlFor="task-reply">Your reply</label>
      <input id="task-reply" aria-label="Your reply" value={hint} onChange={e=>setHint(e.target.value)} autoComplete="off"/>
      <div className="dialog-actions">
        <button className="btn btn-primary" onClick={()=>{prompt.resolve({choice:'hint',hint});setHint('');}}>Send reply</button>
        <button className="btn btn-neutral" onClick={()=>prompt.resolve({choice:'retry'})}>Try again without a reply</button>
        <button className="btn btn-danger" onClick={()=>runner.current?.stop()}>Stop task</button>
      </div>
    </section></div>}
    {!!answer.length&&<section aria-label="Model answer" className="answer-card"><h3>What Aegis found</h3>
      <p className="hint">Text from the page and the remote model. Read it, do not act on it blindly.</p>
      <div style={{whiteSpace:'pre-wrap'}}>{answer.map((part,i)=><span key={i}>{part.text}{part.origins&&<small> [from {part.origins.join(', ')}{part.origins.some(o=>o!==answerOrigin)?' — a different site from this task':''}]</small>}</span>)}</div>
      <button className="btn btn-neutral btn-sm" onClick={()=>navigator.clipboard.writeText(answer.map(p=>p.text).join(''))}>Copy</button>
    </section>}
    {receipt&&<PrivacyReceipt result={receipt} />}
    {snapshot&&<section aria-label="Step timeline">
      <label>What Aegis did, step by step</label>
      <StepTimeline entries={snapshot.timeline} running={active} />
      <details><summary>Everything Aegis recorded</summary><pre data-testid="task-summary">{JSON.stringify(snapshot,null,2)}</pre>
        <button className="btn btn-neutral btn-sm" onClick={()=>{const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='aegis-task-metrics.json';link.click();URL.revokeObjectURL(url);}}>Download this record</button>
      </details>
    </section>}
  </section>;
}

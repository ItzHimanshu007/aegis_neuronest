/** The panel owns this loop. Background only captures; the server only proposes. */
import { PrivacySession } from '../agentHost/session';
import { processObservation, type ProcessResult } from '../agentHost';
import { consentRequest, type ConsentRequest, type ConsentReply } from '../agentHost/task/consent';
import { taskReducer, cancellable, type TaskState } from '../agentHost/task/state';
import { send, endSession } from '../net/network';
import { sendMessage, type ObserveResult } from '../shared/messages';
import { AEGIS_CONFIG as CONFIG } from '../shared/config';
import type { HistoryEntry } from '../shared/schema/payload.v2';
import type { Action } from '../shared/schema/plan.v2';
import type { Mode } from '../privacy/redactor';
import type { Category } from '../privacy/categoryTypes';
import { TOKEN_PATTERN } from '../shared/schema/tokens';
import type { EID, SceneElement } from '../scene';
import { sha256Hex } from '../privacy/sealedRegistry';
import { classifyAction } from '../authority';
import { checkPlan, checkAction } from './checks';
import { rehydrate } from './rehydrate';
import { verify } from './verifier';
import { Recovery, FAILURE_REASON, type FailureCode } from './recovery';
import { RequirementLedger, checkRequirements, type RequirementsView } from './requirements';
import type { ApprovalRequest, ApprovalReply } from './approval';
import type { ExecutionRequest, ExecutionResult } from './executor';
import { decideContextExpansion } from '../sensing/contextExpansion';
import { pageOriginOrThrow } from '../shared/pageUrl';

export interface TaskData { category: Category; value: string }
export interface TimelineEntry {
  step: number; action: HistoryEntry['action']; eid?: EID; level: string; verdict: HistoryEntry['verdict']; code?: FailureCode;
  digest: string; bytes: number; sensing: 'image' | 'dom';
  timings: Record<'observe'|'detect'|'policy'|'redact'|'seal'|'network'|'model'|'check'|'approval'|'execute'|'verify', number>;
}
export interface TaskSnapshot {
  state: TaskState; steps: number; modelCalls: number; replans: number; humanWaitMs: number;
  latencyMs: number; falseSuccess: boolean; timeline: TimelineEntry[]; cleanupFailed: boolean;
  /** The exception message from the run() catch, when the loop threw unexpectedly. Local-only —
   * never sent to the server. Enables the panel and DevTools to show what failed instead of just
   * the opaque 'failed' state. */
  failureError?: string;
}
export interface TaskUI {
  update(snapshot: TaskSnapshot): void;
  consent(request: ConsentRequest, signal: AbortSignal): Promise<ConsentReply>;
  approve(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalReply>;
  ask(text: string, signal: AbortSignal): Promise<{ choice: 'retry'|'hint'|'stop'; hint?: string }>;
  answer(text: string, session: PrivacySession, origin: string): void;
}

export class TaskRunner {
  readonly session = new PrivacySession();
  readonly controller = new AbortController();
  readonly grants = new Map<string, Set<Category>>();
  readonly recovery = new Recovery();
  private readonly ledger = new RequirementLedger();
  readonly history: HistoryEntry[] = [];
  private tokens: string[] = [];
  private state: TaskState = 'idle';
  private steps = 0;
  private modelCalls = 0;
  private humanWaitMs = 0;
  private falseSuccess = false;
  private started = performance.now();
  private timeline: TimelineEntry[] = [];
  private last?: ProcessResult;
  private observed?: ObserveResult;
  private planStepsSeen = false;
  private contextRemaining: number = CONFIG.CONTEXT_EXPANSION_BUDGET;
  private contextDenied?: 'BUDGET_EXHAUSTED'|'NO_SAFE_ELEMENTS'|'INVALID_REQUEST';
  private denialSent = false;
  private cleanupFailed = false;
  private running = false;
  private failureError?: string;
  /** `provider` names one of the SERVER's own configured models to prefer, or undefined to let the
   * server choose. It is a preference, not a destination — see net/network.ts. */
  constructor(readonly tabId: number, private task: string, private mode: Mode, private readonly ui: TaskUI, private readonly provider?: string, private readonly sendImage = true) {}
  get signal(): AbortSignal { return this.controller.signal; }
  /** The most recent step's full privacy-pipeline result (payload + preview), for the Privacy
   * Receipt panel view. Local-only — never sent anywhere; `payload.bytes` is the exact sealed
   * bytes `firewall.seal()` shipped for this step, not a re-serialization. */
  get lastProcessResult(): ProcessResult | undefined { return this.last; }
  snapshot(): TaskSnapshot {
    return { state: this.state, steps: this.steps, modelCalls: this.modelCalls, replans: this.recovery.replans,
      humanWaitMs: this.humanWaitMs, latencyMs: Math.max(0, performance.now()-this.started-this.humanWaitMs),
      falseSuccess: this.falseSuccess, timeline: structuredClone(this.timeline), cleanupFailed: this.cleanupFailed,
      ...(this.failureError !== undefined ? { failureError: this.failureError } : {}) };
  }
  private emit(): void { this.ui.update(this.snapshot()); }
  private move(next: TaskState): void { this.signal.throwIfAborted(); this.state = taskReducer(this.state,next); this.emit(); }
  async credential(origin: string, value: string): Promise<string> {
    const token = await this.wait(this.session.vault.putCredential(origin,value));
    this.tokens.push(token); this.session.taskCategories.add('PASSWORD'); return token;
  }
  private wait<T>(promise: Promise<T>): Promise<T> { return cancellable(this.signal,promise); }
  private async human<T>(promise: Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await this.wait(promise); }
    finally { this.humanWaitMs += performance.now()-start; }
  }
  stop(): void {
    if (['done','failed','stopped'].includes(this.state)) return;
    this.controller.abort();
    this.state = 'stopped'; this.session.end(); this.tokens=[]; this.task='';
    void browser.tabs.sendMessage(this.tabId, {type:'CANCEL_TASK',session:this.session.sessionId}).catch(()=>{});
    void endSession(this.session.sessionId).catch(()=>{this.cleanupFailed=true;this.emit();});
    this.emit();
  }
  private budget(): boolean {
    return this.steps >= CONFIG.MAX_STEPS || this.modelCalls >= CONFIG.MAX_MODEL_CALLS ||
      performance.now()-this.started-this.humanWaitMs >= CONFIG.MAX_WALL_S*1000;
  }
  private record(action: HistoryEntry['action'], verdict: HistoryEntry['verdict'], code?: FailureCode, eid?: string): void {
    this.history.push({step:this.steps,action,verdict,...(code?{code}:{}),...(eid?{eid}: {})});
    if(this.history.length>CONFIG.HISTORY_MAX_STEPS) this.history.shift();
  }
  /**
   * Records a REFUSAL on the user-facing step timeline.
   *
   * `record()` above writes the model-facing history; until this existed, that was the only place a
   * block was written down, and `this.timeline` was appended to in exactly one place — after an
   * action had already executed and been verified. So the timeline could only ever show things that
   * happened, never things that were stopped, even though its own vocabulary already has
   * 'Blocked' / 'Blocked, rest dropped' / 'Rest dropped' for verdicts nothing could produce
   * (entrypoints/sidepanel/labels.ts, STEP_VERDICT).
   *
   * That is the wrong way round for a system whose whole claim is that it refuses things: a plan
   * dropped for carrying a token in a URL is the single most important row a reviewer can see.
   *
   * Nothing here decides anything. It is called only on paths that have ALREADY rejected, and it
   * adds no branch to them. The phases that never ran are recorded as 0 rather than invented, and
   * the digest/bytes are the real ones from the payload that was actually sealed and sent.
   */
  private blocked(action: HistoryEntry['action'], verdict: HistoryEntry['verdict'], code: FailureCode, level: string, eid?: EID): void {
    const t=this.last?.preview.timings;
    this.timeline.push({step:this.steps,action,eid,level,verdict,code,
      digest:this.last?.payload.digest??'',bytes:this.last?.payload.size??0,
      sensing:this.session.scene?.image?'image':'dom',
      timings:{observe:this.observed?.observation.timings.totalMs??0,detect:t?.detectMs??0,policy:t?.policyMs??0,
        redact:t?.redactMs??0,seal:t?.sealMs??0,network:0,model:0,check:0,approval:0,execute:0,verify:0}});
    this.emit();
  }
  private async observe(light=false): Promise<void> {
    this.move('observing');
    let observed=await this.wait(sendMessage('OBSERVE',{tabId:this.tabId,domOnly:light}));
    if (light && observed.change.decision==='NEW_SCREEN') {
      const change=observed.change;
      observed=await this.wait(sendMessage('OBSERVE',{tabId:this.tabId})); observed.change=change;
    }
    this.observed=observed;
    // A task's first scene always carries its current image, even after a preview capture.
    const screen = !this.session.scene ? {decision:'NEW_SCREEN' as const,reason:'task-start'} : observed.change;
    this.last=await this.wait(processObservation({observation:observed.observation,session:this.session,task:this.task,mode:this.mode,
      forceImage:this.modelCalls===0&&this.sendImage,sendImage:this.sendImage, stateToken:observed.stateToken,screen,signal:this.signal,history:this.history,contextDenied:this.contextDenied,
      taskTokens:this.tokens.filter(t=>this.grants.get(new URL(observed.observation.url).origin)?.has(this.session.vault.get(t)!.type)).join(' '),
      requestSpanRects:async data=>{
        const result=await this.wait(browser.tabs.sendMessage(this.tabId,{type:'SPAN_RECTS',data},{frameId:0}));
        if(!result?.ok) return {stale:true}; return result.response;
      }}));
  }
  private async consent(): Promise<void> {
    const scene=this.session.scene!;
    if(this.grants.has(scene.page.origin)) return;
    this.move('consenting');
    const request=consentRequest(scene,this.session);
    const reply=await this.human(this.ui.consent(request,this.signal));
    const allowed=new Set([...request.medium,...request.high,...(reply.credentialToken?['PASSWORD' as const]:[])]);
    this.grants.set(scene.page.origin,new Set(reply.categories.filter(c=>allowed.has(c))));
    this.session.consentedOrigins.add(scene.page.origin);
    this.move('observing');
  }
  /**
   * `entry` names what actually failed. Until it existed this always wrote `observe`/FAIL, so a
   * rejected completion claim reached the model as `{"action":"observe","verdict":"FAIL","code":
   * "DONE_UNVERIFIED"}` — the wrong action, no eid, and nothing to act on. A model cannot build
   * better evidence from that, which is exactly how a run reached 10 replans without ever changing
   * strategy. Defaults preserve every existing call site.
   */
  private async recover(code: FailureCode, entry: {action?: HistoryEntry['action']; eid?: string; alreadyRecorded?: boolean} = {}): Promise<boolean> {
    this.move('recovering'); if(!entry.alreadyRecorded) this.record(entry.action??'observe','FAIL',code,entry.eid);
    if(this.recovery.decide(code)==='replan' && !this.budget()) return true;
    this.move('asking_user');
    const unmet=code==='REQUIREMENTS_UNMET'?this.unmetCategories():[];
    const detail=unmet.length?` Aegis could not confirm these were entered: ${unmet.join(', ')}. Trying again continues without them.`:'';
    const reply=await this.human(this.ui.ask(`Aegis is stuck: ${FAILURE_REASON[code]}.${detail} You can reply with a hint, let it try again, or stop. (${code})`,this.signal));
    if(reply.choice==='stop') {this.stop();return false;}
    if(this.budget()) {this.move('failed');return false;}
    if(reply.hint) this.task += `\nUser hint: ${reply.hint}`;
    // Only the user may relax a local guarantee, and only by explicitly choosing to go on without
    // the value. A hint means "look harder", so it never waives.
    else if(code==='REQUIREMENTS_UNMET') this.ledger.waiveAll();
    this.recovery.retry();this.record('ask_user','PASS',reply.hint?'USER_HINT':'USER_RETRY');
    return true;
  }
  /** Requirements the current origin's consent actually covers — a declined category never reaches
   * the model, so requiring it would make the task unwinnable through no fault of the loop. */
  private requirementsView(): RequirementsView {
    const grants=this.grants.get(this.session.scene!.page.origin)??new Set<Category>();
    return this.ledger.view(token=>{const entry=this.session.vault.get(token);return entry!==undefined&&grants.has(entry.type);});
  }
  /** Category names only, for the panel's question. Never a value. */
  private unmetCategories(): string[] {
    const check=checkRequirements(this.requirementsView(),this.session.scene!);
    if(check.verdict!=='UNMET') return [];
    const types=check.unmet.map(t=>this.session.vault.get(t)?.type).filter((c): c is Category=>c!==undefined);
    return [...new Set(types)].map(c=>c.toLowerCase().replace(/_/g,' '));
  }
  private request(action: Action, el: SceneElement|undefined, approved: boolean): {request:ExecutionRequest;frameId:number} {
    const scene=this.session.scene!;
    const frame=el?scene.local.observation.frames.find(f=>f.frameId===el.frameId):undefined;
    return {frameId:frame?.browserFrameId??0, request:{action,origin:frame?new URL(frame.url).origin:scene.page.origin,approved,
      ...(el?{target:{eid:el.eid,fp:el.fp,fpOrdinal:el.fpOrdinal,nodeRef:(el.local.rawRef as {nodeRef?:string}).nodeRef,
        framePath:frame?.documentPath??[],origin:frame?new URL(frame.url).origin:scene.page.origin,ambiguous:el.ambiguous,
        level:Number(classifyAction(action,el,{origin:scene.page.origin,consentedCategories:this.grants.get(scene.page.origin)??new Set()}).level.slice(1))},category:el.fieldCategory}: {})}};
  }
  private async sendLocal(type:string, action:Action, el?:SceneElement, approved=false): Promise<ExecutionResult> {
    const {request,frameId}=this.request(action,el,approved);
    if(type==='EXECUTE_ACTION' && action.action==='type' && el) request.rawText=rehydrate(action,el,this.session,request.origin);
    try {return await this.wait(browser.tabs.sendMessage(this.tabId,{type,session:this.session.sessionId,request},{frameId}));}
    finally {delete request.rawText;}
  }
  private async askModel(text:string):Promise<boolean> {
    this.move('asking_user');
    const reply=await this.human(this.ui.ask(text,this.signal));
    if(reply.choice==='stop'){this.stop();return false;}
    if(reply.hint) this.task+=`\nUser reply: ${reply.hint}`;
    this.record('ask_user','PASS',reply.hint?'USER_HINT':'USER_RETRY');return true;
  }
  async run(data: TaskData[]): Promise<void> {
    if(this.running) throw new Error('Task already running'); this.running=true;
    try {
      await this.wait(this.session.init());
      const tab=await this.wait(browser.tabs.get(this.tabId)); const origin=pageOriginOrThrow(tab.url);
      for(const row of data) {
        if(['OTP','CVV','UPI_PIN','SECRET','PASSWORD'].includes(row.category)) throw new Error('NEVER_AUTOMATED');
        if(row.value){
          const token=await this.wait(this.session.vault.tokenize(row.category,row.value,{origin,source:'task'}));
          this.tokens.push(token);this.ledger.require(token);this.session.taskCategories.add(row.category);
        }
        row.value='';
      }
      data.length=0;
      await this.observe(); await this.consent();
      main: while(!this.signal.aborted) {
        if(this.budget()){if(!await this.recover('BUDGET_EXHAUSTED')) break;}
        this.steps++;
        // Same messaging race as the post-execution observe() below, but at the top of a replan:
        // caught once, in the full e2e suite (never in isolation, where the content script isn't
        // under the load of 50+ preceding tests' tabs) — kyc_submit's Deny path threw here on its
        // third replan and fell straight to 'failed' via the outer catch, with no approval dialog
        // ever shown. Recoverable the same way: a transient runtime-messaging error is not the
        // model's fault, so it should retry through recover(), not kill the task.
        try {await this.observe();}
        catch {this.signal.throwIfAborted();if(await this.recover('EXEC_FAILED'))continue main;break main;}
        await this.consent();
        // Consent may have added a credential token; re-seal before the first send on this origin.
        this.move('planning');this.modelCalls++;this.emit();
        let response;
        try { response=await this.wait(send(this.last!.payload,this.signal,this.provider)); }
        catch { this.signal.throwIfAborted(); if(await this.recover('NETWORK_ERROR')) continue; break; }
        if(this.contextDenied==='BUDGET_EXHAUSTED') this.denialSent=true;
        this.move('checking');
        const checked=checkPlan(response.body,{stateTokens:this.session.stateTokens,planStepsSeen:this.planStepsSeen});
        if(!checked.ok){
          // The whole plan is dropped here, before any action is classified, approved or run.
          this.blocked(checked.action??'observe','REJECT',checked.reason,'—');
          if(await this.recover(checked.reason)) continue;break;
        }
        const {plan,context}=checked;this.planStepsSeen ||= Boolean(plan.plan_steps);
        if('answer' in plan || 'extract' in plan){
          this.ui.answer('answer' in plan?plan.answer.text:JSON.stringify(plan.extract.data,null,2),this.session,this.session.scene!.page.origin);
          this.move('done'); break;
        }
        if('request_context' in plan){
          // Reject requests naming withheld identifiers even inside their free-text reason.
          if(/\bE\d{1,6}\b/.test(plan.request_context.reason)||TOKEN_PATTERN.test(plan.request_context.reason)) {
            if(await this.recover('CONTEXT_DENIED'))continue;break;
          }
          const expansion=decideContextExpansion(plan.request_context,this.session.scene!,{remaining:this.contextRemaining,elementLimit:10,disclosedEids:new Set(this.session.scene!.elements.keys())});
          this.contextRemaining=expansion.remaining;
          this.record('request_context','FAIL','CONTEXT_DENIED');this.recovery.record('request_context','',this.last!.payload.digest,false);
          if(expansion.deniedReason){
            this.contextDenied=expansion.deniedReason;
            if(expansion.deniedReason==='BUDGET_EXHAUSTED'&&this.denialSent){if(!await this.askModel('The model requested more context after the budget was exhausted. Continue or stop?'))break;}
          } else if(!Array.isArray(expansion.add)) {
            if(expansion.add.kind==='scroll') {this.move('executing');await this.sendLocal('EXECUTE_ACTION',{action:'scroll',direction:'down',amount:400});}
            else this.mode='accurate';
          }
          continue;
        }
        for(const action of plan.plan) {
          this.signal.throwIfAborted();this.move('checking');
          const scene=this.session.scene!, el=action.target?scene.elements.get(action.target.eid as EID):undefined;
          const grants=this.grants.get(scene.page.origin)??new Set<Category>();
          const start=performance.now();
          const gate=checkAction(action,{...context,authority:{origin:scene.page.origin,consentedCategories:grants}},scene);
          if(gate.verdict!=='PASS'){
            this.record(action.action,gate.verdict,gate.reason,action.target?.eid);
            this.blocked(action.action,gate.verdict,gate.reason,classifyAction(action,el,{origin:scene.page.origin,consentedCategories:grants}).level,el?.eid);
            if(await this.recover(gate.reason))continue main;break main;
          }
          if(action.action==='ask_user'){if(await this.askModel(action.reason!))continue main;break main;}
          if(action.action==='fail'){this.record('fail','FAIL','MODEL_FAILED');this.ui.answer(action.reason!,this.session,scene.page.origin);this.move('failed');break main;}
          if(action.action==='done'){
            const preflight=await this.sendLocal('PREPARE_ACTION',action);
            // A completion claim is judged against the page as it is NOW. `scene` above predates the
            // model round trip by however long the server took, so verifying against it would let a
            // claim ride on facts that may no longer hold.
            try {await this.observe(true);}
            catch {this.signal.throwIfAborted();if(await this.recover('EXEC_FAILED',{action:'done'}))continue main;break main;}
            this.move('verifying');
            const result=verify(action.evidence,this.session.scene!,action,preflight,this.requirementsView());
            if(result.verdict==='PASS'){this.record('done','PASS');this.move('done');break main;}
            const code=result.verdict==='FAIL'&&result.code==='REQUIREMENTS_UNMET'?'REQUIREMENTS_UNMET':'DONE_UNVERIFIED';
            this.falseSuccess=true;
            // A refused completion claim is the row a reviewer most needs, and it never reached the
            // timeline before — only the model-facing history ever recorded it.
            this.blocked('done','FAIL',code,'—');
            if(await this.recover(code,{action:'done'}))continue main;break main;
          }
          const authority=classifyAction(action,el,{origin:scene.page.origin,consentedCategories:grants});
          let approved=false;
          const humanBefore=this.humanWaitMs;
          if(authority.requiresUser || (el?.fieldCategory && !grants.has(el.fieldCategory))) {
            this.move('awaiting_approval');
            const reply=await this.human(this.ui.approve({action:action.action,eid:el?.eid,label:(el?.local.rawRef as {name?:string})?.name??el?.labelSanitized??'',
              origin:scene.page.origin,category:el?.fieldCategory,level:authority.level,reason:action.reason??'',token:action.text?.match(TOKEN_PATTERN)?.[0]},this.signal));
            if(reply==='stop'){this.stop();break main;}
            if(reply==='skip'){if(await this.recover('APPROVAL_SKIPPED'))continue main;break main;}
            approved=true;
            if(el?.fieldCategory)grants.add(el.fieldCategory);
            // A human may have changed the page while deciding. Never execute from the old snapshot.
            await this.observe(true);this.move('checking');
            const fresh=checkAction(action,{...context,authority:{origin:scene.page.origin,consentedCategories:grants}},this.session.scene!);
            if(fresh.verdict!=='PASS'){if(await this.recover(fresh.reason))continue main;break main;}
          }
          const preflight=await this.sendLocal('PREPARE_ACTION',action,el,approved);
          if(!preflight.ok){if(await this.recover((preflight.code??'EXEC_FAILED') as FailureCode))continue main;break main;}
          this.move('executing');const executionStart=performance.now();
          let execution:ExecutionResult;
          try {execution=await this.sendLocal('EXECUTE_ACTION',action,el,approved);}
          catch {this.signal.throwIfAborted();if(await this.recover('EXEC_FAILED'))continue main;break main;}
          const executionMs=performance.now()-executionStart;
          if(!execution.ok){if(await this.recover((execution.code??'EXEC_FAILED') as FailureCode))continue main;break main;}
          // The action itself may have navigated the page (a form-submitting Enter, a real
          // link/submit click) — the content script instance the previous capture came from can
          // be destroyed mid-navigation, which throws a generic runtime-messaging error, not one
          // of the FailureCode-shaped errors executeLocal() itself throws. Uncaught, that crashed
          // the whole task instead of recovering: found by driving a real Enter-submitted search
          // form through the agent loop (Stage 3B Part II) — kyc_submit's own click never hit
          // this because it calls preventDefault() and never actually navigates.
          try {await this.observe(true);}
          catch {this.signal.throwIfAborted();if(await this.recover('EXEC_FAILED',{action:action.action,eid:el?.eid}))continue main;break main;}
          // Only a CONFIRMED write enters the ledger: `match` is the executor's read-back of the
          // field, not "the command was dispatched". Recorded after the re-observation so the epoch
          // is the one the value now lives on.
          if(action.action==='type'&&execution.match===true&&el){
            for(const token of action.text?.match(new RegExp(TOKEN_PATTERN.source,'g'))??[]) this.ledger.place(token,el.eid,this.session.scene!.screenEpoch);
          }
          this.move('verifying');const verifyStart=performance.now();
          const result=verify(action.expect,this.session.scene!,action,execution);
          const pass=result.verdict==='PASS'||(result.verdict==='UNVERIFIABLE'&&Number(authority.level.slice(1))<3);
          const code=result.verdict==='PASS'?undefined:result.code;
          this.record(action.action,pass?'PASS':'FAIL',code,el?.eid);
          const t=this.last!.preview.timings;
          this.timeline.push({step:this.steps,action:action.action,eid:el?.eid,level:authority.level,verdict:pass?'PASS':'FAIL',code,
            digest:this.last!.payload.digest,bytes:response.size,sensing:this.session.scene!.image?'image':'dom',
            timings:{observe:this.observed!.observation.timings.totalMs,detect:t.detectMs,policy:t.policyMs,redact:t.redactMs,seal:t.sealMs,
              network:response.networkMs,model:response.modelMs,check:executionStart-start-(this.humanWaitMs-humanBefore),approval:this.humanWaitMs-humanBefore,execute:executionMs,verify:performance.now()-verifyStart}});
          this.emit();
          const digest=await this.wait(sha256Hex(new TextEncoder().encode(JSON.stringify([...this.session.scene!.elements.values()].map(e=>[e.eid,e.fp,e.hasValue,e.visible,e.states])))));
          const stuck=this.recovery.record(action.action,el?.fp??'',digest,pass);
          if(!pass||stuck){if(await this.recover(stuck??code??'EXPECT_FAILED',{alreadyRecorded:true}))continue main;break main;}
          if(this.session.scene!.screenEpoch!==context.screenEpoch){this.record(action.action,'DROP_REMAINING','NEW_SCREEN',el?.eid);continue main;}
        }
      }
    } catch(e: unknown) {
      if(!this.signal.aborted){
        this.failureError=e instanceof Error?e.message:String(e);
        console.error('[aegis] run() unexpected throw — check snapshot.failureError for details:',e);
        this.state='failed';this.emit();
      }
    } finally {
      for(const row of data)row.value='';data.length=0;
      this.session.end();this.tokens=[];this.task='';
      try {await endSession(this.session.sessionId);}catch{this.cleanupFailed=true;}
      this.emit();
    }
  }
}

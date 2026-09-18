# /// script
# requires-python = ">=3.12"
# dependencies = ["selenium==4.49.0"]
# ///
"""Real Firefox MV3 sidebar tests; temporary add-on/profile, no production permission patch.

Selenium installs the add-on. Firefox's Marionette actor addresses the remote sidebar
because Classic frame switching and BiDi do not expose that auxiliary content context.
Inspection stays in the browser; only booleans, counts and API errors leave it.
Run from repository root: pnpm e2e:firefox (portals :5174/:5175 must be running).
"""
from pathlib import Path
import json
import os
import time
from selenium import webdriver
from selenium.webdriver.firefox.service import Service

ROOT = Path(__file__).resolve().parents[2]
ACTOR = "document.getElementById('sidebar').contentDocument.querySelector('browser').browsingContext.currentWindowGlobal.getActor('MarionetteCommands')"
opt = webdriver.FirefoxOptions()
opt.binary_location = os.environ.get('FIREFOX_BINARY', '/Applications/Firefox.app/Contents/MacOS/firefox')
opt.set_preference('sidebar.revamp', False)
opt.set_preference('extensions.autoDisableScopes', 0)
d = webdriver.Firefox(options=opt, service=Service(os.environ.get('GECKODRIVER', '/opt/homebrew/bin/geckodriver'), service_args=['--allow-system-access'], log_output=os.devnull))
d.set_script_timeout(30)
results = []


def record(item, notes=''):
    results.append({'item': item, 'status': 'PASS', 'notes': notes})
    print(f'PASS {item}: {notes}', flush=True)


def wait(check, timeout=25):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = check()
        if value:
            return value
        time.sleep(.15)
    raise AssertionError('Timed out waiting for Firefox condition')


def chrome(script, *args):
    d.set_context('chrome')
    return d.execute_script(script, *args)


def panel(script):
    d.set_context('chrome')
    r = d.execute_async_script(f"""
        const done=arguments[arguments.length-1];
        {ACTOR}.executeScript(arguments[0],[],{{}}).then(done,e=>done({{harnessError:String(e)}}));
    """, script)
    assert not isinstance(r, dict) or 'harnessError' not in r, r
    return r


def click_panel(label):
    d.set_context('chrome')
    wait(lambda: panel('return [...document.querySelectorAll("button")].some(b=>b.textContent===' + json.dumps(label) + '&&!b.disabled)'))
    panel('delete window.__aegisLastObserveResult; delete window.__aegisLastProcessResult;')
    r = d.execute_async_script(f"""
        const done=arguments[arguments.length-1], actor={ACTOR};
        actor.findElement('xpath',"//button[text()='"+arguments[0]+"']",{{}})
          .then(el=>actor.clickElement(el,{{toJSON:()=>({{}})}}))
          .then(done,e=>done({{harnessError:String(e)}}));
    """, label)
    assert not isinstance(r, dict) or 'harnessError' not in r, r


def toolbar():
    chrome('CustomizableUI.addWidgetToArea("aegis_sih26171_local-browser-action", CustomizableUI.AREA_NAVBAR)')
    d.find_element('id', 'aegis_sih26171_local-BAP').click()
    time.sleep(.3)


def navigate(path):
    d.set_context('content')
    d.get('http://localhost:5174/' + path)
    time.sleep(.4)


def observe(sanitize=False):
    click_panel('Observe & Sanitize' if sanitize else 'Observe')
    prop = '__aegisLastProcessResult' if sanitize else '__aegisLastObserveResult'
    try:
        wait(lambda: panel(f'return Boolean(window.{prop}) || Boolean(document.querySelector("pre.error"))'))
    except AssertionError:
        state = panel('return {observe:!!window.__aegisLastObserveResult,processed:!!window.__aegisLastProcessResult,buttons:[...document.querySelectorAll("button")].slice(0,6).map(b=>({label:b.textContent,disabled:b.disabled}))}')
        raise AssertionError('Firefox panel did not finish observation: ' + json.dumps(state)) from None
    error = panel('return document.querySelector("pre.error")?.textContent')
    assert not error, error


def permission_button(allow):
    wait(lambda: chrome('return !document.getElementById("addon-webext-permissions-notification").hidden'))
    css = '.popup-notification-primary-button' if allow else '.popup-notification-secondary-button'
    wait(lambda: chrome('return !document.getElementById("addon-webext-permissions-notification").querySelector(arguments[0]).disabled', css))
    time.sleep(1)
    chrome('document.getElementById("addon-webext-permissions-notification").querySelector(arguments[0]).click()', css)


ALIGNMENT_SCRIPT = """return (async()=>{
      const o=window.__aegisLastObserveResult.observation;
      const [tab]=await browser.tabs.query({active:true,currentWindow:true});
      const [{result:points}]=await browser.scripting.executeScript({target:{tabId:tab.id},func:()=>
        [...document.querySelectorAll('[data-square-id]')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,color:e.dataset.expectedColor}})
        .filter(p=>p.x>=0&&p.y>=0&&p.x<innerWidth&&p.y<innerHeight)});
      const img=new Image(); img.src=o.screenshot.dataUrl; await img.decode();
      const c=new OffscreenCanvas(img.naturalWidth,img.naturalHeight), ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      return {samples:points.length,ok:points.every(p=>{const n=parseInt(p.color.slice(1),16),got=ctx.getImageData(Math.round(p.x*o.screenshot.scaleX),Math.round(p.y*o.screenshot.scaleY),1,1).data;
        return [n>>16&255,n>>8&255,n&255].every((v,i)=>Math.abs(v-got[i])<=30)})};
    })()"""

try:
    d.set_window_size(1200, 900)
    navigate('kyc.html')
    addon = d.install_addon(str(ROOT / 'extension/.output/firefox-mv3'), temporary=True)
    assert addon == 'aegis@sih26171.local'
    version = d.capabilities['browserVersion']
    assert int(version.split('.')[0]) >= 140
    # Open without an action click: no activeTab grant for the scoped-permission capture probe.
    chrome('SidebarController.show("aegis_sih26171_local-sidebar-action")')
    wait(lambda: chrome('return !!document.getElementById("sidebar").contentDocument?.querySelector("browser")?.browsingContext.currentWindowGlobal'))
    wait(lambda: panel('return !!document.querySelector("h1")'))
    record('Sidebar page loads', f'Firefox {version}; unmodified MV3 manifest')
    manifest = panel("const m=browser.runtime.getManifest();return {mv:m.manifest_version,initialAll:m.host_permissions.includes('<all_urls>'),noContentScripts:!m.content_scripts}")
    assert manifest['mv']==3 and not manifest['initialAll'] and manifest['noContentScripts']
    record('Manifest permissions and on-demand injection', json.dumps(manifest))
    scoped = panel("""return browser.tabs.captureVisibleTab(undefined,{format:'png'})
      .then(()=>({captured:true}),e=>({captured:false,error:e.message}));""")
    assert not scoped['captured'], 'Scoped capture behavior changed; update permission policy'
    record('Scoped permission capture rejected', scoped['error'])
    toolbar()
    wait(lambda: not chrome('return SidebarController.isOpen'))
    toolbar()
    wait(lambda: panel('return !!document.querySelector("h1")'))
    record('action.onClicked toggles sidebar', 'Closed then opened by native toolbar clicks')
    active_only = panel("""return (async()=>({
      allUrls:await browser.permissions.contains({origins:['<all_urls>']}),
      captured:!!(await browser.tabs.captureVisibleTab(undefined,{format:'png'}))
    }))()""")
    assert active_only['captured'] and not active_only['allUrls']
    record('activeTab-only capture after toolbar click', 'Succeeded without all_urls grant')
    click_panel('Observe')
    permission_button(False)
    wait(lambda: panel('return !!document.querySelector("pre.error")'))
    assert 'denied' in panel('return document.querySelector("pre.error").textContent')
    record('permissions.request from sidebar: Deny', 'Native permission dialog; trusted Observe click')
    click_panel('Observe')
    permission_button(True)
    wait(lambda: panel('return !!window.__aegisLastObserveResult || !!document.querySelector("pre.error")'))
    assert not panel('return document.querySelector("pre.error")?.textContent')
    assert panel('return window.__aegisLastObserveResult.observation.elements.length') > 0
    kyc = panel("""const o=window.__aegisLastObserveResult.observation;
      const text=document.body.innerText;
      return {roles:['Full name','Email address','Password','Submit verification'].every(n=>o.elements.some(e=>e.name===n)),
        noValueText:!['Asha Verma','hunter22','2345 6789 0123'].some(v=>text.includes(v)),
        passwordNotRead:o.elements.filter(e=>e.inputType==='password').every(e=>e.value===undefined)}""")
    assert all(kyc.values()), kyc
    record('permissions.request from sidebar: Allow; Observe KYC marks', json.dumps(kyc))
    capabilities = panel("""return (async()=>{
      const c=new OffscreenCanvas(4,4); c.getContext('2d').fillRect(0,0,4,4);
      const png=await c.convertToBlob({type:'image/png'}), webp=await c.convertToBlob({type:'image/webp'});
      const key=await crypto.subtle.generateKey({name:'HMAC',hash:'SHA-256'},false,['sign']);
      let blocked=false; try{await crypto.subtle.exportKey('raw',key)}catch{blocked=true}
      return {png:png.type,webp:webp.type,nonExtractable:!key.extractable&&blocked,
        signatureBytes:(await crypto.subtle.sign('HMAC',key,new Uint8Array([1]))).byteLength};
    })()""")
    assert capabilities['png'] == 'image/png' and capabilities['nonExtractable'] and capabilities['signatureBytes'] == 32
    record('OffscreenCanvas export + non-extractable HMAC', json.dumps(capabilities))
    observe(True)
    safe = panel("""const r=window.__aegisLastProcessResult;
      const s=r.preview.draftJson;
      return {sealed:!!r.payload.digest,clean:!['Asha Verma','asha@example.com','hunter22','2345 6789 0123','234567890123'].some(v=>s.includes(v)),image:!!r.preview.redactedImageDataUrl};""")
    assert all(safe.values()), safe
    record('Privacy Preview seals KYC with zero known raw values', 'Exact sealed bytes inspected locally')
    panel('window.__aegisLifetimeSentinel=true')
    toolbar()
    toolbar()
    wait(lambda: panel('return !!document.querySelector("h1")'))
    assert panel('return !window.__aegisLifetimeSentinel && !window.__aegisLastProcessResult')
    record('Sidebar lifetime', 'Close/reopen destroys prior document and in-memory session result')
    navigate('shadow.html')
    observe()
    shadow = panel("""return window.__aegisLastObserveResult.observation.elements
      .filter(e=>e.inShadow==='closed').length""")
    assert shadow > 0
    assert panel("return window.__aegisLastObserveResult.observation.elements.some(e=>e.inShadow==='open')")
    record('Element.openOrClosedShadowRoot', f'{shadow} closed-shadow controls found')
    navigate('frames.html')
    observe()
    frames = panel("""const o=window.__aegisLastObserveResult.observation;
      return {methods:o.frames.map(f=>f.mapping),unmapped:o.media.filter(m=>m.kind==='iframe-unmapped').length,
      framed:o.elements.filter(e=>e.frameId!==0).length}""")
    assert frames['framed'] > 0
    assert len(frames['methods']) > 1 or frames['unmapped'] > 0
    record('Frame mapping', json.dumps(frames))
    navigate('dynamic.html')
    d.set_context('content')
    wait(lambda: d.find_elements('id', 'modal-close'))
    d.find_element('id', 'modal-close').click()
    observe(True)
    panel("window.__aegisBeforeDynamic=JSON.parse(window.__aegisLastProcessResult.preview.draftJson).elements.find(e=>e.label==='Re-rendered field')")
    d.set_context('content')
    d.find_element('id', 'rerender-btn').click()
    observe(True)
    stable = panel("""const before=window.__aegisBeforeDynamic;
      const after=JSON.parse(window.__aegisLastProcessResult.preview.draftJson).elements.find(e=>e.label==='Re-rendered field');
      const adds=window.__aegisLastObserveResult.observation.elements.filter(e=>e.name==='Add');
      return {eid:!!before&&before.eid===after?.eid,fp:before?.fp===after?.fp,
        duplicates:adds.length===3&&new Set(adds.map(e=>e.fp)).size===1&&JSON.stringify(adds.map(e=>e.fpOrdinal).sort())==='[0,1,2]'}""")
    assert all(stable.values()), stable
    record('Dynamic rerender and duplicate ordinals', json.dumps(stable))
    d.set_context('content')
    d.find_element('id', 'open-modal-btn').click()
    observe()
    assert panel("return window.__aegisLastObserveResult.change.reason") == 'dialog-appeared'
    record('Dynamic modal NEW_SCREEN', 'dialog-appeared')
    navigate('hidden.html')
    observe()
    hidden = panel("""const es=window.__aegisLastObserveResult.observation.elements;
      const pairs=[['display:none','display-none'],['visibility:hidden','visibility-hidden'],['opacity:0','opacity-zero'],['aria-hidden','aria-hidden'],['inert ancestor','inert'],['zero-size','zero-size']];
      const all=pairs.every(([label,reason])=>es.some(e=>(e.name===label||e.labelText===label)&&!e.visible&&e.hiddenInteractive&&e.visibilityReason===reason));
      const off=es.find(e=>e.name==='off-screen'||e.labelText==='off-screen'),covered=es.find(e=>e.name==='Click me');
      return {all,off:!off?.visible&&['outside-viewport','clipped'].includes(off?.visibilityReason),covered:covered?.visible&&covered.hitOk===false};""")
    assert all(hidden.values()), hidden
    record('Hidden controls and covered button', json.dumps(hidden))
    navigate('kyc.html')
    observe()
    observe()
    hygiene = panel("""return (async()=>{
      const o=window.__aegisLastObserveResult.observation, e=o.elements.find(e=>e.visible&&e.bbox.width>0);
      const img=new Image();img.src=o.screenshot.dataUrl;await img.decode();
      const c=new OffscreenCanvas(img.naturalWidth,img.naturalHeight),ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      const px=ctx.getImageData(Math.round((e.bbox.x+1)*o.screenshot.scaleX),Math.round((e.bbox.y+1)*o.screenshot.scaleY),1,1).data;
      const [tab]=await browser.tabs.query({active:true,currentWindow:true});
      const [{result:overlay}]=await browser.scripting.executeScript({target:{tabId:tab.id},func:()=>{const host=document.querySelector('[data-aegis-overlay]');return !!host&&host.style.display!=='none'}});
      return {overlayRestored:overlay,clean:!(Math.abs(px[0]-46)<40&&Math.abs(px[1]-204)<40&&Math.abs(px[2]-113)<40)};
    })()""")
    assert all(hygiene.values()), hygiene
    record('Overlay capture hygiene', json.dumps(hygiene))
    burst = panel("""return (async()=>{
      const [tab]=await browser.tabs.query({active:true,currentWindow:true});
      const results=await Promise.all(Array.from({length:4},()=>browser.runtime.sendMessage({type:'OBSERVE',data:{tabId:tab.id}})));
      return {count:results.length,all:results.every(r=>r.ok)};
    })()""")
    assert burst['all'] and burst['count']==4
    record('Rapid capture throttle', '4 concurrent Observe requests completed')
    # --- Stage 3A: occlusion signal and the Privacy Set-of-Marks ------------------------------
    navigate('kyc.html?banner=1')
    d.set_context('content')
    d.execute_script("document.getElementById('submit').scrollIntoView({block:'center'})")
    time.sleep(.3)
    observe(sanitize=True)
    occlusion = panel("""const d=JSON.parse(window.__aegisLastProcessResult.preview.draftJson);
      const submit=d.elements.find(e=>/submit/i.test(e.label));
      const eids=new Set(d.elements.map(e=>e.eid));
      return {occluded:submit?.occluded===true,
              visible:submit?.visible===true,
              coverNamedIsOutbound:d.elements.every(e=>!e.covered_by||eids.has(e.covered_by))};""")
    assert all(occlusion.values()), occlusion
    record('Occluded submit reported (banner)', json.dumps(occlusion))

    navigate('kyc.html')
    d.set_context('content')
    d.execute_script("document.getElementById('submit').scrollIntoView({block:'center'})")
    time.sleep(.3)
    observe(sanitize=True)
    clear = panel("""const d=JSON.parse(window.__aegisLastProcessResult.preview.draftJson);
      return {noneFlagged:d.elements.filter(e=>e.occluded).length};""")
    assert clear['noneFlagged'] == 0, clear
    record('No clear field flagged as occluded', json.dumps(clear))

    # A fresh screen: SAME_SCREEN captures carry no image, so there would be no pixels to sample.
    navigate('search.html')
    observe(sanitize=True)
    marks = panel("""return (async()=>{
      const r=window.__aegisLastProcessResult, d=JSON.parse(r.preview.draftJson);
      if(!d.image) return {error:'no image in payload'};
      const img=new Image();img.src=d.image;await img.decode();
      const c=new OffscreenCanvas(img.naturalWidth,img.naturalHeight),ctx=c.getContext('2d');
      ctx.drawImage(img,0,0);
      const px=ctx.getImageData(0,0,img.naturalWidth,img.naturalHeight).data;
      let marked=0;
      for(let i=0;i<px.length;i+=4){
        if(Math.abs(px[i]-27)<24&&Math.abs(px[i+1]-110)<24&&Math.abs(px[i+2]-243)<24) marked++;
      }
      return {markPixels:marked,sealed:/^[0-9a-f]{64}$/.test(r.preview.digest)};
    })()""")
    assert marks.get('markPixels', 0) > 0 and marks.get('sealed'), marks
    record('Set-of-Marks drawn and sealed', json.dumps(marks))

    navigate('calibration.html')
    for zoom, scrolled in [(1,False),(1.25,False),(.67,False),(1,True)]:
        panel(f"return browser.tabs.query({{active:true,currentWindow:true}}).then(([tab])=>browser.tabs.setZoom(tab.id,{zoom}))")
        d.set_context('content')
        d.execute_script("if(arguments[0])document.getElementById('sq-center').scrollIntoView({block:'center'});else window.scrollTo(0,0)", scrolled)
        time.sleep(.3)
        observe()
        aligned = panel(ALIGNMENT_SCRIPT)
        assert aligned['samples'] > 0 and aligned['ok'], aligned
        record(f'Screenshot alignment at {round(zoom*100)}%' + (' scrolled' if scrolled else ''), f"{aligned['samples']} visible calibration squares")

    # --- Stage 3B: the agent loop / TaskPanel end to end ----------------------------------------
    # No mock-scenario header here (Selenium/Firefox has no equivalent of Playwright's context-wide
    # request interception, which is how extension/e2e/task-kyc.spec.ts forces one on Chromium) —
    # this exercises MockAdapter's plain default plan instead: type the pre-filled Full name field
    # back into itself, then ask_user. That is a smaller plan than the Chromium checkpoint test, but
    # it is real proof the whole NEW path — consent, planner client, Authority Gate, the content
    # script's EXECUTE_ACTION/PREPARE_ACTION handlers, reacquire(), rehydrate() and verify() —
    # actually runs in Firefox, not just Chromium (CLAUDE.md: a change that only works in one
    # browser is not done).
    navigate('kyc.html')
    panel("""const el=document.getElementById('task-input');
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
        .call(el,'Confirm my name is filled, then stop before submitting.');
      el.dispatchEvent(new Event('input',{bubbles:true}));""")
    click_panel('Start')
    wait(lambda: panel('return !!document.querySelector(\'[aria-label="Task consent"]\')'))
    click_panel('Continue with selected')
    # ask_user only fires after the `type` action executed and its `has_value` postcondition
    # passed — seeing this dialog is itself proof the fill+verify round-trip succeeded.
    wait(lambda: panel('return !!document.querySelector(\'[aria-label="Task question"]\')'), timeout=30)
    d.set_context('content')
    name_value = d.execute_script("return document.getElementById('full-name').value")
    d.set_context('chrome')
    click_panel('Stop task')
    wait(lambda: panel('return document.querySelector(\'[data-testid="task-status"]\')?.textContent===\'stopped\''))
    task = {'nameRoundTripped': name_value == 'Asha Verma', 'stopped': True}
    assert all(task.values()), task
    record('Agent loop: consent, executor, rehydrate, verify round-trip', json.dumps(task))

finally:
    d.quit()
    report = ROOT / 'eval/reports/firefox-stage2.5.json'
    report.write_text(json.dumps({'firefoxVersion': d.capabilities.get('browserVersion'), 'complete': len(results) >= 25, 'results': results}, indent=2) + '\n')

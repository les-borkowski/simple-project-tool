/* global React */
const A3 = window.APP_DATA;
const { useState: useS_AD } = React;

/* ─────────────── Story detail ─────────────── */
function AtlasStoryDetail({ storyId, onNav }) {
  const story = window.byId(A3.stories, storyId) || A3.stories[0];
  const project = window.byId(A3.projects, story.project);
  const tasks = A3.tasks.filter(t => t.story === story.id);
  const done = tasks.filter(t => t.status === 'done').length;

  return (
    <div className="atlas-page">
      <AtlasTopbar
        breadcrumbs={['Projects', project.name, story.title]}
        actions={<>
          <button className="btn"><Icon name="edit" size={12}/> Edit</button>
          <button className="btn primary"><Icon name="plus" size={14}/> New task</button>
        </>}
      />

      <div className="story-grid">
        <div>
          {/* Header */}
          <div className="story-head">
            <div className="mono">S-{story.id.replace('s','').padStart(3,'0')} · in {project.name}</div>
            <h1 className="display" style={{margin:'4px 0 12px', fontSize:30}}>{story.title}</h1>
            <p style={{color:'var(--text-muted)', maxWidth:680, lineHeight:1.6}}>{story.description}</p>
          </div>

          {/* Tasks */}
          <section style={{marginTop:24}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <h3 className="display" style={{margin:0, fontSize:18}}>Tasks <span className="mono" style={{marginLeft:6}}>{done}/{tasks.length}</span></h3>
              <button className="btn ghost sm"><Icon name="plus" size={12}/> Add task</button>
            </div>
            <div className="card" style={{padding:0, overflow:'hidden'}}>
              {tasks.map(t => (
                <div key={t.id} className="story-task" onClick={() => onNav('task:'+t.id)}>
                  <span className={'check-circ' + (t.status==='done'?' on':'')}>
                    {t.status==='done' && <Icon name="check" size={11}/>}
                  </span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:14, fontWeight:500, textDecoration: t.status==='done' ? 'line-through':'none', color: t.status==='done'?'var(--text-muted)':'var(--text)'}}>{t.title}</div>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4}}>
                      <span className="mono">T-{t.id.replace('t','').padStart(3,'0')}</span>
                      <Priority p={t.priority}/>
                      {t.checks[1] > 0 && <span className="mono">{t.checks[0]}/{t.checks[1]} subtasks</span>}
                    </div>
                  </div>
                  <StatusPill status={t.status}/>
                  <Avatar user={t.assignee}/>
                  <span className="mono" style={{minWidth:48,textAlign:'right'}}>{fmtDate(t.due)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Comments */}
          <section style={{marginTop:24}}>
            <h3 className="display" style={{margin:'0 0 10px', fontSize:18}}>Discussion</h3>
            <div className="card" style={{padding:14}}>
              <div style={{display:'flex',gap:10}}>
                <Avatar user={A3.currentUser} size="lg"/>
                <div style={{flex:1}}>
                  <textarea className="input" rows={2} placeholder="Add a comment… use **markdown** if you like."/>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
                    <div style={{display:'flex',gap:8,color:'var(--text-faint)'}}>
                      <button className="btn ghost sm"><Icon name="paperclip" size={12}/></button>
                      <button className="btn ghost sm">@ Mention</button>
                    </div>
                    <button className="btn primary sm">Comment</button>
                  </div>
                </div>
              </div>
            </div>
            <ul className="comments">
              <li>
                <Avatar user="u3" size="lg"/>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                    <b style={{fontSize:13}}>Anya Petrov</b>
                    <span className="mono">3 hours ago</span>
                  </div>
                  <p style={{margin:'4px 0 0', fontSize:13, lineHeight:1.55}}>I tested the QR pairing on a low-bandwidth network — handshake retries gracefully. Bumping <b>T-009</b> to in-review.</p>
                </div>
              </li>
              <li>
                <Avatar user="u2" size="lg"/>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                    <b style={{fontSize:13}}>Théo Beaumont</b>
                    <span className="mono">yesterday</span>
                  </div>
                  <p style={{margin:'4px 0 0', fontSize:13, lineHeight:1.55}}>Are we keeping the email fallback as a primary action or behind "More options"? My read is the second.</p>
                </div>
              </li>
            </ul>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="story-side">
          <div className="card" style={{padding:14}}>
            <SideRow label="Status"><StatusPill status={story.status}/></SideRow>
            <SideRow label="Priority"><Priority p={story.priority}/></SideRow>
            <SideRow label="Owner"><Avatar user={story.owner}/> <span style={{fontSize:13}}>{window.byId(A3.members, story.owner).name}</span></SideRow>
            <SideRow label="Project">{project.name}</SideRow>
            <SideRow label="Created"><span className="mono">{fmtDate(story.created_at)}</span></SideRow>
          </div>

          <div className="card" style={{padding:14, marginTop:12}}>
            <div className="label" style={{marginBottom:10}}>Time in status</div>
            <ul className="time-stack">
              <li><span className="time-dot" data-tone="todo"/>To do<span className="mono" style={{marginLeft:'auto'}}>2d</span></li>
              <li><span className="time-dot" data-tone="progress"/>In progress<span className="mono" style={{marginLeft:'auto'}}>9d 4h</span></li>
              <li><span className="time-dot" data-tone="review"/>In review<span className="mono" style={{marginLeft:'auto'}}>1d 6h</span></li>
            </ul>
          </div>

          <div className="card" style={{padding:14, marginTop:12}}>
            <div className="label" style={{marginBottom:10}}>History</div>
            <ul className="hist">
              <li><b>Anya</b> moved to <i>In review</i><div className="mono">2h ago</div></li>
              <li><b>Théo</b> updated description<div className="mono">yesterday</div></li>
              <li><b>Maya</b> created the story<div className="mono">Mar 1</div></li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
function SideRow({ label, children }) {
  return (
    <div className="side-row">
      <span className="label">{label}</span>
      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}>{children}</div>
    </div>
  );
}

/* ─────────────── Task detail ─────────────── */
function AtlasTaskDetail({ taskId, onNav }) {
  const task = window.byId(A3.tasks, taskId) || A3.tasks[2];
  const story = window.byId(A3.stories, task.story);
  const project = window.byId(A3.projects, story.project);
  const sub = [
    { d: 'Sketch capture surface in low-fi', done: true },
    { d: 'Pull tokens from design system', done: true },
    { d: 'Implement shared CameraSurface component', done: true },
    { d: 'Wire haptic feedback', done: true },
    { d: 'Performance pass — sub-100ms first frame', done: false },
    { d: 'iPad / landscape variant', done: false },
    { d: 'Localized strings (en, pl)', done: false },
    { d: 'Accessibility audit', done: false },
    { d: 'QA on 3 device classes', done: false },
  ];

  return (
    <div className="atlas-page">
      <AtlasTopbar
        breadcrumbs={['Projects', project.name, story.title, task.title]}
        actions={<>
          <button className="btn ghost"><Icon name="archive" size={12}/></button>
          <button className="btn"><Icon name="edit" size={12}/> Edit</button>
          <button className="btn primary"><Icon name="check" size={14}/> Mark done</button>
        </>}
      />

      <div className="story-grid">
        <div>
          <div className="story-head">
            <div className="mono">T-{task.id.replace('t','').padStart(3,'0')} · in {story.title}</div>
            <h1 className="display" style={{margin:'4px 0 12px', fontSize:30}}>{task.title}</h1>
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <StatusPill status={task.status}/>
              <Priority p={task.priority}/>
              <span className="mono">due {fmtDate(task.due)}</span>
            </div>
          </div>

          <section style={{marginTop:24}}>
            <h3 className="display" style={{margin:'0 0 10px', fontSize:18}}>Description</h3>
            <div className="card" style={{padding:18, fontSize:14, lineHeight:1.65, color:'var(--text)'}}>
              <p style={{marginTop:0}}>The <b>CameraSurface</b> is the foundation for every capture experience in the app. It must:</p>
              <ul style={{paddingLeft:20}}>
                <li>Render preview with under 100ms cold-start latency</li>
                <li>Support haptic feedback on shutter and on focus lock</li>
                <li>Expose a single declarative API for both single-shot and burst modes</li>
                <li>Handle permission-denied states without breaking the parent flow</li>
              </ul>
              <p>The component lives in <span className="mono" style={{padding:'2px 6px',background:'var(--surface-2)',borderRadius:4}}>@aperture/capture</span> and is consumed by both iOS and Android targets.</p>
            </div>
          </section>

          <section style={{marginTop:24}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <h3 className="display" style={{margin:0, fontSize:18}}>Subtasks <span className="mono" style={{marginLeft:6}}>{sub.filter(s=>s.done).length}/{sub.length}</span></h3>
              <button className="btn ghost sm"><Icon name="plus" size={12}/> Add</button>
            </div>
            <div className="card" style={{padding:0, overflow:'hidden'}}>
              {sub.map((s, i) => (
                <div key={i} className="subtask">
                  <span className={'check-circ' + (s.done?' on':'')}>
                    {s.done && <Icon name="check" size={11}/>}
                  </span>
                  <span style={{flex:1, fontSize:13.5, color: s.done?'var(--text-muted)':'var(--text)', textDecoration: s.done?'line-through':'none'}}>{s.d}</span>
                  {i % 3 === 0 && <Avatar user={['u2','u3','u4'][i%3]}/>}
                </div>
              ))}
            </div>
          </section>

          <section style={{marginTop:24}}>
            <h3 className="display" style={{margin:'0 0 10px', fontSize:18}}>Discussion <span className="mono" style={{marginLeft:6}}>{task.comments}</span></h3>
            <div className="card" style={{padding:14}}>
              <div style={{display:'flex',gap:10}}>
                <Avatar user={A3.currentUser} size="lg"/>
                <textarea className="input" rows={2} placeholder="Add a comment…"/>
              </div>
            </div>
            <ul className="comments">
              <li>
                <Avatar user="u4" size="lg"/>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8}}><b style={{fontSize:13}}>Reza Saatchi</b><span className="mono">5h ago</span></div>
                  <p style={{margin:'4px 0 0', fontSize:13, lineHeight:1.55}}>For the haptics — I'd recommend the same pattern as Operator console (selectionFeedback + impact medium). Shared file in <span className="mono">/haptics/library.ts</span>.</p>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <aside className="story-side">
          <div className="card" style={{padding:14}}>
            <SideRow label="Assignee"><Avatar user={task.assignee}/> <span style={{fontSize:13}}>{window.byId(A3.members, task.assignee).name}</span></SideRow>
            <SideRow label="Status"><StatusPill status={task.status}/></SideRow>
            <SideRow label="Priority"><Priority p={task.priority}/></SideRow>
            <SideRow label="Story">{story.title.slice(0,30)}…</SideRow>
            <SideRow label="Due"><span className="mono">{fmtDate(task.due)}</span></SideRow>
          </div>

          <div className="card" style={{padding:14, marginTop:12}}>
            <div className="label" style={{marginBottom:10}}>Watchers</div>
            <AvatarStack ids={['u1','u2','u3','u4']}/>
            <button className="btn ghost sm" style={{marginTop:8}}><Icon name="plus" size={12}/> Add watcher</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─────────────── Invitations ─────────────── */
function AtlasInvitations({ onNav }) {
  return (
    <div className="atlas-page">
      <AtlasTopbar title="Invitations" actions={null}/>
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        {A3.invitations.map(inv => (
          <div key={inv.id} className="inv-row">
            <div className="inv-icon"><Icon name="inbox" size={16}/></div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14, fontWeight:500}}>{inv.project}</div>
              <div style={{fontSize:12, color:'var(--text-muted)', marginTop:2}}>{inv.inviter} invited you as <b>{inv.role}</b> · expires {inv.expires}</div>
            </div>
            <button className="btn">Decline</button>
            <button className="btn primary">Accept</button>
          </div>
        ))}
        {A3.invitations.length === 0 && <div style={{padding:40, textAlign:'center', color:'var(--text-muted)'}}>No pending invitations</div>}
      </div>
    </div>
  );
}

/* ─────────────── Config ─────────────── */
function AtlasConfig() {
  const [tab, setTab] = useS_AD('profile');
  const me = window.byId(A3.members, A3.currentUser);
  return (
    <div className="atlas-page">
      <AtlasTopbar title="Settings" actions={null}/>
      <div className="cfg-grid">
        <nav className="cfg-nav">
          {[
            ['profile','Profile','user'],
            ['theme','Appearance','sun'],
            ['locale','Language','book'],
            ['keys','API keys','git'],
            ['security','Security','flag'],
          ].map(([id,label,icon]) => (
            <button key={id} className={tab===id?'on':''} onClick={()=>setTab(id)}>
              <Icon name={icon} size={14}/> {label}
            </button>
          ))}
        </nav>
        <div>
          {tab === 'profile' && (
            <div className="card" style={{padding:24}}>
              <h3 className="display" style={{margin:'0 0 16px', fontSize:18}}>Profile</h3>
              <div style={{display:'flex',gap:18,alignItems:'center',marginBottom:18}}>
                <Avatar user={me} size="xl"/>
                <div>
                  <button className="btn sm">Upload</button>
                  <div className="mono" style={{marginTop:6}}>PNG or JPG · max 2MB</div>
                </div>
              </div>
              <div style={{display:'grid', gap:12, gridTemplateColumns:'1fr 1fr'}}>
                <Field label="Name" defaultValue={me.name}/>
                <Field label="Email" defaultValue={me.email}/>
                <Field label="Role" defaultValue="Manager" disabled/>
                <Field label="Timezone" defaultValue="Europe/London"/>
              </div>
              <div style={{marginTop:16, display:'flex', justifyContent:'flex-end'}}>
                <button className="btn primary">Save changes</button>
              </div>
            </div>
          )}
          {tab === 'theme' && (
            <div className="card" style={{padding:24}}>
              <h3 className="display" style={{margin:'0 0 16px', fontSize:18}}>Appearance</h3>
              <div style={{display:'grid', gap:12, gridTemplateColumns:'repeat(3, 1fr)'}}>
                {['Light','Dark','System'].map(t => (
                  <button key={t} className="theme-card">
                    <div className={'theme-prev ' + t.toLowerCase()}><span/><span/><span/></div>
                    <div style={{fontSize:13, fontWeight:500, marginTop:8}}>{t}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === 'locale' && (
            <div className="card" style={{padding:24}}>
              <h3 className="display" style={{margin:'0 0 16px', fontSize:18}}>Language</h3>
              <Field label="Display language" select options={['English (UK)','Polski']}/>
              <Field label="Date format" select options={['DD MMM YYYY','MM/DD/YYYY','YYYY-MM-DD']}/>
              <Field label="Week starts on" select options={['Monday','Sunday']}/>
            </div>
          )}
          {tab === 'keys' && (
            <div className="card" style={{padding:0, overflow:'hidden'}}>
              <div style={{padding:'18px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--line)'}}>
                <h3 className="display" style={{margin:0, fontSize:18}}>API keys</h3>
                <button className="btn primary"><Icon name="plus" size={12}/> Create key</button>
              </div>
              {[
                {label: 'CI deployment', scopes: ['read','write'], used: '2h ago'},
                {label: 'Local dev — Maya', scopes: ['read'], used: 'yesterday'},
                {label: 'Webhook bridge', scopes: ['read','write','admin'], used: 'Mar 4'},
              ].map((k, i) => (
                <div key={i} className="key-row">
                  <div style={{flex:1}}>
                    <div style={{fontSize:14, fontWeight:500}}>{k.label}</div>
                    <div className="mono" style={{marginTop:2}}>sk_live_•••••••••••••{i*7+39}</div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    {k.scopes.map(s => <span key={s} className="pill" data-tone="todo">{s}</span>)}
                  </div>
                  <span className="mono" style={{minWidth:80, textAlign:'right'}}>used {k.used}</span>
                  <button className="btn sm">Revoke</button>
                </div>
              ))}
            </div>
          )}
          {tab === 'security' && (
            <div className="card" style={{padding:24}}>
              <h3 className="display" style={{margin:'0 0 16px', fontSize:18}}>Security</h3>
              <Field label="Current password" type="password" defaultValue="••••••••••"/>
              <Field label="New password" type="password" defaultValue=""/>
              <Field label="Confirm new password" type="password" defaultValue=""/>
              <div style={{marginTop:16, padding:'14px 16px', background:'var(--surface-2)', borderRadius:'var(--radius)', display:'flex', alignItems:'center', gap:12}}>
                <Icon name="flag" size={18}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:500}}>Two-factor authentication</div>
                  <div style={{fontSize:12, color:'var(--text-muted)'}}>Off — recommended for managers</div>
                </div>
                <button className="btn">Enable</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function Field({ label, select, options, ...rest }) {
  return (
    <div style={{marginBottom:14}}>
      <div className="label" style={{marginBottom:4}}>{label}</div>
      {select
        ? <select className="input" {...rest}>{(options||[]).map(o => <option key={o}>{o}</option>)}</select>
        : <input className="input" {...rest}/>}
    </div>
  );
}

/* ─────────────── Login (used by both variations via wrapper) ─────────────── */
function AtlasLogin() {
  return (
    <div className="login-wrap">
      <div className="login-l">
        <div className="login-brand">
          <div className="as-mark" style={{width:32, height:32, fontSize:16}}>N</div>
          <span style={{fontWeight:600, fontSize:15}}>Northwind</span>
        </div>
        <div style={{maxWidth:380, margin:'auto', padding:'24px 0'}}>
          <h1 className="display" style={{fontSize:32, margin:'0 0 6px'}}>Welcome back.</h1>
          <p style={{color:'var(--text-muted)', margin:'0 0 28px'}}>Pick up where your team left off.</p>
          <Field label="Email" defaultValue="maya@northwind.studio"/>
          <Field label="Password" type="password" defaultValue="••••••••••••"/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'14px 0 18px'}}>
            <label style={{fontSize:13, display:'flex',gap:6,alignItems:'center'}}><input type="checkbox" defaultChecked/> Remember me</label>
            <a style={{fontSize:13, color:'var(--accent)'}}>Forgot password?</a>
          </div>
          <button className="btn primary" style={{width:'100%', justifyContent:'center', padding:'10px'}}>Log in</button>
          <div style={{textAlign:'center', marginTop:18, color:'var(--text-muted)', fontSize:13}}>
            New here? <a style={{color:'var(--accent)'}}>Create an account</a>
          </div>
        </div>
        <div style={{color:'var(--text-faint)', fontSize:12}}>© Northwind Studio · 2026</div>
      </div>
      <div className="login-r">
        <div className="login-quote">
          <div className="mono" style={{color:'rgba(255,255,255,0.7)'}}>From the changelog · April 14</div>
          <p className="display" style={{fontSize:28, margin:'12px 0 18px', lineHeight:1.3, color:'#fff'}}>
            "We shipped pairing — three taps and the device's online. Felt like the team's sharpest week of the quarter."
          </p>
          <div style={{display:'flex',alignItems:'center',gap:10, color:'rgba(255,255,255,0.85)'}}>
            <Avatar user="u1" size="lg"/>
            <div>
              <div style={{fontSize:13, fontWeight:500}}>Maya Okafor</div>
              <div style={{fontSize:12, opacity:0.7}}>Engineering manager</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AtlasStoryDetail, AtlasTaskDetail, AtlasInvitations, AtlasConfig, AtlasLogin, Field });

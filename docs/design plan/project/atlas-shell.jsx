/* global React */
/* Atlas — sidebar shell, warm aesthetic, Kanban hero
   Layout: full-height left rail with workspace switcher and pinned projects */

const A = window.APP_DATA;
const { useState: useS_A, useMemo: useM_A } = React;

/* ─────────────── Sidebar ─────────────── */
function AtlasSidebar({ route, onNav }) {
  const pinned = A.projects.filter(p => !p.archived).slice(0, 5);
  const item = (id, icon, label, badge) => (
    <button
      key={id}
      onClick={() => onNav(id)}
      className={'as-item' + (route.startsWith(id) ? ' on' : '')}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
      {badge != null && <span className="as-badge">{badge}</span>}
    </button>
  );
  return (
    <aside className="atlas-side">
      <div className="as-brand">
        <div className="as-mark">N</div>
        <div>
          <div className="as-org">Northwind Studio</div>
          <div className="as-org-sub">Workspace · 6 members</div>
        </div>
        <button className="as-org-toggle"><Icon name="chevD" size={14}/></button>
      </div>

      <div className="as-search">
        <Icon name="search" size={14} />
        <input placeholder="Search projects, stories…" />
        <span className="kbd">⌘K</span>
      </div>

      <nav className="as-group">
        {item('dashboard', 'home', 'My work')}
        {item('projects', 'folder', 'Projects')}
        {item('invitations', 'inbox', 'Invitations', A.invitations.length)}
      </nav>

      <div className="as-section">
        <span className="label">Pinned projects</span>
        <button className="as-mini"><Icon name="plus" size={12}/></button>
      </div>
      <nav className="as-group">
        {pinned.map(p => (
          <button
            key={p.id}
            onClick={() => onNav('project:' + p.id)}
            className={'as-item project' + (route === 'project:' + p.id ? ' on' : '')}
          >
            <span className="as-pdot" style={{background: `hsl(${p.color} 75% 55%)`}} />
            <span style={{minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</span>
          </button>
        ))}
      </nav>

      <div style={{flex:1}} />

      <div className="as-section"><span className="label">You</span></div>
      <nav className="as-group">
        {item('config', 'settings', 'Settings')}
      </nav>

      <div className="as-me">
        <Avatar user={A.currentUser} size="lg" />
        <div style={{minWidth:0, flex:1}}>
          <div style={{fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{window.byId(A.members, A.currentUser).name}</div>
          <div style={{fontSize:11, color:'var(--sidebar-text-muted)'}}>Manager</div>
        </div>
        <button className="as-mini"><Icon name="chevD" size={14}/></button>
      </div>
    </aside>
  );
}

/* ─────────────── Topbar ─────────────── */
function AtlasTopbar({ title, breadcrumbs, actions }) {
  return (
    <header className="atlas-top">
      <div className="at-crumbs">
        {breadcrumbs && breadcrumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="at-sep">/</span>}
            <span className={i === breadcrumbs.length - 1 ? 'at-cur' : ''}>{c}</span>
          </span>
        ))}
        {!breadcrumbs && <h1 className="display" style={{margin:0, fontSize:22}}>{title}</h1>}
      </div>
      <div className="at-actions">{actions}</div>
    </header>
  );
}

/* ─────────────── Dashboard / My work ─────────────── */
function AtlasDashboard({ onNav }) {
  const me = A.currentUser;
  const myTasks = A.tasks.filter(t => t.assignee === me);
  const today = new Date('2026-04-17');
  const upcoming = A.tasks.filter(t => new Date(t.due) >= today && t.status !== 'done').slice(0, 6);
  const inProgress = A.tasks.filter(t => t.status === 'in_progress').slice(0, 5);
  const reviewQueue = A.tasks.filter(t => t.status === 'in_review').slice(0, 4);

  const counts = {
    today: 4, week: 11, blocked: 1, focus: 6,
  };

  return (
    <div className="atlas-dash">
      <AtlasTopbar
        title="My work"
        actions={<>
          <button className="btn"><Icon name="cal" size={14}/> Apr 14 — 20</button>
          <button className="btn primary"><Icon name="plus" size={14}/> New</button>
        </>}
      />
      <div className="dash-grid">
        <section className="dash-hero">
          <div className="dash-greet">
            <div className="label">Thursday · April 17</div>
            <h2 className="display" style={{margin:'4px 0 6px', fontSize:32}}>Good morning, Maya.</h2>
            <p style={{color:'var(--text-muted)', margin:0, maxWidth:520}}>
              You have <b>{counts.today}</b> things on today and <b>{counts.focus}</b> in focus across two projects. Yesterday's review queue is empty.
            </p>
          </div>
          <div className="dash-stats">
            <Stat label="Due today" value={counts.today} accent />
            <Stat label="This week" value={counts.week} />
            <Stat label="In review" value={reviewQueue.length} />
            <Stat label="Blocked" value={counts.blocked} />
          </div>
        </section>

        <section className="card dash-block">
          <div className="dash-bhead">
            <h3 className="display" style={{margin:0, fontSize:16}}>Up next</h3>
            <button className="btn ghost sm">View all <Icon name="arrow" size={12}/></button>
          </div>
          <ul className="dash-tasks">
            {upcoming.map(t => {
              const story = window.byId(A.stories, t.story);
              return (
                <li key={t.id} onClick={() => onNav('task:' + t.id)}>
                  <span className="dt-check"><Icon name="check" size={11}/></span>
                  <div style={{flex:1, minWidth:0}}>
                    <div className="dt-title">{t.title}</div>
                    <div className="dt-meta">
                      <span className="mono">{story?.title.split('—')[0].trim()}</span>
                      <StatusPill status={t.status} />
                      <Priority p={t.priority} />
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <Avatar user={t.assignee} />
                    <span className="mono" style={{color:'var(--text-faint)'}}>{fmtDate(t.due)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card dash-block">
          <div className="dash-bhead">
            <h3 className="display" style={{margin:0, fontSize:16}}>Active projects</h3>
            <button className="btn ghost sm" onClick={() => onNav('projects')}>All projects <Icon name="arrow" size={12}/></button>
          </div>
          <div className="dash-projects">
            {A.projects.filter(p => !p.archived).slice(0,4).map(p => {
              const ptasks = A.tasks.filter(t => {
                const s = window.byId(A.stories, t.story); return s && s.project === p.id;
              });
              const done = ptasks.filter(t => t.status === 'done').length;
              const pct = ptasks.length ? Math.round(done / ptasks.length * 100) : 0;
              return (
                <button key={p.id} className="dpr" onClick={() => onNav('project:'+p.id)}>
                  <span className="dpr-bar" style={{background: `hsl(${p.color} 75% 55%)`}} />
                  <div style={{flex:1, minWidth:0}}>
                    <div className="dpr-name">{p.name}</div>
                    <div className="dpr-meta">
                      <StatusPill status={p.status} />
                      <span className="mono">{ptasks.length} tasks</span>
                    </div>
                  </div>
                  <div className="dpr-prog">
                    <div className="dpr-pbar"><span style={{width: pct+'%'}}/></div>
                    <span className="mono">{pct}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card dash-block">
          <div className="dash-bhead">
            <h3 className="display" style={{margin:0, fontSize:16}}>Activity</h3>
          </div>
          <ul className="dash-activity">
            {A.activity.map(a => (
              <li key={a.id}>
                <Avatar user={a.who} />
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13}}>
                    <b>{window.byId(A.members, a.who).name.split(' ')[0]}</b>{' '}
                    <span style={{color:'var(--text-muted)'}}>{a.what}</span>{' '}
                    <span>{a.target}</span>
                  </div>
                  <div className="mono" style={{marginTop:2}}>{a.at}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
function Stat({ label, value, accent }) {
  return (
    <div className={'stat' + (accent ? ' accent' : '')}>
      <div className="stat-v">{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
function fmtDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { month:'short', day:'numeric' });
}

/* ─────────────── Projects list ─────────────── */
function AtlasProjects({ onNav }) {
  const [view, setView] = useS_A('rows');
  const [showArchived, setArch] = useS_A(false);
  const items = A.projects.filter(p => p.archived === showArchived);

  return (
    <div className="atlas-page">
      <AtlasTopbar
        title="Projects"
        actions={<>
          <div className="seg">
            <button className={view==='rows' ? 'on':''} onClick={()=>setView('rows')}><Icon name="list" size={12}/></button>
            <button className={view==='cards' ? 'on':''} onClick={()=>setView('cards')}><Icon name="grid" size={12}/></button>
          </div>
          <button className="btn"><Icon name="filter" size={12}/> Filter</button>
          <button className="btn primary"><Icon name="plus" size={14}/> New project</button>
        </>}
      />
      <div className="ap-tools">
        <div className="seg">
          <button className={!showArchived?'on':''} onClick={()=>setArch(false)}>Active · {A.projects.filter(p=>!p.archived).length}</button>
          <button className={showArchived?'on':''} onClick={()=>setArch(true)}>Archived · {A.projects.filter(p=>p.archived).length}</button>
        </div>
        <div className="ap-search">
          <Icon name="search" size={13}/>
          <input className="input" placeholder="Search…" style={{padding:'4px 8px', width:200, border:'none', background:'transparent'}}/>
        </div>
      </div>

      {view === 'rows' ? (
        <div className="card ap-table">
          <div className="ap-thead">
            <div>Project</div>
            <div>Status</div>
            <div>Priority</div>
            <div>Members</div>
            <div>Progress</div>
            <div>Updated</div>
          </div>
          {items.map(p => {
            const ptasks = A.tasks.filter(t => { const s = window.byId(A.stories, t.story); return s && s.project === p.id; });
            const done = ptasks.filter(t => t.status === 'done').length;
            const pct = ptasks.length ? Math.round(done / ptasks.length * 100) : 0;
            return (
              <button key={p.id} onClick={() => onNav('project:' + p.id)} className="ap-row">
                <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                  <span className="ap-mark" style={{background: `hsl(${p.color} 75% 55%)`}} />
                  <div style={{minWidth:0}}>
                    <div className="ap-name">{p.name}</div>
                    <div className="ap-desc">{p.description}</div>
                  </div>
                </div>
                <div><StatusPill status={p.status}/></div>
                <div><Priority p={p.priority}/></div>
                <div><AvatarStack ids={p.members}/></div>
                <div className="ap-prog">
                  <div className="dpr-pbar"><span style={{width: pct+'%'}}/></div>
                  <span className="mono">{pct}%</span>
                </div>
                <div className="mono">{fmtDate(p.created_at)}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="ap-cards">
          {items.map(p => {
            const ptasks = A.tasks.filter(t => { const s = window.byId(A.stories, t.story); return s && s.project === p.id; });
            const done = ptasks.filter(t => t.status === 'done').length;
            const pct = ptasks.length ? Math.round(done / ptasks.length * 100) : 0;
            const pStories = A.stories.filter(s => s.project === p.id);
            return (
              <button key={p.id} className="card ap-card" onClick={() => onNav('project:' + p.id)}>
                <div className="ap-cardh" style={{background: `linear-gradient(135deg, hsl(${p.color} 75% 60%), hsl(${(p.color+30)%360} 70% 50%))`}}>
                  <span className="mono" style={{color:'rgba(255,255,255,0.85)'}}>P-{p.id.replace('p','').padStart(3,'0')}</span>
                  <Priority p={p.priority}/>
                </div>
                <div className="ap-cardb">
                  <div className="ap-name" style={{fontSize:15}}>{p.name}</div>
                  <div className="ap-desc">{p.description}</div>
                  <div className="ap-cardstats">
                    <span className="mono">{pStories.length} stories · {ptasks.length} tasks</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8}}>
                    <AvatarStack ids={p.members}/>
                    <StatusPill status={p.status}/>
                  </div>
                  <div className="ap-prog" style={{marginTop:10}}>
                    <div className="dpr-pbar"><span style={{width: pct+'%'}}/></div>
                    <span className="mono">{pct}%</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AtlasSidebar, AtlasTopbar, AtlasDashboard, AtlasProjects, fmtDate });

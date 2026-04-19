/* global React */
const A2 = window.APP_DATA;
const { useState: useS_AB } = React;

/* ─────────────── Project Detail — Kanban hero ─────────────── */
function AtlasProjectDetail({ projectId, onNav }) {
  const project = window.byId(A2.projects, projectId) || A2.projects[0];
  const [tab, setTab] = useS_AB('board');
  const [groupBy, setGroupBy] = useS_AB('story'); // 'story' | 'flat'

  const stories = A2.stories.filter(s => s.project === project.id);
  const tasks = A2.tasks.filter(t => stories.some(s => s.id === t.story));
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;

  return (
    <div className="atlas-page">
      <AtlasTopbar
        breadcrumbs={['Projects', project.name]}
        actions={<>
          <button className="btn ghost"><Icon name="star" size={14}/></button>
          <button className="btn"><Icon name="user" size={12}/> Invite</button>
          <button className="btn primary"><Icon name="plus" size={14}/> New story</button>
        </>}
      />

      {/* Project header */}
      <header className="proj-hero">
        <div className="proj-hero-l">
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
            <span className="proj-mark lg" style={{background: `linear-gradient(135deg, hsl(${project.color} 75% 60%), hsl(${(project.color+30)%360} 70% 50%))`}}>
              {project.name[0]}
            </span>
            <div>
              <div className="mono">P-{project.id.replace('p','').padStart(3,'0')} · created {fmtDate(project.created_at)}</div>
              <h1 className="display" style={{margin:'2px 0 0', fontSize:30}}>{project.name}</h1>
            </div>
          </div>
          <p style={{color:'var(--text-muted)', maxWidth:680, margin:'8px 0 16px'}}>{project.description}</p>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <StatusPill status={project.status}/>
            <Priority p={project.priority}/>
            <span className="hr-vert" />
            <AvatarStack ids={project.members} max={6}/>
            <span className="mono" style={{marginLeft:4}}>{project.members.length} members</span>
          </div>
        </div>
        <div className="proj-hero-r">
          <div className="proj-stats">
            <div><div className="proj-stat-v">{stories.length}</div><div className="proj-stat-l">Stories</div></div>
            <div><div className="proj-stat-v">{tasks.length}</div><div className="proj-stat-l">Tasks</div></div>
            <div><div className="proj-stat-v">{done}</div><div className="proj-stat-l">Done</div></div>
          </div>
          <div className="proj-progress">
            <div className="dpr-pbar lg"><span style={{width: pct+'%'}}/></div>
            <span className="mono">{pct}% complete</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="proj-tabs">
        {[
          ['board','Board','grid'],
          ['stories','Stories','list'],
          ['timeline','Timeline','clock'],
          ['members','Members','user'],
          ['activity','Activity','spark'],
          ['settings','Settings','settings'],
        ].map(([id, label, icon]) => (
          <button key={id} className={tab===id?'on':''} onClick={()=>setTab(id)}>
            <Icon name={icon} size={13}/> {label}
          </button>
        ))}
      </nav>

      {/* Board controls */}
      {tab === 'board' && (
        <>
          <div className="board-tools">
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span className="label">Group by</span>
              <div className="seg">
                <button className={groupBy==='story'?'on':''} onClick={()=>setGroupBy('story')}>Story</button>
                <button className={groupBy==='flat'?'on':''} onClick={()=>setGroupBy('flat')}>None</button>
              </div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className="btn ghost sm"><Icon name="filter" size={12}/> Filter</button>
              <button className="btn ghost sm"><Icon name="sort" size={12}/> Sort: priority</button>
              <span className="hr-vert"/>
              <AvatarStack ids={project.members} max={4}/>
              <button className="btn ghost sm"><Icon name="plus" size={12}/></button>
            </div>
          </div>

          <div className="board">
            {A2.STATUSES.map(col => {
              const colTasks = tasks.filter(t => t.status === col.id);
              return (
                <div key={col.id} className="board-col">
                  <header className="board-colh">
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="board-coldot" data-tone={col.id.replace('_','')}/>
                      <span className="board-coltitle">{col.label}</span>
                      <span className="mono">{colTasks.length}</span>
                    </div>
                    <button className="btn ghost icon"><Icon name="plus" size={13}/></button>
                  </header>
                  <div className="board-collist">
                    {groupBy === 'story' ? (
                      stories.map(s => {
                        const st = colTasks.filter(t => t.story === s.id);
                        if (!st.length) return null;
                        return (
                          <div key={s.id} className="board-grp">
                            <button className="board-grph" onClick={() => onNav('story:'+s.id)}>
                              <Icon name="chevD" size={11}/>
                              <span style={{flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.title}</span>
                              <span className="mono">{st.length}</span>
                            </button>
                            {st.map(t => <BoardCard key={t.id} task={t} onNav={onNav}/>)}
                          </div>
                        );
                      })
                    ) : (
                      colTasks.map(t => <BoardCard key={t.id} task={t} onNav={onNav}/>)
                    )}
                    {colTasks.length === 0 && (
                      <button className="board-empty">+ Add task</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'stories' && <AtlasStoriesList stories={stories} tasks={tasks} onNav={onNav}/>}
      {tab === 'members' && <AtlasMembers project={project}/>}
      {tab === 'timeline' && <AtlasTimeline stories={stories} tasks={tasks}/>}
      {tab === 'activity' && <AtlasActivityTab/>}
      {tab === 'settings' && <AtlasProjectSettings project={project}/>}
    </div>
  );
}

function BoardCard({ task, onNav }) {
  const story = window.byId(A2.stories, task.story);
  const dueDate = new Date(task.due);
  const today = new Date('2026-04-17');
  const overdue = dueDate < today && task.status !== 'done';
  return (
    <button className={'bcard' + (task.status === 'done' ? ' done' : '')} onClick={() => onNav('task:' + task.id)}>
      <div className="bcard-top">
        <span className="mono">T-{task.id.replace('t','').padStart(3,'0')}</span>
        <Priority p={task.priority}/>
      </div>
      <div className="bcard-title">{task.title}</div>
      {task.checks[1] > 0 && (
        <div className="bcard-progress">
          <Icon name="check" size={11}/>
          <span className="mono">{task.checks[0]}/{task.checks[1]}</span>
          <div className="bcard-pbar">
            <span style={{width: (task.checks[0]/task.checks[1]*100)+'%'}}/>
          </div>
        </div>
      )}
      <div className="bcard-foot">
        <Avatar user={task.assignee}/>
        <div className="bcard-meta">
          {task.comments > 0 && <span><Icon name="msg" size={11}/> {task.comments}</span>}
          <span className={overdue ? 'overdue':''}><Icon name="cal" size={11}/> {fmtDate(task.due)}</span>
        </div>
      </div>
    </button>
  );
}

/* ─────────────── Stories list view ─────────────── */
function AtlasStoriesList({ stories, tasks, onNav }) {
  return (
    <div className="card" style={{marginTop:16, overflow:'hidden'}}>
      {stories.map(s => {
        const st = tasks.filter(t => t.story === s.id);
        const done = st.filter(t => t.status === 'done').length;
        const pct = st.length ? Math.round(done/st.length*100) : 0;
        return (
          <div key={s.id} className="story-row" onClick={() => onNav('story:'+s.id)}>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span className="mono">S-{s.id.replace('s','').padStart(3,'0')}</span>
                <h4 style={{margin:0, fontSize:15, fontWeight:500}}>{s.title}</h4>
              </div>
              <p style={{margin:'4px 0 0', color:'var(--text-muted)', fontSize:13}}>{s.description}</p>
              <div style={{display:'flex',alignItems:'center',gap:10,marginTop:8}}>
                <StatusPill status={s.status}/>
                <Priority p={s.priority}/>
                <span className="mono">{st.length} tasks · {done} done</span>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <Avatar user={s.owner} size="lg"/>
              <div style={{width:120}}>
                <div className="dpr-pbar"><span style={{width: pct+'%'}}/></div>
                <div className="mono" style={{textAlign:'right',marginTop:3}}>{pct}%</div>
              </div>
              <Icon name="chevR" size={14}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────── Members tab ─────────────── */
function AtlasMembers({ project }) {
  const members = project.members.map(id => window.byId(A2.members, id));
  return (
    <div style={{marginTop:16}}>
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        {members.map(m => (
          <div key={m.id} className="member-row">
            <Avatar user={m} size="xl"/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14, fontWeight:500}}>{m.name}</div>
              <div style={{fontSize:12, color:'var(--text-muted)'}}>{m.email}</div>
            </div>
            <span className="pill" data-tone="todo">{m.role}</span>
            <button className="btn ghost sm"><Icon name="settings" size={12}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AtlasTimeline({ stories }) {
  return (
    <div className="card" style={{marginTop:16, padding:24}}>
      <div className="label" style={{marginBottom:14}}>April 2026</div>
      <div className="timeline">
        {stories.map((s, i) => {
          const start = 5 + i * 8;
          const width = 22 + (i % 3) * 10;
          return (
            <div key={s.id} className="tl-row">
              <div className="tl-label">{s.title.slice(0, 28)}{s.title.length > 28 ? '…' : ''}</div>
              <div className="tl-track">
                <div className="tl-bar" style={{left: start+'%', width: width+'%', background: `hsl(var(--status-${s.status === 'to_do' ? 'todo' : s.status === 'in_progress' ? 'progress' : s.status === 'in_review' ? 'review' : s.status === 'in_testing' ? 'testing' : 'done'}) / 0.6)`}}>
                  <span className="mono" style={{color:'#fff'}}>{s.title.split(' ').slice(0,3).join(' ')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="tl-axis">
        {['Apr 1','5','9','13','17','21','25','29'].map(d => <span key={d} className="mono">{d}</span>)}
      </div>
    </div>
  );
}

function AtlasActivityTab() {
  return (
    <div className="card" style={{marginTop:16, padding:18}}>
      <ul className="dash-activity">
        {A2.activity.concat(A2.activity).map((a, i) => (
          <li key={i}>
            <Avatar user={a.who} />
            <div style={{flex:1}}>
              <div style={{fontSize:13}}>
                <b>{window.byId(A2.members, a.who).name.split(' ')[0]}</b>{' '}
                <span style={{color:'var(--text-muted)'}}>{a.what}</span>{' '}
                <span>{a.target}</span>
              </div>
              <div className="mono" style={{marginTop:2}}>{a.at}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AtlasProjectSettings({ project }) {
  return (
    <div style={{marginTop:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
      <div className="card" style={{padding:20}}>
        <h3 className="display" style={{margin:'0 0 14px', fontSize:16}}>General</h3>
        <div style={{display:'grid', gap:12}}>
          <div>
            <div className="label" style={{marginBottom:4}}>Name</div>
            <input className="input" defaultValue={project.name}/>
          </div>
          <div>
            <div className="label" style={{marginBottom:4}}>Description</div>
            <textarea className="input" rows={3} defaultValue={project.description}/>
          </div>
        </div>
      </div>
      <div className="card" style={{padding:20}}>
        <h3 className="display" style={{margin:'0 0 14px', fontSize:16}}>Danger zone</h3>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--line)'}}>
          <div><div style={{fontWeight:500, fontSize:13}}>Archive project</div><div style={{fontSize:12, color:'var(--text-muted)'}}>Hide from active list. Can restore later.</div></div>
          <button className="btn"><Icon name="archive" size={12}/> Archive</button>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0'}}>
          <div><div style={{fontWeight:500, fontSize:13, color:'hsl(4 75% 50%)'}}>Delete project</div><div style={{fontSize:12, color:'var(--text-muted)'}}>Permanently remove. Cannot be undone.</div></div>
          <button className="btn" style={{color:'hsl(4 75% 50%)', borderColor:'hsl(4 75% 80%)'}}><Icon name="trash" size={12}/> Delete</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AtlasProjectDetail });

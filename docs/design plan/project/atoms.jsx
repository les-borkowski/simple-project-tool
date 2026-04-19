/* global React, ReactDOM */
const { useState, useMemo, useEffect, useRef } = React;
const D = window.APP_DATA;

/* ────────── tiny atoms ────────── */
function StatusPill({ status }) {
  const tone = { to_do: 'todo', in_progress: 'progress', in_review: 'review', in_testing: 'testing', done: 'done' }[status];
  const label = window.APP_DATA.STATUSES.find(s => s.id === status).label;
  return <span className="pill" data-tone={tone}><span className="dot" />{label}</span>;
}
function Priority({ p }) {
  const icons = {
    high: <svg viewBox="0 0 12 12"><path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    medium: <svg viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>,
    low: <svg viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  };
  return <span className="prio" data-p={p}>{icons[p]} {p[0].toUpperCase()+p.slice(1)}</span>;
}
function Avatar({ user, size }) {
  const u = typeof user === 'string' ? window.byId(D.members, user) : user;
  if (!u) return null;
  const cls = 'av' + (size === 'lg' ? ' lg' : size === 'xl' ? ' xl' : '');
  return <span className={cls} style={{'--av-h': u.hue, background: `hsl(${u.hue} 60% 50%)`}} title={u.name}>{u.initials}</span>;
}
function AvatarStack({ ids, max=4 }) {
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <span className="av-stack">
      {shown.map(id => <Avatar key={id} user={id} />)}
      {extra > 0 && <span className="av" style={{background: 'var(--surface-3)', color: 'var(--text-muted)'}}>+{extra}</span>}
    </span>
  );
}
function Icon({ name, size=16 }) {
  const paths = {
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
    folder: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
    home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2h-4v-7H10v7H6a2 2 0 01-2-2z',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.97 7.97 0 00-.13-1.5l2.1-1.65-2-3.46-2.49 1a8 8 0 00-2.6-1.5L13.5 2h-4l-.78 2.39a8 8 0 00-2.6 1.5l-2.49-1-2 3.46L3.73 10A8 8 0 003.6 12c0 .51.05 1 .13 1.5l-2.1 1.65 2 3.46 2.49-1a8 8 0 002.6 1.5L9.5 22h4l.78-2.39a8 8 0 002.6-1.5l2.49 1 2-3.46-2.1-1.65c.08-.5.13-.99.13-1.5z',
    bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
    plus: 'M12 5v14M5 12h14',
    search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
    chevR: 'M9 18l6-6-6-6',
    chevD: 'M6 9l6 6 6-6',
    filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
    sort: 'M3 6h18M6 12h12M10 18h4',
    layers: 'M12 2L2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
    user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z',
    msg: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8z',
    check: 'M20 6L9 17l-5-5',
    cal: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    grid: 'M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    cmd: 'M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z',
    moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
    sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
    paperclip: 'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
    star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
    trash: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
    edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
    git: 'M6 3v12 M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9',
    dot: 'M12 12h.01',
    close: 'M18 6L6 18M6 6l12 12',
    menu: 'M3 12h18M3 6h18M3 18h18',
    flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22V15',
    clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
    spark: 'M5 3v4M3 5h4M6 17v4M4 19h4M13 3l3.5 7L24 12l-7.5 2L13 21l-3.5-7L2 12l7.5-2z',
    book: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  };
  const d = paths[name];
  if (!d) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flex:'none'}}><path d={d}/></svg>;
}

Object.assign(window, { StatusPill, Priority, Avatar, AvatarStack, Icon });

import { contactsPanel, contactsScript } from "./contacts-ui.js";
export const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email Market workspace</title><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head>
<body><header><a href="/">Email Market</a><button id="logout" hidden>Sign out</button></header>
<main><h1>Workspaces</h1><p id="status" role="status" aria-live="polite"></p>
<section id="identity"><h2>Access your workspace</h2>
<form id="identity-form"><label>Email<input name="email" type="email" required></label>
<label>Password<input name="password" type="password" minlength="12" maxlength="128" required></label>
<div class="actions"><button name="action" value="login">Sign in</button><button name="action" value="signup" class="secondary">Create account</button></div></form></section>
<section id="workspace" hidden><h2>Your workspaces</h2><ul id="list"></ul>
<form id="workspace-form"><label>Workspace name<input name="name" maxlength="100" required></label><button>Create workspace</button></form></section>
<section id="management" hidden><h2 id="selected"></h2><h3>Members</h3><ul id="members"></ul>
<form id="member-form" hidden><label>Existing account email<input name="email" type="email" required></label>
<label>Role<select name="role"><option>viewer</option><option>marketer</option><option>developer</option><option>admin</option></select></label>
<button>Save member</button></form><h3>Audit history</h3><ul id="audit"></ul></section>${contactsPanel}</main></body></html>`;

export const assets = {
  css: `
:root { color-scheme: light; font-family: "Inter", system-ui, sans-serif; --ink:#162934; --muted:#425960; --paper:#f3f8f7; --line:#cadbd7; --accent:#07584e; }
* { box-sizing:border-box; } [hidden] { display:none !important; }
body { margin:0; background:var(--paper); color:var(--ink); }
header { display:flex; align-items:center; justify-content:space-between; padding:1rem max(1rem, calc((100vw - 56rem) / 2)); background:#fff; border-bottom:1px solid var(--line); }
header a { color:var(--accent); font-weight:750; text-decoration:none; }
main { width:min(100% - 2rem, 56rem); margin:2rem auto; }
h1 { font-size:clamp(2rem, 5vw, 3.4rem); margin:0 0 1rem; letter-spacing:-.05em; }
h2 { margin-top:0; }
section { margin:1rem 0; background:#fff; border:1px solid var(--line); border-radius:1rem; padding:clamp(1rem, 4vw, 2rem); }
form { display:grid; gap:1rem; max-width:30rem; }
label { display:grid; gap:.4rem; font-weight:650; }
input, select, button { font:inherit; min-height:2.65rem; border:1px solid var(--line); border-radius:.45rem; padding:.55rem .75rem; }
button { width:fit-content; cursor:pointer; background:var(--accent); color:white; font-weight:650; }
button.secondary { color:var(--accent); background:white; }
:focus-visible { outline:3px solid #c4630b; outline-offset:3px; }
.actions { display:flex; flex-wrap:wrap; gap:.5rem; }
li { margin-block:.6rem; overflow-wrap:anywhere; }
li button { margin-inline-start:.5rem; }
#status { color:var(--muted); min-height:1.25rem; }`,
  js: `
const get = id => document.getElementById(id);
const report = message => { get('status').textContent = message; };
async function api(path, method = 'GET', data) {
  const response = await fetch('/api/v1/' + path, { method, headers: data ? {'content-type':'application/json'} : {}, body: data ? JSON.stringify(data) : undefined });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}
function item(list, text) {
  const row = document.createElement('li');
  row.textContent = text;
  list.append(row);
  return row;
}
function action(row, text, handler) {
  const button = document.createElement('button');
  button.textContent = text;
  button.addEventListener('click', () => perform(handler));
  row.append(button);
}
async function perform(handler) {
  report('');
  try { await handler(); }
  catch (error) { report(error.message || 'Request failed'); }
}
let active;
async function select(workspace) {
  active = workspace;
  get('selected').textContent = workspace.name;
  get('members').replaceChildren();
  get('audit').replaceChildren();
  get('member-form').hidden = workspace.role !== 'owner';
  const canManage = ['owner', 'admin'].includes(workspace.role);
  get('management').hidden = !canManage;
  if (!canManage) return;
  const prefix = 'workspaces/' + workspace.id;
  const [members, audit] = await Promise.all([api(prefix + '/members'), api(prefix + '/audit')]);
  if (active !== workspace) return;
  for (const member of members) {
    const row = item(get('members'), member.email + ' · ' + member.role);
    if (workspace.role === 'owner' && member.role !== 'owner') action(row, 'Remove', async () => {
      await api(prefix + '/members/' + member.id, 'DELETE');
      await select(workspace);
    });
  }
  for (const entry of audit) item(get('audit'), new Date(entry.occurred_at).toLocaleString() + ' · ' + entry.action);
}
async function refresh() {
  try {
    const workspaces = await api('workspaces');
    get('identity').hidden = true;
    get('workspace').hidden = get('logout').hidden = false;
    const list = get('list');
    list.replaceChildren();
    for (const workspace of workspaces) {
      const row = item(list, workspace.name + ' · ' + workspace.role);
      if (['owner','admin','marketer','viewer'].includes(workspace.role)) action(row, 'Contacts', () => openAudience(workspace));
      if (['owner', 'admin'].includes(workspace.role)) action(row, 'Manage', () => select(workspace));
    }
    if (!workspaces.length) item(list, 'Create your first workspace below.');
  } catch (error) {
    if (error.status !== 401) throw error;
    get('identity').hidden = false;
    get('workspace').hidden = get('management').hidden = get('logout').hidden = true;
    active = undefined; hideAudience();
  }
}
function form(id, handler) {
  get(id).addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const submitter = event.submitter;
    if (submitter) submitter.disabled = true;
    void perform(() => handler(values, submitter?.value)).finally(() => {
      if (submitter) submitter.disabled = false;
    });
  });
}
form('identity-form', async (values, operation) => {
  if (operation === 'signup') await api('signup', 'POST', values);
  await api('login', 'POST', values);
  get('identity-form').reset();
  await refresh();
});
form('workspace-form', async values => {
  await api('workspaces', 'POST', values);
  get('workspace-form').reset();
  await refresh();
});
form('member-form', async values => {
  const workspace = active;
  await api('workspaces/' + workspace.id + '/members', 'PUT', values);
  get('member-form').reset();
  await select(workspace);
});
get('logout').addEventListener('click', () => perform(async () => { await api('logout', 'POST'); await refresh(); }));
${contactsScript}
void perform(refresh);`,
};

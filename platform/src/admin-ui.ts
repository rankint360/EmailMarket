export const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Market administration</title><link rel="stylesheet" href="/app.css"><script src="/admin.js" defer></script><main><h1>Platform administration</h1><form id="signin"><label>Operator key<input type="password" required autocomplete="off"></label><button>Connect</button></form><p id="result" role="status"></p><section id="console" hidden><button id="disconnect">Disconnect</button><h2>Users</h2><ul id="users"></ul><button id="users-more" hidden>More users</button><h2>Workspaces</h2><ul id="workspaces"></ul><button id="workspaces-more" hidden>More workspaces</button><h2 id="workspace-heading">Workspace details</h2><div id="workspace-actions"></div><pre id="details"></pre><h2>Operator audit</h2><button id="audit">Refresh audit</button><pre id="history"></pre></section></main></html>`;
export const script = `
const get = id => document.getElementById(id);
let key, session = 0;
const report = value => { get('result').textContent = value; };
async function api(path, method='GET', data) {
 const response=await fetch('/internal/admin/v1/'+path,{method,headers:{authorization:'Bearer '+key,...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const result=await response.json();
 if(!response.ok) throw new Error(result.error);
 return result;
}
async function act(work) {try{report(''); await work();}catch(error){report(error.message);}}
function button(parent,label,work) {
 const child=document.createElement('button');
 child.textContent=label;
 child.onclick=()=>act(work);
 parent.append(child);
}
function reason() { const value=prompt('Reason for this change'); return value?.trim(); }
async function directory(kind,after) {
 const active=session;
 const rows=await api(kind+(after?'?after='+after:''));
 if(active!==session) return;
 const list=get(kind), more=get(kind+'-more');
 if(!after) list.replaceChildren();
 for(const row of rows) {
  const li=document.createElement('li');
  li.textContent=row.email ? row.email+' · '+(row.disabled?'Disabled':'Enabled') : row.name;
  list.append(li);
  if(kind==='workspaces') button(li,'Manage',()=>workspace(row.id));
  else button(li,row.disabled?'Enable':'Disable',async()=>{
   const note=reason();
   if(!note)return;
   await api('users/'+row.id,'PUT',{disabled:!row.disabled,reason:note});
   await directory('users');
  });
 }
 more.hidden=rows.length<50;
 more.onclick=()=>act(()=>directory(kind,rows.at(-1)?.id));
}
let selection=0;
async function workspace(id) {
 const current=++selection, active=session;
 const path='workspaces/'+id, data=await api(path);
 if(current!==selection || active!==session)return;
 get('workspace-heading').textContent=data.workspace.name;
 get('details').textContent=JSON.stringify(data,null,2);
 const actions=get('workspace-actions');
 actions.replaceChildren();
 for(const [paused,label] of [[false,'Approve sending'],[true,'Pause sending']]) button(actions,label,async()=>{
  const note=reason();
  if(!note)return;
  await api(path+'/sending','PUT',{paused,reason:note});
  if(current===selection) await workspace(id);
 });
 button(actions,'Set monthly billing rate',async()=>{
  const month=prompt('Billing month (YYYY-MM)');
  if(!month)return;
  const value=prompt('Rate per accepted message in USD cents');
  if(!value?.trim())return;
  const note=reason();
  if(!note)return;
  await api(path+'/billing','PUT',{month,unitCents:Number(value),reason:note});
  report('Billing rate saved for '+month+'.');
 });
 for(const kind of ['sending','integrations']) for(const item of data[kind]) button(actions,'Revoke '+kind+' key '+item.id,async()=>{
  const note=reason();
  if(!note)return;
  await api(path+'/'+kind+'/'+item.id,'DELETE',{reason:note});
  if(current===selection) await workspace(id);
 });
}
get('signin').onsubmit=event=>{
 event.preventDefault();
 const field=event.currentTarget.querySelector('input');
 key=field.value;field.value='';session++;
 void act(async()=>{await Promise.all([directory('users'),directory('workspaces')]);if(key)get('console').hidden=false;});
};
get('disconnect').onclick=()=>{
 key=undefined;session++;selection++;get('console').hidden=true;
 for(const id of ['users','workspaces','details','history','workspace-actions'])get(id).replaceChildren();
 get('workspace-heading').textContent='Workspace details';
};
get('audit').onclick=()=>act(async()=>{const active=session;const rows=await api('audit');if(active===session)get('history').textContent=JSON.stringify(rows,null,2);});
`;

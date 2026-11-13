export const contactsPanel = `
<section id="audience" hidden>
<h2 id="audience-title">Contacts</h2>
<div id="audience-actions" hidden>
<form id="new-contact"><label>Email<input name="email" type="email" required></label><label>Name<input name="name" maxlength="160"></label><button>Add contact</button></form>
<form id="import-contacts"><label>CSV file<input name="file" type="file" accept=".csv,text/csv" required></label><div class="actions"><button value="preview">Preview import</button><button value="commit" class="secondary">Import contacts</button></div></form>
<pre id="import-result" aria-live="polite"></pre>
<form id="new-group"><label>Group name<input name="name" maxlength="100" required></label><label>Type<select name="kind"><option>list</option><option>tag</option></select></label><button>Create group</button></form>
</div>
<h3>Lists and tags</h3><ul id="groups"></ul>
<h3>Contacts</h3><ul id="contacts"></ul><button id="more-contacts" hidden>Load more contacts</button>
<div id="contact-detail" hidden><h3 id="contact-heading"></h3>
<form id="edit-contact"><label>Name<input name="name" maxlength="160"></label><button>Save name</button></form>
<form id="preference"><label>Marketing preference<select name="subscribed"><option value="false">Unsubscribed</option><option value="true">Subscribed</option></select></label><label>Consent evidence<input name="evidence" maxlength="250" required></label><button>Record preference</button></form>
<form id="assign-group"><label>List or tag<select name="group" required></select></label><div class="actions"><button value="add">Add membership</button><button value="remove" class="secondary">Remove membership</button></div></form>
<div class="actions"><button id="make-unsubscribe">Create unsubscribe link</button><button id="delete-contact" class="secondary">Delete contact</button></div>
<a id="unsubscribe-link" hidden>Open unsubscribe link</a><h4>Consent history</h4><ul id="consent-history"></ul></div>
<div id="compliance" hidden><h3>Suppressions</h3><ul id="suppression-list"></ul><button id="more-suppressions" hidden>Load more suppressions</button>
<form id="suppression-form"><label>Email<input type="email" name="email" required></label><label>Reason<select name="reason"><option>manual</option><option>hard_bounce</option><option>complaint</option><option>unsubscribe</option></select></label>
<label>Evidence for removal<input name="evidence" maxlength="250"></label><div class="actions"><button value="add">Suppress address</button><button value="remove" class="secondary">Remove suppression</button></div></form>
<form id="import-suppressions"><label>Suppression CSV<input name="file" type="file" accept=".csv,text/csv" required></label><div class="actions"><button value="preview">Preview suppressions</button><button value="commit" class="secondary">Import suppressions</button></div></form><pre id="suppression-result" aria-live="polite"></pre><a id="export-contacts">Download contacts and compliance records</a></div>
</section>`;

export const contactsScript = `
let audience, selectedContact, contactCursor, suppressionCursor;
const canEditAudience = () => ['owner','admin','marketer'].includes(audience?.role);
const canManageCompliance = () => ['owner','admin'].includes(audience?.role);
const audiencePath = suffix => 'workspaces/' + audience.id + '/' + suffix;
function hideAudience() {
  audience = selectedContact = undefined;
  get('audience').hidden = true;
}
async function openAudience(workspace) {
  audience = workspace;
  selectedContact = undefined;
  get('audience').hidden = false;
  get('audience-title').textContent = workspace.name + ' contacts';
  get('audience-actions').hidden = !canEditAudience();
  get('compliance').hidden = !canManageCompliance();
  get('contact-detail').hidden = true;
  get('import-result').textContent = ''; get('suppression-result').textContent = '';
  get('export-contacts').href = '/api/v1/' + audiencePath('contacts-export');
  await refreshAudience();
}
async function loadContacts(append = false) {
  const workspace = audience;
  const rows = await api(audiencePath('contacts' + (append ? '?after=' + contactCursor : '')));
  if (audience !== workspace) return;
  const list = get('contacts');
  if (!append) list.replaceChildren();
  if (!append && !rows.length) item(list, 'No contacts yet.');
  for (const row of rows) {
    const line = item(list, (row.name ? row.name + ' · ' : '') + row.email + ' · ' + (row.suppressed ? 'Suppressed' : row.subscribed ? 'Subscribed' : 'Unsubscribed'));
    action(line, 'Details', () => contactDetails(row));
  }
  contactCursor = rows.at(-1)?.id;
  get('more-contacts').hidden = rows.length < 100;
}
async function loadSuppressions(append = false) {
  const workspace = audience;
  const rows = await api(audiencePath('suppressions' + (append ? '?after=' + encodeURIComponent(suppressionCursor) : '')));
  if (audience !== workspace) return;
  const list = get('suppression-list');
  if (!append) list.replaceChildren();
  if (!append && !rows.length) item(list, 'No suppressed addresses.');
  for (const row of rows) item(list, row.email + ' · ' + row.reason);
  suppressionCursor = rows.at(-1)?.email;
  get('more-suppressions').hidden = new Set(rows.map(row => row.email)).size < 100;
}
async function refreshAudience() {
  const workspace = audience;
  const groups = await api(audiencePath('groups'));
  if (audience !== workspace) return;
  const list = get('groups');
  list.replaceChildren();
  const select = get('assign-group').elements.group;
  select.replaceChildren();
  if (!groups.length) item(list, 'No lists or tags yet.');
  for (const group of groups) {
    select.add(new Option(group.kind + ': ' + group.name, group.id));
    const line = item(list, group.kind + ': ' + group.name + ' (' + group.members + ')');
    const members = document.createElement('ul');
    line.append(members);
    action(line, 'View members', async () => {
      members.replaceChildren();
      let cursor;
      do {
        const rows = await api(audiencePath('groups/' + group.id + '/contacts' + (cursor ? '?after=' + cursor : '')));
        for (const row of rows) item(members, row.email);
        if (!cursor && !rows.length) item(members, 'No members.');
        cursor = rows.length === 100 ? rows.at(-1).id : undefined;
      } while (cursor && audience === workspace);
    });
    if (canEditAudience()) {
      action(line, 'Rename', async () => {
        const name = prompt('Group name', group.name);
        if (name === null) return;
        await api(audiencePath('groups/' + group.id), 'PATCH', {name});
        await refreshAudience();
      });
      action(line, 'Delete', async () => {
        if (!confirm('Delete this group and its memberships?')) return;
        await api(audiencePath('groups/' + group.id), 'DELETE');
        await refreshAudience();
      });
    }
  }
  await Promise.all([loadContacts(), ...(canManageCompliance() ? [loadSuppressions()] : [])]);
}
async function contactDetails(contact) {
  selectedContact = contact;
  get('contact-detail').hidden = false;
  get('contact-heading').textContent = contact.email;
  get('edit-contact').elements.name.value = contact.name;
  get('preference').elements.subscribed.value = String(contact.subscribed);
  get('preference').elements.evidence.value = '';
  get('unsubscribe-link').hidden = true;
  for (const id of ['edit-contact','preference','assign-group','make-unsubscribe','delete-contact']) get(id).hidden = !canEditAudience();
  const history = await api(audiencePath('contacts/' + contact.id + '/consent'));
  if (selectedContact !== contact) return;
  const list = get('consent-history');
  list.replaceChildren();
  if (!history.length) item(list, 'No consent events recorded.');
  for (const event of history) item(list, new Date(event.occurred_at).toLocaleString() + ' · ' + (event.subscribed ? 'Subscribed' : 'Unsubscribed') + ' · ' + event.source);
}
form('new-contact', async values => {
  await api(audiencePath('contacts'), 'POST', values);
  get('new-contact').reset();
  await loadContacts();
});
form('new-group', async values => {
  await api(audiencePath('groups'), 'POST', values);
  get('new-group').reset();
  await refreshAudience();
});
form('import-contacts', async (values, operation) => {
  if (values.file.size > 450000) throw new Error('CSV file exceeds 450 KB.');
  const result = await api(audiencePath('imports'), 'POST', {csv:await values.file.text(),commit:operation === 'commit'});
  get('import-result').textContent = [result.valid + ' valid · ' + result.existing + ' existing · ' + result.inserted + ' imported', ...result.errors.map(row => 'Record ' + row.row + ': ' + row.error)].join(String.fromCharCode(10));
  if (result.committed) await loadContacts();
});
form('import-suppressions', async (values, operation) => {
  if (values.file.size > 450000) throw new Error('CSV file exceeds 450 KB.');
  const result = await api(audiencePath('suppression-imports'), 'POST', {csv:await values.file.text(),commit:operation === 'commit'});
  get('suppression-result').textContent = [result.valid + ' valid · ' + result.inserted + ' imported', ...result.errors.map(row => 'Record ' + row.row + ': ' + row.error)].join(String.fromCharCode(10));
  if (result.committed) await Promise.all([loadContacts(),loadSuppressions()]);
});
form('edit-contact', async values => {
  const contact = selectedContact;
  await api(audiencePath('contacts/' + contact.id), 'PATCH', values);
  if (selectedContact === contact) await contactDetails({...contact,name:values.name.trim()});
  await loadContacts();
});
form('preference', async values => {
  const contact = selectedContact;
  const subscribed = values.subscribed === 'true';
  await api(audiencePath('contacts/' + contact.id + '/preferences'), 'PUT', {...values,subscribed});
  if (selectedContact === contact) await contactDetails({...contact,subscribed});
  await loadContacts();
});
form('assign-group', async (values, operation) => {
  await api(audiencePath('groups/' + values.group + '/contacts/' + selectedContact.id), operation === 'remove' ? 'DELETE' : 'PUT');
  await refreshAudience();
});
form('suppression-form', async (values, operation) => {
  await api(audiencePath('suppressions'), operation === 'remove' ? 'DELETE' : 'PUT', values);
  get('suppression-form').reset();
  get('contact-detail').hidden = true;
  selectedContact = undefined;
  await Promise.all([loadContacts(),loadSuppressions()]);
});
get('more-contacts').onclick = () => perform(() => loadContacts(true));
get('more-suppressions').onclick = () => perform(() => loadSuppressions(true));
get('make-unsubscribe').onclick = () => perform(async () => {
  const contact = selectedContact;
  const result = await api(audiencePath('contacts/' + contact.id + '/unsubscribe-link'), 'POST');
  if (selectedContact !== contact) return;
  get('unsubscribe-link').href = result.path;
  get('unsubscribe-link').hidden = false;
});
get('delete-contact').onclick = () => perform(async () => {
  if (!confirm('Delete this contact? Consent and suppression history will be retained.')) return;
  await api(audiencePath('contacts/' + selectedContact.id), 'DELETE');
  selectedContact = undefined;
  get('contact-detail').hidden = true;
  await refreshAudience();
});
`;

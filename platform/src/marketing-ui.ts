export const marketingPanel = `
<section id="marketing" hidden><h2 id="marketing-title">Campaigns</h2>
<h3>Templates</h3><ul id="templates"></ul>
<form id="template-form"><label>Template name<input name="name" required maxlength="100"></label>
<label>Subject<input name="subject" required maxlength="250"></label>
<label>Message<textarea name="content" rows="8" required maxlength="48000"></textarea></label>
<h4>Plain-text preview</h4><pre id="template-preview"></pre>
<div class="actions"><button>Save template</button><button type="button" id="reset-template" class="secondary">New template</button></div></form>
<h3>Campaigns</h3><ul id="campaigns"></ul>
<form id="campaign-form"><label>Campaign name<input name="name" required maxlength="100"></label>
<label>Sender email<input type="email" name="sender" required></label>
<label>Template<select name="template" required></select></label>
<label>Audience list or tag<select name="group" required></select></label>
<div class="actions"><button>Save draft</button><button type="button" id="reset-campaign" class="secondary">New draft</button></div></form>
<form id="schedule-form" hidden><h3 id="schedule-title"></h3>
<label>Send time (your local time)<input type="datetime-local" name="time" required></label>
<div class="actions"><button>Schedule campaign</button><button type="button" id="validate-campaign" class="secondary">Check audience</button></div></form>
</section>`;

export const marketingScript = `
let marketing, templateId, campaignId;
const mkPath = suffix => 'workspaces/' + marketing.id + '/' + suffix;
const mkEdit = () => ['owner','admin','marketer'].includes(marketing.role);
function hideMarketing() {
  marketing = templateId = campaignId = undefined;
  get('marketing').hidden = true;
}
function resetTemplate() {
  templateId = undefined;
  get('template-form').reset();
  get('template-preview').textContent = '';
}
function resetCampaign() {
  campaignId = undefined;
  get('campaign-form').reset();
  get('schedule-form').hidden = true;
}
async function openMarketing(workspace) {
  marketing = workspace;
  resetTemplate();
  resetCampaign();
  get('marketing-title').textContent = workspace.name + ' campaigns';
  get('marketing').hidden = false;
  get('template-form').hidden = get('campaign-form').hidden = !mkEdit();
  await loadMarketing();
}
async function loadMarketing() {
  const workspace = marketing;
  const [templates, campaigns, groups] = await Promise.all(['marketing-templates','campaigns','groups'].map(path => api(mkPath(path))));
  if (marketing !== workspace) return;
  const templateList = get('templates'), campaignList = get('campaigns');
  templateList.replaceChildren();
  campaignList.replaceChildren();
  const fields = get('campaign-form').elements;
  const previous = [fields.template.value, fields.group.value];
  fields.template.replaceChildren(...templates.map(row => new Option(row.name, row.id)));
  fields.group.replaceChildren(...groups.map(row => new Option(row.kind + ': ' + row.name, row.id)));
  if (templates.some(row => row.id === previous[0])) fields.template.value = previous[0];
  if (groups.some(row => row.id === previous[1])) fields.group.value = previous[1];
  if (!templates.length) item(templateList, 'No templates yet.');
  if (!campaigns.length) item(campaignList, 'No campaigns yet.');
  for (const row of templates) {
    const li = item(templateList, row.name + ' · ' + row.subject);
    if (!mkEdit()) continue;
    action(li, 'Edit', () => {
      templateId = row.id;
      const controls = get('template-form').elements;
      controls.name.value = row.name;
      controls.subject.value = row.subject;
      controls.content.value = row.content;
      get('template-preview').textContent = row.content;
    });
    action(li, 'Delete', async () => {
      if (!confirm('Delete this template?')) return;
      await api(mkPath('marketing-templates/' + row.id), 'DELETE');
      if (templateId === row.id) resetTemplate();
      await loadMarketing();
    });
  }
  for (const row of campaigns) {
    const li = item(campaignList, row.name + ' · ' + (row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() + ' · ' + row.queued_count + ' originally queued' : 'Draft'));
    if (row.scheduled_at) {
      action(li, 'Analytics', async () => {
        const results = await api(mkPath('campaigns/' + row.id + '/analytics'));
        report(results.length ? results.map(entry => entry.status + ': ' + entry.count).join(' · ') : 'No delivery records.');
      });
      if (mkEdit()) action(li, 'Cancel unsent', async () => {
        if (!confirm('Cancel queued messages for this campaign?')) return;
        const result = await api(mkPath('campaigns/' + row.id + '/cancel'), 'POST');
        report(result.cancelled + ' messages cancelled.');
      });
    } else if (mkEdit()) {
      action(li, 'Edit draft', () => {
        campaignId = row.id;
        fields.name.value = row.name;
        fields.sender.value = row.sender;
        fields.template.value = row.template_id;
        fields.group.value = row.group_id;
        get('schedule-title').textContent = 'Schedule ' + row.name;
        get('schedule-form').hidden = false;
      });
      action(li, 'Delete draft', async () => {
        if (!confirm('Delete this draft?')) return;
        await api(mkPath('campaigns/' + row.id), 'DELETE');
        if (campaignId === row.id) resetCampaign();
        await loadMarketing();
      });
    }
  }
}
get('template-form').elements.content.oninput = event => { get('template-preview').textContent = event.target.value; };
get('reset-template').onclick = resetTemplate;
get('reset-campaign').onclick = resetCampaign;
form('template-form', async values => {
  await api(mkPath('marketing-templates' + (templateId ? '/' + templateId : '')), templateId ? 'PATCH' : 'POST', values);
  resetTemplate();
  await loadMarketing();
});
form('campaign-form', async values => {
  await api(mkPath('campaigns' + (campaignId ? '/' + campaignId : '')), campaignId ? 'PATCH' : 'POST', values);
  resetCampaign();
  await loadMarketing();
  report('Draft saved. Select Edit draft to validate or schedule it.');
});
get('validate-campaign').onclick = () => perform(async () => {
  const result = await api(mkPath('campaigns/' + campaignId + '/validate'));
  report(result.eligible + ' eligible of ' + result.total + ' contacts. ' + result.skipped + ' skipped.');
});
form('schedule-form', async values => {
  if (!confirm('Schedule this campaign using the saved draft?')) return;
  const result = await api(mkPath('campaigns/' + campaignId + '/schedule'), 'POST', {scheduledAt:new Date(values.time).toISOString()});
  resetCampaign();
  await loadMarketing();
  report(result.queued + ' messages queued · ' + result.skipped + ' skipped.');
});
`;

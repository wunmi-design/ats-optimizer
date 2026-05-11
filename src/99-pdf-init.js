async function fmtSavePdf() {
  const fullText = getResumeText();
  if (!fullText || !fullText.trim()) {
    toast('Open the Template tab first so the preview renders');
    return;
  }
  
  updateLivePreview();
  await new Promise(r => setTimeout(r, 150));
  
  const fullHtml = fmtRenderSections(fmtParseText(fullText));
  
  // Resolve all the formatting bits the print needs from the current template config.
  const bg       = _fmt.bgColor || '#ffffff';
  const color    = _fmt.textColor || '#111111';
  const fontFam  = (_fmt.bodyFont || 'Arial') + ',Arial,sans-serif';
  const fontSize = (_fmt.bodySize || 11) + 'pt';
  const lineH    = _fmt.template === 'compact' ? '1.3' : '1.35';
  const pad      = _fmt.margin || '0.65in';
  
  let fontFaceCSS = '';

  // Build a Google Fonts URL covering every font used in the resume so the iframe can load
  // them on its own. Cross-origin (Google) stylesheets can't be copied via cssRules above,
  // so we have to re-import them inside the iframe document. Only include fonts we know are
  // available on Google Fonts (defined in GOOGLE_FONTS).
  const fontsUsed = [...new Set([
    _fmt.nameFont, _fmt.bodyFont, _fmt.headingFont, _fmt.expFont, _fmt.roleFont
  ].filter(f => f && GOOGLE_FONTS.includes(f)))];
  const googleFontsLink = fontsUsed.length
    ? `<link href="https://fonts.googleapis.com/css2?${fontsUsed.map(f => 'family=' + f.replace(/ /g,'+') + ':wght@400;500;600;700').join('&')}&display=swap" rel="stylesheet">`
    : '';
  
  const filename = (await getResumeFilenameSmart('pdf')).replace('.pdf', '');
  
  // Build a complete, standalone HTML document for the iframe.
  // @page margin: 0.5in on all sides — applied consistently to EVERY printed page by the
  // browser engine, including top/bottom of pages 2, 3, etc. This is the ATS-safe standard.
  // Previous approach used @page {margin:0} + body padding, which only applied to the body
  // element's own box — page 2+ had no top/bottom margins, and page 1 had no bottom margin
  // when content flowed past the first page.
  // appStyles deliberately NOT included — the resume uses inline styles entirely.
  // Including the app's CSS in the iframe pulled in stacking-context and background
  // rules that fought our @page margin coloring. With a minimal stylesheet, the
  // body::before fixed-position bleed reliably fills the @page margin zones.

  const printHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(filename)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${googleFontsLink}
<style>
  *, *::before, *::after { box-sizing: border-box; }
  /* Real per-page margins via @page — content flows naturally across pages, with
     0.5in top/bottom/left/right on every printed page. This is the only way to
     get correct multi-page layout (sections can break across pages, no clipping,
     no white gaps). The trade-off: in some Chrome versions the @page margin zones
     render as paper white. We set background on html, body, AND a wrapper to
     maximize the chance the margin zones inherit bgColor. */
  @page {
    margin: 0.5in;
    size: letter;
  }
  html {
    margin: 0;
    padding: 0;
    background: ${bg};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  body {
    margin: 0;
    padding: 0;
    background: ${bg};
    font-family: ${fontFam};
    font-size: ${fontSize};
    line-height: ${lineH};
    color: ${color};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  a { color: inherit; text-decoration: none; }
  
  /* PAGE BREAK CONTROL — prevents orphans and split sections.
     Each top-level section (Summary, Skills, Work Experience entries, Education, Awards)
     stays together when possible. Headings stay with their first child.
     Bullets stay with their context. Prevents the "AWARDS heading on page 2, body on page 3"
     orphan that happens when content barely overflows. */
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  /* Section-level: try to keep section + first child together */
  body > div {
    page-break-inside: auto;
  }
  /* Individual experience entries (role + bullets) shouldn't split mid-bullet */
  div[style*="margin-top:14px"] {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  /* Last short sections (Education, Awards) — keep whole on one page */
  div[style*="margin-bottom"]:last-child {
    page-break-inside: avoid;
    break-inside: avoid;
  }
</style>
</head>
<body>${fullHtml}</body>
</html>`;
  
  // Create a hidden iframe, write the doc, and print from inside it.
  document.getElementById('pdf-print-iframe')?.remove();
  const iframe = document.createElement('iframe');
  iframe.id = 'pdf-print-iframe';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  
  const idoc = iframe.contentDocument || iframe.contentWindow.document;
  idoc.open();
  idoc.write(printHtml);
  idoc.close();
  
  // Wait for fonts and layout to settle inside the iframe before printing.
  // Google Fonts need a network round-trip, so we give them a moment.
  await new Promise(r => setTimeout(r, 1000));
  try {
    if (idoc.fonts && idoc.fonts.ready) await idoc.fonts.ready;
  } catch(e) {}
  // One more frame for the layout to apply the loaded fonts
  await new Promise(r => setTimeout(r, 200));
  
  try {
    iframe.contentWindow.focus();
    const origTitle = document.title;
    document.title = filename; // parent title = filename for browsers that use it
    iframe.contentWindow.print();
    document.title = origTitle;
    toast('Tip: enable "Background graphics" in the print dialog to keep colors');
  } catch(e) {
    toast('Print failed: ' + (e.message || 'unknown'));
  }
  
  // Clean up after a delay so the print dialog has time to read the iframe.
  setTimeout(() => iframe.remove(), 5000);
}

// ─────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════
//  STRUCTURED CONTENT EDITOR DATA MODEL
//  proj.ce = { contact, summary, roles[], edu[], skillGroups[] }
// ══════════════════════════════════════════════════════════

function ceDefaultData() {
  return {
    contact: { fname:'', lname:'', title:'', email:'', phone:'', linkedin:'', portfolio:'', city:'', state:'' },
    summary: '',
    roles: [],
    edu: [],
    skillGroups: [],
    awards: [],
    certs: [],
    contactOrder: [{key:'portfolio',line:1},{key:'email',line:1},{key:'linkedin',line:1},{key:'phone',line:2}],
    ban: '',
    thread: '',
  };
}

// ── ACCORDION TOGGLE ──────────────────────────────────────
function ceToggle(id) {
  const el = document.getElementById('ce-'+id);
  if (el) el.classList.toggle('open');
}

// ── READ ALL CE FIELDS INTO proj.ce ──────────────────────
function collectCE() {
  if (!proj) return;
  if (!proj.ce) proj.ce = ceDefaultData();
  const c = proj.ce.contact;
  c.fname = g('ce-fname'); c.lname = g('ce-lname'); c.title = g('ce-title');
  c.email = g('ce-email')||''; c.phone = g('ce-phone')||'';
  c.linkedin = g('ce-linkedin')||''; c.portfolio = g('ce-portfolio')||'';
  // contactOrder is updated directly on drag — no need to re-read from DOM
  c.city = g('ce-city'); c.state = g('ce-state');
  proj.ce.summary = g('ce-summary-text');
  proj.ce.ban = g('ce-ban');
  proj.ce.thread = g('ce-thread');
  // roles, edu, skillGroups are written directly on change
}

// ── FILL CE FIELDS FROM proj.ce ──────────────────────────
function fillCE(ce) {
  if (!ce || typeof ce !== 'object') return;
  // Initialize all required arrays if missing
  if (!ce.roles || !Array.isArray(ce.roles)) ce.roles = [];
  if (!ce.edu || !Array.isArray(ce.edu)) ce.edu = [];
  if (!ce.skills || !Array.isArray(ce.skills)) ce.skills = [];
  if (!ce.contact || typeof ce.contact !== 'object') ce.contact = {}; 
  const c = ce.contact || {};
  s('ce-fname', c.fname); s('ce-lname', c.lname); s('ce-title', c.title);
  s('ce-email', c.email); s('ce-phone', c.phone);
  s('ce-linkedin', c.linkedin); s('ce-portfolio', c.portfolio);
  s('ce-city', c.city); s('ce-state', c.state);
  s('ce-summary-text', ce.summary);
  s('ce-ban', ce.ban);
  s('ce-thread', ce.thread);
  renderRoles();
  renderEdu();
  renderSkillGroups();
  renderAwards();
  renderCerts();
  renderContactFields();
}

// ── ROLES ─────────────────────────────────────────────────
function addRole(data) {
  if (!proj) return;
  if (!proj.ce) proj.ce = ceDefaultData();
  const role = data || { id: 'r'+Date.now(), company:'', title:'', startDate:'', endDate:'', location:'', bullets:[] };
  proj.ce.roles.push(role);
  renderRoles();
  liveUpdate();
}

function removeRole(id) {
  if (!proj?.ce) return;
  proj.ce.roles = proj.ce.roles.filter(r => r.id !== id);
  renderRoles();
  liveUpdate();
}

function updateRole(id, field, val) {
  const r = proj?.ce?.roles?.find(r => r.id === id);
  if (r) { r[field] = val; liveUpdate(); }
}

function addBullet(roleId) {
  const r = proj?.ce?.roles?.find(r => r.id === roleId);
  if (!r) return;
  r.bullets.push({ id: 'b'+Date.now(), text:'' });
  renderRoles();
  liveUpdate();
  // Focus the new bullet
  setTimeout(() => {
    const bullets = document.querySelectorAll(`[data-role="${roleId}"] .bullet-row textarea`);
    if (bullets.length) bullets[bullets.length-1].focus();
  }, 50);
}

function removeBullet(roleId, bulletId) {
  const r = proj?.ce?.roles?.find(r => r.id === roleId);
  if (!r) return;
  r.bullets = r.bullets.filter(b => b.id !== bulletId);
  renderRoles();
  liveUpdate();
}

function updateBullet(roleId, bulletId, val) {
  const r = proj?.ce?.roles?.find(r => r.id === roleId);
  if (!r) return;
  const b = r.bullets.find(b => b.id === bulletId);
  if (b) { b.text = val; liveUpdate(); }
}

function toggleRole(id) {
  const el = document.querySelector(`[data-role="${id}"]`);
  if (el) el.classList.toggle('expanded');
}

function renderRoles() {
  const list = document.getElementById('roles-list');
  if (!list || !proj?.ce) return;
  if (!proj.ce.roles || !Array.isArray(proj.ce.roles)) {
    proj.ce.roles = [];
  }
  if (!proj.ce.roles.length) {
    list.innerHTML = '<div class="text-xs text-muted" style="padding:12px;">No roles yet. Click + Add to add your first role.</div>';
    return;
  }
  list.innerHTML = proj.ce.roles.map(r => {
    const compDisplay = r.company || '<span style="color:var(--muted);font-weight:400;">New Role</span>';
    const titleDisplay = r.title ? ` · <span style="font-weight:400;color:var(--muted);font-size:11px;">${esc(r.title)}</span>` : '';
    const bulletsHtml = r.bullets.map(b => `
      <div class="bullet-row">
        <span style="color:var(--muted);margin-top:10px;font-size:13px;">•</span>
        <div style="flex:1;">
          <textarea data-role-id="${r.id}" data-bullet-id="${b.id}" 
            oninput="updateBullet('${r.id}','${b.id}',this.value);updateCharCount(this)" 
>${esc(b.text)}</textarea>
          <div class="char-count ${b.text.length > 150 ? 'over' : ''}">${b.text.length}/150</div>
        </div>
        <button class="bullet-del" onclick="removeBullet('${r.id}','${b.id}')" title="Remove bullet">×</button>
      </div>`).join('');
    return `<div class="role-card ${r._expanded ? 'expanded' : ''}" data-role="${r.id}"
      draggable="true"
      ondragstart="dragStart(event,'role','${r.id}')"
      ondragend="dragEnd(event)"
      ondragover="dragOver(event,'role','${r.id}')"
      ondrop="dropOn(event,'role','${r.id}')">
      <div class="role-card-head">
        <span class="drag-handle" title="Drag to reorder" ondragstart="event.stopPropagation()" onclick="event.stopPropagation()">⠿</span>
        <div class="role-card-company" onclick="toggleRoleExpand('${r.id}')">${r.company ? esc(r.company) + (r.title ? ' · <span style="font-weight:400;color:var(--muted);font-size:11px;">'+esc(r.title)+'</span>' : '') : r.title ? '<span style="font-weight:600;">'+esc(r.title)+'</span>' : '<span style="color:var(--muted);font-weight:400;">New Role</span>'}</div>
        <div class="flex-c gap-1">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="toggleRoleExpand('${r.id}')" title="Expand/collapse">⌄</button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="removeRole('${r.id}')" title="Remove role" style="color:var(--red);">×</button>
        </div>
      </div>
      <div class="role-fields">
        <div class="role-grid">
          <div class="field"><label class="fl">Company</label><input type="text" value="${esc(r.company)}" oninput="updateRole('${r.id}','company',this.value)"></div>
          <div class="field"><label class="fl">Job Title</label><input type="text" value="${esc(r.title)}" oninput="updateRole('${r.id}','title',this.value)"></div>
          <div class="field"><label class="fl">Start Date</label><input type="text" value="${esc(r.startDate)}" oninput="updateRole('${r.id}','startDate',this.value)"></div>
          <div class="field"><label class="fl">End Date</label><input type="text" value="${esc(r.endDate)}" oninput="updateRole('${r.id}','endDate',this.value)"></div>
        </div>
        <div class="field"><label class="fl">Location</label><input type="text" value="${esc(r.location)}" oninput="updateRole('${r.id}','location',this.value)"></div>
        <div class="field"><label class="fl">Role summary (optional — appears before bullets)</label><textarea style="min-height:54px;font-size:12px;" oninput="updateRole('${r.id}','context',this.value)">${esc(r.context||'')}</textarea></div>
        <div class="bullet-list">${bulletsHtml}</div>
        <button class="btn-add-bullet" onclick="addBullet('${r.id}')">+ Add Bullet</button>
      </div>
    </div>`;
  }).join('');
}

function updateCharCount(textarea) {
  const counter = textarea.nextElementSibling;
  if (!counter || !counter.classList.contains('char-count')) return;
  const len = textarea.value.length;
  counter.textContent = len + '/150';
  counter.classList.toggle('over', len > 150);
}

function toggleRoleExpand(id) {
  const r = proj?.ce?.roles?.find(r => r.id === id);
  if (!r) return;
  r._expanded = !r._expanded;
  renderRoles();
}

// ── EDUCATION ─────────────────────────────────────────────
function addEdu(data) {
  if (!proj) return;
  if (!proj.ce) proj.ce = ceDefaultData();
  proj.ce.edu.push(data || { id: 'e'+Date.now(), degree:'', field:'', school:'', location:'', year:'', notes:'' });
  renderEdu();
  liveUpdate();
}

function removeEdu(id) {
  if (!proj?.ce) return;
  proj.ce.edu = proj.ce.edu.filter(e => e.id !== id);
  renderEdu();
  liveUpdate();
}

function updateEdu(id, field, val) {
  const e = proj?.ce?.edu?.find(e => e.id === id);
  if (e) { e[field] = val; liveUpdate(); }
}

function renderEdu() {
  const list = document.getElementById('edu-list');
  if (!list || !proj?.ce) return;
  if (!proj.ce.edu || !Array.isArray(proj.ce.edu)) {
    proj.ce.edu = [];
  }
  if (!proj.ce.edu.length) {
    list.innerHTML = '<div class="text-xs text-muted" style="padding:12px;">No education yet.</div>';
    return;
  }
  list.innerHTML = proj.ce.edu.map(e => {
    // Header label: "Degree in Field" if both, else whichever exists.
    const header = e.degree && e.field
      ? `${esc(e.degree)} in ${esc(e.field)}`
      : esc(e.degree || e.field || 'New Entry');
    return `
    <div class="edu-card">
      <div class="flex-between mb-2">
        <span style="font-size:12px;font-weight:600;">${header}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="removeEdu('${e.id}')" style="color:var(--red);">×</button>
      </div>
      <div class="role-grid">
        <div class="field"><label class="fl">Degree / Certificate</label><input type="text" value="${esc(e.degree)}" oninput="updateEdu('${e.id}','degree',this.value)"></div>
        <div class="field"><label class="fl">Field of Study</label><input type="text" value="${esc(e.field)}" oninput="updateEdu('${e.id}','field',this.value)"></div>
      </div>
      <div class="role-grid">
        <div class="field"><label class="fl">School</label><input type="text" value="${esc(e.school)}" oninput="updateEdu('${e.id}','school',this.value)"></div>
        <div class="field"><label class="fl">Location</label><input type="text" value="${esc(e.location || '')}" oninput="updateEdu('${e.id}','location',this.value)"></div>
      </div>
      <div class="role-grid">
        <div class="field"><label class="fl">Year</label><input type="text" value="${esc(e.year)}" oninput="updateEdu('${e.id}','year',this.value)"></div>
        <div class="field"><label class="fl">Notes (honors, GPA, etc.)</label><input type="text" value="${esc(e.notes)}" oninput="updateEdu('${e.id}','notes',this.value)"></div>
      </div>
    </div>`;
  }).join('');
}

// ── SKILL GROUPS ───────────────────────────────────────────
function addSkillGroup(data) {
  if (!proj) return;
  if (!proj.ce) proj.ce = ceDefaultData();
  proj.ce.skillGroups.push(data || { id: 'sg'+Date.now(), label:'New Group', skills:[] });
  renderSkillGroups();
  liveUpdate();
}

function removeSkillGroup(id) {
  if (!proj?.ce) return;
  proj.ce.skillGroups = proj.ce.skillGroups.filter(g => g.id !== id);
  renderSkillGroups();
  liveUpdate();
}

function updateSkillGroupLabel(id, val) {
  const sg = proj?.ce?.skillGroups?.find(g => g.id === id);
  if (sg) { sg.label = val; liveUpdate(); }
}

function addSkill(groupId, val) {
  addSkillsBulk(groupId, val);
}

function addSkillsBulk(groupId, raw) {
  if (!raw.trim()) return;
  const sg = proj?.ce?.skillGroups?.find(g => g.id === groupId);
  if (!sg) return;
  const items = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  // For single items, check if auto-classify suggestion makes sense
  if (items.length === 1) {
    const skill = items[0];
    // Check for duplicate first
    const allSkills = (proj.ce.skillGroups||[]).flatMap(g => g.skills.map(s => s.text.toLowerCase()));
    if (allSkills.includes(skill.toLowerCase())) { toast('Skill already exists'); return; }
    // Try to classify
    classifyAndSuggest(skill, groupId);
    return;
  }
  // Bulk: add directly, deduplicate
  const allSkills = (proj.ce.skillGroups||[]).flatMap(g => g.skills.map(s => s.text.toLowerCase()));
  items.forEach(text => {
    if (!allSkills.includes(text.toLowerCase())) {
      sg.skills.push({ id: 'sk'+Date.now()+Math.random(), text });
    }
  });
  renderSkillGroups();
  liveUpdate();
}

async function classifyAndSuggest(skill, currentGroupId) {
  const groupLabels = (proj.ce.skillGroups||[]).map(g => g.label).join(', ');
  const sg = proj.ce.skillGroups.find(g => g.id === currentGroupId);
  try {
    const raw = await claudeFetch(`Classify this skill into one of these groups: ${groupLabels}.
Skill: "${skill}"
Return ONLY valid JSON: {"group": "exact group name", "confidence": "high|medium"}`, 200);
    const parsed = parseJson(raw);
    const suggestedGroup = proj.ce.skillGroups.find(g => g.label === parsed.group);
    if (!suggestedGroup || suggestedGroup.id === currentGroupId || parsed.confidence !== 'high') {
      // Add to current group without suggestion
      sg?.skills.push({ id:'sk'+Date.now(), text: skill });
      renderSkillGroups(); liveUpdate(); return;
    }
    // Show suggestion
    showClassifySuggestion(skill, currentGroupId, suggestedGroup);
  } catch(e) {
    // Fallback: add to current group
    sg?.skills.push({ id:'sk'+Date.now(), text: skill });
    renderSkillGroups(); liveUpdate();
  }
}

function showClassifySuggestion(skill, currentGroupId, suggestedGroup) {
  // Find the input in the current group and show a dropdown suggestion
  const input = document.querySelector(`#chips-${currentGroupId} .skill-chip-input`);
  if (!input) {
    // No input found, just add to suggested group
    suggestedGroup.skills.push({ id:'sk'+Date.now(), text: skill });
    renderSkillGroups(); liveUpdate(); return;
  }
  // Remove any existing suggestion
  document.querySelectorAll('.skill-suggest-drop').forEach(el => el.remove());
  const drop = document.createElement('div');
  drop.className = 'skill-suggest-drop';
  drop.innerHTML = `
    <div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);">Suggested category:</div>
    <div class="skill-suggest-item" onclick="acceptClassify('${skill}','${currentGroupId}','${suggestedGroup.id}')">
      <span><strong>${esc(skill)}</strong></span>
      <span class="skill-suggest-group">→ ${esc(suggestedGroup.label)}</span>
    </div>
    <div class="skill-suggest-item" onclick="acceptClassify('${skill}','${currentGroupId}','${currentGroupId}')">
      <span>Keep in current group</span>
      <span class="skill-suggest-group">${esc(proj.ce.skillGroups.find(g=>g.id===currentGroupId)?.label||'')}</span>
    </div>`;
  input.parentNode.style.position = 'relative';
  input.parentNode.appendChild(drop);
  // Close on outside click
  setTimeout(() => document.addEventListener('click', function handler(e) {
    if (!drop.contains(e.target)) { drop.remove(); document.removeEventListener('click', handler); }
  }), 100);
}

function acceptClassify(skill, fromGroupId, toGroupId) {
  document.querySelectorAll('.skill-suggest-drop').forEach(el => el.remove());
  const toGroup = proj.ce.skillGroups.find(g => g.id === toGroupId);
  if (!toGroup) return;
  const allSkills = (proj.ce.skillGroups||[]).flatMap(g => g.skills.map(s => s.text.toLowerCase()));
  if (!allSkills.includes(skill.toLowerCase())) {
    toGroup.skills.push({ id:'sk'+Date.now()+Math.random(), text: skill });
  }
  renderSkillGroups(); liveUpdate();
}

function handleSkillKey(e, groupId, input) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    if (input.value.trim()) { addSkillsBulk(groupId, input.value); input.value = ''; }
  }
}

function handleSkillPaste(e, groupId, input) {
  e.preventDefault();
  const pasted = (e.clipboardData || window.clipboardData).getData('text');
  if (pasted.trim()) { addSkillsBulk(groupId, pasted); input.value = ''; }
}

function removeSkill(groupId, skillId) {
  const sg = proj?.ce?.skillGroups?.find(g => g.id === groupId);
  if (!sg) return;
  sg.skills = sg.skills.filter(s => s.id !== skillId);
  renderSkillGroups();
  liveUpdate();
}

// ── CONTACT FIELD REORDERING ─────────────────────────────
const CONTACT_FIELD_META = {
  email:     { label:'Email',             placeholder:'you@example.com',          id:'ce-email' },
  phone:     { label:'Phone',             placeholder:'555-000-0000',              id:'ce-phone' },
  linkedin:  { label:'LinkedIn URL',      placeholder:'linkedin.com/in/yourname',  id:'ce-linkedin' },
  portfolio: { label:'Portfolio / Website', placeholder:'iwillchangeit.com',       id:'ce-portfolio' },
  location:  { label:'Location (City, State)', placeholder:'Arlington, VA',        id:'ce-location-combined' },
};

let _contactDragKey = null;

function normalizeContactOrder(order) {
  // Migrate old plain-string array to new {key, line} format
  if (!order?.length) return [{key:'portfolio',line:1},{key:'email',line:1},{key:'linkedin',line:1},{key:'phone',line:2},{key:'location',line:2}];
  if (typeof order[0] === 'string') return order.map((k,i) => ({key:k, line: i < 3 ? 1 : 2}));
  // Ensure location exists in order if not present
  if (!order.find(o => o.key === 'location')) order.push({key:'location', line:2});
  return order;
}

function renderContactFields() {
  const list = document.getElementById('contact-fields-list');
  if (!list || !proj?.ce) return;
  proj.ce.contactOrder = normalizeContactOrder(proj.ce.contactOrder);
  const order = proj.ce.contactOrder;

  list.innerHTML = order.map(item => {
    const {key, line} = item;
    const meta = CONTACT_FIELD_META[key];
    if (!meta) return '';
    let val = '';
    if (key === 'location') {
      const city = proj.ce.contact?.city || '';
      const state = proj.ce.contact?.state || '';
      val = [city, state].filter(Boolean).join(', ');
    } else {
      val = proj.ce.contact?.[key] || '';
    }
    const lineBtns = [1,2,3,4,5].map(n =>
      `<button class="line-btn${line===n?' active':''}" onclick="setContactLine('${key}',${n})" title="Line ${n}">${n}</button>`
    ).join('');
    return `<div class="contact-drag-row" data-key="${key}" draggable="true"
      ondragstart="contactDragStart(event,'${key}')"
      ondragend="contactDragEnd(event)"
      ondragover="contactDragOver(event,'${key}')"
      ondrop="contactDrop(event,'${key}')">
      <span class="drag-handle" style="font-size:13px;">⠿</span>
      <div class="field" style="flex:1;margin-bottom:0;">
        <label class="fl">${meta.label}</label>
        <input type="text" id="${meta.id}" value="${esc(val)}"
          oninput="updateContactField('${key}',this.value)">
      </div>
      <div style="flex-shrink:0;">
        <div class="text-xs text-muted" style="text-align:center;margin-bottom:2px;font-size:9px;">LINE</div>
        <div class="line-btns">${lineBtns}</div>
      </div>
    </div>`;
  }).join('');
}

function setContactLine(key, line) {
  if (!proj?.ce?.contactOrder) return;
  const item = proj.ce.contactOrder.find(o => o.key === key);
  if (item) { item.line = line; }
  renderContactFields();
  liveUpdate();
}

function updateContactField(key, val) {
  if (!proj?.ce?.contact) return;
  if (key === 'location') {
    // Parse "City, State" back into separate fields
    const parts = val.split(',').map(s => s.trim());
    proj.ce.contact.city = parts[0] || '';
    proj.ce.contact.state = parts[1] || '';
    // Also sync the hidden city/state inputs
    const cityEl = document.getElementById('ce-city');
    const stateEl = document.getElementById('ce-state');
    if (cityEl) cityEl.value = proj.ce.contact.city;
    if (stateEl) stateEl.value = proj.ce.contact.state;
  } else {
    proj.ce.contact[key] = val;
  }
  liveUpdate();
}

function contactDragStart(e, key) {
  _contactDragKey = key;
  e.dataTransfer.effectAllowed = 'move';
  if (e.currentTarget) {
    setTimeout(() => { if (e.currentTarget) e.currentTarget.style.opacity = '0.4'; }, 0);
  }
}

function contactDragEnd(e) {
  if (e.currentTarget) {
    e.currentTarget.style.opacity = '';
  }
  document.querySelectorAll('.contact-drag-row').forEach(r => r.classList.remove('drag-over'));
  _contactDragKey = null;
}

function contactDragOver(e, key) {
  if (!_contactDragKey || _contactDragKey === key) return;
  e.preventDefault();
  document.querySelectorAll('.contact-drag-row').forEach(r => r.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}

function contactDrop(e, targetKey) {
  e.preventDefault();
  document.querySelectorAll('.contact-drag-row').forEach(r => r.classList.remove('drag-over'));
  if (!_contactDragKey || _contactDragKey === targetKey) return;
  const order = proj.ce.contactOrder;
  const from = order.findIndex(o => o.key === _contactDragKey);
  const to = order.findIndex(o => o.key === targetKey);
  if (from < 0 || to < 0) return;
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  renderContactFields();
  liveUpdate();
}

// ── CERTIFICATIONS ────────────────────────────────────────
function addCert(data) {
  if (!proj) return;
  if (!proj.ce) proj.ce = ceDefaultData();
  if (!proj.ce.certs) proj.ce.certs = [];
  proj.ce.certs.push(data || { id:'cr'+Date.now(), title:'', org:'', year:'', notes:'' });
  renderCerts(); liveUpdate();
}
function removeCert(id) {
  if (!proj?.ce) return;
  proj.ce.certs = (proj.ce.certs||[]).filter(c => c.id !== id);
  renderCerts(); liveUpdate();
}
function updateCert(id, field, val) {
  const c = proj?.ce?.certs?.find(c => c.id === id);
  if (c) { c[field] = val; liveUpdate(); }
}
function renderCerts() {
  const list = document.getElementById('certs-list');
  if (!list || !proj?.ce) return;
  const certs = proj.ce.certs || [];
  if (!certs.length) {
    list.innerHTML = '<div class="text-xs text-muted" style="padding:12px;">No certifications yet.</div>';
    return;
  }
  list.innerHTML = certs.map(c => `
    <div class="edu-card">
      <div class="flex-between mb-2">
        <span style="font-size:12px;font-weight:600;">${esc(c.title||'New Certification')}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="removeCert('${c.id}')" style="color:var(--red);">×</button>
      </div>
      <div class="role-grid">
        <div class="field"><label class="fl">Certification</label><input type="text" value="${esc(c.title)}" oninput="updateCert('${c.id}','title',this.value)"></div>
        <div class="field"><label class="fl">Issuing Organization</label><input type="text" value="${esc(c.org)}" oninput="updateCert('${c.id}','org',this.value)"></div>
      </div>
      <div class="role-grid">
        <div class="field"><label class="fl">Year</label><input type="text" value="${esc(c.year)}" oninput="updateCert('${c.id}','year',this.value)"></div>
        <div class="field"><label class="fl">Notes (optional)</label><input type="text" value="${esc(c.notes)}" oninput="updateCert('${c.id}','notes',this.value)"></div>
      </div>
    </div>`).join('');
}


function addAward(data) {
  if (!proj) return;
  if (!proj.ce) proj.ce = ceDefaultData();
  if (!proj.ce.awards) proj.ce.awards = [];
  proj.ce.awards.push(data || { id:'aw'+Date.now(), title:'', org:'', year:'', desc:'' });
  renderAwards(); liveUpdate();
}
function removeAward(id) {
  if (!proj?.ce) return;
  proj.ce.awards = (proj.ce.awards||[]).filter(a => a.id !== id);
  renderAwards(); liveUpdate();
}
function updateAward(id, field, val) {
  const a = proj?.ce?.awards?.find(a => a.id === id);
  if (a) { a[field] = val; liveUpdate(); }
}
function renderAwards() {
  const list = document.getElementById('awards-list');
  if (!list || !proj?.ce) return;
  const awards = proj.ce.awards || [];
  if (!awards.length) {
    list.innerHTML = '<div class="text-xs text-muted" style="padding:12px;">No awards yet.</div>';
    return;
  }
  list.innerHTML = awards.map(a => `
    <div class="edu-card">
      <div class="flex-between mb-2">
        <span style="font-size:12px;font-weight:600;">${esc(a.title||'New Award')}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="removeAward('${a.id}')" style="color:var(--red);">×</button>
      </div>
      <div class="role-grid">
        <div class="field"><label class="fl">Award / Honor</label><input type="text" value="${esc(a.title)}" oninput="updateAward('${a.id}','title',this.value)"></div>
        <div class="field"><label class="fl">Organization</label><input type="text" value="${esc(a.org)}" oninput="updateAward('${a.id}','org',this.value)"></div>
      </div>
      <div class="role-grid">
        <div class="field"><label class="fl">Year</label><input type="text" value="${esc(a.year)}" oninput="updateAward('${a.id}','year',this.value)"></div>
        <div class="field"><label class="fl">Description (optional)</label><input type="text" value="${esc(a.desc)}" oninput="updateAward('${a.id}','desc',this.value)"></div>
      </div>
    </div>`).join('');
}

// ── DRAG & DROP REORDER HELPERS ───────────────────────────
let _dragId = null;
let _dragType = null;
let _dragGroupId = null;
let _chipDragId = null;
let _chipGroupId = null;

function dragStart(e, type, id, groupId) {
  _dragId = id; _dragType = type; _dragGroupId = groupId||null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  setTimeout(() => { e.target.closest('.role-card, .skill-group')?.classList.add('dragging'); }, 0);
}

function dragEnd(e) {
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  _dragId = null; _dragType = null; _dragGroupId = null;
}

function dragOver(e, type, id, groupId) {
  if (!_dragId || _dragType !== type) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}

// ── Chip-specific drag (separate state from group/role drag) ──
function chipDragStart(e, skillId, groupId) {
  _chipDragId = skillId; _chipGroupId = groupId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', skillId);
  setTimeout(() => {
    document.querySelector(`.skill-chip[data-skill-id="${skillId}"]`)?.classList.add('dragging');
  }, 0);
}

function chipDragOver(e, targetSkillId) {
  if (!_chipDragId || _chipDragId === targetSkillId) return;
  e.preventDefault();
  document.querySelectorAll('.skill-chip.drag-over').forEach(el => el.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}

function chipDrop(e, targetSkillId, groupId) {
  e.preventDefault();
  document.querySelectorAll('.skill-chip.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.skill-chip.dragging').forEach(el => el.classList.remove('dragging'));
  if (!_chipDragId || _chipDragId === targetSkillId || _chipGroupId !== groupId) return;
  const sg = proj.ce.skillGroups.find(g => g.id === groupId);
  if (!sg) return;
  const from = sg.skills.findIndex(s => s.id === _chipDragId);
  const to = sg.skills.findIndex(s => s.id === targetSkillId);
  if (from < 0 || to < 0) return;
  const [item] = sg.skills.splice(from, 1);
  sg.skills.splice(to, 0, item);
  _chipDragId = null; _chipGroupId = null;
  renderSkillGroups();
  liveUpdate();
}

// Group drag-over/drop on the group container (for skill group reordering)
function groupDragOver(e, groupId) {
  if (!_dragId || _dragType !== 'skillgroup') return;
  e.preventDefault();
}

function groupDrop(e, groupId) {
  if (!_dragId || _dragType !== 'skillgroup') return;
  e.preventDefault();
  dropOn(e, 'skillgroup', groupId, null);
}

function groupDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function dropOn(e, type, targetId, groupId) {
  e.preventDefault();
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (!_dragId || _dragId === targetId) return;
  if (type === 'role') {
    const arr = proj.ce.roles;
    const from = arr.findIndex(r => r.id === _dragId);
    const to = arr.findIndex(r => r.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    renderRoles();
  } else if (type === 'skillgroup') {
    const arr = proj.ce.skillGroups;
    const from = arr.findIndex(g => g.id === _dragId);
    const to = arr.findIndex(g => g.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    renderSkillGroups();
  } else if (type === 'skill' && _dragGroupId === groupId) {
    const sg = proj.ce.skillGroups.find(g => g.id === groupId);
    if (!sg) return;
    const arr = sg.skills;
    const from = arr.findIndex(s => s.id === _dragId);
    const to = arr.findIndex(s => s.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    renderSkillGroups();
  }
  liveUpdate();
}

function renderSkillGroups() {
  const list = document.getElementById('skills-list');
  if (!list || !proj?.ce) return;
  if (!proj.ce.skillGroups.length) {
    list.innerHTML = '<div class="text-xs text-muted" style="padding:12px;">No skill groups yet. Click + Group to add one.</div>';
    return;
  }
  list.innerHTML = proj.ce.skillGroups.map(sg => {
    const chipsHtml = sg.skills.map(sk =>
      `<span class="skill-chip" draggable="true"
        data-skill-id="${sk.id}" data-group-id="${sg.id}"
        ondragstart="event.stopPropagation();chipDragStart(event,'${sk.id}','${sg.id}')"
        ondragend="event.stopPropagation();dragEnd(event)"
        ondragover="event.stopPropagation();event.preventDefault();chipDragOver(event,'${sk.id}')"
        ondrop="event.stopPropagation();chipDrop(event,'${sk.id}','${sg.id}')"
      ><span style="cursor:grab;color:var(--dim);margin-right:2px;font-size:10px;" ondragstart="event.stopPropagation()">⠿</span>${esc(sk.text)}<button class="skill-chip-del" onclick="removeSkill('${sg.id}','${sk.id}')" title="Remove">×</button></span>`
    ).join('');
    return `<div class="skill-group"
      ondragover="groupDragOver(event,'${sg.id}')"
      ondrop="groupDrop(event,'${sg.id}')"
      ondragleave="groupDragLeave(event)">
      <div class="skill-group-head">
        <span class="drag-handle" title="Drag to reorder group" draggable="true"
          ondragstart="dragStart(event,'skillgroup','${sg.id}')"
          ondragend="dragEnd(event)">⠿</span>
        <input class="skill-group-label" type="text" value="${esc(sg.label)}" 
          oninput="updateSkillGroupLabel('${sg.id}',this.value)" 
          style="font-size:11px;font-weight:600;color:var(--ink2);">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="removeSkillGroup('${sg.id}')" style="color:var(--red);" title="Remove group">×</button>
      </div>
      <div class="skill-chips" id="chips-${sg.id}">
        ${chipsHtml}
        <input class="skill-chip-input" type="text" 
          onkeydown="handleSkillKey(event,'${sg.id}',this)"
          onpaste="handleSkillPaste(event,'${sg.id}',this)"
          onblur="if(this.value.trim()){addSkillsBulk('${sg.id}',this.value);this.value='';}">
      </div>
    </div>`;
  }).join('');
}

// ── LIVE PREVIEW UPDATE ────────────────────────────────────
let _liveTimer = null;
function liveUpdate() {
  collectCE();
  autoSave();
  clearTimeout(_liveTimer);
  _liveTimer = setTimeout(renderLivePreview, 80);
}

// Note: maybeTrimSkillsInCE is no longer called from liveUpdate. Skill capping happens only during
// Optimize / Apply Selected via capSkillsTo30 in the apply pipeline. Users can add as many skills
// as they want in the Content Editor without triggering an automatic trim.
let _skillCapTimer = null;
let _skillCapInFlight = false;
async function maybeTrimSkillsInCE() {
  if (_skillCapInFlight) return; // prevent overlapping calls
  if (!proj?.ce?.skillGroups?.length) return;
  const totalSkills = proj.ce.skillGroups.reduce((sum, sg) => sum + (sg.skills?.length || 0), 0);
  if (totalSkills <= 30) return;
  const jdText = (proj?.jdText || g('jd-text') || '').trim();
  const jdTitle = (proj?.jdTitle || g('jd-title') || '').trim();
  if (!jdText && !jdTitle) {
    console.log('[CE skill cap] Over 30 skills but no JD — skipping trim');
    return;
  }
  console.log('[CE skill cap] Trimming', totalSkills, 'skills to 24 against JD');
  _skillCapInFlight = true;
  try {
    // Build the current skill structure as a compact JSON payload for the AI.
    const groups = proj.ce.skillGroups.map(sg => ({
      label: sg.label || '',
      skills: (sg.skills || []).map(s => s.text)
    }));
    const prompt = `Return ONLY valid JSON. From the structured skill groups below, keep AT MOST 30 total skills, prioritized for the target job and rebalanced across groups based on what the role actually values.

JOB TITLE: ${jdTitle || '(unspecified)'}
JOB DESCRIPTION:
${jdText.slice(0, 4000)}

STEP 1 — DETERMINE THE ROLE'S CHARACTER. Read the JD and classify what kind of role this is:
- Design leadership / UX leadership: weight Leadership + Design groups heavier than Engineering or back-office Product Ops.
- Hands-on IC design: Design > Leadership.
- Product management: Product > Design.
- Engineering: Engineering > Product/Design.
- Hybrid: weight skills that span both, plus the channel-specific skills the JD names.

STEP 2 — REBALANCE PROPORTIONALLY. Do not split the 24-skill budget equally across groups. Allocate more slots to the groups that match the role's character. Example for a design leadership role: ~8 Leadership + ~9 Design + ~5 Product + ~2 Engineering. Pick proportions that fit THIS specific JD.

STEP 3 — WITHIN EACH GROUP, keep skills the JD explicitly names first, then strong adjacent skills, then drop the rest.

OTHER RULES:
- Total cap is 30 skills across ALL groups combined.
- Drop the LEAST role-fit skills entirely — never rename, abbreviate, merge, or invent.
- KEEP EVERY ORIGINAL GROUP. Even groups less central to the role (e.g. Engineering on a design leadership role) should keep 1–3 skills. Do NOT omit a group just because it's a small fit. Empty groups are NOT acceptable.
- Within each remaining group, list the most JD-relevant skills first.
- Only return existing skills; do not add new ones.
- Going under 30 is fine if the JD genuinely doesn't justify 30. Never go above 30.

CURRENT SKILL GROUPS:
${JSON.stringify(groups)}

Return ONLY this JSON shape: [{"label":"...","skills":["...","..."]},...]`;
    const raw = await claudeFetch(prompt, 1500);
    const cleaned = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
    const trimmed = JSON.parse(cleaned);
    if (!Array.isArray(trimmed)) throw new Error('non-array response');
    // Validate: every returned skill must exist in the original to prevent fabrication.
    const allOriginalSkills = new Set();
    proj.ce.skillGroups.forEach(sg => (sg.skills || []).forEach(s => allOriginalSkills.add(s.text.toLowerCase())));
    let newTotal = 0;
    // Build safeGroups in the ORIGINAL group order (don't let AI reorder groups). For each original
    // group, find the AI's matching group (if any) and keep verified skills. If AI dropped the
    // group entirely, we'll restore at least one skill below.
    const safeGroups = proj.ce.skillGroups.map(origGroup => {
      const aiGroup = trimmed.find(g => (g.label || '') === (origGroup.label || ''));
      let verifiedSkills = [];
      if (aiGroup) {
        verifiedSkills = (aiGroup.skills || [])
          .filter(skText => allOriginalSkills.has(String(skText).toLowerCase()))
          .map(skText => origGroup.skills.find(s => s.text.toLowerCase() === String(skText).toLowerCase()))
          .filter(Boolean);
      }
      // SAFETY: never drop a group entirely. If the AI returned 0 verified skills for this group
      // (or no group at all), restore the first skill from the user's original list so the group
      // structure stays intact. The user explicitly wants their group structure preserved.
      if (!verifiedSkills.length && origGroup.skills?.length) {
        verifiedSkills = [origGroup.skills[0]];
      }
      return { id: origGroup.id, label: origGroup.label, skills: verifiedSkills };
    }).filter(g => g.skills.length); // only fully-empty original groups get dropped (rare)
    safeGroups.forEach(g => { newTotal += g.skills.length; });
    // If the safety net pushed us slightly over 24, trim from the largest groups.
    while (newTotal > 30) {
      const largest = safeGroups.reduce((a, b) => a.skills.length > b.skills.length ? a : b);
      largest.skills.pop();
      newTotal--;
    }
    if (newTotal === 0) {
      console.warn('[CE skill cap] AI response invalid (total = 0), keeping original');
      return;
    }
    proj.ce.skillGroups = safeGroups;
    console.log('[CE skill cap] Trimmed to', newTotal, 'skills across', safeGroups.length, 'groups');
    renderSkillGroups();
    autoSave();
    renderLivePreview();
    toast('Skills trimmed to ' + newTotal + ' for relevance');
  } catch (e) {
    console.warn('[CE skill cap] Trim failed:', e);
  } finally {
    _skillCapInFlight = false;
  }
}

function renderLivePreview() {
  if (!proj?.ce) return;
  const text = buildResumeTextFromCE(proj.ce);
  // Store as latest draft
  if (!proj.drafts) proj.drafts = [];
  if (proj.drafts.length === 0) proj.drafts.push(text);
  else proj.drafts[proj.drafts.length - 1] = text;
  // Update right panel — always show formatted preview
  const bodyEl = document.getElementById('resume-panel-body');
  const previewEl = document.getElementById('fmt-live-preview');
  const wrapper = document.getElementById('fmt-preview-pages-wrapper');
  if (wrapper && previewEl) {
    if (bodyEl) bodyEl.style.display = 'none';
    const footEl = document.getElementById('resume-foot');
    if (footEl) footEl.style.display = 'none';
    previewEl.classList.add('show');
    // Empty CE → render a single placeholder page so the preview isn't blank.
    if (!text || !text.trim()) {
      wrapper.innerHTML = '';
      const slot = document.createElement('div');
      slot.className = 'fmt-preview-page-slot';
      const pageEl = document.createElement('div');
      pageEl.className = 'fmt-preview-page';
      pageEl.id = 'fmt-preview-page';
      pageEl.style.fontFamily = _fmt.bodyFont + ',Arial,sans-serif';
      pageEl.style.fontSize = _fmt.size;
      pageEl.style.padding = `calc(${_fmt.margin} / 4) ${_fmt.margin} ${_fmt.margin} ${_fmt.margin}`;
      pageEl.style.lineHeight = _fmt.template === 'compact' ? '1.3' : '1.35';
      pageEl.style.background = _fmt.bgColor || '#ffffff';
      pageEl.style.color = _fmt.textColor || '#111111';
      pageEl.innerHTML = '<div style="padding:2rem;text-align:center;color:#aaa;font-size:13px;">Start filling in your details to see the preview.</div>';
      slot.appendChild(pageEl);
      wrapper.appendChild(slot);
      scalePreviewPages();
    } else {
      const sections = fmtParseText(text);
      const html = fmtRenderSections(sections);
      applyPreviewToPages(html);
    }
  }
  // Update version badge
  const badge = document.getElementById('editor-version-badge');
  if (badge) { badge.textContent = 'v'+(proj.drafts?.length||1); badge.style.display='inline-flex'; }
}

function buildResumeTextFromCE(ce) {
  if (!ce) return '';
  const c = ce.contact || {};
  const name = [c.fname, c.lname].filter(Boolean).join(' ');
  if (!name && !ce.summary && !ce.roles?.length) return '';
  const lines = [];
  // Header — name only. Job title is injected by the renderer directly from
  // proj.ce.contact.title so it never goes through fmtParseText, which would
  // misclassify an all-caps title like "DES" or "DESIGN" as a section heading.
  if (name) lines.push(name);
  const loc = [c.city, c.state].filter(Boolean).join(', ');
  // Build contact lines from per-field line assignments
  const fieldMap = { email: c.email, phone: c.phone, linkedin: c.linkedin, portfolio: c.portfolio, location: loc };
  const rawOrder = ce.contactOrder || [{key:'portfolio',line:1},{key:'email',line:1},{key:'linkedin',line:1},{key:'phone',line:2},{key:'location',line:2}];
  const order = (typeof rawOrder[0] === 'string')
    ? rawOrder.map((k,i) => ({key:k, line: i<3?1:2}))
    : rawOrder;
  // Ensure location is in order if missing
  if (!order.find(o => o.key === 'location')) order.push({key:'location', line:2});
  // Group by line number, preserving order within each line
  const lineGroups = {1:[], 2:[], 3:[], 4:[], 5:[]};
  order.forEach(({key, line}) => {
    const val = fieldMap[key];
    if (val) lineGroups[line > 0 && line <= 5 ? line : 1].push(val);
  });
  if (lineGroups[1].length) lines.push(lineGroups[1].join(' | '));
  if (lineGroups[2].length) lines.push(lineGroups[2].join(' | '));
  if (lineGroups[3].length) lines.push(lineGroups[3].join(' | '));
  if (lineGroups[4].length) lines.push(lineGroups[4].join(' | '));
  if (lineGroups[5].length) lines.push(lineGroups[5].join(' | '));
  lines.push('');
  // Summary
  if (ce.summary) {
    lines.push('SUMMARY');
    lines.push(ce.summary);
    lines.push('');
  }
  // Skills
  if (ce.skillGroups?.length) {
    lines.push('SKILLS');
    ce.skillGroups.forEach(sg => {
      if (sg.skills.length) {
        const txt = sg.skills.map(s => s.text).join(', ');
        const lbl = (sg.label || '').trim();
        lines.push(lbl ? lbl + ': ' + txt : txt);
      }
    });
    lines.push('');
  }
  // Experience
  if (ce.roles?.length) {
    lines.push('EXPERIENCE');
    ce.roles.forEach(r => {
      const dates = [r.startDate, r.endDate].filter(Boolean).join(' – ');
      // Canonical "Title · Company · Dates · Location" form. The renderer parses on " · "
      // separators and identifies the date chunk by regex. Avoids the prior wide-gap form
      // (4 spaces between Company and Dates), which got collapsed to a single space when
      // the resume text passed through contentEditable.innerText, breaking the parser.
      const parts = [r.title, r.company, dates, r.location].filter(Boolean);
      if (parts.length) lines.push(parts.join(' · '));
      if (r.context?.trim()) lines.push(r.context.trim());
      r.bullets?.forEach(b => { if (b.text.trim()) lines.push('• ' + b.text.trim()); });
      lines.push('');
    });
  }
  // Education
  if (ce.edu?.length) {
    lines.push('EDUCATION');
    ce.edu.forEach(e => {
      // Line 1: "Degree in Field · Year" (degree+field combine via "in" if both present)
      const credential = e.degree && e.field
        ? `${e.degree} in ${e.field}`
        : (e.degree || e.field || '');
      const line1Parts = [credential, e.year].filter(Boolean);
      if (line1Parts.length) lines.push(line1Parts.join(' · '));
      // Line 2: "School, Location"
      const line2Parts = [e.school, e.location].filter(Boolean);
      if (line2Parts.length) lines.push(line2Parts.join(', '));
      if (e.notes) lines.push(e.notes);
    });
    lines.push('');
  }
  // Certifications
  if (ce.certs?.length) {
    lines.push('CERTIFICATIONS');
    ce.certs.forEach(c => {
      const parts = [c.title, c.org, c.year].filter(Boolean);
      if (parts.length) lines.push(parts.join(' · '));
      if (c.notes) lines.push(c.notes);
    });
    lines.push('');
  }
  // Awards
  if (ce.awards?.length) {
    lines.push('AWARDS');
    ce.awards.forEach(a => {
      const parts = [a.title, a.org, a.year].filter(Boolean);
      if (parts.length) lines.push(parts.join(' · '));
      if (a.desc) lines.push(a.desc);
    });
  }
  return lines.join('\n').trim();
}

// ── PARSE UPLOADED RESUME INTO CE STRUCTURE ───────────────
async function parseToCE(text, suppressTabSwitch) {
  const msg = document.getElementById('upload-msg');
  if (!proj.ce) proj.ce = ceDefaultData();

  try {
    // ── Pass 1: Contact, summary, education, awards, certifications ──────────
    // We send the start of the resume (for contact/summary) plus the end (where education,
    // awards, and certifications usually live). If the resume is short, we just send the whole thing.
    msg.textContent = 'Extracting contact, education, awards, certifications...';
    const head = text.slice(0, 2500);
    const tail = text.length > 5000 ? '\n\n[...]\n\n' + text.slice(-3500) : (text.length > 2500 ? text.slice(2500) : '');
    const pass1Source = head + tail;
    const raw1 = await claudeFetch(`From this resume extract ONLY the contact info, summary, education, awards, and certifications. Return ONLY valid JSON:
{"contact":{"fname":"","lname":"","title":"","email":"","phone":"","linkedin":"","portfolio":"","city":"","state":""},"summary":"full summary paragraph","edu":[{"degree":"","field":"","school":"","year":"","notes":""}],"awards":[{"title":"","org":"","year":"","notes":""}],"certs":[{"title":"","org":"","year":"","notes":""}]}

ABSOLUTE RULE — VERBATIM TEXT:
Every string you place into a field must be a CHARACTER-FOR-CHARACTER COPY of the matching text in the source resume. Do NOT abbreviate, expand, paraphrase, normalize, "clean up", capitalize differently, or fix typos. If the source says "Bachelor of Fine Arts", you write "Bachelor of Fine Arts". If the source says "BFA", you write "BFA". Never the other way. This rule applies to EVERY field: degree, field of study, school, award title, organization, summary text, contact name, job title, everything.

EXTRACTION RULES:
- "edu": ONLY degrees and academic programs (Bachelor's, Master's, MBA, PhD, B.A., M.A., etc.). "degree" = the credential name only, copied verbatim. "field" = the field of study only, copied verbatim. Splitting examples (the SUBSTRINGS must remain verbatim):
  • Source "Bachelor of Fine Arts, Communication Design" → degree="Bachelor of Fine Arts", field="Communication Design"
  • Source "Bachelor of Fine Arts in Communication Design" → degree="Bachelor of Fine Arts", field="Communication Design"
  • Source "BFA, Communication Design" → degree="BFA", field="Communication Design"
  • Source "MBA" alone → degree="MBA", field=""
- "certs": professional certifications, licenses, security clearances, and credentials that are NOT academic degrees. Copy verbatim. Examples that go in "certs", NOT "edu":
  • "Federal Fund Certifier · USDOT · 2024" → title="Federal Fund Certifier", org="USDOT", year="2024"
  • "Security Clearance: Public Trust (Active): USDOT" → title="Public Trust", org="USDOT", notes="Active"
  • "Certified Scrum Master (CSM)" → title="Certified Scrum Master (CSM)"
  • "PMP" → title="PMP"
  Do NOT put certifications in the "edu" array. Do NOT put degrees in the "certs" array.
- "awards": every award, honor, recognition, scholarship, or notable named achievement. Copy verbatim. If no awards section exists, return an empty array.
- "summary": copy the entire summary paragraph verbatim. Do not condense, rewrite, or paraphrase.
- Return all entries you find. Do not skip any.

RESUME:
${pass1Source}`, 2500);

    try {
      const p1 = parseJson(raw1);
      if (p1.contact) proj.ce.contact = p1.contact;
      if (p1.summary) proj.ce.summary = p1.summary;
      if (p1.edu?.length) {
        proj.ce.edu = p1.edu.map(e => ({
          id:'e'+Date.now()+Math.random(),
          degree:e.degree||'', field:e.field||'', school:e.school||'', year:e.year||'', notes:e.notes||''
        }));
      }
      if (p1.awards?.length) {
        proj.ce.awards = p1.awards.map(a => ({
          id:'a'+Date.now()+Math.random(),
          title:a.title||'', org:a.org||'', year:a.year||'', notes:a.notes||''
        }));
      }
      if (p1.certs?.length) {
        proj.ce.certs = p1.certs.map(c => ({
          id:'cr'+Date.now()+Math.random(),
          title:c.title||'', org:c.org||'', year:c.year||'', notes:c.notes||''
        }));
      }
    } catch(e) { console.warn('Pass 1 parse error:', e); }

    // ── Pass 2: All roles in one call ────────────────────
    // Single pass avoids coordination bugs from the previous "first 5" / "skip first 5" split,
    // where roles between the boundary could go missing if Pass 2a stopped short.
    msg.textContent = 'Extracting work experience...';
    const pass2Prompt = `Extract EVERY work experience entry from this resume. Do not stop early. Do not skip any role. The first role in the list is the most recent; include it and continue through the oldest. For each role, capture the intro/context sentence that appears between the job header and the first bullet point (many roles have a 1–2 sentence paragraph before the bullets — copy it exactly into "context"). Return ONLY a JSON array, nothing else:
[{"company":"","title":"","startDate":"","endDate":"","location":"","context":"exact intro sentence(s) if present, empty string if not","bullets":["exact bullet text"]}]

CRITICAL FIELD RULES:
- "title" is the JOB TITLE only (e.g. "Lead Product Designer", "Senior Manager"). Never include the company name.
- "company" is the EMPLOYER NAME only (e.g. "Yodle", "Web.com", "Verizon"). Never include the job title, never include "·" or "—" or ":" separators, never include dates, never include location.
- If the source line shows a merged header like "Lead Product Designer · Yodle (Acquired by Web.com)", split it: title goes in title, company goes in company. NEVER copy the whole header verbatim into one field.
- "location" is the city/state only. Never include dates or company.

EXTRACTION RULES:
- Copy bullet text and context verbatim — character-for-character. Do not paraphrase, abbreviate, or "clean up".
- Include every bullet under each role.
- If a role has no bullets, still include it with an empty bullets array.
- Process the entire resume from top to bottom. Do not stop after the first few roles.
- The output array length must equal the number of work experience entries in the resume. Count them.

RESUME:\n${text}`;
    const rawAllRoles = await claudeFetch(pass2Prompt, 8000);

    // Sanitizes a parsed role object — fixes common AI extraction errors like dumping a whole
    // header line into a single field. Mutates and returns the role.
    function sanitizeRole(r) {
      const co = (r.company || '').trim();
      const ti = (r.title || '').trim();

      // Case A: company contains the title + " · " separator → strip title from company
      if (co && ti && co.includes(' · ' + ti)) {
        r.company = co.replace(' · ' + ti, '').trim();
      } else if (co && ti && co.startsWith(ti + ' · ')) {
        r.company = co.slice((ti + ' · ').length).trim();
      } else if (co && ti && co.includes(' · ') && co.toLowerCase().startsWith(ti.toLowerCase())) {
        // Case B: company starts with title (case-insensitive) followed by separator
        const sepIdx = co.indexOf(' · ');
        const before = co.slice(0, sepIdx).trim();
        if (before.toLowerCase() === ti.toLowerCase()) {
          r.company = co.slice(sepIdx + 3).trim();
        }
      }

      // Case C: company is "X · X" (doubled) → keep one copy
      const doubled = (r.company || '').match(/^(.{3,}?)\s+·\s+\1\s*$/i);
      if (doubled) r.company = doubled[1].trim();

      // Case D: title doubled the same way
      const tDoubled = (r.title || '').match(/^(.{3,}?)\s+·\s+\1\s*$/i);
      if (tDoubled) r.title = tDoubled[1].trim();

      // Case E: title contains " · " — only strip if what follows looks like a leaked company
      if ((r.title || '').includes(' · ')) {
        const parts = r.title.split(' · ');
        const after = parts.slice(1).join(' · ').trim();
        const looksLikeCompany = /\([^)]*\)|\.com|\.io|\.co\b|\bInc\b|\bLLC\b|\bLtd\b|^[A-Z][a-z]+\s+(?:Inc|LLC|Group)/i.test(after);
        if (looksLikeCompany) {
          r.title = parts[0].trim();
        }
      }

      // Case F: company contains date-range pattern → strip it
      r.company = (r.company || '').replace(/\s*[·\-—]\s*\d{1,2}\/\d{2,4}.*$/, '').trim();

      return r;
    }

    try {
      function parseRoles(raw) {
        const cleaned = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
        const arr = JSON.parse(cleaned);
        return Array.isArray(arr) ? arr : [];
      }
      const allRoles = parseRoles(rawAllRoles).map(sanitizeRole);
      console.log('[parseToCE] Extracted', allRoles.length, 'roles from resume');
      // Deduplicate by company+title+startDate (start date disambiguates two roles at same company with same title)
      const seen = new Set();
      const deduped = allRoles.filter(r => {
        const key = (r.company||'').trim().toLowerCase()+'|'+(r.title||'').trim().toLowerCase()+'|'+(r.startDate||'').trim();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      if (deduped.length) {
        proj.ce.roles = deduped.map(r => ({
          id:'r'+Date.now()+Math.random(),
          company:r.company||'', title:r.title||'',
          startDate:r.startDate||'', endDate:r.endDate||'',
          location:r.location||'',
          context: typeof r.context === 'string' ? r.context : '',
          bullets:(r.bullets||[]).map(b=>({id:'b'+Date.now()+Math.random(),text:String(b)})),
          _expanded:false
        }));
      }
    } catch(e) { console.warn('Pass 2 parse error:', e); }

    // ── Pass 3: Skills ────────────────────────────────────
    msg.textContent = 'Extracting skills...';
    // Send head + tail (same approach as Pass 1) so skills sections at the bottom of long resumes
    // aren't truncated. Andrea's "Skills & Technology" section appears on page 2 past 3000 chars.
    const skillsHead = text.slice(0, 2500);
    const skillsTail = text.length > 5000 ? '\n\n[...]\n\n' + text.slice(-3500) : (text.length > 2500 ? text.slice(2500) : '');
    const skillsSource = skillsHead + skillsTail;
    const raw3 = await claudeFetch(`From this resume extract skills that are EXPLICITLY stated. Do NOT invent, infer, or add skills not present. Return ONLY valid JSON array. If no skills section exists, return [].
[{"label":"Group label or empty string","skills":["exactly as written"]}]

GROUPING RULES:
- If the resume has SUB-LABELED groups under a compound section name (e.g. section "Skills & Technology" with sub-labels "Software:" and "Core Competencies:"), output ONE GROUP PER SUB-LABEL using the sub-label as "label". Example:
    Source:
      Skills & Technology
      Software: Microsoft Office, Salesforce CRM, Claude
      Core Competencies: Operations Management, Executive Support, Vendor Management
    Output:
      [{"label":"Software","skills":["Microsoft Office","Salesforce CRM","Claude"]},
       {"label":"Core Competencies","skills":["Operations Management","Executive Support","Vendor Management"]}]
- If the section has NO sub-labels and is just a flat list (e.g. section "SKILLS" followed by a single comma-separated list), output ONE GROUP with label "" (empty string).
- If there are multiple labeled groups (e.g. "Leadership:", "Design:", "Product:"), output ONE GROUP PER LABEL.
- Strip the trailing colon from labels ("Software:" → "Software"). Strip the section name itself if it appears as a label ("SKILLS:" → empty). Otherwise copy labels verbatim.
- Skills values are copied verbatim from the source — no reformatting.

RESUME:
${skillsSource}`, 2000);

    try {
      const sgs = JSON.parse(
        raw3.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim()
      );
      if (Array.isArray(sgs) && sgs.length) {
        // If a label is the parent section name itself ("SKILLS", "COMPETENCIES"), drop it so the
        // renderer doesn't print "SKILLS:" under the SKILLS heading. Real sub-labels like "Software"
        // and "Core Competencies" are preserved.
        const sectionNamePattern = /^(skills?|competenc(?:y|ies)|technical skills?|core skills?|expertise|capabilities|skills?\s*(?:&|and)\s*technolog(?:y|ies)?)$/i;
        const sanitized = sgs.map(sg => ({
          ...sg,
          label: sectionNamePattern.test((sg.label || '').trim()) ? '' : (sg.label || '')
        }));
        proj.ce.skillGroups = sanitized.map(sg => ({
          id:'sg'+Date.now()+Math.random(),
          label:sg.label||'',
          skills:(sg.skills||[]).map(sk=>({id:'sk'+Date.now()+Math.random(),text:String(sk)}))
        }));
        console.log('[parseToCE] Extracted', proj.ce.skillGroups.length, 'skill group(s):',
          proj.ce.skillGroups.map(g => `${g.label||'(unlabeled)'} (${g.skills.length})`).join(', '));
      }
    } catch(e) { console.warn('Pass 3 parse error:', e); }

    // ── Done ──────────────────────────────────────────────
    fillCE(proj.ce);
    document.getElementById('upload-loading').classList.remove('show');
    document.getElementById('upload-strip').style.display='none';
    // Expand experience and contact sections
    document.getElementById('ce-contact')?.classList.add('open');
    document.getElementById('ce-experience')?.classList.add('open');
    // Expand education, certifications, and awards sections if we found any
    if (proj.ce.edu?.length) document.getElementById('ce-education')?.classList.add('open');
    if (proj.ce.certs?.length) document.getElementById('ce-certs')?.classList.add('open');
    if (proj.ce.awards?.length) document.getElementById('ce-awards')?.classList.add('open');
    autoSave();
    renderLivePreview();
    toast(`Imported ${proj.ce.roles?.length||0} roles · ${proj.ce.skillGroups?.reduce((a,sg)=>a+sg.skills.length,0)||0} skills`);
    if (!suppressTabSwitch) switchTab('content');

  } catch(e) {
    document.getElementById('upload-loading').classList.remove('show');
    console.error('parseToCE error:', e);
    toast('Import error: ' + e.message);
  }
}

// Override processFile to use new CE parser
async function processFile(file, suppressTabSwitch) {
  const ext = file.name.split('.').pop().toLowerCase();
  const loading = document.getElementById('upload-loading');
  const msg = document.getElementById('upload-msg');
  loading.classList.add('show'); msg.textContent = 'Reading file...';
  try {
    let text = '';
    if (ext === 'txt' || ext === 'rtf') {
      text = await file.text();
    } else if (ext === 'docx') {
      // DOCX: use mammoth.js (Claude API's document type only supports PDF, not DOCX).
      // Lazy-load mammoth on first DOCX upload and extract text entirely client-side.
      msg.textContent = 'Extracting text from Word doc...';
      if (!window.mammoth) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Could not load mammoth.js library'));
          document.head.appendChild(script);
        });
      }
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      text = (result?.value || '').trim();
      if (!text) throw new Error('Word doc appears empty — no text extracted by parser');
    } else {
      // PDF and legacy DOC: use Claude API (which DOES support PDF)
      msg.textContent = 'Parsing with AI...';
      const base64 = await fileToBase64(file);
      const mt = ext === 'pdf' ? 'application/pdf' : 'application/msword';
      const key = getKey();
      if (!key) throw new Error('API key not configured');
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body: JSON.stringify({model:'claude-opus-4-5',max_tokens:4000,messages:[{role:'user',content:[{type:'document',source:{type:'base64',media_type:mt,data:base64}},{type:'text',text:'Extract all text from this resume. Return only plain text. Preserve line structure, section headers, bullet points, and all content. No commentary.'}]}]})
      });
      const d = await resp.json(); text = d.content?.map(b=>b.text||'').join('')||'';
    }
    if (!text.trim()) throw new Error('No text extracted');
    proj.parsedText = text;
    
    // Populate proj.drafts so getResumeText() returns the resume immediately and the
    // live preview shows content while parseToCE runs in background.
    if (!proj.drafts || proj.drafts.length === 0) {
      proj.drafts = [text];
    }
    
    await parseToCE(text, suppressTabSwitch);
  } catch(e) { loading.classList.remove('show'); toast('Error: ' + e.message); }
}

// ── OVERRIDE collectWorkspace TO USE CE DATA ───────────────
function collectWorkspace() {
  collectCE();
  const ce = proj?.ce || ceDefaultData();
  const c = ce.contact || {};
  const name = [c.fname, c.lname].filter(Boolean).join(' ');
  const loc = [c.city, c.state].filter(Boolean).join(', ');
  const contact = [c.email, c.phone, c.linkedin, c.portfolio].filter(Boolean).join(' · ');
  const firstRole = ce.roles?.[0] || {};
  const prevRoles = (ce.roles||[]).slice(1).map(r => {
    const dates = [r.startDate, r.endDate].filter(Boolean).join(' – ');
    const bullets = r.bullets?.map(b=>'- '+b.text).join('\n') || '';
    return `${r.title} · ${r.company} · ${dates} · ${r.location}\n${bullets}`;
  }).join('\n\n');
  const skillsText = (ce.skillGroups||[]).map(sg => sg.label+': '+(sg.skills||[]).map(s=>s.text).join(', ')).join('\n');
  const eduText = (ce.edu||[]).map(e=>[e.degree,e.school,e.year].filter(Boolean).join(' · ')).join('\n');
  return {
    name, title: c.title, contact, location: loc,
    'tgt-title': g('jd-title') || proj?.jdTitle || '',
    'tgt-company': g('jd-company') || proj?.jdCompany || '',
    'tgt-level': 'senior', years: '',
    hard: skillsText, soft: '', tools: '', certs: '',
    achievements: ce.summary || '',
    uvp: '', 'sum-type': 'executive',
    'r1-title': firstRole.title||'', 'r1-company': firstRole.company||'',
    'r1-dates': [firstRole.startDate, firstRole.endDate].filter(Boolean).join(' – '),
    'r1-loc': firstRole.location||'',
    'r1-duties': firstRole.bullets?.map(b=>b.text).join('. ')||'',
    'r1-results': '',
    prev: prevRoles,
    team:'', exec:'', xfn:'', scope:'',
    'm-biz':'','m-ops':'','m-prod':'','m-scale':'',
    edu: eduText, training:'', awards:'',
    gap:'', thread: ce.thread||'', ban: ce.ban||'spearheaded, leveraged, utilized',
    keep:'', extra:'', braindump: g('ws-braindump')||'', fit:''
  };
}

// ── OVERRIDE fillWorkspace TO USE CE ─────────────────────
function fillWorkspace(ws) {
  // Legacy — now we use CE structure
  if (proj?.ce) fillCE(proj.ce);
}

// ── OVERRIDE fillDefaultWorkspace ────────────────────────
function fillDefaultWorkspace() {
  if (!proj) return;
  proj.ce = ceDefaultData();
  // Default skill groups
  proj.ce.skillGroups = [
    { id:'sg1', label:'Leadership', skills:[] },
    { id:'sg2', label:'Strategy', skills:[] },
    { id:'sg3', label:'Practice', skills:[] },
    { id:'sg4', label:'Tools', skills:[] },
  ];
  fillCE(proj.ce);
}

// ── ALWAYS SHOW FORMATTED PREVIEW ON RIGHT ────────────────
// Override showFmtPreviewPanel to keep preview visible
const _origShowFmtPreviewPanel = typeof showFmtPreviewPanel === 'function' ? showFmtPreviewPanel : null;

// ── INIT CE ON PROJECT LOAD ───────────────────────────────
function initCEForProject() {
  if (!proj) return;
  try {
    if (proj.ce && (proj.ce.roles?.length || proj.ce.contact?.fname || proj.ce.summary)) {
      // Has valid CE data — use it directly
      fillCE(proj.ce);
    } else if (proj.ws && (proj.ws.name || proj.ws['r1-title'] || proj.ws.hard)) {
      // Old ws-format project — migrate
      migrateWsToCE(proj.ws);
    } else if (proj.parsedText) {
      // Has raw parsed text but no structured data — parse into CE
      proj.ce = ceDefaultData();
      fillCE(proj.ce);
      // Kick off background parse
      setTimeout(() => parseToCE(proj.parsedText), 100);
    } else if (proj.drafts?.length) {
      // Has resume drafts but no structured data — show draft, set up blank CE
      proj.ce = proj.ce || ceDefaultData();
      fillCE(proj.ce);
    } else {
      // Genuinely empty project
      fillDefaultWorkspace();
    }
  } catch(e) {
    console.error('initCEForProject error:', e);
    proj.ce = proj.ce || ceDefaultData();
    fillCE(proj.ce);
  }
  renderLivePreview();
}

function migrateWsToCE(ws) {
  if (!proj) return;
  const nameParts = (ws.name||'').split(' ');
  proj.ce = {
    contact: {
      fname: nameParts[0]||'', lname: nameParts.slice(1).join(' ')||'',
      title: ws.title||'', email:'', phone:'', linkedin:'', portfolio:'',
      city: (ws.location||'').split(',')[0]?.trim()||'',
      state: (ws.location||'').split(',').slice(1).join(',').trim()||''
    },
    summary: ws.achievements||'',
    roles: [],
    edu: ws.edu ? [{ id:'e1', degree: ws.edu, school:'', year:'', notes: ws.training||'' }] : [],
    skillGroups: [
      { id:'sg1', label:'Leadership', skills: (ws.soft||'').split(/[·,]/).map(s=>({id:'sk'+Math.random(),text:s.trim()})).filter(s=>s.text) },
      { id:'sg2', label:'Strategy', skills:[] },
      { id:'sg3', label:'Practice', skills: (ws.hard||'').split(/[·,]/).map(s=>({id:'sk'+Math.random(),text:s.trim()})).filter(s=>s.text) },
      { id:'sg4', label:'Tools', skills: (ws.tools||'').split(/[·,]/).map(s=>({id:'sk'+Math.random(),text:s.trim()})).filter(s=>s.text) },
    ],
    ban: ws.ban||'', thread: ws.thread||''
  };
  // Add first role
  if (ws['r1-company'] || ws['r1-title']) {
    const dates = (ws['r1-dates']||'').split(/[-–]/).map(d=>d.trim());
    proj.ce.roles.push({
      id:'r1', company: ws['r1-company']||'', title: ws['r1-title']||'',
      startDate: dates[0]||'', endDate: dates[1]||'',
      location: ws['r1-loc']||'',
      bullets: (ws['r1-duties']||'').split(/\.\s+/).filter(Boolean).map(b=>({id:'b'+Math.random(),text:b})),
      _expanded: true
    });
  }
  fillCE(proj.ce);
}

// Also update saveProject to save CE
const _origSaveProject = saveProject;


document.addEventListener('DOMContentLoaded',()=>{
  proj = null;
  const nd = document.getElementById('proj-name-display');
  if (nd) { nd.textContent = ''; nd.classList.add('placeholder'); }
  const editIcon = document.getElementById('proj-edit-icon');
  if (editIcon) editIcon.style.display = 'none';
  renderProjGrid();
  // Show preview panel from the start
  const previewEl = document.getElementById('fmt-live-preview');
  const bodyEl = document.getElementById('resume-panel-body');
  if (previewEl && bodyEl) {
    bodyEl.style.display = 'none';
    previewEl.classList.add('show');
    const page = document.getElementById('fmt-preview-page');
    if (page) page.innerHTML = '<div style="padding:2rem;text-align:center;color:#aaa;font-size:13px;">Create or load a project to see your resume preview.</div>';
  }
  // System fonts loading is disabled — the user can still click "Load system fonts"
  // manually if needed, but the app no longer pulls every font on the user's machine
  // automatically. Only the Google Fonts in GOOGLE_FONTS are loaded.
});

async function autoLoadSystemFonts() {
  const btn = document.getElementById('load-fonts-btn');
  try {
    if (btn) { btn.textContent = 'Loading fonts...'; btn.disabled = true; }
    const fonts = await window.queryLocalFonts();
    const normalFonts = fonts.filter(f => {
      const s = (f.style || '').toLowerCase();
      return !s.includes('italic') && !s.includes('oblique');
    });
    const families = [...new Set(normalFonts.map(f => f.family))].sort();
    const BATCH = 20;
    for (let i = 0; i < normalFonts.length; i += BATCH) {
      const batch = normalFonts.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async fd => {
        try {
          const blob = await fd.blob();
          const url = URL.createObjectURL(blob);
          const face = new FontFace(fd.family, `url(${url})`, { style:'normal', weight: fd.weight||'400' });
          await face.load();
          face.$$url = url;
          document.fonts.add(face);
        } catch(e) {}
      }));
    }
    populateFontDropdowns(families);
    _systemFontsLoaded = true;
    if (btn) { btn.textContent = `✓ ${families.length} fonts`; btn.style.color = 'var(--green)'; btn.disabled = false; }
    document.getElementById('system-font-note')?.remove();
  } catch(e) {
    if (btn) { btn.textContent = 'Load system fonts'; btn.disabled = false; }
    if (e.name !== 'NotAllowedError') populateFontDropdowns(GOOGLE_FONTS);
  }
}

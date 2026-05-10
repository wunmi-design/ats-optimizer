// ─────────────────────────────────────────────────────────
//  PROJECT STORE
// ─────────────────────────────────────────────────────────
const ProjectStore = {
  _key:'ats_projects',
  _cache: null,
  getAll(){
    if (this._cache) return this._cache;
    try {
      const raw = JSON.parse(localStorage.getItem(this._key)||'[]');
      // Sanitize: assign a real id to any project whose id is missing/null/'undefined'/'null'
      // so it can be deleted via the normal flow.
      let mutated = false;
      const fixed = raw.map(p => {
        if (!p || typeof p !== 'object') return null;
        const bad = p.id == null || p.id === 'undefined' || p.id === 'null' || p.id === '';
        if (bad) {
          p.id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          mutated = true;
        }
        return p;
      }).filter(Boolean);
      if (mutated) {
        try { localStorage.setItem(this._key, JSON.stringify(fixed)); } catch(e) {}
      }
      return fixed;
    } catch(e) { return []; }
  },
  save(p, skipTimestamp){
    if (!skipTimestamp) p.updatedAt = Date.now();
    const all = this.getAll().filter(x => x.id !== p.id);
    all.unshift(p);
    const trimmed = all.slice(0, 50);
    this._cache = trimmed;
    try { localStorage.setItem(this._key, JSON.stringify(trimmed)); } catch(e) {}
    // Sync to cloud
    this.saveToCloud(p);
  },
  load(id){ return this.getAll().find(p => p.id === id) || null; },
  delete(id){
    // Robust matching: handle real id, the literal string 'undefined', null, and missing-id projects
    const isMatch = (p) => {
      if (!p) return true; // drop garbage entries
      if (p.id === id) return true;
      // If caller passed 'undefined'/'null' as a string, also catch projects whose id is actually missing
      if ((id === 'undefined' || id === 'null' || id == null) &&
          (p.id == null || p.id === 'undefined' || p.id === 'null' || p.id === '')) return true;
      return false;
    };
    const all = this.getAll().filter(p => !isMatch(p));
    this._cache = all;
    try { localStorage.setItem(this._key, JSON.stringify(all)); } catch(e) {}
    // Track deleted IDs so syncFromCloud doesn't restore them
    try {
      const deleted = JSON.parse(localStorage.getItem('ats_deleted_ids') || '[]');
      if (id && !deleted.includes(id)) deleted.push(id);
      localStorage.setItem('ats_deleted_ids', JSON.stringify(deleted.slice(-100)));
    } catch(e) {}
    if (id) this.deleteFromCloud(id);
  },
  newProject(name){
    return {id:'p_'+Date.now(),name:name||'Untitled',createdAt:Date.now(),updatedAt:Date.now(),jdTitle:'',jdCompany:'',jdText:'',parsedText:'',parsedFields:{},jdAnalysis:null,ws:{},questions:[],drafts:[],scores:[],atsAudit:null,claudeContext:{source:'conversation',text:''}};
  },
  // ─── CLOUD SYNC ────────────────────────────────────
  // Uses existing Supabase table: projects(id, user_id, name, resume_content JSONB, ...)
  // Stores full project object in resume_content JSONB column
  async saveToCloud(p) {
    if (!window._atsUser || !window._atsToken) return;
    try {
      // Use project name + user_id as unique key (table has UNIQUE(user_id, name))
      // First try to find by matching resume_content->id
      const checkRes = await supaFetch('/rest/v1/projects?select=id&user_id=eq.' + window._atsUser.id + '&resume_content->>id=eq.' + encodeURIComponent(p.id));
      const existing = await checkRes.json();

      const row = {
        user_id: window._atsUser.id,
        name: (p.name || 'Untitled').substring(0, 200) + '_' + p.id.slice(-6),
        resume_content: p,
        updated_at: new Date().toISOString()
      };

      if (Array.isArray(existing) && existing.length > 0) {
        await supaFetch('/rest/v1/projects?id=eq.' + existing[0].id, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ resume_content: p, updated_at: new Date().toISOString() })
        });
      } else {
        await supaFetch('/rest/v1/projects', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify(row)
        });
      }
      console.log('Cloud save OK:', p.name);
    } catch(e) { console.error('Cloud save error:', e); }
  },
  async deleteFromCloud(projectId) {
    if (!window._atsUser || !window._atsToken) return;
    try {
      await supaFetch('/rest/v1/projects?user_id=eq.' + window._atsUser.id + '&resume_content->>id=eq.' + encodeURIComponent(projectId), {
        method: 'DELETE'
      });
    } catch(e) { console.error('Cloud delete error:', e); }
  },
  async syncFromCloud() {
    if (!window._atsUser || !window._atsToken) { console.log('syncFromCloud: skipped - no user/token'); return; }
    try {
      console.log('syncFromCloud: fetching projects for user', window._atsUser.id);
      const res = await supaFetch('/rest/v1/projects?user_id=eq.' + window._atsUser.id + '&order=updated_at.desc&limit=50');
      console.log('syncFromCloud: response status', res.status);
      if (!res.ok) {
        const errText = await res.text();
        console.error('Cloud sync failed:', res.status, errText);
        // If 403/401, RLS policies may be missing — still render local projects
        if (res.status === 403 || res.status === 401) {
          console.warn('Cloud sync: RLS policy may be missing. Check Supabase dashboard → projects table → RLS policies.');
        }
        return;
      }
      const rows = await res.json();
      console.log('syncFromCloud: got', rows.length, 'rows from cloud');
      if (Array.isArray(rows) && rows.length > 0) {
        const deletedIds = JSON.parse(localStorage.getItem('ats_deleted_ids') || '[]');
        const cloudProjects = rows.map(r => r.resume_content).filter(p => p && !deletedIds.includes(p.id));
        console.log('syncFromCloud: parsed', cloudProjects.length, 'valid projects');
        // Merge: cloud wins for conflicts
        const local = this.getAll();
        const cloudIds = new Set(cloudProjects.map(p => p.id));
        const merged = [...cloudProjects];
        local.forEach(lp => {
          if (!cloudIds.has(lp.id)) merged.push(lp);
        });
        this._cache = merged;
        try { localStorage.setItem(this._key, JSON.stringify(merged.slice(0, 50))); } catch(e) {}
        console.log('Cloud sync OK:', cloudProjects.length, 'cloud +', (merged.length - cloudProjects.length), 'local-only');
      } else {
        console.log('syncFromCloud: no cloud projects found, keeping local only');
      }
    } catch(e) { console.error('Cloud sync error:', e); }
  }
};


let currentDisplayedResume = ''; // Track what's currently shown to prevent resets
let proj = null;

// ─────────────────────────────────────────────────────────
//  PROJECT GRID
// ─────────────────────────────────────────────────────────
function statusLabel(s) {
  return CONFIG.getStatusLabel(s);
}
function statusCls(s) {
  return CONFIG.getStatusClass(s);
}
function toggleStatusPopup(id, e) {
  e.stopPropagation();
  const popup = document.getElementById('status-' + id);
  const isOpen = popup?.classList.contains('open');
  // Close all popups
  document.querySelectorAll('.status-popup.open').forEach(p => {
    p.classList.remove('open');
    p.classList.remove('left-align');
  });
  if (!isOpen && popup) {
    popup.classList.add('open');
    // Check if popup would go off-screen to the right
    const rect = popup.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 170;
    const buttonRect = e.target.closest('[onclick*="toggleStatusPopup"]')?.getBoundingClientRect() || rect;
    const rightEdge = buttonRect.right + popupWidth;
    if (rightEdge > window.innerWidth - 20) {
      popup.classList.add('left-align');
    }
  }
}
function setProjectStatus(id, status) {
  const p = ProjectStore.load(id);
  if (!p) return;
  p.status = status;
  ProjectStore.save(p);
  // Update button label + class without full re-render
  const btn = document.querySelector(`#status-${id}`).previousElementSibling;
  if (btn) { btn.textContent = statusLabel(status); btn.className = 'status-btn ' + statusCls(status); }
  document.querySelectorAll('.status-popup.open').forEach(p => p.classList.remove('open'));
  // If this is the active project, update it too
  if (proj?.id === id) proj.status = status;
}
// Close status popups on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.status-popup.open').forEach(p => p.classList.remove('open'));
});

function getLogoUrl(company) {
  if (!company) return null;
  // Known company → domain mappings for best results
  const knownDomains = {
    'google': 'google.com', 'meta': 'meta.com', 'apple': 'apple.com',
    'microsoft': 'microsoft.com', 'amazon': 'amazon.com', 'netflix': 'netflix.com',
    'adobe': 'adobe.com', 'figma': 'figma.com', 'salesforce': 'salesforce.com',
    'airbnb': 'airbnb.com', 'uber': 'uber.com', 'lyft': 'lyft.com',
    'stripe': 'stripe.com', 'slack': 'slack.com', 'zoom': 'zoom.us',
    'deloitte': 'deloitte.com', 'accenture': 'accenture.com',
    'ibm': 'ibm.com', 'oracle': 'oracle.com', 'sap': 'sap.com',
    'verizon': 'verizon.com', 'att': 'att.com', 'comcast': 'comcast.com',
    'crowdstrike': 'crowdstrike.com', 'iherb': 'iherb.com',
    'webflow': 'webflow.com', 'notion': 'notion.so', 'asana': 'asana.com',
    'shopify': 'shopify.com', 'twitter': 'twitter.com', 'linkedin': 'linkedin.com',
    '6sense': '6sense.com', 'hubspot': 'hubspot.com', 'zendesk': 'zendesk.com',
    'atlassian': 'atlassian.com', 'dropbox': 'dropbox.com', 'twilio': 'twilio.com',
    'datadog': 'datadoghq.com', 'splunk': 'splunk.com', 'okta': 'okta.com',
    'workday': 'workday.com', 'servicenow': 'servicenow.com',
  };
  const key = company.toLowerCase().replace(/[^a-z0-9]/g,'');
  const domain = knownDomains[key] || (key + '.com');
  // Use Google favicon service — returns real favicon, no generic placeholder
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function renderProjGrid() {
  const grid = document.getElementById('proj-grid');
  const all = ProjectStore.getAll();

  // Upload tile — always shown
  let html = `
  <div class="proj-card new-card" id="upload-zone-projects" onclick="document.getElementById('file-in-projects').click()"
    ondragover="onDragOver(event,'upload-zone-projects')"
    ondrop="onDropProjects(event)"
    ondragleave="document.getElementById('upload-zone-projects').classList.remove('drag')"
    style="min-height:140px;cursor:pointer;">
    <input type="file" id="file-in-projects" accept=".pdf,.doc,.docx,.txt" style="display:none" onchange="onFileSelectProjects(event)">
    <div style="font-size:1.6rem;margin-bottom:6px;">📄</div>
    <div style="font-size:12px;font-weight:600;text-align:center;padding:0 8px;">Upload a resume to start a new project</div>
    <div class="text-xs text-muted mt-1">PDF · Word · Text</div>
  </div>`;

  // New Project tile — only when logged in
  if (window._atsUser) {
    html += `
    <div class="proj-card new-card" onclick="showNewProjectModal()" style="min-height:140px;">
      <div class="proj-card-icon">+</div>
      <div style="font-size:12px;font-weight:600;">New Project</div>
    </div>`;
  }

  // Project tiles — only when logged in
  if (!window._atsUser) { grid.innerHTML = html; return; }

  const sorted = [...all].sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  sorted.forEach(p => {
    const sc = p.scores?.[p.scores.length-1]?.overall || 0;
    const scCls = sc>=80?'high':sc>=60?'mid':sc>0?'low':'';
    const date = p.updatedAt ? (() => {
      const d = new Date(p.updatedAt);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${dateStr} · ${timeStr}`;
    })() : '';
    const logoUrl = getLogoUrl(p.jdCompany);
    const logoHtml = logoUrl
      ? `<img class="proj-logo" src="${logoUrl}" alt=""
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
         <div class="proj-logo-placeholder" style="display:none;">${esc((p.jdCompany||'?')[0].toUpperCase())}</div>`
      : `<div class="proj-logo-placeholder">${esc((p.jdCompany||p.name||'?')[0].toUpperCase())}</div>`;

    const activeCls = (proj && proj.id === p.id) ? ' active' : '';
    html += `<div class="proj-card${activeCls}" onclick="loadProject('${p.id}')" data-company="${esc(p.jdCompany||'')}" style="min-height:140px;display:flex;flex-direction:column;">
      <!-- Top row: logo + score -->
      <div class="flex-between" style="margin-bottom:10px;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:8px;">${logoHtml}</div>
        ${sc>0?`<span class="proj-card-score ${scCls}">${sc}%</span>`:'<span></span>'}
      </div>
      <!-- Middle: name, meta -->
      <div class="proj-card-name" style="font-size:13px;font-weight:700;">${esc(p.name)}</div>
      ${p.jdCompany?`<div class="proj-card-meta" style="margin-top:2px;">${esc(p.jdCompany)}</div>`:''}
      ${p.jdTitle?`<div class="proj-card-meta" style="margin-top:1px;">${esc(p.jdTitle)}</div>`:''}
      ${date?`<div class="proj-card-meta" style="margin-top:1px;">${date}</div>`:''}
      <div style="flex:1;"></div>
      <!-- Bottom row: status left, ellipsis right -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);" onclick="event.stopPropagation()">
        <div class="status-wrap">
          <button class="status-btn ${statusCls(p.status)}" onclick="toggleStatusPopup('${p.id}',event)" aria-label="Set application status">${statusLabel(p.status)}</button>
          ${Templates.statusPopup(p.id, p.status)}
        </div>
        <div class="proj-card-menu">
          <button class="proj-ellipsis" onclick="toggleProjMenu('${p.id}',event)" title="More options" aria-label="Project options">···</button>
          <div class="proj-dropdown" id="menu-${p.id}">
            <button onclick="renameProjectClick('${p.id}','${esc(p.name).replace(/"/g, '&quot;')}')">Rename</button>
            <button onclick="dupProject('${p.id}');closeProjMenus()">Duplicate</button>
            <button class="danger" onclick="deleteProjectClick('${p.id}','${esc(p.name).replace(/"/g, '&quot;')}')">Delete</button>
          </div>
        </div>
      </div>
    </div>`;
  });

  grid.innerHTML = html;

  // Close menus on outside click
  document.addEventListener('click', closeProjMenus, {once:false});
}

function toggleProjMenu(id, e) {
  e.stopPropagation();
  const menu = document.getElementById('menu-'+id);
  const isOpen = menu?.classList.contains('open');
  closeProjMenus();
  if (!isOpen && menu) menu.classList.add('open');
}

function closeProjMenus() {
  document.querySelectorAll('.proj-dropdown.open').forEach(m => m.classList.remove('open'));
}

function renameProjectClick(id, name) {
  closeProjMenus();
  showRenameModal(id, name);
}

function deleteProjectClick(id, name) {
  closeProjMenus();
  confirmDeleteProject(id, name);
}



function confirmDeleteProject(id, name) {
  closeProjMenus();
  const modal = document.getElementById('confirm-modal');
  const msg = document.getElementById('confirm-msg');
  const btn = document.getElementById('confirm-ok-btn');
  if (!modal || !msg || !btn) { console.error('Delete modal elements missing'); return; }
  msg.textContent = `Delete "${name}"? This cannot be undone.`;
  // Use setAttribute to set onclick so it always fires correctly
  btn.setAttribute('data-delete-id', id);
  btn.setAttribute('onclick', `doDeleteProject('${id}')`);
  modal.classList.remove('hidden');
}

function doDeleteProject(id) {
  ProjectStore.delete(id);
  if (proj?.id === id) {
    proj = null;
    updateProjDisplay();
  }
  hideConfirmModal();
  renderProjGrid();
  toast('Project deleted');
}

function hideConfirmModal() {
  document.getElementById('confirm-modal')?.classList.add('hidden');
}

let _renameProjectId = null;

function showRenameModal(id, currentName) {
  _renameProjectId = id;
  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('rename-input');
  if (!modal || !input) return;
  input.value = currentName;
  modal.classList.remove('hidden');
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

function hideRenameModal() {
  document.getElementById('rename-modal')?.classList.add('hidden');
  _renameProjectId = null;
}

function confirmRename() {
  const input = document.getElementById('rename-input');
  const name = input?.value.trim();
  console.log('confirmRename called, name:', name, 'id:', _renameProjectId);
  if (!name) { toast('Please enter a name'); return; }
  if (!_renameProjectId) {
    // Fall back to active project if no id set
    if (!proj) { hideRenameModal(); return; }
    _renameProjectId = proj.id;
  }
  const p = ProjectStore.load(_renameProjectId);
  if (!p) { console.error('Project not found:', _renameProjectId); hideRenameModal(); return; }
  p.name = name;
  ProjectStore.save(p);
  if (proj?.id === _renameProjectId) {
    proj.name = name;
    updateProjDisplay();
  }
  hideRenameModal();
  renderProjGrid();
  toast('Renamed to "' + name + '"');
}

function showNewProjectModal() {
  document.getElementById('new-proj-name').value='';
  document.getElementById('new-proj-modal').classList.add('show');
  setTimeout(()=>document.getElementById('new-proj-name').focus(),100);
}
function confirmNewProject() {
  const name = g('new-proj-name').trim()||'Untitled Project';
  document.getElementById('new-proj-modal').classList.remove('show');
  proj = ProjectStore.newProject(name);
  // Wipe all JD fields and project-level JD state for the new project — never carry over from previous project
  s('jd-title', ''); s('jd-company', ''); s('jd-text', '');
  proj.jdTitle = ''; proj.jdCompany = ''; proj.jdText = ''; proj.jdAnalysis = null;
  // Hide the inline questions section until this project is analyzed
  const qaSection = document.getElementById('qa-section');
  if (qaSection) qaSection.style.display = 'none';
  ProjectStore.save(proj, skipTimestamp);
  updateProjDisplay();
  initCEForProject();
  switchTab('content');
  toast('Project created: '+name);
}
function dupProject(id) {
  const src = ProjectStore.load(id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id='p_'+Date.now(); copy.name=src.name+' (copy)'; copy.drafts=[...src.drafts];
  ProjectStore.save(copy); renderProjGrid(); toast('Duplicated');
}
function promptRenameProject() {
  if (!proj) return;
  showRenameModal(proj.id, proj.name);
}
function updateProjDisplay() {
  const el = document.getElementById('proj-name-display');
  const editIcon = document.getElementById('proj-edit-icon');
  if (!proj) { el.textContent=''; el.classList.add('placeholder'); editIcon.style.display='none'; return; }
  el.textContent=proj.name; el.classList.remove('placeholder'); editIcon.style.display='inline';
}

function loadProject(id) {
  const loaded = ProjectStore.load(id);
  if (!loaded) { toast('Project not found'); return; }
  // Reset post-Optimize view so it doesn't carry across projects
  try { exitPostOptimizeView(); } catch(e) {}
  proj = loaded;
  // Ensure all fields exist
  proj.ws = proj.ws || {};
  proj.drafts = proj.drafts || [];
  proj.scores = proj.scores || [];
  proj.questions = proj.questions || [];
  // Track all fixes/keywords ever applied to this project
  proj.appliedFixes = proj.appliedFixes || [];  // {type:'fix'|'keyword', title, text, timestamp}
  // Migration: the old 5-line contact default (each field on its own line) is no longer the
  // intended layout. If we detect that exact pattern, swap to the current 2-line default
  // (email|phone|location / portfolio|linkedin). This runs once per project load and is silent —
  // a real user-customized order won't match the migration check (different field set, or
  // multiple fields on one line, or fewer than 5 fields) so it won't get touched.
  if (proj.ce?.contactOrder?.length === 5) {
    const co = proj.ce.contactOrder;
    const lines = co.map(o => o.line).sort();
    const isOldDefault = lines.join(',') === '1,2,3,4,5';
    if (isOldDefault) {
      proj.ce.contactOrder = [
        {key:'email',     line:1},
        {key:'phone',     line:1},
        {key:'location',  line:1},
        {key:'portfolio', line:2},
        {key:'linkedin',  line:2},
      ];
    }
  }
  // Keep scores so suggestions persist across reload
  // Clear transient cross-project state so suggestions don't leak between projects
  proj._redoStack = [];
  proj._currentFixes = [];
  proj._missingKeywords = [];
  proj._deepKeywords = [];
  // Restore cached score from stored scores so analysis renders without re-running
  const latestStoredScore = (proj.scores && proj.scores.length > 0) ? proj.scores[proj.scores.length - 1] : null;
  proj._cachedScore = latestStoredScore || null;
  proj._analysisHash = null; // will be set fresh on next analysis
  // Set _aiApplied based on whether there are drafts (AI has modified the resume)
  proj._aiApplied = (proj.drafts && proj.drafts.length > 0);
  // Clear the analyzer DOM so stale content from the previous project doesn't flash
  const analyzerContent = document.getElementById('analyzer-content');
  if (analyzerContent) analyzerContent.style.display = 'none';
  const topFixes = document.getElementById('top-fixes');
  if (topFixes) topFixes.innerHTML = '';
  const deepFixes = document.getElementById('deep-fix-items');
  if (deepFixes) deepFixes.innerHTML = '';
  const kwCov = document.getElementById('keyword-coverage');
  if (kwCov) kwCov.innerHTML = '';
  const strengths = document.getElementById('score-strengths');
  if (strengths) strengths.innerHTML = '';
  const gaps = document.getElementById('score-gaps');
  if (gaps) gaps.innerHTML = '';
  try { s('jd-title', proj.jdTitle||''); s('jd-company', proj.jdCompany||''); s('jd-text', proj.jdText||''); s('jd-url', proj.jdUrl||''); updateJdUrlLink(); } catch(e) {}
  try { if (proj.jdAnalysis) renderJDAnalysis(proj.jdAnalysis); } catch(e) {}
  try { if (proj.questions?.length) renderQuestions(proj.questions); } catch(e) {}
  try { if (proj.outcomeQuestions?.length) renderOutcomeQuestions(); } catch(e) {}
  // Reveal the inline qa-section if this project already has questions; hide it otherwise
  try {
    const qaSection = document.getElementById('qa-section');
    if (qaSection) qaSection.style.display = proj.questions?.length ? 'block' : 'none';
  } catch(e) {}
  const draft = proj.drafts?.[proj.drafts.length-1];
  console.log('loadProject: loaded', proj.id, 'with', proj.drafts?.length || 0, 'drafts, latest draft length:', draft?.length || 0);
  try { 
    if (draft) {
      console.log('loadProject: displaying draft v' + proj.drafts.length);
      showResume(draft, proj.drafts.length);
    } else if (proj.ce) {
      const ceText = buildResumeTextFromCE(proj.ce);
      if (ceText.trim()) {
        console.log('loadProject: no drafts, building from CE');
        showResume(ceText, 0);
      }
    }
  } catch(e) {
    console.error('loadProject showResume error:', e);
  }
  // Re-render analysis dashboard if scores exist
  if (proj.scores && proj.scores.length > 0) {
    const latestScore = proj.scores[proj.scores.length - 1];
    try {
      renderDashboard(latestScore);
      proj._currentFixes = latestScore.top_fixes || [];
      if (latestScore.keyword_coverage?.length) {
        proj._missingKeywords = latestScore.keyword_coverage.filter(k => !k.found).map(k => k.keyword);
      }
      const analyzerContent = document.getElementById('analyzer-content');
      if (analyzerContent) analyzerContent.style.display = 'block';
      updateScorePill(latestScore.overall);
    } catch(e) {
      console.error('loadProject: error re-rendering analysis:', e);
    }
  }
  // Restore applied fixes visual state if they exist
  if (proj.appliedFixes && proj.appliedFixes.length > 0) {
    setTimeout(() => {
      proj.appliedFixes.forEach(fixText => {
        const items = document.querySelectorAll('.fix-item, .kw-item');
        items.forEach(item => {
          if (item.textContent.includes(fixText)) {
            item.classList.add('applied');
          }
        });
      });
    }, 100);
  }
  // Only render the stored score if it matches the current resume + JD content.
  // Otherwise the suggestions will be from a stale analysis.
  const score = proj.scores?.[proj.scores.length-1];
  const currentHash = draft && proj.jdText ? simpleHash(draft + proj.jdText) : null;
  const scoreHash = proj._savedAnalysisHash;
  if (score && currentHash && scoreHash === currentHash) {
    try { renderDashboard(score); if (analyzerContent) analyzerContent.style.display='block'; } catch(e) {}
    proj._cachedScore = score;
    proj._analysisHash = currentHash;
    // Restore deep analysis (fixes, keyword coverage)
    if (proj._lastDeep) {
      try { renderDeepFixItems(proj._lastDeep); } catch(e) {}
      // Restore keyword coverage
      const kwCov = document.getElementById('keyword-coverage');
      if (kwCov && score.keyword_coverage?.length) {
        const found = score.keyword_coverage.filter(k => k.found);
        const missing = score.keyword_coverage.filter(k => !k.found);
        kwCov.innerHTML = (missing.length ? `<div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;">Missing from resume</div>` + missing.map(k => `<label class="kw-missing-row" style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><input type="checkbox" class="kw-missing-row" data-kw="${esc(k.keyword)}"> <span style="font-size:12px;">${esc(k.keyword)}</span></label>`).join('') : '') +
          (found.length ? `<div style="font-size:12px;font-weight:600;color:var(--green);margin:8px 0 6px;">Found in resume</div>` + found.map(k => `<div style="font-size:12px;color:var(--green);margin-bottom:2px;">✓ ${esc(k.keyword)}</div>`).join('') : '');
      }
    }
    // Restore ATS audit
    if (proj.atsAudit?.checks) {
      const container = document.getElementById('ats-checks');
      const card = document.getElementById('ats-audit-card');
      if (container) container.innerHTML = proj.atsAudit.checks.map(c =>
        `<div class="ats-row"><div class="ats-icon">${c.status==='pass'?'✅':c.status==='warn'?'⚠️':'❌'}</div><div><div class="ats-title">${esc(c.label)}</div><div class="ats-desc">${esc(c.issue||'')}</div></div></div>`
      ).join('');
      if (card) card.style.display = proj.atsAudit.checks.some(c => c.status !== 'pass') ? 'block' : 'none';
    }
  } else {
    // Stale or missing — reset the score pill so the user knows to re-analyze
    updateScorePill(null);
  }
  updateProjDisplay();
  try { initCEForProject(); } catch(e) { console.error('CE init error:', e); }
  // Restore format settings if saved with project
  if (proj.fmt) restoreFmt(proj.fmt);
  // Render the applied fixes inventory when loading
  renderAppliedFixes();
  // Re-render grid so the active-project border moves to the newly loaded tile.
  try { renderProjGrid(); } catch(e) {}
  
  // If this project has been optimized before, restore the What Has Changed view.
  // We persisted blocks (with AI titles) on proj.lastOptimize, so this renders without
  // any API calls — instant restore, no token cost.
  if (proj.lastOptimize?.blocks?.length) {
    setTimeout(() => {
      try {
        renderWhatHasChangedView(
          proj.lastOptimize.blocks,
          proj.lastOptimize.scoreBefore || 0,
          proj.lastOptimize.scoreAfter || 0
        );
      } catch(e) { console.warn('Failed to restore What Has Changed view:', e); }
    }, 150);
  }
  
  toast('Loaded: ' + proj.name);
  // Stay on projects tab — don't switch tabs when loading. Resume loads on right side.
  // switchTab(draft ? 'content' : 'jd');
}


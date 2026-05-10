// ─────────────────────────────────────────────────────────
//  WORKSPACE
// ─────────────────────────────────────────────────────────
function collectWorkspace() {
  const ids=['name','title','contact','location','tgt-level','years','achievements','uvp','sum-type','hard','soft','tools','certs','r1-title','r1-company','r1-dates','r1-loc','r1-duties','r1-results','prev','team','exec','xfn','scope','m-biz','m-ops','m-prod','m-scale','edu','training','awards','gap','thread','ban','keep','extra','braindump'];
  const out={}; ids.forEach(id=>{out[id]=g('ws-'+id);});
  // Pull target title and company from the JD tab (single source of truth)
  out['tgt-title'] = g('jd-title') || (proj?.jdTitle || '');
  out['tgt-company'] = g('jd-company') || (proj?.jdCompany || '');
  out['fit'] = ''; // removed field
  return out;
}
function fillWorkspace(ws) {
  if(!ws) return;
  Object.entries(ws).forEach(([id,val])=>s('ws-'+id,val));
}
function fillDefaultWorkspace() {
  // New projects start blank — no personal data pre-filled
  const fields = ['ws-name','ws-title','ws-contact','ws-location','ws-years','ws-hard','ws-soft',
    'ws-tools','ws-certs','ws-edu','ws-training','ws-awards','ws-r1-title','ws-r1-company',
    'ws-r1-dates','ws-r1-loc','ws-r1-duties','ws-r1-results','ws-prev','ws-achievements',
    'ws-uvp','ws-team','ws-exec','ws-xfn','ws-scope','ws-m-biz','ws-m-ops',
    'ws-m-prod','ws-m-scale','ws-gap','ws-thread','ws-ban','ws-keep','ws-extra','ws-braindump'];
  fields.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
}

// ─────────────────────────────────────────────────────────
//  SAVE / LOAD
// ─────────────────────────────────────────────────────────
function toggleSaveMenu() {
  const menu = document.getElementById('save-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function saveAsNewProject() {
  if (!proj) { toast('No project to save'); return; }
  const newName = prompt('New project name:', proj.name + ' (copy)');
  if (!newName) return;
  
  // Create a new project with the same data
  const newProj = JSON.parse(JSON.stringify(proj));
  newProj.id = 'p_' + Date.now();
  newProj.name = newName;
  newProj.createdAt = Date.now();
  newProj.updatedAt = Date.now();
  
  // Save the new project
  ProjectStore.save(newProj);
  
  // Update UI
  toggleSaveMenu();
  renderProjGrid();
  toast('Saved as "' + newName + '"');
}

function saveProject(skipTimestamp) {
  if (!proj) return;
  proj.ws=collectWorkspace(); proj.jdTitle=g('jd-title'); proj.jdCompany=g('jd-company'); proj.jdText=g('jd-text');
  proj.fmt = Object.assign({}, _fmt);
  // Collect all question answers from the textareas before saving
  if (proj.questions?.length) {
    proj.questions.forEach(q => {
      const ta = document.getElementById('qa-' + q.id);
      if (ta) q.answer = ta.value || '';
    });
  }
  // Collect brain dump
  const braindump = document.getElementById('ws-braindump');
  if (braindump && proj.ws) proj.ws.braindump = braindump.value || '';
  // Save applied fixes state
  if (!proj.appliedFixes) proj.appliedFixes = [];
  const appliedItems = document.querySelectorAll('.fix-item.applied, .kw-item.applied');
  proj.appliedFixes = Array.from(appliedItems).map(item => item.textContent).filter(Boolean);
  console.log('saveProject: saving', proj.id, 'with', proj.drafts?.length || 0, 'drafts');
  ProjectStore.save(proj, skipTimestamp);
  // Clear unsaved-changes indicator now that we've persisted.
  _dirty = false;
  updateSaveButton();
  // Don't toast autosave — only show user feedback on manual save/export
}

function saveAsNewProject() {
  if (!proj) { toast('No project open to save'); return; }
  const newName = prompt('New project name:', proj.name + ' (copy)');
  if (!newName || !newName.trim()) return;
  
  // Save current state first
  saveProject();
  
  // Create a deep copy of the project
  const newProj = JSON.parse(JSON.stringify(proj));
  newProj.id = 'p_' + Date.now();
  newProj.name = newName.trim();
  newProj.createdAt = Date.now();
  newProj.updatedAt = Date.now();
  
  // Save the new project
  ProjectStore.save(newProj);
  
  // Update the grid and show confirmation
  renderProjGrid();
  toast('Saved as "' + newName + '"');
}

// Save semantics: only the manual Save button commits to ProjectStore. Optimize, Apply Selected,
// CE edits, brain-dump typing, etc. all stage changes in memory only. Reload restores last-saved.
// _dirty is set by autoSave() (now a no-op for persistence) and cleared by saveProject().
let _dirty = false;

function setDirty() {
  if (_dirty) return;
  _dirty = true;
  updateSaveButton();
  // beforeunload warning attached once; the handler reads _dirty fresh each time.
  if (!setDirty._unloadAttached) {
    setDirty._unloadAttached = true;
    window.addEventListener('beforeunload', (e) => {
      if (_dirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });
  }
}

function updateSaveButton() {
  // Show a dot on the Save button when there are unsaved changes.
  const btns = document.querySelectorAll('[data-save-btn], #save-btn, .save-btn');
  btns.forEach(btn => {
    if (_dirty) {
      btn.classList.add('has-unsaved');
      if (!btn.querySelector('.unsaved-dot')) {
        const dot = document.createElement('span');
        dot.className = 'unsaved-dot';
        dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;margin-left:6px;vertical-align:middle;';
        btn.appendChild(dot);
      }
    } else {
      btn.classList.remove('has-unsaved');
      const dot = btn.querySelector('.unsaved-dot');
      if (dot) dot.remove();
    }
  });
}

function autoSave() {
  // No-op for persistence. Marks the project as having unsaved changes so the Save button
  // shows the indicator and reload prompts the user. To actually persist, call saveProject().
  if (proj) setDirty();
}
// Autosave disabled — only save on manual Save button click
// setInterval(autoSave, 30000);

async function saveProjectToDisk() {
  if (!proj) { toast('Open a project first'); return; }
  saveProject();
  const blob = new Blob([JSON.stringify(proj,null,2)],{type:'application/json'});
  const name=(proj.name||'Project').replace(/[^a-z0-9_\- ]/gi,'').replace(/\s+/g,'_')+'.json';
  if (window.showSaveFilePicker) {
    try { const h=await window.showSaveFilePicker({suggestedName:name,types:[{description:'Project File',accept:{'application/json':['.json']}}]}); const w=await h.createWritable();await w.write(blob);await w.close();toast('Saved: '+h.name);return; } catch(e){if(e.name==='AbortError')return;}
  }
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);toast('Saved as '+name);
}
async function loadProjectFromDisk() {
  if (window.showOpenFilePicker) {
    try { const [h]=await window.showOpenFilePicker({types:[{description:'Project File',accept:{'application/json':['.json']}}],multiple:false});const file=await h.getFile();await importProjectFile(file);return; } catch(e){if(e.name==='AbortError')return;}
  }
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=async e=>{if(e.target.files[0])await importProjectFile(e.target.files[0]);};input.click();
}
async function importProjectFile(file) {
  try {
    const text = await file.text();
    let loaded;
    try {
      loaded = JSON.parse(text);
    } catch(parseErr) {
      toast('Invalid project file — could not parse JSON');
      console.error('JSON parse error:', parseErr);
      return;
    }
    if (!loaded.id || !loaded.name) {
      toast('Invalid project file — missing id or name');
      return;
    }
    // Ensure required fields exist so old files don't crash new code
    loaded.ce = loaded.ce || null;
    loaded.ws = loaded.ws || {};
    loaded.drafts = loaded.drafts || [];
    loaded.scores = loaded.scores || [];
    loaded.questions = loaded.questions || [];
    loaded._redoStack = [];
    loaded._cachedScore = null;
    loaded._analysisHash = null;
    ProjectStore.save(loaded);
    loadProject(loaded.id);
    renderProjGrid();
    toast('Loaded: ' + loaded.name);
  } catch(e) {
    toast('Error loading project: ' + e.message);
    console.error('importProjectFile error:', e);
  }
}

// ─────────────────────────────────────────────────────────
//  RESUME PANEL
// ─────────────────────────────────────────────────────────
function showResume(text, vNum) {
  const editor=document.getElementById('resume-editor');
  const empty=document.getElementById('resume-empty');
  const foot=document.getElementById('resume-foot');
  if (!text || !text.trim()) { 
    if(editor) editor.style.display='none'; 
    if(empty) empty.style.display='flex'; 
    if(foot) foot.style.display='none'; 
    currentDisplayedResume = '';
    return; 
  }
  if(editor) {
    editor.textContent=text;
    // Also update innerText for consistency with other parts of code
    editor.innerText=text;
    editor.style.display='block';
    currentDisplayedResume = text; // Track what we just displayed
    console.log('showResume: displayed v' + (vNum||1) + ', length:', text.length);
  }
  if(empty) empty.style.display='none'; 
  if(foot) foot.style.display='flex';
  const badge=document.getElementById('editor-version-badge');
  if(badge) {
    badge.textContent='v'+(vNum||1); 
    badge.style.display='inline-flex';
  }
}
// Builds the natural filename without AI calls. Sync. Used as the fallback when AI abbreviation
// fails or isn't needed (i.e. the name is already within the target length).
function getResumeFilename(ext) {
  // Format: FirstName_LastName_JobTitle.ext
  const ws = proj?.ws || {};
  const fullName = ws.name || g('ce-name') || '';
  const jobTitle = g('jd-title') || proj?.jdTitle || g('ce-title') || '';
  const parts = [];
  if (fullName) {
    const nameParts = fullName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      parts.push(nameParts[0], nameParts[nameParts.length - 1]);
    } else if (nameParts.length === 1) {
      parts.push(nameParts[0]);
    }
  }
  if (jobTitle) parts.push(jobTitle.trim());
  if (!parts.length) parts.push('Resume');
  return sanitizeForFilename(parts.join('_')) + '_Resume.' + ext;
}

// Strips special chars (commas, ampersands, slashes, etc.), collapses underscores, trims edges.
function sanitizeForFilename(s) {
  return String(s || '')
    .replace(/&/g, 'and')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Smart filename builder. Uses the AI to strip qualifiers ("— Client Experience", ", Senior
// Manager", "(Remote)") from the job title while preserving the role itself, then builds
// FirstName_LastName_Title_Resume.{ext}. No character cap. The AI is told NEVER to change the
// role — only to remove suffix qualifiers. Falls back to the raw title if the AI call fails.
async function getResumeFilenameSmart(ext) {
  const ws = proj?.ws || {};
  const fullName = ws.name || g('ce-name') || '';
  const rawTitle = (g('jd-title') || proj?.jdTitle || g('ce-title') || '').trim();
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstLast = nameParts.length >= 2
    ? [nameParts[0], nameParts[nameParts.length - 1]]
    : (nameParts.length === 1 ? [nameParts[0]] : []);
  if (!firstLast.length && !rawTitle) return 'Resume.' + ext;
  const namePart = sanitizeForFilename(firstLast.join('_'));

  // No title? Just use the name.
  if (!rawTitle) return namePart + '_Resume.' + ext;

  // Detect whether the title has qualifier punctuation worth stripping. If it doesn't (a clean
  // title like "Senior Product Designer"), skip the AI call entirely.
  const hasQualifiers = /[—–\-,()|/]/.test(rawTitle) || /\s(at|for|on|of|—|in)\s/i.test(rawTitle);
  let cleanTitle = rawTitle;
  if (hasQualifiers) {
    try {
      const ai = await claudeFetch(
        `Strip qualifying suffixes from this job title and return ONLY the core role. Do NOT change the role itself.\n\n` +
        `Rules:\n` +
        `- Keep the actual job title intact. "Manager, Product Design" stays "Manager, Product Design" — do NOT shorten it to "Product Designer" (those are different roles).\n` +
        `- Remove department/team qualifiers after dashes, em-dashes, or trailing commas: "— Client Experience", "- Growth Team", ", Engagement", ", Mobile Apps".\n` +
        `- Remove parenthetical qualifiers: "(Remote)", "(Hybrid)", "(L5)", "(Contract)".\n` +
        `- Remove location suffixes: "in San Francisco", "at Stripe".\n` +
        `- Keep seniority words that are part of the role: "Senior", "Staff", "Principal", "Lead", "Manager", "Director", "VP".\n` +
        `- Output the cleaned title ONLY. No quotes, no explanation, no extra text.\n\n` +
        `Examples:\n` +
        `"Manager, Product Design — Client Experience" → Manager, Product Design\n` +
        `"Senior Product Designer, Engagement" → Senior Product Designer\n` +
        `"Staff Product Designer (Remote)" → Staff Product Designer\n` +
        `"Director of Brand & Marketing — Growth" → Director of Brand & Marketing\n` +
        `"Product Design Manager - Stitch Fix" → Product Design Manager\n` +
        `"VP of Engineering, Platform" → VP of Engineering\n\n` +
        `Now clean this title:\n${rawTitle}`,
        100
      );
      const trimmed = (ai || '').trim().split('\n')[0].replace(/^["'`]|["'`]$/g, '').trim();
      if (trimmed) cleanTitle = trimmed;
    } catch (e) {
      console.warn('Title cleanup failed, using raw:', e);
    }
  }

  const titlePart = sanitizeForFilename(cleanTitle);
  const core = [namePart, titlePart].filter(Boolean).join('_');
  return core + '_Resume.' + ext;
}

function getResumeText() {
  // If there are drafts (from AI applies), use the latest one
  if (proj?.drafts?.length) {
    const latest = proj.drafts[proj.drafts.length - 1] || '';
    console.log('DEBUG getResumeText: drafts exist, v' + proj.drafts.length + ', first 50 chars:', latest.substring(0, 50));
    return latest;
  }
  // If we have structured CE data, build from that
  if (proj?.ce) {
    const t = buildResumeTextFromCE(proj.ce);
    if (t.trim()) {
      console.log('DEBUG getResumeText: using CE data');
      return t;
    }
  }
  // Fallback to hidden text editor
  const fallback = (document.getElementById('resume-editor')?.innerText||'').trim();
  console.log('DEBUG getResumeText: FALLBACK - NO DRAFTS! proj.drafts.length:', proj?.drafts?.length);
  return fallback;
}
let _isLoadingResume = false; // Flag to prevent onResumeEdit from corrupting drafts during load

function onResumeEdit() {
  // DISABLED: This function was corrupting drafts by reading stale DOM content
  // The resume content is managed through proj.drafts, not by editing the DOM
  // Manual edits to the resume-editor are handled through the save/load workflow
  return;
}

function toggleBold() {
  const editor = document.getElementById('resume-editor');
  if (!editor) return;
  editor.focus();
  document.execCommand('bold');
  updateBoldBtn();
}

function updateBoldBtn() {
  const btn = document.getElementById('bold-btn');
  if (!btn) return;
  const isBold = document.queryCommandState('bold');
  btn.classList.toggle('active', isBold);
}

// Update bold button state on selection change
document.addEventListener('selectionchange', () => {
  const editor = document.getElementById('resume-editor');
  if (editor && document.activeElement === editor) updateBoldBtn();
});

// Also allow Ctrl+B shortcut in the editor
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    const editor = document.getElementById('resume-editor');
    if (document.activeElement === editor) {
      e.preventDefault();
      toggleBold();
    }
  }
});
function undoVersion() {
  if (!proj?.drafts?.length || proj.drafts.length < 2) { toast('Nothing to undo'); return; }
  if (!proj._redoStack) proj._redoStack = [];
  proj._redoStack.push(proj.drafts.pop());
  const txt = proj.drafts[proj.drafts.length - 1];
  showResume(txt, proj.drafts.length);
  autoSave();
  toast('↩ Undo — v' + proj.drafts.length);
  updateUndoRedoBtns();
}

function redoVersion() {
  if (!proj?._redoStack?.length) { toast('Nothing to redo'); return; }
  const txt = proj._redoStack.pop();
  proj.drafts.push(txt);
  showResume(txt, proj.drafts.length);
  autoSave();
  toast('↪ Redo — v' + proj.drafts.length);
  updateUndoRedoBtns();
}

function updateUndoRedoBtns() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  if (undoBtn) undoBtn.style.opacity = (proj?.drafts?.length > 1) ? '1' : '0.35';
  if (redoBtn) redoBtn.style.opacity = (proj?._redoStack?.length) ? '1' : '0.35';
}
function updateScorePill(pct) {
  const pill=document.getElementById('editor-score-pill');
  const tabBadge=document.getElementById('tab-analyzer-score');
  if (pct === null || pct === undefined) {
    if (pill) pill.className = 'score-pill';
    if (tabBadge) tabBadge.className = 'score-pill';
    return;
  }
  if(pill){pill.textContent=pct+'%';pill.className='score-pill show '+(pct>=80?'high':pct>=60?'mid':'low');}
  if(tabBadge){tabBadge.textContent=pct+'%';tabBadge.className='score-pill show '+(pct>=80?'high':pct>=60?'mid':'low');tabBadge.style.cssText='font-size:10px;padding:1px 5px;margin-left:4px;';}
}
function copyResume(){
  navigator.clipboard.writeText(getResumeText()).then(()=>toast('Copied'));
}

// ─────────────────────────────────────────────────────────
//  UPLOAD + PARSE
// ─────────────────────────────────────────────────────────
function onDragOver(e,zoneId){e.preventDefault();document.getElementById(zoneId||'upload-zone')?.classList.add('drag');}
function onDragLeave(){document.getElementById('upload-zone').classList.remove('drag');}
function onDrop(e){e.preventDefault();document.getElementById('upload-zone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f)processFile(f);}

function onDragOver(e, zoneId) {
  e.preventDefault();
  const id = zoneId || 'upload-zone';
  document.getElementById(id)?.classList.add('drag');
}

function onDropProjects(e) {
  e.preventDefault();
  document.getElementById('upload-zone-projects')?.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) processFileFromProjects(f);
}

function onFileSelectProjects(e) {
  const f = e.target.files[0];
  if (f) processFileFromProjects(f);
}

async function processFileFromProjects(file) {
  // Verify API key before starting
  if (!getKey()) {
    toast('API key not configured. Please set your API key.');
    return;
  }
  
  // Show blocking upload modal immediately
  const uploadModal = document.getElementById('upload-modal');
  const uploadMsg = document.getElementById('upload-modal-msg');
  if (uploadModal) {
    uploadModal.style.display = 'flex';
    uploadMsg.textContent = 'Reading resume...';
  }
  
  try {
    // Create a new project through the store so it gets a proper id, defaults, and is persisted.
    const projName = file.name.replace(/\.[^/.]+$/, '');
    proj = ProjectStore.newProject(projName);

    // Wipe any DOM state carried from a previous project — JD inputs, analyzer panel, qa-section.
    // Without this, the new project shows the previous project's JD title/company/text in the inputs,
    // and the Optimizer tab still shows the old score and suggestions.
    s('jd-title', ''); s('jd-company', ''); s('jd-text', '');
    proj.jdTitle = ''; proj.jdCompany = ''; proj.jdText = ''; proj.jdAnalysis = null;
    const qaSection = document.getElementById('qa-section');
    if (qaSection) qaSection.style.display = 'none';
    const analyzerContent = document.getElementById('analyzer-content');
    if (analyzerContent) analyzerContent.style.display = 'none';
    // Reset the tab-level Optimizer score pill
    const tabScore = document.getElementById('tab-analyzer-score');
    if (tabScore) tabScore.textContent = '';
    // Apply the Standard template typography preset so the rendered resume has a clean, known baseline.
    // Without this, _fmt carries stale values from whichever template the previous project last used.
    if (typeof selectTemplate === 'function') selectTemplate('standard');
    ProjectStore.save(proj);

    // Process the file with the new project in context — suppress the tab switch so the
    // Projects view stays in front for the user.
    await processFile(file, true);
    
    // After processing, initialize the content editor and refresh the Projects grid.
    // Stay on Projects so the user sees the new tile and can decide what to do next.
    updateProjDisplay();
    initCEForProject();
    switchTab('projects');
    renderProjGrid();
    
  } catch(err) {
    console.error('Upload error:', err);
    if (uploadModal) uploadModal.style.display = 'none';
    toast('Error: ' + (err.message || 'Failed to process resume'));
    // Reset proj if there was an error
    proj = null;
  } finally {
    // Hide upload modal
    if (uploadModal) uploadModal.style.display = 'none';
  }
}
function onFileSelect(e){const f=e.target.files[0];if(f)processFile(f);}

async function processFile(file) {
  if (!proj){toast('Create a project first');return;}
  const ext=file.name.split('.').pop().toLowerCase();
  const loading=document.getElementById('upload-loading');
  const msg=document.getElementById('upload-msg');
  const uploadModal=document.getElementById('upload-modal');
  const uploadMsg=document.getElementById('upload-modal-msg');
  loading.classList.add('show');msg.textContent='Reading file...';
  if(uploadMsg){
    uploadMsg.textContent='Reading file...';
  }
  try {
    let text='';
    if(ext==='txt'||ext==='rtf'){
      try {
        text=await file.text();
      } catch(e) {
        throw new Error('Could not read text file: ' + e.message);
      }
    } else {
      msg.textContent='Parsing with AI...';
      if(uploadMsg) uploadMsg.textContent='Parsing with AI...';
      const base64=await fileToBase64(file);
      const mt=ext==='pdf'?'application/pdf':ext==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/msword';
      const key=getKey();
      if(!key) throw new Error('API key not configured');
      const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-opus-4-5',max_tokens:3000,messages:[{role:'user',content:[{type:'document',source:{type:'base64',media_type:mt,data:base64}},{type:'text',text:'Extract all text from this resume. Return only plain text. Preserve line breaks and section structure. No commentary.'}]}]})});
      if(!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText}`);
      const d=await resp.json();
      console.log('API Response:', d);
      if(d.error) throw new Error('API error: ' + (d.error.message || JSON.stringify(d.error)));
      if(!d) throw new Error('Empty response from API');
      if(d.content && !Array.isArray(d.content)) throw new Error('Content is not an array: ' + typeof d.content);
      if(!d.content || d.content.length === 0) throw new Error('No content blocks in API response');
      const textBlocks = d.content.filter(b => b.type === 'text');
      if(textBlocks.length === 0) throw new Error('No text blocks found in response');
      text = textBlocks.map(b => b.text || '').filter(t => t.trim()).join('\n');
      if(!text || !text.trim()) throw new Error('No text extracted from response blocks');
    }
    if(!text.trim())throw new Error('No text extracted');
    proj.parsedText=text;
    msg.textContent='Analyzing structure...';
    await parseResumeText(text);
  } catch(e){ 
    loading.classList.remove('show'); 
    const uploadModal = document.getElementById('upload-modal');
    if(uploadModal) uploadModal.style.display = 'none';
    toast('Error: '+e.message); 
  }
}

async function parseResumeText(text) {
  const msg=document.getElementById('upload-msg');
  const uploadMsg=document.getElementById('upload-modal-msg');
  msg.textContent='Extracting fields...';
  if(uploadMsg)uploadMsg.textContent='Extracting fields...';
  const jsonTemplate = '{"name":"","email":"","phone":"","location":"","linkedin":"","portfolio":"","title":"","years_exp":"","hard_skills":"","soft_skills":"","tools":"","current_role":"","current_company":"","current_dates":"","education":"","certifications":"","achievements":"","all_experience":""}';
  const prompt = `You are a resume parser. Extract information from the resume and return ONLY a valid JSON object matching this structure:

\${jsonTemplate}

Return ONLY the JSON. No markdown blocks, no text, no explanation. Just valid JSON.

RESUME:
\${text}`
  const raw=await claudeFetch(prompt,2000);
  let parsed;
  try {
    parsed=parseJson(raw);
  } catch(e) {
    document.getElementById('upload-loading').classList.remove('show');
    const uploadModal = document.getElementById('upload-modal');
    if(uploadModal) uploadModal.style.display = 'none';
    toast('Could not parse resume structure: '+e.message);
    return;
  }
  
  if(!parsed || typeof parsed !== 'object') {
    document.getElementById('upload-loading').classList.remove('show');
    const uploadModal = document.getElementById('upload-modal');
    if(uploadModal) uploadModal.style.display = 'none';
    toast('Invalid parsed data structure');
    return;
  }
  
  proj.parsedFields = parsed;
  
  // Fill workspace — add safety checks
  const map={name:'ws-name',location:'ws-location',title:'ws-title',hard_skills:'ws-hard',soft_skills:'ws-soft',tools:'ws-tools',certifications:'ws-certs',education:'ws-edu',achievements:'ws-achievements',current_role:'ws-r1-title',current_company:'ws-r1-company',current_dates:'ws-r1-dates',all_experience:'ws-prev',years_exp:'ws-years'};
  Object.entries(map).forEach(([f,wsId])=>{
    try {
      const v=parsed[f]?.value;
      if(v && typeof v === 'string') s(wsId,v);
    } catch(e) {
      console.warn('Error filling '+wsId+': '+e.message);
    }
  });
  
  const contact=[parsed.email?.value,parsed.phone?.value,parsed.linkedin?.value,parsed.portfolio?.value].filter(v => v && typeof v === 'string').join(' · ');
  if(contact) s('ws-contact',contact);
  
  try {
    renderParseReview(parsed);
  } catch(e) {
    console.error('renderParseReview error:', e);
    toast('Could not render review: '+e.message);
  }
  document.getElementById('upload-loading').classList.remove('show');
  const uploadModal = document.getElementById('upload-modal');
  if(uploadModal) uploadModal.style.display = 'none';
  document.getElementById('parse-review').style.display='block';
  document.getElementById('upload-zone-wrap').style.display='none';
  autoSave();
}

function renderParseReview(parsed) {
  if(!parsed || typeof parsed !== 'object') {
    console.error('Invalid parsed data:', parsed);
    return;
  }
  const LABELS={name:'Name',email:'Email',phone:'Phone',location:'Location',title:'Title',hard_skills:'Hard Skills',soft_skills:'Soft Skills',tools:'Tools',current_role:'Latest Role',current_company:'Company',current_dates:'Dates',education:'Education',achievements:'Achievements'};
  const container=document.getElementById('parse-review');
  if(!container) return;
  const entries=Object.entries(parsed || {}).filter(([k,v])=>v?.value&&LABELS[k]);
  container.innerHTML=`<div class="card mb-3"><div class="card-head"><span class="card-title">Extracted from Resume</span><button class="btn btn-primary btn-sm" onclick="acceptParsed()">Accept & Continue →</button></div>`+
    entries.map(([key,data])=>{
      const c=data.confidence||0;const cls=c>=.85?'badge-teal':c>=.6?'badge-amber':'badge-red';const lbl=c>=.85?'High':c>=.6?'Med':'Low';
      const isLong=(data.value||'').length>80;
      const inp=isLong?`<textarea id="pf-${key}" style="min-height:50px;font-size:12px;">${esc(data.value||'')}</textarea>`:`<input type="text" id="pf-${key}" value="${esc(data.value||'')}" style="font-size:12px;">`;
      return `<div class="parsed-row"><div class="parsed-key">${LABELS[key]||key}</div><div class="parsed-val">${inp}</div><span class="badge ${cls}">${lbl}</span></div>`;
    }).join('')+'</div>';
}

function acceptParsed() {
  const map={name:'ws-name',location:'ws-location',title:'ws-title',hard_skills:'ws-hard',soft_skills:'ws-soft',tools:'ws-tools',certifications:'ws-certs',education:'ws-edu',achievements:'ws-achievements',current_role:'ws-r1-title',current_company:'ws-r1-company',current_dates:'ws-r1-dates',all_experience:'ws-prev',years_exp:'ws-years'};
  Object.entries(map).forEach(([pf,ws])=>{const el=document.getElementById('pf-'+pf);if(el)s(ws,el.value);});
  document.getElementById('parse-review').style.display='none';
  document.getElementById('upload-zone-wrap').style.display='block';
  autoSave();
  // If called from projects upload flow, stay on content tab; otherwise go to jd
  const currentTab = document.querySelector('.tab.active')?.id;
  if (!currentTab || currentTab === 'tab-projects') {
    switchTab('content');
    toast('Resume loaded — switch to Content Editor');
  } else {
    switchTab('jd');
    toast('Information imported — paste a job description next');
  }
}
function fileToBase64(file){return new Promise((r,j)=>{const rd=new FileReader();rd.onload=()=>r(rd.result.split(',')[1]);rd.onerror=j;rd.readAsDataURL(file);});}


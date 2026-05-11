const _fmt = { template:'standard', font:'Lato', nameFont:'Prata', bodyFont:'Lato', headingFont:'Prata', expFont:'Lato', roleFont:'Lato', nameSize:26, bodySize:10, headingSize:14, expSize:10, roleSize:14, expRoleSize:11, skillsSize:10, accent:'#111111', size:'10pt', margin:'0.5in', bgColor:'#ffffff', textColor:'#111111', nameFontWeight:500, nameFontStyle:'normal', titleFontWeight:400, titleFontStyle:'normal', titleLetterSpacing:'0', showDividerLines:true, headingLetterSpacing:'0.06em', headingFontWeight:400, dividerLineWidth:'2', dividerLineOpacity:0.6, summaryHeadingSize:14, skillsHeadingSize:14, experienceHeadingSize:14, expertiseHeadingSize:14 };

// Template definitions — each has a render function
const TEMPLATES = [
  {
    id:'standard', name:'Standard',
    desc:'Left-aligned header with name, title, and stacked contact lines.',
    thumb: (ac) => tmplHtml('standard', ac)
  },
  {
    id:'professional', name:'Professional',
    desc:'Centered name, gray section headings, clean job layout.',
    thumb: (ac) => tmplHtml('professional', ac)
  }
];

// Generate a scaled real-text preview for each template
function tmplHtml(layout, ac) {
  const name = 'Your Name';
  const contact = '555-000-0000 · you@example.com · Arlington, VA';
  const sections = [
    { heading: 'EXPERIENCE', lines: [
      { company: 'Verizon', role: 'Senior Design Manager', dates: '02/24–Present', bullets: ['Led 9 designers across financial products', 'Drove 26% MAU growth and 90% activation'] },
      { company: 'Web.com', role: 'Product Design Manager', dates: '06/17–02/20', bullets: ['Built design system across 15 product teams'] },
    ]},
    { heading: 'SKILLS', lines: ['Leadership · UX Design · Figma · Design Systems'] },
    { heading: 'EDUCATION', lines: ['BFA, Communication Design · Syracuse University'] },
  ];

  // Scale factor: card is ~180px wide, letter page is ~816px → scale ~0.22
  const S = 'font-size:2.4px;line-height:1.45;font-family:Arial,sans-serif;color:#111;';

  let header = '';
  if (layout === 'professional' || layout === 'classic' || layout === 'executive' || layout === 'ruled' || layout === 'compact') {
    const border = layout === 'classic' ? `border-bottom:0.3px solid ${ac};padding-bottom:1px;margin-bottom:2px;`
                 : layout === 'ruled'   ? `border-bottom:0.3px solid ${ac};padding-bottom:1px;margin-bottom:2px;`
                 : '';
    header = `<div style="text-align:center;${border}margin-bottom:2px;">
      <div style="font-size:4px;font-weight:700;margin-bottom:0.5px;">${name}</div>
      <div style="font-size:1.8px;color:#555;">${contact}</div>
    </div>`;
  } else if (layout === 'modern') {
    header = `<div style="background:${ac};padding:2px 3px;margin:-6px -6px 2px;">
      <div style="font-size:4px;font-weight:700;color:#fff;">${name}</div>
      <div style="font-size:1.8px;color:rgba(255,255,255,.8);">${contact}</div>
    </div>`;
  } else if (layout === 'boldline') {
    header = `<div style="display:flex;gap:1.5px;margin-bottom:2px;">
      <div style="width:1.5px;background:${ac};flex-shrink:0;border-radius:1px;"></div>
      <div>
        <div style="font-size:4px;font-weight:700;">${name}</div>
        <div style="font-size:1.8px;color:#555;">${contact}</div>
      </div>
    </div>`;
  } else if (layout === 'minimal') {
    header = `<div style="margin-bottom:2px;">
      <div style="font-size:4px;font-weight:700;">${name}</div>
      <div style="font-size:1.8px;color:#555;">${contact}</div>
    </div>`;
  }

  let body = '';
  sections.forEach(sec => {
    const secStyle = layout === 'professional'
      ? `font-size:2px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#888;border-bottom:0.2px solid #ddd;padding-bottom:0.5px;margin:1.5px 0 0.8px;`
      : layout === 'ruled'
      ? `font-size:2px;font-weight:700;text-transform:uppercase;border-bottom:0.3px solid ${ac};padding-bottom:0.3px;margin:1.5px 0 0.8px;`
      : layout === 'executive'
      ? `font-size:2px;font-weight:700;text-transform:uppercase;display:flex;align-items:center;gap:1px;margin:1.5px 0 0.8px;`
      : `font-size:2px;font-weight:700;text-transform:uppercase;color:${ac};margin:1.5px 0 0.8px;`;

    const execRule = layout === 'executive'
      ? `<div style="${secStyle}"><div style="flex:1;height:0.2px;background:${ac};"></div><span style="padding:0 1px;">${sec.heading}</span><div style="flex:1;height:0.2px;background:${ac};"></div></div>`
      : `<div style="${secStyle}">${sec.heading}</div>`;

    body += layout === 'executive' ? execRule : `<div style="${secStyle}">${sec.heading}</div>`;

    if (sec.lines && typeof sec.lines[0] === 'object') {
      sec.lines.forEach(job => {
        body += `<div style="display:flex;justify-content:space-between;margin-bottom:0.3px;">
          <span style="font-size:2.2px;font-weight:700;">${job.company}</span>
          <span style="font-size:1.8px;color:#888;">${job.dates}</span>
        </div>`;
        body += `<div style="font-size:2px;font-weight:600;color:#333;margin-bottom:0.3px;">${job.role}</div>`;
        job.bullets.forEach(b => {
          body += `<div style="font-size:1.8px;color:#444;padding-left:2px;">· ${b}</div>`;
        });
      });
    } else {
      sec.lines.forEach(l => {
        body += `<div style="font-size:1.8px;color:#555;margin-bottom:0.3px;">${l}</div>`;
      });
    }
  });

  return `<div style="${S}padding:6px;overflow:hidden;height:100%;box-sizing:border-box;background:${layout==='modern'?'#fff':'#fff'}">
    ${header}${body}
  </div>`;
}


function rows(n, col, gap) {
  return Array.from({length:n}, (_, i) =>
    `<div style="height:1px;background:${col};margin-bottom:${gap||2}px;width:${95-i*5}%;"></div>`
  ).join('');
}

// Render all template thumbnails into the grid
function renderTemplateGrid() {
  const grid = document.getElementById('tmpl-grid');
  if (!grid) return;
  initFontDropdowns();
  grid.innerHTML = TEMPLATES.map(t => `
    <div class="tmpl-card ${_fmt.template === t.id ? 'active' : ''}" 
         id="tmpl-${t.id}" onclick="selectTemplate('${t.id}')" title="${t.desc}">
      <div class="tmpl-thumb">${t.thumb(_fmt.accent)}</div>
      <div class="tmpl-name">${t.name}</div>
    </div>`).join('');
}

// Built-in template typography presets — applied each time the user selects a template
// so picking Standard always lands on a known-good baseline.
const TEMPLATE_PRESETS = {
  standard: {
    nameFont: 'Prata', nameSize: 26,
    bodyFont: 'Lato', bodySize: 10,
    headingFont: 'Prata', headingSize: 14,
    expFont: 'Lato', expSize: 10,
    roleFont: 'Lato', roleSize: 14,
    expRoleSize: 11,
    skillsSize: 10,
    titleLetterSpacing: '0',
  },
  professional: {
    bodySize: 10,
    expSize: 11,
    roleSize: 12,
    headingSize: 11,
    skillsSize: 10,
  },
};

function selectTemplate(id) {
  _fmt.template = id;
  // Apply preset typography for templates that define one
  const preset = TEMPLATE_PRESETS[id];
  if (preset) {
    Object.assign(_fmt, preset);
    _fmt.font = preset.bodyFont; // legacy alias
    _fmt.size = preset.bodySize + 'pt';
    // Sync the visible Typography inputs so the user sees the new values
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('fmt-name-font', preset.nameFont); setVal('fmt-name-size', preset.nameSize);
    setVal('fmt-body-font', preset.bodyFont); setVal('fmt-body-size', preset.bodySize);
    setVal('fmt-heading-font', preset.headingFont); setVal('fmt-heading-size', preset.headingSize);
    setVal('fmt-exp-font', preset.expFont); setVal('fmt-exp-size', preset.expSize);
    setVal('fmt-role-font', preset.roleFont); setVal('fmt-role-size', preset.roleSize);
    setVal('fmt-skills-size', preset.skillsSize);
  }
  // Standard and Professional both default to a 2-line contact layout.
  // Line 1: email | phone | location. Line 2: portfolio | linkedin.
  if ((id === 'standard' || id === 'professional') && proj?.ce) {
    proj.ce.contactOrder = [
      {key:'email',     line:1},
      {key:'phone',     line:1},
      {key:'location',  line:1},
      {key:'portfolio', line:2},
      {key:'linkedin',  line:2},
    ];
    if (typeof renderContactFields === 'function') renderContactFields();
  }
  document.querySelectorAll('.tmpl-card').forEach(c => c.classList.remove('active'));
  document.getElementById('tmpl-' + id)?.classList.add('active');
  updateLivePreview();
}

function fmtSetAccent(val, btn) {
  _fmt.accent = val;
  document.querySelectorAll('#view-format .fmt-chip').forEach(b => {
    if (b.id && b.id.startsWith('ac-')) b.classList.remove('active');
  });
  btn.classList.add('active');
  renderTemplateGrid(); // redraw thumbs with new accent
  updateLivePreview();
}

function fmtSetProp(key, val, btn) {
  _fmt[key] = val;
  btn.parentElement.querySelectorAll('.fmt-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateLivePreview();
}

// Keep old fmtSet/fmtTabSet aliases so modal still works
function fmtSet(k,v,btn){fmtSetProp(k,v,btn);}

// Fallback Google Fonts list
const GOOGLE_FONTS = ['Arial','Helvetica','Georgia','Garamond','Times New Roman',
  'Lato','DM Sans','Source Sans 3','Nunito','Playfair Display',
  'Inter','Roboto','Open Sans','Montserrat','Poppins',
  'Josefin Sans','Cormorant','Cormorant Garamond','Prata','Gloock','DM Serif Display'];

let _systemFontsLoaded = false;

async function loadSystemFonts() {
  const btn = document.getElementById('load-fonts-btn');

  if (!('queryLocalFonts' in window)) {
    toast('System font access requires Chrome 103+. Using built-in fonts.');
    populateFontDropdowns(GOOGLE_FONTS);
    return;
  }
  try {
    btn.textContent = 'Loading...';
    btn.disabled = true;

    const fonts = await window.queryLocalFonts();
    // Only load non-italic variants to avoid all text becoming italic
    const normalFonts = fonts.filter(f => {
      const s = (f.style || '').toLowerCase();
      return !s.includes('italic') && !s.includes('oblique');
    });
    const families = [...new Set(normalFonts.map(f => f.family))].sort();
    btn.textContent = `Loading ${families.length} fonts...`;

    const BATCH = 20;
    for (let i = 0; i < normalFonts.length; i += BATCH) {
      const batch = normalFonts.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async fontData => {
        try {
          const blob = await fontData.blob();
          const url = URL.createObjectURL(blob);
          const face = new FontFace(fontData.family, `url(${url})`, {
            style: 'normal',
            weight: fontData.weight || '400',
          });
          await face.load();
          face.$$url = url; // store for PDF embedding
          document.fonts.add(face);
        } catch(e) {
          // Skip fonts that fail — some system fonts are restricted
        }
      }));
      loaded += batch.length;
      if (loaded % 100 === 0) {
        btn.textContent = `Loading... ${Math.round(loaded/fonts.length*100)}%`;
        await new Promise(r => setTimeout(r, 0)); // yield to UI
      }
    }

    populateFontDropdowns(families);
    _systemFontsLoaded = true;
    btn.textContent = `✓ ${families.length} fonts loaded`;
    btn.style.color = 'var(--green)';
    document.getElementById('system-font-note')?.remove();
    toast(`${families.length} system fonts ready`);
  } catch(e) {
    btn.textContent = 'Load system fonts';
    btn.disabled = false;
    if (e.name === 'NotAllowedError') {
      toast('Permission denied — click the address bar lock icon and allow Fonts access');
    } else {
      toast('Could not load system fonts: ' + e.message);
      populateFontDropdowns(GOOGLE_FONTS);
    }
  }
}

function populateFontDropdowns(families) {
  const dropdowns = ['fmt-name-font','fmt-body-font','fmt-heading-font','fmt-exp-font','fmt-role-font'];
  const keys = ['nameFont','bodyFont','headingFont','expFont','roleFont'];
  dropdowns.forEach((id, i) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = _fmt[keys[i]] || 'Arial';
    sel.innerHTML = families.map(f =>
      `<option value="${f}"${f === current ? ' selected' : ''}>${f}</option>`
    ).join('');
    // Apply the font name as a preview in each option where possible
    sel.style.fontFamily = current + ',Arial,sans-serif';
    sel.addEventListener('change', function() {
      this.style.fontFamily = this.value + ',Arial,sans-serif';
    });
  });
}

function initFontDropdowns() {
  populateFontDropdowns(GOOGLE_FONTS);
}

function exportWorkday() {
  console.log('exportWorkday called, proj=', !!proj);
  try {
    if (!proj) { alert('Open a project first'); return; }

    const ce = proj.ce || {};
    const contact = ce.contact || {};
    const lines = [];

    const name = ((contact.fname || '') + ' ' + (contact.lname || '')).trim();
    const jobTitle = proj.jdTitle || contact.title || '';
    const email = contact.email || '';
    const phone = contact.phone || '';
    const city = contact.city || '';
    const state = contact.state || '';
    const location = [city, state].filter(Boolean).join(', ');
    const linkedin = contact.linkedin || '';
    const website = contact.portfolio || '';

    // Contact — plain values, no labels
    if (name) lines.push(name);
    if (jobTitle) lines.push(jobTitle);
    if (email) lines.push(email);
    if (phone) lines.push(phone);
    if (location) lines.push(location);
    if (linkedin) lines.push(linkedin);
    if (website) lines.push(website);
    lines.push('');

    // Summary
    const summary = ce.summary || '';
    if (summary) { lines.push('Summary'); lines.push(summary.trim()); lines.push(''); }

    // Skills — flat, no category labels
    const skillGroups = ce.skillGroups || [];
    const allSkills = skillGroups.flatMap(sg => (sg.skills || []).map(s => typeof s === 'string' ? s : s.text || '').filter(Boolean));
    if (allSkills.length) {
      lines.push('Skills');
      lines.push('(Copy each skill individually into Workday\'s Skills field)');
      allSkills.forEach(s => lines.push('- ' + s));
      lines.push('');
    }

    // Work Experience — plain values in order: title, company, location, dates, description, bullets
    const roles = ce.roles || [];
    if (roles.length) {
      lines.push('Work Experience');
      lines.push('');
      roles.forEach(role => {
        const rawTitle = (role.title || '').trim();
        const company = (role.company || '').trim();
        const loc = (role.location || '').trim();

        // Workday parser splits on commas in titles — strip department suffix
        // e.g. "Senior Experience Design Manager, Financial Services" → "Senior Experience Design Manager"
        // Put the department in the role description instead
        const commaIdx = rawTitle.indexOf(',');
        const title = commaIdx > 0 ? rawTitle.substring(0, commaIdx).trim() : rawTitle;
        const dept = commaIdx > 0 ? rawTitle.substring(commaIdx + 1).trim() : '';
        const startDate = fmtWorkdayDate(role.startDate || '');
        const endDate = (!role.endDate || role.endDate === 'Present') ? 'Present' : fmtWorkdayDate(role.endDate);

        lines.push(title);
        lines.push(company);
        if (loc) lines.push(loc);
        if (startDate) lines.push(startDate + ' - ' + (endDate || ''));
        if (role.context) lines.push((dept ? dept + ' — ' : '') + role.context.trim());
        else if (dept) lines.push(dept);
        (role.bullets || []).forEach((b, i) => {
          const text = (typeof b === 'string' ? b : b.text || b.content || '').replace(/^[•\-\*]\s*/, '').trim();
          if (text) lines.push((i + 1) + '. ' + text);
        });
        lines.push('');
      });
    }

    // Education
    const edu = ce.edu || [];
    if (edu.length) {
      lines.push('Education');
      lines.push('');
      edu.forEach(e => {
        if (e.school) lines.push(e.school);
        if (e.degree) lines.push(e.degree);
        if (e.field) lines.push(e.field);
        if (e.year || e.endYear) lines.push(String(e.year || e.endYear));
        lines.push('');
      });
    }

    const text = lines.join('\n');
    const safeName = (name + (jobTitle ? '_' + jobTitle : '')).replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_');
    const fname = safeName + '_Workday.txt';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { document.body.removeChild(a); } catch(e) {} URL.revokeObjectURL(url); }, 100);
    if (typeof toast === 'function') toast('Workday export saved');
  } catch(err) {
    console.error('Workday export error:', err);
    alert('Export failed: ' + err.message);
  }
}
function fmtWorkdayDate(dateStr) {
  if (!dateStr) return '';
  // Handle MM/YYYY, MM-YYYY, Month YYYY, YYYY formats
  const clean = dateStr.trim();
  // Already MM/YYYY
  if (/^\d{2}\/\d{4}$/.test(clean)) return clean;
  // Convert month names: "Feb 2024" → "02/2024"
  const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  const m = clean.toLowerCase().match(/^([a-z]{3})\s+(\d{4})$/);
  if (m && months[m[1]]) return months[m[1]] + '/' + m[2];
  // "09/25" short year → "09/2025"  (handle 2-digit year)
  const short = clean.match(/^(\d{2})\/(\d{2})$/);
  if (short) return short[1] + '/20' + short[2];
  return clean;
}

// Format date for iCIMS — prefers "Mon YYYY" (e.g. "Feb 2024"), the form iCIMS parses most reliably.
function fmtIcimsDate(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // MM/YYYY -> "Mon YYYY"
  let m = clean.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) { const idx = parseInt(m[1],10)-1; if (idx>=0 && idx<12) return monthNames[idx] + ' ' + m[2]; }
  // MM/YY -> "Mon 20YY"
  m = clean.match(/^(\d{1,2})\/(\d{2})$/);
  if (m) { const idx = parseInt(m[1],10)-1; if (idx>=0 && idx<12) return monthNames[idx] + ' 20' + m[2]; }
  // "Feb 2024" already formatted — title-case it
  m = clean.match(/^([a-z]{3,9})\s+(\d{4})$/i);
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1, 3).toLowerCase() + ' ' + m[2];
  return clean;
}

function exportIcims() {
  try {
    if (!proj) { alert('Open a project first'); return; }

    const ce = proj.ce || {};
    const contact = ce.contact || {};
    const lines = [];

    const name = ((contact.fname || '') + ' ' + (contact.lname || '')).trim();
    const email = contact.email || '';
    const phone = contact.phone || '';
    const city = contact.city || '';
    const state = contact.state || '';
    const location = [city, state].filter(Boolean).join(', ');
    const linkedin = contact.linkedin || '';
    const website = contact.portfolio || '';

    // Contact block — name, then ATS-style "Field: value" pairs.
    // Labels (Phone:/Email:/LinkedIn:/Portfolio:) keep the parser from confusing the
    // portfolio URL with a company name elsewhere in the resume.
    if (name) lines.push(name);
    if (phone) lines.push('Phone: ' + phone);
    if (email) lines.push('Email: ' + email);
    if (location) lines.push('Location: ' + location);
    if (linkedin) lines.push('LinkedIn: ' + linkedin);
    if (website) lines.push('Portfolio: ' + website);
    lines.push('');

    // Professional Summary
    const summary = ce.summary || '';
    if (summary) {
      lines.push('Professional Summary');
      lines.push(summary.trim());
      lines.push('');
    }

    // Skills
    const skillGroups = ce.skillGroups || [];
    const skillsWithText = skillGroups.filter(sg => (sg.skills || []).some(s => (typeof s === 'string' ? s : s.text || '').trim()));
    if (skillsWithText.length) {
      lines.push('Skills');
      skillsWithText.forEach(sg => {
        const skillTexts = (sg.skills || []).map(s => typeof s === 'string' ? s : s.text || '').filter(Boolean);
        if (skillTexts.length) {
          const label = (sg.label || '').trim();
          lines.push(label ? `${label}: ${skillTexts.join(', ')}` : skillTexts.join(', '));
        }
      });
      lines.push('');
    }

    // Work Experience — listed OLDEST first (reverse of UI order).
    // iCIMS-style parsers dedupe by employer name and keep the last-encountered instance,
    // so listing oldest-first means the most recent role at each employer wins. This way
    // your current/most-recent roles are the ones that populate the form, not the oldest.
    const roles = (ce.roles || []).slice().reverse();
    if (roles.length) {
      lines.push('Work Experience');
      lines.push('');
      roles.forEach((role, idx) => {
        const rawTitle = (role.title || '').trim();
        const company = (role.company || '').trim();
        const loc = (role.location || '').trim();
        const startDate = fmtIcimsDate(role.startDate || '');
        const endDate = (!role.endDate || /^present$/i.test(role.endDate)) ? 'Present' : fmtIcimsDate(role.endDate);

        // Strict 4-line role header so the parser locks onto each field
        if (rawTitle) lines.push(rawTitle);
        if (company) lines.push(company);
        if (loc) lines.push(loc);
        if (startDate) lines.push(startDate + ' - ' + (endDate || 'Present'));

        if (role.context && role.context.trim()) lines.push(role.context.trim());

        // ASCII bullets — most parsers handle * more reliably than •
        (role.bullets || []).forEach(b => {
          const text = (typeof b === 'string' ? b : b.text || b.content || '').replace(/^[•\-\*]\s*/, '').trim();
          if (text) lines.push('* ' + text);
        });
        // Hard separator between roles. Most parsers treat blank-line + separator as a strong boundary.
        if (idx < roles.length - 1) {
          lines.push('');
          lines.push('---');
          lines.push('');
        } else {
          lines.push('');
        }
      });
    }

    // Education
    const edu = ce.edu || [];
    const eduWithContent = edu.filter(e => e.school || e.degree || e.field || e.year || e.endYear);
    if (eduWithContent.length) {
      lines.push('Education');
      lines.push('');
      eduWithContent.forEach(e => {
        const left = [e.degree, e.field].filter(Boolean).join(', ').trim();
        const year = (e.year || e.endYear || '').toString().trim();
        const right = [e.school, year].filter(Boolean).join(', ').trim();
        if (left && right) lines.push(left + ' - ' + right);
        else if (left) lines.push(left);
        else if (right) lines.push(right);
        lines.push('');
      });
    }

    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    const text = lines.join('\n');

    const jobTitle = proj.jdTitle || '';
    const safeName = (name + (jobTitle ? '_' + jobTitle : '')).replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_');
    const fname = safeName + '_iCIMS.txt';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { document.body.removeChild(a); } catch(e) {} URL.revokeObjectURL(url); }, 100);
    if (typeof toast === 'function') toast('iCIMS export saved');
  } catch(err) {
    console.error('iCIMS export error:', err);
    alert('Export failed: ' + err.message);
  }
}

function toggleDownloadMenu(e) {
  e.stopPropagation();
  const dd = document.getElementById('download-dropdown');
  if (!dd) return;
  const isOpen = dd.style.display === 'block';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => document.addEventListener('click', closeDownloadMenu, {once:true}), 0);
  }
}
function closeDownloadMenu() {
  const dd = document.getElementById('download-dropdown');
  if (dd) dd.style.display = 'none';
}

// Dynamically loads a Google Font if it isn't already linked. Called whenever the user picks
// a font from any dropdown so fonts appear immediately without pre-loading all of them.
function loadGoogleFont(family) {
  if (!family || !GOOGLE_FONTS.includes(family)) return; // system font or not in list
  const id = 'gf-' + family.replace(/\s+/g, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g,'+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300;1,400;1,700&display=swap`;
  document.head.appendChild(link);
}

function fmtSetTypo(key, val) {
  _fmt[key] = val;
  if (key === 'bodyFont') _fmt.font = val;
  // Name font drives heading font — they always match
  if (key === 'nameFont') {
    _fmt.headingFont = val;
    const hEl = document.getElementById('fmt-heading-font');
    if (hEl) hEl.value = val;
    loadGoogleFont(val);
  }
  if (typeof val === 'string' && key.toLowerCase().includes('font')) loadGoogleFont(val);
  updateLivePreview();
}

// Toggle horizontal divider lines on/off
function fmtToggleDividerLines() {
  _fmt.showDividerLines = !_fmt.showDividerLines;
  const on = _fmt.showDividerLines;
  const label = document.getElementById('divider-lines-label');
  const track = document.getElementById('divider-lines-track');
  const thumb = document.getElementById('divider-lines-thumb');
  if (label) label.textContent = on ? 'On' : 'Off';
  if (track) track.style.background = on ? 'var(--teal)' : '#bbb';
  if (thumb) thumb.style.left = on ? '18px' : '2px';
  updateLivePreview();
}

function fmtSetSize(key, val) {
  const n = parseInt(val);
  if (isNaN(n)) return;
  _fmt[key] = n;
  if (key === 'bodySize') _fmt.size = n + 'pt';
  updateLivePreview();
}

function restoreFmt(saved) {
  // Merge saved values into _fmt
  Object.assign(_fmt, saved);

  // Migrate any deprecated template IDs (Classic, Executive, Modern, Minimal, Bold Line, Compact, Ruled)
  // from older saved projects → coerce to 'standard' so rendering doesn't break.
  const validTemplates = ['standard', 'professional'];
  if (!validTemplates.includes(_fmt.template)) _fmt.template = 'standard';

  // Sync accent color chips
  document.querySelectorAll('[id^="ac-"]').forEach(b => b.classList.remove('active'));
  const acMatch = document.querySelector(`[onclick*="fmtSetAccent('${_fmt.accent}"]`);
  if (acMatch) acMatch.classList.add('active');

  // Sync template selection
  renderTemplateGrid();

  // Sync size inputs
  const sizeMap = {
    'fmt-name-size': 'nameSize',
    'fmt-body-size': 'bodySize',
    'fmt-heading-size': 'headingSize',
    'fmt-exp-size': 'expSize',
    'fmt-exp-role-size': 'expRoleSize',
    'fmt-role-size': 'roleSize',
    'fmt-skills-size': 'skillsSize',
    'fmt-summary-heading-size': 'summaryHeadingSize',
    'fmt-skills-heading-size': 'skillsHeadingSize',
    'fmt-experience-heading-size': 'experienceHeadingSize',
    'fmt-expertise-heading-size': 'expertiseHeadingSize',
  };
  Object.entries(sizeMap).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el && _fmt[key] !== undefined) el.value = _fmt[key];
  });

  // Sync font dropdowns (after initFontDropdowns populates them)
  const fontMap = {
    'fmt-name-font': 'nameFont',
    'fmt-body-font': 'bodyFont',
    'fmt-heading-font': 'headingFont',
    'fmt-exp-font': 'expFont',
    'fmt-role-font': 'roleFont',
  };
  Object.entries(fontMap).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el && _fmt[key]) {
      // Try to select the saved font; add it if not in list
      const existing = Array.from(el.options).find(o => o.value === _fmt[key]);
      if (!existing) {
        const opt = document.createElement('option');
        opt.value = _fmt[key]; opt.textContent = _fmt[key];
        el.insertBefore(opt, el.firstChild);
      }
      el.value = _fmt[key];
      el.style.fontFamily = _fmt[key] + ',Arial,sans-serif';
    }
  });
  
  // Pre-load any Google Fonts referenced in this project's saved settings
  ['nameFont','bodyFont','headingFont','expFont','roleFont'].forEach(k => {
    if (_fmt[k]) loadGoogleFont(_fmt[k]);
  });

  // Sync weight/style dropdowns
  const selectSyncMap = {
    'fmt-name-weight': 'nameFontWeight',
    'fmt-name-style':  'nameFontStyle',
    'fmt-title-weight':'titleFontWeight',
    'fmt-title-style': 'titleFontStyle',
    'fmt-title-letter-spacing': 'titleLetterSpacing',
    'fmt-heading-weight': 'headingFontWeight',
    'fmt-heading-letter-spacing': 'headingLetterSpacing',
    'fmt-divider-width': 'dividerLineWidth',
    'fmt-divider-opacity': 'dividerLineOpacity',
  };
  Object.entries(selectSyncMap).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el && _fmt[key] !== undefined) el.value = String(_fmt[key]);
  });

  // Sync divider lines toggle
  const on = _fmt.showDividerLines !== false;
  const lbl = document.getElementById('divider-lines-label');
  const trk = document.getElementById('divider-lines-track');
  const thm = document.getElementById('divider-lines-thumb');
  if (lbl) lbl.textContent = on ? 'On' : 'Off';
  if (trk) trk.style.background = on ? 'var(--teal)' : '#bbb';
  if (thm) thm.style.left = on ? '18px' : '2px';

  // Sync font size chips
  document.querySelectorAll('#view-format .fmt-chip-row .fmt-chip').forEach(b => {
    if (b.onclick?.toString().includes('fmtSetProp')) b.classList.remove('active');
  });

  // Sync margin chips
  document.querySelectorAll('.fmt-chip-row .fmt-chip').forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    if (oc.includes("fmtSetProp('margin'")) {
      b.classList.toggle('active', oc.includes("'" + _fmt.margin + "'"));
    }
  });

  // Sync bg color
  const bgPicker = document.getElementById('fmt-bg-color');
  const bgHex = document.getElementById('fmt-bg-hex');
  if (bgPicker) bgPicker.value = _fmt.bgColor || '#ffffff';
  if (bgHex) bgHex.value = _fmt.bgColor || '#ffffff';
  document.querySelectorAll('.fmt-color-presets .fmt-color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === _fmt.bgColor);
  });

  // Sync text color
  const tcPicker = document.getElementById('fmt-text-color');
  const tcHex = document.getElementById('fmt-text-hex');
  if (tcPicker) tcPicker.value = _fmt.textColor || '#111111';
  if (tcHex) tcHex.value = _fmt.textColor || '#111111';

  // Re-render preview with restored settings
  updateLivePreview();
}

function onHexInput(input, colorPickerId, type) {
  const val = input.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    document.getElementById(colorPickerId).value = val;
    input.style.borderColor = '';
    if (type === 'bg') fmtSetBg(val);
    else if (type === 'text') fmtSetTextColor(val);
    else if (type === 'accent') fmtSetAccent(val, null);
  } else {
    input.style.borderColor = val.length >= 7 ? 'var(--red)' : '';
  }
}

function fmtSetBg(val) {
  _fmt.bgColor = val;
  document.querySelectorAll('.fmt-color-presets .fmt-color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === val);
  });
  updateLivePreview();
}

function fmtSetBgSwatch(val, el) {
  _fmt.bgColor = val;
  document.getElementById('fmt-bg-color').value = val;
  document.getElementById('fmt-bg-hex').value = val;
  document.querySelectorAll('.fmt-color-presets .fmt-color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  updateLivePreview();
}

function fmtSetTextColor(val) {
  _fmt.textColor = val;
  updateLivePreview();
}

function fmtSetTextSwatch(val, el) {
  _fmt.textColor = val;
  document.getElementById('fmt-text-color').value = val;
  document.getElementById('fmt-text-hex').value = val;
  document.querySelectorAll('#fmt-text-color ~ .fmt-color-presets .fmt-color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  updateLivePreview();
}
function fmtTabSet(k,v,btn){if(k==='layout')selectTemplate(v);else fmtSetProp(k,v,btn);}

function openFormatModal(){switchTab('format');}
function closeFmt(){}
// ─────────────────────────────────────────────────────────
//  LIVE PREVIEW (right panel when Format tab active)
// ─────────────────────────────────────────────────────────
function updateLivePreview() {
  console.log('DEBUG updateLivePreview: CALLED, proj.drafts.length:', proj?.drafts?.length);
  
  // CRITICAL FIX: Reload project from localStorage to ensure we have the latest drafts
  // The in-memory proj object can become stale when switching tabs
  if (proj?.id) {
    const freshProj = ProjectStore.load(proj.id);
    if (freshProj && freshProj.drafts && freshProj.drafts.length > proj.drafts.length) {
      console.log('DEBUG updateLivePreview: Reloading project from storage, was v' + proj.drafts.length + ' now v' + freshProj.drafts.length);
      proj = freshProj;
    }
  }
  
  const text = getResumeText();
  console.log('DEBUG updateLivePreview: got text, first 50 chars:', text?.substring(0, 50) || '(empty)');
  const page = document.getElementById('fmt-preview-page');
  if (!page) {
    console.log('DEBUG updateLivePreview: ERROR - fmt-preview-page not found!');
    return;
  }
  if (!text) {
    console.log('DEBUG updateLivePreview: ERROR - text is empty!');
    page.innerHTML = '<div style="padding:2rem;text-align:center;color:#aaa;font-size:13px;">Generate a resume first to see the preview.</div>';
    return;
  }
  const sections = fmtParseText(text);
  const html = fmtRenderSections(sections);
  applyPreviewToPages(html);
}

// In-page units. CSS uses physical inches at 96 CSS DPI.
const PAGE_WIDTH_IN = 8.5;
const PAGE_HEIGHT_IN = 11;

// Rebuilds the print-preview pages. Renders all content into a hidden measuring page at full
// 8.5" width, splits children across multiple page elements when content exceeds 11" of vertical
// height, then applies a CSS transform: scale(N) so the pages fit the preview panel width while
// the page itself stays at literal Letter dimensions. Result reads as a true print preview.
function applyPreviewToPages(html) {
  const wrapper = document.getElementById('fmt-preview-pages-wrapper');
  if (!wrapper) return;
  // Extend bgColor to the outer gutter so margins match the page background.
  const bg = _fmt.bgColor || '#ffffff';
  const livePreview = document.getElementById('fmt-live-preview');
  if (livePreview) livePreview.style.background = bg;
  wrapper.style.background = bg;
  // Per-page styles. The single page becomes one tall continuous render with dashed boundary
  // lines drawn over it at every US Letter (8.5in × 11in) interval so the user can see where
  // the printer will split pages.
  const pageStyle = {
    fontFamily: _fmt.bodyFont + ',Arial,sans-serif',
    fontSize: _fmt.size,
    padding: `0.5in`,
    lineHeight: _fmt.template === 'compact' ? '1.3' : '1.35',
    background: _fmt.bgColor || '#ffffff',
    color: _fmt.textColor || '#111111',
  };

  // Single tall page. width is fixed at 8.5in so pagination boundaries land at deterministic
  // pixel offsets (multiples of 11in). height auto so the page grows with content.
  wrapper.innerHTML = '';
  const slot = document.createElement('div');
  slot.className = 'fmt-preview-page-slot';
  const pageEl = document.createElement('div');
  pageEl.className = 'fmt-preview-page';
  pageEl.id = 'fmt-preview-page';
  Object.assign(pageEl.style, pageStyle, {
    width: PAGE_WIDTH_IN + 'in',
    height: 'auto',           // override the .fmt-preview-page CSS that fixes height to 11in
    minHeight: PAGE_HEIGHT_IN + 'in',
    overflow: 'visible',
    position: 'relative',     // so absolutely-positioned page-break lines pin to the page
  });
  pageEl.innerHTML = html;
  slot.appendChild(pageEl);
  wrapper.appendChild(slot);

  drawPageBreakLinesOnPage(pageEl);
  scalePreviewPages();
}

// Draws dashed horizontal lines across the page at every 11in (US Letter page height) so the
// user can see where the print engine will break pages. Lines are absolutely positioned inside
// the page element. They have class 'page-break-line' which is excluded from print via
// @media print, so PDF output remains clean.
// Computes total years of experience from the earliest role start date in the Content Editor.
// Start dates are stored as 'MM/YY' (e.g. '06/07' = June 2007). Two-digit years follow the
// standard convention: 00-69 → 2000-2069, 70-99 → 1970-1999. Returns 0 if no roles or unparseable.
function computeYearsOfExperience() {
  const roles = proj?.ce?.roles || [];
  if (!roles.length) return 0;
  let earliest = null;
  for (const r of roles) {
    const sd = (r?.startDate || '').trim();
    if (!sd) continue;
    // Accept MM/YY, MM/YYYY, M/YY, M/YYYY
    const m = sd.match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
    if (!m) continue;
    let yr = parseInt(m[2], 10);
    if (yr < 100) yr += (yr < 70 ? 2000 : 1900);
    const mo = Math.max(1, Math.min(12, parseInt(m[1], 10) || 1));
    const d = new Date(yr, mo - 1, 1);
    if (!earliest || d < earliest) earliest = d;
  }
  if (!earliest) return 0;
  const now = new Date();
  return Math.max(0, (now - earliest) / (365.25 * 24 * 60 * 60 * 1000));
}

// Returns the number of pages a resume of this experience level should target.
// Uses RESUME_LENGTH module for consistency with auto-trim pipeline.
// <5y=1pg, 5-10y=2pg, 10-15y=2pg, 15-20y=2pg, 20+y=3pg
function recommendedMaxPages() {
  try {
    const resume = getResumeText();
    if (resume && typeof RESUME_LENGTH !== 'undefined') {
      const analysis = RESUME_LENGTH.analyze(resume);
      return analysis.recommended.max;
    }
  } catch(e) { /* fall through to legacy logic */ }
  const yoe = computeYearsOfExperience();
  return yoe >= 10 ? 2 : 1;
}

function drawPageBreakLinesOnPage(pageEl) {
  if (!pageEl) return;
  pageEl.querySelectorAll('.page-break-line, .max-length-line').forEach(el => el.remove());
  const PAGE_HEIGHT_PX = PAGE_HEIGHT_IN * 96;
  const totalHeight = pageEl.scrollHeight;
  
  // Preview's pageEl has 0.5in padding INSIDE it, so content actually starts marginPx below
  // the top edge. We need to offset all page break indicators by marginPx so they line up
  // with where content actually breaks visually.
  const marginPx = 0.5 * 96; // 48px — matches the hardcoded preview padding
  const contentAreaPx = PAGE_HEIGHT_PX - (2 * marginPx); // 960px usable per page
  
  // First page break appears at: top padding + 1 page of content area = end of page 1 content
  // Subsequent breaks step by contentAreaPx (in continuous flow, pages have no inter-page gaps)
  let y = marginPx + contentAreaPx; // e.g., 48 + 960 = 1008
  let pageNum = 2;
  while (y < totalHeight) {
    const line = document.createElement('div');
    line.className = 'page-break-line';
    line.style.cssText = `position:absolute;left:0;right:0;top:${y}px;height:0;border-top:1px dashed #aaa;pointer-events:none;z-index:5;`;
    const label = document.createElement('span');
    label.style.cssText = 'position:absolute;right:8px;top:-9px;font-size:9px;color:#888;background:#fff;padding:0 4px;font-family:system-ui,sans-serif;';
    label.textContent = `Page ${pageNum}`;
    line.appendChild(label);
    pageEl.appendChild(line);
    y += contentAreaPx;
    pageNum++;
  }

  // Max-length indicator at top padding + maxPages of content area
  const maxPages = recommendedMaxPages();
  if (maxPages > 0) {
    const maxY = marginPx + (maxPages * contentAreaPx); // e.g., 48 + 2*960 = 1968
    const line = document.createElement('div');
    line.className = 'max-length-line';
    line.style.cssText = `position:absolute;left:0;right:0;top:${maxY}px;height:0;border-top:2px dashed #dc2626;pointer-events:none;z-index:6;`;
    const label = document.createElement('span');
    label.style.cssText = 'position:absolute;left:8px;top:-10px;font-size:10px;color:#dc2626;background:#fff;padding:0 6px;font-family:system-ui,sans-serif;font-weight:600;';
    label.textContent = `Max recommended length (${maxPages} page${maxPages > 1 ? 's' : ''})`;
    line.appendChild(label);
    pageEl.appendChild(line);
  }
}

// Computes the scale factor so the 8.5in page fits the preview panel width, then applies the
// transform. Slot reserves the scaled height of the actual content (which can exceed 11in for
// multi-page resumes).
function scalePreviewPages() {
  const wrapper = document.getElementById('fmt-preview-pages-wrapper');
  const previewEl = document.getElementById('fmt-live-preview');
  if (!wrapper || !previewEl) return;
  const previewStyle = getComputedStyle(previewEl);
  const padL = parseFloat(previewStyle.paddingLeft) || 0;
  const padR = parseFloat(previewStyle.paddingRight) || 0;
  const availableWidth = previewEl.clientWidth - padL - padR - 8;
  const PAGE_WIDTH_PX = PAGE_WIDTH_IN * 96;
  const scale = Math.max(0.1, Math.min(1, availableWidth / PAGE_WIDTH_PX));
  const slot = wrapper.querySelector('.fmt-preview-page-slot');
  if (!slot) return;
  const page = slot.querySelector('.fmt-preview-page');
  if (!page) return;
  page.style.transform = `scale(${scale})`;
  // The single page can be taller than 11in. Reserve actual scaled content height.
  const contentHeight = page.scrollHeight;
  slot.style.width = (PAGE_WIDTH_PX * scale) + 'px';
  slot.style.height = (contentHeight * scale) + 'px';
}

// Re-scale on window resize so the preview tracks the panel width.
window.addEventListener('resize', () => {
  // Debounce so rapid resize doesn't thrash
  clearTimeout(window._previewResizeTimer);
  window._previewResizeTimer = setTimeout(scalePreviewPages, 60);
});

// Legacy stub kept so other callers don't break — paginatePreview now handles boundaries.
function drawPageBreakLines() {}

// Adds a non-printing overlay of dashed horizontal lines on the preview page at every US Letter
// boundary. (Replaced by paginatePreview in 2.4.71 — kept as no-op alias above for safety.)

function showFmtPreviewPanel(show) {
  const previewEl = document.getElementById('fmt-live-preview');
  const bodyEl = document.getElementById('resume-panel-body');
  const footEl = document.getElementById('resume-foot');
  const headBtn = document.querySelector('.resume-panel-head .btn-secondary');
  if (!previewEl || !bodyEl) {
    console.log('DEBUG showFmtPreviewPanel: ERROR - elements not found');
    return;
  }
  if (show) {
    console.log('DEBUG showFmtPreviewPanel: SHOWING preview, hiding body');
    bodyEl.style.display = 'none';
    if (footEl) footEl.style.display = 'none';
    previewEl.classList.add('show');
    console.log('DEBUG showFmtPreviewPanel: previewEl classes:', previewEl.className, 'computed display:', getComputedStyle(previewEl).display);
    updateLivePreview();
    renderTemplateGrid();
  } else {
    console.log('DEBUG showFmtPreviewPanel: HIDING preview, showing body');
    bodyEl.style.display = '';
    const draft = getResumeText();
    if (draft && footEl) footEl.style.display = 'flex';
    previewEl.classList.remove('show');
    console.log('DEBUG showFmtPreviewPanel: bodyEl display:', bodyEl.style.display, 'computed:', getComputedStyle(bodyEl).display);
  }
}

function fmtParseText(text){const lines=text.split('\n');const sections=[];let cur={type:'header',lines:[]};let hD=false;const isH=l=>{const t=l.trim();return t.length>2&&t===t.toUpperCase()&&/[A-Z]/.test(t)&&!t.startsWith('•')&&!t.startsWith('-');};for(const line of lines){if(!hD&&isH(line)&&cur.lines.length>0){sections.push(cur);hD=true;cur={type:'section',heading:line.trim(),lines:[]};}else if(hD&&isH(line)){sections.push(cur);cur={type:'section',heading:line.trim(),lines:[]};}else cur.lines.push(line);}sections.push(cur);return sections;}
function fmtLinkify(raw) {
  // Works on UNESCAPED text. Finds URLs/emails, wraps in <a>, escapes everything else.
  const LS = 'color:inherit;text-decoration:none;';
  const ESC = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Token pattern: email | full URL | linkedin.com/... | bare domain.tld
  const TOKEN = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})|(https?:\/\/[^\s·•,]+)|(www\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\/[^\s·•,]*)?)|((?:linkedin|github|dribbble)\.com\/[^\s·•,]+)|([a-zA-Z0-9][a-zA-Z0-9\-]*\.(?:com|io|co|net|org|design|me|dev|studio|app|site|pro|co|us|ca|uk|au|info|biz)(?:\/[^\s·•,]*)?)/gi;

  let result = '';
  let last = 0;
  let m;
  while ((m = TOKEN.exec(raw)) !== null) {
    result += ESC(raw.slice(last, m.index));
    const match = m[0];
    if (m[1]) {
      // Email
      result += `<a href="mailto:${ESC(match)}" style="${LS}">${ESC(match)}</a>`;
    } else if (m[2]) {
      // Full https?:// URL
      result += `<a href="${ESC(match)}" style="${LS}">${ESC(match)}</a>`;
    } else {
      // www.* or linkedin/github/etc or bare domain — all need https:// prepended
      result += `<a href="https://${ESC(match)}" style="${LS}">${ESC(match)}</a>`;
    }
    last = m.index + match.length;
  }
  result += ESC(raw.slice(last));
  return result;
}function fmtRenderSections(secs){
  const layout=_fmt.template;
  const accent=_fmt.accent, size=_fmt.size;
  const font=_fmt.bodyFont||_fmt.font||'Arial';
  const nameFont=_fmt.nameFont||font;
  const headingFont=_fmt.headingFont||font;
  const expFont=_fmt.expFont||font;
  const namePx=(_fmt.nameSize||28)+'pt';
  const headingPx=(_fmt.headingSize||11)+'pt';
  const expPx=(_fmt.expSize||12)+'pt';
  const rolePx=(_fmt.roleSize||11)+'pt';          // resume title (under person's name)
  const expRolePx=(_fmt.expRoleSize||11)+'pt';    // role titles within experience entries
  const roleFont=_fmt.roleFont||expFont;
  const nameWeight=_fmt.nameFontWeight||700;
  const nameStyle=_fmt.nameFontStyle||'normal';
  const titleWeight=_fmt.titleFontWeight||400;
  const titleStyle=_fmt.titleFontStyle||'normal';
  const e=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const sidKws=['CORE COMPETENCIES','SKILLS','COMPETENCIES','EDUCATION','CERTIFICATIONS','AWARDS','HONORS'];
  const sidS=secs.filter(s=>s.type==='section'&&sidKws.some(k=>(s.heading||'').includes(k)));
  const mainS=secs.filter(s=>!sidS.includes(s));
  function rSec(sec){if(sec.type==='header'){const hl=sec.lines.filter(l=>l.trim());if(!hl.length)return'';const name=hl[0];const rest=hl.slice(1);
    const contactHtml=rest.map(l=>`<div style="font-size:.82em;color:${layout==='modern'?'rgba(255,255,255,.85)':'#555'};margin-top:2px;">${fmtLinkify(l)}</div>`).join('');
    if(layout==='modern')return`<div style="background:${accent};color:#fff;padding:0.3in 0.4in 0.2in;margin:-${_fmt.margin} -${_fmt.margin} 0.2in;font-family:${font},Arial,sans-serif;"><div style="font-size:1.8em;font-weight:700;letter-spacing:-.01em;">${e(name)}</div>${contactHtml}</div>`;
    if(layout==='boldline')return`<div style="display:flex;gap:10px;margin-bottom:.2in;padding-bottom:.1in;border-bottom:1px solid #ddd;"><div style="width:4px;background:${accent};border-radius:2px;flex-shrink:0;"></div><div><div style="font-size:${namePx};font-weight:700;font-family:${nameFont},Arial,sans-serif;">${e(name)}</div>${contactHtml}</div></div>`;
    if(layout==='executive')return`<div style="text-align:center;margin-bottom:.2in;"><div style="font-size:${namePx};font-weight:700;font-family:${nameFont},Arial,sans-serif;letter-spacing:.02em;">${e(name)}</div><div style="height:2px;background:${accent};margin:.1in auto .05in;width:80%;"></div><div style="height:1px;background:#bbb;width:50%;margin:0 auto .1in;"></div>${contactHtml}</div>`;
    if(layout==='minimal')return`<div style="margin-bottom:.25in;"><div style="font-size:${namePx};font-weight:700;font-family:${nameFont},Arial,sans-serif;">${e(name)}</div>${contactHtml}</div>`;
    if(layout==='standard'){
      // Split-header layout: name + title on the left, contact column on the right.
      // Contact items are right-aligned and stacked vertically. The phone number's cap-height
      // aligns visually with the name's cap-height because we use align-items:flex-start.
      // First line after name is treated as title (job title), rest are contact lines.
      // A "title" is a short non-link, non-email, non-phone, non-address line.
      const isContact=(s)=>/[@]|^\+?[\d\s().-]{7,}$|^\d|http|www\.|\.com|\.io|\.co|linkedin|github|^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}$/i.test(s.trim());
      // Read job title from CE data directly when available — this bypasses fmtParseText
      // which would misclassify an all-caps title like "DESIGN" as a section heading.
      const ceTitle = (proj?.ce?.contact?.title || '').trim();
      let title = '';
      let contactLines = rest.slice();
      if (ceTitle) {
        title = ceTitle;
        // rest is all contact lines (title was not emitted into the text)
      } else if (rest.length > 0 && !isContact(rest[0]) && rest[0].trim().length < 60) {
        title = rest[0];
        contactLines = rest.slice(1);
      }
      // Split each contact line by separators (· | ,) so each contact item ends up on its own
      // right-aligned line. Source resumes often have "email | phone | location" — we want
      // them stacked vertically per the new design.
      const contactItems = contactLines.flatMap(line =>
        line.split(/\s*[·|]\s*/).map(s => s.trim()).filter(Boolean)
      );
      // All contact items use body text color — no special link color in the contact section.
      const contactTextColor = _fmt.textColor || '#111';
      const contactHtml=contactItems.map(item=>{
        return `<div style="font-size:${size};font-family:${font},Arial,sans-serif;color:${contactTextColor};line-height:1.55;">${fmtLinkify(item)}</div>`;
      }).join('');
      const titleLS = _fmt.titleLetterSpacing || '0.05em';
      const titleHtml=title?`<div style="font-size:${rolePx};font-weight:${titleWeight};font-style:${titleStyle};color:#666;letter-spacing:${titleLS};margin-top:.06in;font-family:${roleFont},Arial,sans-serif;line-height:1.0;">${e(title)}</div>`:'';
      const showLines = _fmt.showDividerLines !== false;
      const lineW2 = (_fmt.dividerLineWidth || '1') + 'px';
      const lineOp2 = _fmt.dividerLineOpacity !== undefined ? _fmt.dividerLineOpacity : 1;
      const lineColor2 = `rgba(80,80,80,${lineOp2})`;
      return`<div style="display:flex;justify-content:space-between;align-items:center;gap:.4in;margin-top:0;${showLines ? `border-bottom:${lineW2} solid ${lineColor2};padding-bottom:.08in;margin-bottom:.05in;` : 'margin-bottom:.18in;'}">
        <div style="flex:1;min-width:0;">
          <div style="font-size:${namePx};font-weight:${nameWeight};font-style:${nameStyle};letter-spacing:-.01em;font-family:${nameFont},Arial,sans-serif;color:#111;line-height:1.0;">${e(name)}</div>
          ${titleHtml}
        </div>
        <div style="text-align:right;flex-shrink:0;">${contactHtml}</div>
      </div>`;
    }
    if(layout==='professional'){
      // Per Bug 58: email/phone/location in black, portfolio + LinkedIn in blue, nothing underlined.
      const profContact=rest.map(l=>{
        const trimmed=l.trim();
        const isLink=/http|www\.|\.com|\.io|\.co|linkedin|github/i.test(trimmed) && !trimmed.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        const color=isLink?'#1a5fa5':'#111';
        return `<div style="font-size:${size};font-family:${font},Arial,sans-serif;color:${color};margin-top:2px;line-height:1.5;text-align:center;">${fmtLinkify(l)}</div>`;
      }).join('');
      return`<div style="text-align:center;margin-bottom:.12in;">
        <div style="font-size:${namePx};font-weight:700;letter-spacing:-.01em;font-family:${nameFont},Arial,sans-serif;color:#111;margin-bottom:.06in;">${e(name)}</div>
        ${profContact}
      </div>`;
    }
    // classic, compact, ruled — centered with bottom border
    return`<div style="text-align:center;margin-bottom:.15in;padding-bottom:.1in;border-bottom:${layout==='ruled'?'3':'2'}px solid ${accent};"><div style="font-size:${namePx};font-weight:700;font-family:${nameFont},Arial,sans-serif;">${e(name)}</div>${contactHtml}</div>`;
  }
  // Helper: split a line into left + right around the date/location
  function splitLeftRight(t) {
    // Find the date segment. Supports:
    // - MM/YY or MM/YYYY ranges
    // - 4-digit year ranges (2024 – 2026)
    // - Either format ending in Present/Current/Now
    // - Wide-gap split (2+ spaces) for any tail string
    const dateRange = /(?:\d{1,2}\/\d{2,4}|\d{4})\s*[-–—]\s*(?:\d{1,2}\/\d{2,4}|\d{4}|Present|Current|Now)(?:\s*[-–·,]\s*.+)?/i;
    const singleDate = /(?:\d{1,2}\/\d{2,4}|\d{4})/;
    const m = t.match(/^(.+?)\s{2,}((?:\d{1,2}\/\d{2,4}|\d{4}).+)$/) ||
              t.match(new RegExp(`^(.+?)\\s+(${dateRange.source})$`, 'i')) ||
              t.match(new RegExp(`^(.+?)\\s+(${singleDate.source}\\s*[-–—]\\s*(?:Present|Current|Now)(?:\\s*[-–·,]\\s*.+)?)$`, 'i'));
    if (m) return { left: m[1].trim(), right: m[2].trim() };
    return null;
  }

  // Parse a job header that may be a single line OR two consecutive lines.
  // Single-line: "Role · Company    MM/YY – MM/YY · City, ST"
  // Two-line:    line1 = "Company    MM/YY – MM/YY"
  //              line2 = "Role       City, ST"
  function parseJobHeader(line1, line2) {
    // Canonical form first: "Title · Company · Dates · Location" (any order works as long as
    // the date chunk is detectable by regex). This matches what buildResumeTextFromCE produces.
    // We split on " · ", find the chunk containing a date pattern, and assign:
    //   chunk before date → title (and possibly company)
    //   the date chunk    → dates
    //   chunks after date → location
    const dotChunks = line1.split(/\s+·\s+/).map(s => s.trim()).filter(Boolean);
    if (dotChunks.length >= 3) {
      const datePattern = /^(?:\d{1,2}\/\d{2,4}|\d{4})\s*[-–—]\s*(?:\d{1,2}\/\d{2,4}|\d{4}|Present|Current|Now)$/i;
      const dateIdx = dotChunks.findIndex(c => datePattern.test(c));
      if (dateIdx > 0) {
        // Everything before the date — last one is company, rest joined is title.
        const beforeDate = dotChunks.slice(0, dateIdx);
        const role = beforeDate.length >= 2
          ? beforeDate.slice(0, -1).join(' · ').trim()
          : beforeDate[0].trim();
        const company = beforeDate.length >= 2 ? beforeDate[beforeDate.length - 1].trim() : '';
        const dates = dotChunks[dateIdx];
        const location = dotChunks.slice(dateIdx + 1).join(', ').trim();
        return { company, dates, role, location, consumed: 1 };
      }
    }

    const lr1 = splitLeftRight(line1);
    if (!lr1) return null;

    // Check if line1 left side contains · meaning "Role · Company" format
    const dotParts = lr1.left.split(/\s+·\s+/);
    if (dotParts.length >= 2) {
      // Single-line format: "Role · Company    date · location"
      // Last part = company, everything before = role
      const company = dotParts[dotParts.length - 1].trim();
      const role = dotParts.slice(0, -1).join(' · ').trim();
      // Right side: "MM/YY – MM/YY · City, ST"
      const rightParts = lr1.right.split(/\s+·\s+/);
      const dates = rightParts[0].trim();
      const location = rightParts.slice(1).join(' · ').trim();
      return { company, dates, role, location, consumed: 1 };
    }

    // Two-line format: line1 = "Company   dates", line2 = "Role   location"
    // Only consume line2 if it looks like a job title line:
    // either has a right-aligned location, or is a short non-sentence line
    if (line2) {
      const lr2 = splitLeftRight(line2);
      if (lr2) {
        // Confirm right side looks like a location (City, ST) or date
        const looksLikeLocation = /^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}/.test(lr2.right) || /\d{2}\/\d{2}/.test(lr2.right);
        if (looksLikeLocation) {
          return { company: lr1.left, dates: lr1.right, role: lr2.left, location: lr2.right, consumed: 2 };
        }
      }
      // line2 has no right side but is short — treat as role only if it looks like a title
      // (no lowercase words suggesting it's a sentence/bullet)
      const isTitle = line2.length < 80 && !/\b(the|and|for|with|across|through|by|in|of|to|a|an)\b/.test(line2);
      if (isTitle) {
        return { company: lr1.left, dates: lr1.right, role: line2, location: '', consumed: 2 };
      }
    }

    // Single line, no · in left — treat left as ROLE (company was blank)
    // Right side may contain location after ·
    const rightParts = lr1.right.split(/\s+·\s+/);
    const dates = rightParts[0].trim();
    const location = rightParts.slice(1).join(' · ').trim();
    return { company: '', dates, role: lr1.left, location, consumed: 1 };
  }

  // For professional + standard: process lines in pairs (company+date / role+location)
  let body;
  // Helper: wrapped skill grid with • separators. Used for SKILLS-type sections in both layouts.
  // A "skills line" looks like "Leadership: A, B, C" or just "A, B, C" (when label was stripped).
  const isSkillsSection = /SKILLS|COMPETENCIES/i.test(sec.heading || '');
  // Chip size is controlled by _fmt.skillsSize. Use pt (not px) to match the body text unit so a
  // user-set size of 10 in the input renders the same physical size as the body text at 10.
  const chipPt = (Number(_fmt.skillsSize) || 11) + 'pt';
  const renderSkillLine = (label, valuesText) => {
    const items = String(valuesText || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!items.length) return '';
    // Less space below the label so chips sit closer to their subsection title.
    const labelHtml = label ? `<div style="font-weight:700;margin-top:6px;margin-bottom:0;color:#111;">${e(label)}</div>` : '';
    const chips = items.map(item => {
      return `<span style="display:inline-block;white-space:nowrap;margin-right:8px;font-size:${chipPt};"><span style="color:#666;margin-right:8px;">•</span>${e(item)}</span>`;
    }).join('');
    return `${labelHtml}<div style="line-height:1.7;margin-bottom:4px;padding-left:20px;word-wrap:break-word;overflow-wrap:break-word;">${chips}</div>`;
  };
  if (layout === 'professional' || layout === 'standard') {
    const lines = sec.lines;
    let html = '';
    let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) { html += '<div style="height:3px;"></div>'; i++; continue; }
      if (t.startsWith('•') || t.startsWith('-')) {
        const bulletText = t.replace(/^[•\-]\s*/, '');
        html += `<div style="padding-left:1em;text-indent:-.9em;margin-left:.9em;margin-bottom:3px;color:#111;"><span style="color:#666;">•</span> ${fmtLinkify(bulletText)}</div>`;
        i++; continue;
      }
      // Check if this is a job header pair. Match any date pattern: MM/YY format, 4-digit year
      // ranges (2024 – 2026), or anything ending in Present/Current/Now.
      const hasDate = (/\d{2}\/\d{2}|\b\d{4}\s*[-–—]\s*(?:\d{4}|Present|Current|Now)\b/i.test(t)) && t.length < 200;
      // Look ahead: is the next non-empty line also a short non-bullet line?
      let nextIdx = i + 1;
      while (nextIdx < lines.length && !lines[nextIdx].trim()) nextIdx++;
      const nextT = nextIdx < lines.length ? lines[nextIdx].trim() : '';
      const nextIsJobLine = nextT && !nextT.startsWith('•') && !nextT.startsWith('-') && nextT.length < 100;

      if (hasDate) {
        // Try to parse as a job header (single or two-line)
        const jh = parseJobHeader(t, nextIsJobLine ? nextT : null);
        if (jh) {
          const ESC = s => String(s||'').replace(/\s*·\s*$/, '').trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          if (layout === 'standard') {
            // Standard layout: role + date on top line (uses Role/Title size), company + location underneath (uses Company size)
            const topLine = jh.role
              ? `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:1px;">
                  <div style="font-size:${expRolePx};font-weight:700;font-family:${expFont},Arial,sans-serif;color:#111;">${ESC(jh.role)}</div>
                  <div style="font-size:${size};font-weight:400;color:#666;white-space:nowrap;flex-shrink:0;">${ESC(jh.dates)}</div>
                 </div>`
              : '';
            const subLine = (jh.company || jh.location)
              ? `<div style="font-size:${expPx};color:#444;margin-bottom:8px;">
                  ${jh.company ? `<span style="font-weight:600;font-style:italic;">${ESC(jh.company)}</span>` : ''}${jh.location ? `${jh.company ? ' · ' : ''}<span style="font-weight:400;">${ESC(jh.location)}</span>` : ''}
                 </div>`
              : '';
            html += `<div style="margin-top:14px;margin-bottom:6px;">${topLine}${subLine}</div>`;
          } else {
            // Original layout (Professional + fallback): company on top, role+date underneath
            const companyLine = (jh.company || jh.location)
              ? `<div style="margin-bottom:7px;">
                  ${jh.company ? `<span style="font-size:${expPx};font-weight:700;font-style:italic;font-family:${expFont},Arial,sans-serif;">${ESC(jh.company)}</span>` : ''}${jh.location ? `<span style="font-size:${expPx};font-weight:400;">${jh.company ? ', ' : ''}${ESC(jh.location)}</span>` : ''}
                 </div>`
              : '';
            const titleLine = jh.role
              ? `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:2px;">
                  <div style="font-size:${expRolePx};font-weight:700;font-family:${expFont},Arial,sans-serif;">${ESC(jh.role)}</div>
                  <div style="font-weight:400;color:#888;white-space:nowrap;flex-shrink:0;">${ESC(jh.dates)}</div>
                 </div>`
              : '';
            html += `<div style="margin-top:10px;margin-bottom:4px;">${companyLine}${titleLine}</div>`;
          }
          // Skip consumed lines (1 or 2), plus skip any immediately following
          // empty lines that would otherwise render as spacers between header and bullets
          i = jh.consumed === 2 ? nextIdx + 1 : i + 1;
          // Skip blank lines right after the header block
          while (i < lines.length && !lines[i].trim()) i++;
          continue;
        }
      }
      // Bold inline labels like "Leadership: ..."
      const labelMatch = t.match(/^([A-Z][a-zA-Z\s&]+):\s(.+)$/);
      if (labelMatch && labelMatch[1].length < 30) {
        if (isSkillsSection) {
          html += renderSkillLine(labelMatch[1], labelMatch[2]);
        } else {
          html += `<div style="margin-bottom:3px;"><strong>${e(labelMatch[1])}:</strong> ${fmtLinkify(labelMatch[2])}</div>`;
        }
        i++; continue;
      }
      // Plain text — could be a role context/summary sentence, OR an unlabeled skill line in a SKILLS section.
      if (isSkillsSection && t.includes(',')) {
        html += renderSkillLine('', t);
        i++; continue;
      }
      
      // Special handling for EDUCATION sections: combine adjacent non-empty lines with " · " separator
      const isEducationHeading = /EDUCATION|CERTIFICATIONS|DEGREES/i.test(sec.heading || '');
      if (isEducationHeading && !t.includes(':')) {
        // Look ahead for next non-empty line to combine education entries
        let eduLines = [t];
        let nextIdx = i + 1;
        while (nextIdx < lines.length) {
          const nextLine = lines[nextIdx].trim();
          if (!nextLine) {
            nextIdx++;
            continue;
          }
          // Stop if next line looks like a new institution (has a university/school name pattern)
          if (/university|college|school|institute|academy|polytechnic/i.test(nextLine) && 
              eduLines.length >= 1 &&
              !eduLines[0].match(/university|college|school|institute|academy|polytechnic/i)) {
            // This is the location/school line, include it
            eduLines.push(nextLine);
            i = nextIdx;
            break;
          }
          // Otherwise, include this line
          eduLines.push(nextLine);
          nextIdx++;
          // Stop after second line (degree + school combo is standard)
          if (eduLines.length >= 2) break;
        }
        if (eduLines.length > 1) {
          html += `<div style="color:#333;margin-bottom:4px;">${fmtLinkify(eduLines.join(' · '))}</div>`;
        } else {
          html += `<div style="color:#333;margin-bottom:1px;">${fmtLinkify(t)}</div>`;
        }
        i++; continue;
      }
      
      const isContextLine = t.length > 40 && t.endsWith('.');
      html += `<div style="color:#333;margin-bottom:${isContextLine?'7':'1'}px;">${fmtLinkify(t)}</div>`;
      i++;
    }
    body = html;
  } else {
    // For EDUCATION sections, combine adjacent non-empty lines into single entries to keep them on one line
    const isEducationSection = (sec.heading||'').toUpperCase().includes('EDUCATION');
    if (isEducationSection) {
      const entries = [];
      let currentEntry = [];
      for (const line of sec.lines) {
        const t = line.trim();
        if (!t) {
          if (currentEntry.length > 0) {
            entries.push(currentEntry);
            currentEntry = [];
          }
        } else {
          currentEntry.push(t);
        }
      }
      if (currentEntry.length > 0) entries.push(currentEntry);
      body = entries.map(entry => {
        const combined = entry.join(' · ');
        return `<div style="color:#333;margin-bottom:4px;white-space:normal;">${fmtLinkify(combined)}</div>`;
      }).join('');
    } else {
      body = sec.lines.map(line=>{
        const t=line.trim();
        if(!t) return'<div style="height:4px;"></div>';
        if(t.startsWith('•')||t.startsWith('-'))
          return`<div style="padding-left:1em;text-indent:-.9em;margin-left:.9em;margin-bottom:2px;">${fmtLinkify(t)}</div>`;
        if(/\d{2}\/\d{2}/.test(t)&&t.length<120)
          return`<div style="font-size:${(_fmt.expRoleSize||11)+'pt'};font-weight:700;margin-top:6px;margin-bottom:1px;">${fmtLinkify(t)}</div>`;
        const labelMatch=t.match(/^([A-Z][a-zA-Z\s&]+):\s(.+)$/);
        if(labelMatch&&labelMatch[1].length<30) {
          if (isSkillsSection) return renderSkillLine(labelMatch[1], labelMatch[2]);
          return`<div style="margin-bottom:3px;"><strong>${e(labelMatch[1])}:</strong> ${fmtLinkify(labelMatch[2])}</div>`;
        }
        if (isSkillsSection && t.includes(',')) return renderSkillLine('', t);
        return`<div style="color:#333;margin-bottom:1px;">${fmtLinkify(t)}</div>`;
      }).join('');
    }
  }
    // Section heading style per template
  let headingHtml;
  const showLines = _fmt.showDividerLines !== false;
  const headingLS = _fmt.headingLetterSpacing || '0.06em';
  const lineW = (_fmt.dividerLineWidth || '1') + 'px';
  const lineOp = _fmt.dividerLineOpacity !== undefined ? _fmt.dividerLineOpacity : 1;
  const lineColor = `rgba(80,80,80,${lineOp})`;
  // Manual small-caps: first letter at full size, rest explicitly uppercase at ~0.78em.
  // CSS font-variant:small-caps synthesizes small-caps by shrinking glyphs, which makes
  // strokes physically thinner — so the initial cap always looks heavier by contrast.
  // Manual split gives identical stroke weight across all letters.
  function fmtSmallCaps(text) {
    const es = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return text.split(/(\s+)/).map(seg => {
      if (!seg || /^\s+$/.test(seg)) return ' ';
      const first = es(seg[0]);
      const rest = es(seg.slice(1).toUpperCase());
      return `<span>${first}</span>${rest ? `<span style="font-size:.78em">${rest}</span>` : ''}`;
    }).join('');
  }
  // Display-name substitutions — source text unchanged, display uses Title Case
  const headingAliases = { 'SUMMARY': 'Professional Summary', 'EXPERIENCE': 'Work Experience' };
  const rawHeading = headingAliases[(sec.heading||'').trim().toUpperCase()] ||
    (sec.heading||'').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const displayHeading = rawHeading;
  const dividerKws = ['EXPERIENCE','EDUCATION','AWARDS','HONORS','EXPERTISE','TRAINING','VOLUNTEER','LEADERSHIP','SKILL','COMPETENCIES'];
  const hasTopLine = showLines && layout === 'standard' && dividerKws.some(k => (sec.heading||'').toUpperCase().includes(k));
  if(layout==='executive') headingHtml=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;"><div style="flex:1;height:1px;background:${accent};"></div><div style="font-size:.7em;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${accent};white-space:nowrap;">${e(displayHeading)}</div><div style="flex:1;height:1px;background:${accent};"></div></div>`;
  else if(layout==='minimal') headingHtml=`<div style="font-size:.8em;font-weight:600;color:${accent};margin-bottom:4px;letter-spacing:.03em;">${e(displayHeading)}</div>`;
  else if(layout==='ruled') headingHtml=`<div style="font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#333;border-bottom:2px solid ${accent};padding-bottom:2px;margin-bottom:5px;">${e(displayHeading)}</div>`;
  else if(layout==='boldline') headingHtml=`<div style="font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${accent};margin-bottom:4px;padding-left:4px;border-left:3px solid ${accent};">${e(displayHeading)}</div>`;
  else if(layout==='professional') headingHtml=`<div style="font-size:${headingPx};font-weight:600;font-variant:small-caps;letter-spacing:${headingLS};color:#888;font-family:${headingFont},Arial,sans-serif;margin-bottom:2px;margin-top:0;">${e(displayHeading)}</div>`;
  else if(layout==='standard') headingHtml=`<div style="${hasTopLine ? `border-top:${lineW} solid ${lineColor};padding-top:.05in;margin-top:.04in;` : ''}font-size:${headingPx};font-weight:${_fmt.headingFontWeight||400};letter-spacing:${headingLS};color:#111;font-family:${headingFont},Arial,sans-serif;margin-bottom:.16in;">${fmtSmallCaps(displayHeading)}</div>`;
  else headingHtml=`<div style="font-size:.7em;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${accent};border-bottom:1px solid ${accent}44;padding-bottom:2px;margin-bottom:5px;">${e(displayHeading)}</div>`;
  return`<div style="margin-bottom:${layout==='standard'?'.12in':layout==='professional'?'.10in':'.12in'}">${headingHtml}<div style="font-size:${size};font-family:${font},Arial,sans-serif;line-height:${layout==='compact'?'1.25':'1.35'};">${body}</div></div>`;}
  // Two-column layouts
  // sidebar layout removed — single-column only
  // Professional + Standard templates: SUMMARY → CORE COMPETENCIES → EXPERIENCE → ... → EDUCATION/SKILLS
  if(layout==='professional'||layout==='standard'){
    const bottomKws=['EDUCATION','CERTIFICATIONS','AWARDS','HONORS','TRAINING'];
    const compKws=['CORE COMPETENCIES','COMPETENCIES','SKILLS'];
    const summaryKws=['SUMMARY','PROFILE','OBJECTIVE'];
    const bottomSecs=secs.filter(s=>s.type==='section'&&bottomKws.some(k=>(s.heading||'').toUpperCase().includes(k)));
    const compSecs=secs.filter(s=>s.type==='section'&&compKws.some(k=>(s.heading||'').toUpperCase().includes(k)));
    const summarySecs=secs.filter(s=>s.type==='section'&&summaryKws.some(k=>(s.heading||'').toUpperCase().includes(k)));
    const headerSecs=secs.filter(s=>s.type==='header');
    const restSecs=secs.filter(s=>!bottomSecs.includes(s)&&!compSecs.includes(s)&&!summarySecs.includes(s)&&s.type!=='header');
    return[...headerSecs,...summarySecs,...compSecs,...restSecs,...bottomSecs].map(rSec).join('');
  }
  return secs.map(rSec).join('');
}
function renderFmtPreview(){const text=getResumeText();if(!text)return;const inner=document.getElementById('fmt-preview-inner');if(!inner)return;inner.style.fontFamily=_fmt.font;inner.style.fontSize=_fmt.size;inner.style.padding=_fmt.margin;inner.style.lineHeight=_fmt.layout==='compact'?'1.3':'1.45';inner.innerHTML=fmtRenderSections(fmtParseText(text));}
function fmtGetHtml(fp) {
  const text = getResumeText();
  if (!text) return '';
  const body = fmtRenderSections(fmtParseText(text));
  const pad = fp ? '0' : _fmt.margin;
  const bg = _fmt.bgColor || '#ffffff';
  const tc = _fmt.textColor || '#111111';
  const bodyFont = _fmt.bodyFont || _fmt.font || 'Arial';
  const bodySize = (_fmt.bodySize || 11) + 'px';
  const lh = _fmt.template === 'compact' ? '1.3' : '1.35';
  // Asymmetric padding: top padding is half the side/bottom padding so the Name sits closer to the
  // top edge in the screen preview. Print uses @page so PDF still gets a safe margin.
  const topPad = fp ? '0' : `calc(${pad} / 4)`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { margin:${_fmt.margin}; size:letter; }
    *, *::before, *::after { box-sizing:border-box; }
    html, body { margin:0; padding:0; background:${bg}; }
    body {
      font-family: ${bodyFont}, Arial, sans-serif;
      font-size: ${bodySize};
      padding: ${topPad} ${pad} ${pad} ${pad};
      color: ${tc};
      line-height: ${lh};
      background: ${bg};
    }
    a { color:inherit; text-decoration:none; }
  </style></head><body>${body}</body></html>`;
}

async function fmtSaveDocx(){await saveDocx();}

// Print-to-PDF the resume by rendering it into a sandboxed iframe and printing only that.
// Previous version (3.1.5 and earlier) tried to hide the rest of the app via @media print
// rules, but the app's CSS was bleeding through and the print preview captured the whole UI.
// The iframe approach has its own document, its own stylesheet, and its own print context, so
// nothing from the parent app can leak in.

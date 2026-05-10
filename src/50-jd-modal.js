// ─────────────────────────────────────────────────────────
//  JD ANALYZER
// ─────────────────────────────────────────────────────────
function syncJDToWorkspace() {
  // Keep proj in sync so prompts always use latest JD title/company/url/text
  if (!proj) return;
  proj.jdTitle = g('jd-title');
  proj.jdCompany = g('jd-company');
  proj.jdText = g('jd-text');
  proj.jdUrl = g('jd-url');
  autoSave();
}

// Show/hide the "Open ↗" link next to the URL field based on whether a URL is present.
// Called on input events and after loading a project so the link reflects current state.
function updateJdUrlLink() {
  const url = (document.getElementById('jd-url')?.value || '').trim();
  const link = document.getElementById('jd-url-open');
  if (!link) return;
  if (url && /^https?:\/\//i.test(url)) {
    link.style.display = 'inline-block';
    link.href = url;
  } else {
    link.style.display = 'none';
    link.removeAttribute('href');
  }
}

// Open the URL in a new tab. Works even if the field has whitespace or http schemes that the
// browser would otherwise misinterpret. Returns false to suppress the default anchor click
// behavior since we open via window.open() for full control.
function openJdUrl(e) {
  if (e) e.preventDefault();
  const url = (document.getElementById('jd-url')?.value || '').trim();
  if (!url) { toast('No URL entered'); return false; }
  const safe = /^https?:\/\//i.test(url) ? url : 'https://' + url;
  window.open(safe, '_blank', 'noopener,noreferrer');
  return false;
}

// Converts HTML (often double-encoded — entities embedded in JSON, then literal HTML inside) to
// clean plaintext suitable for the JD textarea. Decodes entities, parses as DOM, and walks block
// elements emitting newlines so headings and lists don't run together. Used by the Ashby/Lever/
// Greenhouse handlers.
function htmlToText(htmlOrEncoded) {
  if (!htmlOrEncoded) return '';
  // Decode HTML entities once. If the source is already raw HTML, this is a no-op.
  const ta = document.createElement('textarea');
  ta.innerHTML = String(htmlOrEncoded);
  const decoded = ta.value;
  // Now parse decoded HTML and walk it.
  const doc = new DOMParser().parseFromString(decoded, 'text/html');
  if (!doc.body) return decoded.replace(/\s+/g, ' ').trim();

  const blockTags = new Set(['DIV','P','BR','H1','H2','H3','H4','H5','H6','LI','UL','OL','TR','TD','TH','SECTION','ARTICLE','HEADER','FOOTER','BLOCKQUOTE','PRE']);
  const out = [];
  const walk = (node) => {
    if (node.nodeType === 3) { // text node
      out.push(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    const isBlock = blockTags.has(tag);
    if (isBlock) out.push('\n');
    if (tag === 'LI') out.push('- ');
    for (const child of node.childNodes) walk(child);
    if (isBlock) out.push('\n');
  };
  walk(doc.body);
  return out.join('')
    .replace(/[ \t]+\n/g, '\n')      // trim trailing spaces on each line
    .replace(/\n{3,}/g, '\n\n')      // collapse 3+ newlines to 2
    .replace(/^[\s\n]+|[\s\n]+$/g, '') // trim outer whitespace
    .replace(/[ \t]{2,}/g, ' ');     // collapse runs of spaces
}

// ─────────────────────────────────────────────────────────
//  URL FETCH
// ─────────────────────────────────────────────────────────
async function fetchJobFromUrl() {
  const url = (document.getElementById('jd-url')?.value || '').trim();
  if (!url) { toast('Paste a job URL first'); return; }
  if (!url.startsWith('http')) { toast('Please include https://'); return; }

  const loading = document.getElementById('jd-url-loading');
  const errEl = document.getElementById('jd-url-error');
  const msgEl = document.getElementById('jd-url-msg');
  loading?.classList.add('show');
  if (errEl) errEl.style.display = 'none';
  if (msgEl) msgEl.textContent = 'Fetching job posting...';

  try {
    // Try multiple methods to fetch the job posting
    let html = '';
    const encodedUrl = encodeURIComponent(url);

    // Special handler for Ashby job boards (JS-rendered, proxies won't work)
    const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^\/]+)\/([a-f0-9-]+)/);
    if (ashbyMatch) {
      try {
        if (msgEl) msgEl.textContent = 'Fetching from Ashby API...';
        const ashbyGqlResp = await fetch('https://jobs.ashbyhq.com/api/non-user-graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationName: 'apiJobPosting',
            variables: { organizationHostedJobsPageName: ashbyMatch[1], jobPostingId: ashbyMatch[2] },
            query: 'query apiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) { id title departmentName locationName descriptionHtml teamNames } }'
          })
        });
        if (ashbyGqlResp.ok) {
          const ashbyGql = await ashbyGqlResp.json();
          const info = ashbyGql?.data?.jobPosting;
          if (!info) throw new Error('Job not found');
          const title = info.title || '';
          const descText = htmlToText(info.descriptionHtml || '');
          
          if (title) { s('jd-title', title); if (proj) proj.jdTitle = title; }
          const company = ashbyMatch[1].charAt(0).toUpperCase() + ashbyMatch[1].slice(1);
          s('jd-company', company); if (proj) proj.jdCompany = company;
          if (descText) { s('jd-text', descText); if (proj) proj.jdText = descText; }
          loading?.classList.remove('show');
          toast('Job details extracted — review and click Analyze');
          if (proj) autoSave();
          return;
        }
      } catch(ashbyErr) { console.warn('Ashby API error:', ashbyErr); }
    }

    // Special handler for Lever job boards
    const leverMatch = url.match(/jobs\.lever\.co\/([^\/]+)\/([a-f0-9-]+)/);
    if (leverMatch) {
      try {
        if (msgEl) msgEl.textContent = 'Fetching from Lever API...';
        const leverResp = await fetch('https://api.lever.co/v0/postings/' + leverMatch[1] + '/' + leverMatch[2]);
        if (leverResp.ok) {
          const leverData = await leverResp.json();
          if (leverData.text) { s('jd-title', leverData.text); if (proj) proj.jdTitle = leverData.text; }
          if (leverData.categories?.team) { s('jd-company', leverData.categories.team); if (proj) proj.jdCompany = leverData.categories.team; }
          const descHtml = leverData.descriptionPlain || (leverData.description || '').replace(/<[^>]+>/g, ' ');
          if (descHtml) { s('jd-text', descHtml); if (proj) proj.jdText = descHtml; }
          loading?.classList.remove('show');
          toast('Job details extracted — review and click Analyze');
          if (proj) autoSave();
          return;
        }
      } catch(leverErr) { console.warn('Lever API error:', leverErr); }
    }

    // Special handler for Greenhouse job boards
    const ghMatch = url.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
    if (ghMatch) {
      try {
        if (msgEl) msgEl.textContent = 'Fetching from Greenhouse API...';
        const ghResp = await fetch('https://boards-api.greenhouse.io/v1/boards/' + ghMatch[1] + '/jobs/' + ghMatch[2]);
        if (ghResp.ok) {
          const ghData = await ghResp.json();
          if (ghData.title) { s('jd-title', ghData.title); if (proj) proj.jdTitle = ghData.title; }
          s('jd-company', ghMatch[1].charAt(0).toUpperCase() + ghMatch[1].slice(1));
          if (proj) proj.jdCompany = ghMatch[1].charAt(0).toUpperCase() + ghMatch[1].slice(1);
          const descText = htmlToText(ghData.content || '');
          if (descText) { s('jd-text', descText); if (proj) proj.jdText = descText; }
          loading?.classList.remove('show');
          toast('Job details extracted — review and click Analyze');
          if (proj) autoSave();
          return;
        }
      } catch(ghErr) { console.warn('Greenhouse API error:', ghErr); }
    }

    // Greenhouse-proxied company careers pages: company.com/careers/jobs/{id}/?gh_jid={id}
    // The job ID is in gh_jid; the company slug isn't in the URL but is usually inferrable from
    // the host (e.g. circleci.com → "circleci"). We try a few likely slugs against the API.
    const ghJidMatch = url.match(/[?&]gh_jid=(\d+)/);
    if (ghJidMatch) {
      try {
        const ghJobId = ghJidMatch[1];
        const host = new URL(url).hostname.replace(/^www\./, '');
        // Build candidate company slugs. Greenhouse slugs are lowercase alphanum, no dots.
        // From circleci.com → ['circleci']. From foo.bar.com → ['foo', 'foobar', 'bar'].
        const parts = host.split('.').filter(p => p && p !== 'com' && p !== 'careers' && p !== 'jobs');
        const candidates = Array.from(new Set([
          parts[0],
          parts.join(''),
          parts.slice(-1)[0],
        ].filter(Boolean).map(s => s.replace(/[^a-z0-9]/gi, '').toLowerCase())));

        if (msgEl) msgEl.textContent = 'Fetching from Greenhouse API...';
        let ghData = null;
        let resolvedSlug = '';
        for (const slug of candidates) {
          try {
            const r = await fetch('https://boards-api.greenhouse.io/v1/boards/' + slug + '/jobs/' + ghJobId);
            if (r.ok) {
              const d = await r.json();
              if (d?.title) { ghData = d; resolvedSlug = slug; break; }
            }
          } catch(e) {}
        }
        if (ghData) {
          if (ghData.title) { s('jd-title', ghData.title); if (proj) proj.jdTitle = ghData.title; }
          const companyName = resolvedSlug.charAt(0).toUpperCase() + resolvedSlug.slice(1);
          s('jd-company', companyName); if (proj) proj.jdCompany = companyName;
          const descText = htmlToText(ghData.content || '');
          if (descText) { s('jd-text', descText); if (proj) proj.jdText = descText; }
          loading?.classList.remove('show');
          toast('Job details extracted — review and click Analyze');
          if (proj) autoSave();
          return;
        }
      } catch(ghJidErr) { console.warn('Greenhouse-by-jid error:', ghJidErr); }
    }
    const proxies = [
      { url: `https://api.allorigins.win/get?url=${encodedUrl}`, parse: d => d.contents },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encodedUrl}`, parse: d => d },
      { url: `https://corsproxy.io/?${encodedUrl}`, parse: d => d },
    ];

    // Detect JS-rendered job boards that can't be fetched via proxy
    const jsRenderedBoards = [
      { pattern: /myjobs\.adp\.com/, name: 'ADP' },
      { pattern: /myworkdayjobs\.com|workday\.com\/.*\/job/, name: 'Workday' },
      { pattern: /icims\.com/, name: 'iCIMS' },
      { pattern: /taleo\.(net|com)/, name: 'Taleo' },
      { pattern: /successfactors\.com|successfactors\.eu/, name: 'SuccessFactors' },
      { pattern: /smartrecruiters\.com/, name: 'SmartRecruiters' },
      { pattern: /jobvite\.com/, name: 'Jobvite' },
      { pattern: /ultipro\.com|ukg\.com/, name: 'UKG' },
    ];
    const jsBoard = jsRenderedBoards.find(b => b.pattern.test(url));
    if (jsBoard) {
      loading?.classList.remove('show');
      if (errEl) {
        errEl.style.display = 'block';
        errEl.textContent = `${jsBoard.name} job pages are app-rendered and can't be fetched automatically. Please copy and paste the job title, company, and full description from the posting.`;
      }
      return;
    }

    // Try direct fetch first
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (resp.ok) html = await resp.text();
    } catch(e) {}

    // Try proxies in sequence
    if (!html) {
      for (const proxy of proxies) {
        try {
          if (msgEl) msgEl.textContent = 'Trying alternate fetch...';
          const resp = await fetch(proxy.url);
          if (resp.ok) {
            const contentType = resp.headers.get('content-type') || '';
            if (contentType.includes('json')) {
              const data = await resp.json();
              html = typeof proxy.parse(data) === 'string' ? proxy.parse(data) : '';
            } else {
              html = await resp.text();
            }
            if (html && html.length > 100) break;
            html = '';
          }
        } catch(e) { html = ''; }
      }
    }

    // No AI fallback here — Claude has no real web access via the API, so asking it to "fetch"
    // a URL just produces hallucinated content (made-up JDs that look plausible but are wrong).
    // We'd rather fail loudly and let the user paste the JD text manually.
    if (!html) {
      loading?.classList.remove('show');
      throw new Error('Could not fetch this page automatically. Please copy the job description and paste it into the description field below.');
    }

    // Extract text content from HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove nav, footer, scripts, styles
    ['nav','footer','header','script','style','aside','.nav','.footer','.header'].forEach(sel => {
      try { doc.querySelectorAll(sel).forEach(el => el.remove()); } catch(e) {}
    });

    const bodyText = (doc.body?.innerText || doc.body?.textContent || '').trim();
    if (!bodyText || bodyText.length < 100) throw new Error('Page content too short. Try pasting the description manually.');

    // Use Claude to extract structured job info from the raw text
    if (msgEl) msgEl.textContent = 'Extracting job details...';
    const raw = await claudeFetch(`Extract the job posting from the page text below. ALL THREE FIELDS ARE REQUIRED — do not skip any.

Return ONLY valid JSON with no other text:
{"title":"the exact job title from the posting","company":"the company name","description":"the COMPLETE job description text"}

Rules:
- Title must be the actual job title (e.g. "Senior Product Designer"). Never return a department, page header, or page title.
- Company must be the hiring ORGANIZATION name (e.g. "Loop", "Verizon", "Netflix"). Look for patterns like "At [Company]," or "[Company]'s" or "join [Company]" — the company name is usually a proper noun that owns the role. NEVER return a team name, department, or function (e.g. "Design Team", "Design", "Engineering", "Product", "Brand"). If the description says "The Design Team at Loop..." then the company is "Loop", not "Design" or "Design Team".
- Description MUST be complete and include ALL sections: intro, what you'll do, responsibilities, requirements/qualifications, experience, compensation, benefits, and any company story or footer. Do NOT stop early. Do NOT summarize. Copy the full posting body verbatim. If the page has multiple sections (Overview, What You'll Do, Requirements, etc.), include ALL of them concatenated with line breaks. Missing any section is a failure.
- Strip navigation menus, cookie banners, application form UI, and repeated headers/footers — keep only the actual job posting text.
- Escape any double quotes inside the description field.

PAGE TEXT:
${bodyText.slice(0, 25000)}`, 6000);

    const parsed = parseJson(raw);
    if (parsed.title) { s('jd-title', parsed.title); if (proj) proj.jdTitle = parsed.title; }
    if (parsed.company) { s('jd-company', parsed.company); if (proj) proj.jdCompany = parsed.company; }
    if (parsed.description) { s('jd-text', parsed.description); if (proj) proj.jdText = parsed.description; }
    if (proj) autoSave();

    // Diagnostic so missing fields are visible to the user instead of silently failing.
    const missing = [];
    if (!parsed.title) missing.push('title');
    if (!parsed.company) missing.push('company');
    if (!parsed.description) missing.push('description');
    loading?.classList.remove('show');
    if (missing.length) {
      toast(`Extracted partial data — missing: ${missing.join(', ')}. Fill them in manually.`);
    } else {
      toast('Job details extracted — review and click Analyze');
    }
  } catch(e) {
    loading?.classList.remove('show');
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    toast('Could not fetch URL — paste the description manually');
  }
}

// ─────────────────────────────────────────────────────────
//  ANSWER WITH AI MODAL
// ─────────────────────────────────────────────────────────
function showAnswerModal() {
  if (!proj?.questions?.length) { toast('Analyze a job description first to generate questions'); return; }
  // Clear any stale paste from a previous open or previous project
  const ta = document.getElementById('ai-paste-answers');
  if (ta) ta.value = '';
  document.getElementById('answer-modal')?.classList.remove('hidden');
}

function hideAnswerModal() {
  // Clear on close too — defensive, in case the user opens it again
  const ta = document.getElementById('ai-paste-answers');
  if (ta) ta.value = '';
  document.getElementById('answer-modal')?.classList.add('hidden');
  // Reset answer mode so the next showAnswerModal defaults back to screening questions.
  if (proj) proj._answerMode = null;
}

// Parses pasted numbered answers and assigns them to outcome questions in order. Mirrors the
// answer onto proj.ce.roles[].bullets[].outcomeNote so Optimize can fold the outcome back into
// the matching bullet at apply time.
async function applyPastedOutcomeAnswers(text) {
  if (!proj?.outcomeQuestions?.length) { toast('No outcome questions to fill in'); return; }

  // Strip trailing AI sign-offs / closers.
  text = text
    .replace(/\n\s*---+\s*\n[\s\S]*$/g, '')
    .replace(/\n\s*(?:Let me know|Want me to|I can (?:also|further|happily)|Happy to|Would you like|Feel free to|If you'?d like)[\s\S]*$/gi, '')
    .trim();

  const btn = document.getElementById('apply-answers-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Applying...'; }

  try {
    const numberedPattern = /(?:^|\n)\s*(?:\*{0,2})\s*(\d+)[.):\-]\s*([\s\S]+?)(?=\n\s*\**\s*\d+[.):\-]|\s*$)/g;
    const matches = [...text.matchAll(numberedPattern)];
    let filled = 0;
    if (matches.length) {
      matches.forEach(m => {
        const idx = parseInt(m[1], 10) - 1;
        const answer = (m[2] || '').trim();
        if (idx < 0 || idx >= proj.outcomeQuestions.length || !answer) return;
        const q = proj.outcomeQuestions[idx];
        q.answer = answer;
        saveOutcomeNoteToBullet(q.bulletId, answer);
        filled++;
      });
    }
    if (filled === 0) {
      toast("Couldn't parse numbered answers. Make sure they're formatted '1. answer / 2. answer / ...'");
      return;
    }
    autoSave();
    renderOutcomeQuestions();
    hideAnswerModal();
    toast(`Saved ${filled} outcome${filled === 1 ? '' : 's'} — they'll fold into the next Optimize run`);
  } catch (e) {
    console.error('applyPastedOutcomeAnswers:', e);
    toast('Error applying answers — try again');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Apply Answers'; }
  }
}

// Computes a line-level diff between two text blocks using Myers' LCS-based algorithm.
// Returns an array of ops: {type:'eq'|'add'|'del', line: string}.
// O(M*N) memory and time; resumes are small enough that this is fine.
function computeLineDiff(beforeText, afterText) {
  const a = (beforeText || '').split('\n');
  const b = (afterText || '').split('\n');
  const m = a.length, n = b.length;
  // dp[i][j] = LCS length for a[0..i) vs b[0..j)
  const dp = Array.from({length: m + 1}, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  // Walk back to produce ops
  const ops = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1]) { ops.push({type:'eq', line:a[i-1]}); i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) { ops.push({type:'del', line:a[i-1]}); i--; }
    else { ops.push({type:'add', line:b[j-1]}); j--; }
  }
  while (i > 0) { ops.push({type:'del', line:a[i-1]}); i--; }
  while (j > 0) { ops.push({type:'add', line:b[j-1]}); j--; }
  ops.reverse();
  return ops;
}

// Groups a flat ops list (from computeLineDiff) into "change blocks": a contiguous run of
// del/add ops becomes one block. Equal ops act as boundaries between blocks. Each block
// captures the before-text (joined del lines) and after-text (joined add lines), plus a kind:
// 'add' (only adds), 'del' (only dels), 'edit' (both).
function groupDiffIntoBlocks(ops) {
  const blocks = [];
  let cur = null;
  for (const op of ops) {
    if (op.type === 'eq') {
      if (cur) { blocks.push(cur); cur = null; }
      continue;
    }
    if (!cur) cur = { del: [], add: [] };
    if (op.type === 'del') cur.del.push(op.line);
    else cur.add.push(op.line);
  }
  if (cur) blocks.push(cur);
  return blocks.map((b, i) => {
    const kind = b.del.length && b.add.length ? 'edit' : (b.add.length ? 'add' : 'del');
    return {
      id: 'change-' + i,
      kind,
      before: b.del.join('\n').trim(),
      after: b.add.join('\n').trim(),
    };
  });
}

// Sends all change blocks to the AI in one batched call. Returns the same blocks decorated with
// a short title (4-7 words) and a one-sentence detail. Falls back to auto-generated titles if
// the AI call fails so the UI never blocks.
async function titleChangeBlocks(blocks) {
  if (!blocks.length) return [];
  const compactBlocks = blocks.map((b, i) => ({
    id: i,
    kind: b.kind,
    before: (b.before || '').slice(0, 400),
    after: (b.after || '').slice(0, 400),
  }));
  try {
    const raw = await claudeFetch(
      `For each resume change block below, write a 4-7 word title in plain English summarizing what the change does, plus a 1-sentence detail. Return ONLY a JSON array, one entry per block, in the SAME order as input.\n\n` +
      `Format: [{"id":0,"title":"...","detail":"..."}, ...]\n\n` +
      `Title rules:\n` +
      `- Lead with the verb: "Tightened summary", "Added skills", "Reframed bullet"\n` +
      `- Name the section if obvious (Summary, Skills, Verizon role, etc.)\n` +
      `- Keep it under 7 words\n` +
      `- Don't quote text from the before/after, describe the change\n\n` +
      `Detail rules:\n` +
      `- One short sentence, max 15 words\n` +
      `- Say what improved (e.g. "Now leads with client journeys and AI-enhanced design")\n\n` +
      `BLOCKS:\n${JSON.stringify(compactBlocks)}`,
      1500,
      undefined,
      undefined,
      CONFIG.models.sonnet
    );
    const cleaned = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('expected array');
    // Merge titles back onto the blocks by id.
    blocks.forEach((b, i) => {
      const aiEntry = parsed.find(p => p.id === i) || parsed[i];
      b.title = aiEntry?.title || autoTitleForBlock(b);
      b.detail = aiEntry?.detail || '';
    });
  } catch (e) {
    console.warn('titleChangeBlocks AI call failed, using auto titles:', e);
    blocks.forEach(b => { b.title = autoTitleForBlock(b); b.detail = ''; });
  }
  return blocks;
}

// Produces a fallback title from the block content alone — used if the AI call fails.
function autoTitleForBlock(b) {
  const verb = b.kind === 'add' ? 'Added' : (b.kind === 'del' ? 'Removed' : 'Updated');
  // Detect section by looking at the after (or before) text for a section header.
  const text = (b.after || b.before || '').toUpperCase();
  const sections = ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'EDUCATION', 'CERTIFICATIONS', 'AWARDS'];
  for (const sec of sections) {
    if (text.includes(sec)) return `${verb} ${sec.toLowerCase()}`;
  }
  return `${verb} content`;
}

// Pure render function: paints the What Has Changed UI from already-built blocks.
// Used both by showPostOptimizeView (after computing diff + AI titles) and by loadProject
// (when restoring a previously-optimized project from saved state).
function renderWhatHasChangedView(blocks, scoreBefore, scoreAfter) {
  // Make sure analyzer-content stays visible
  const analyzerEl = document.getElementById('analyzer-content');
  if (analyzerEl) analyzerEl.style.display = 'block';
  
  // Hide the legacy post-optimize content (we don't use it anymore)
  const postEl = document.getElementById('post-optimize-content');
  if (postEl) postEl.style.display = 'none';
  
  // Hide Applied Fixes card and ATS Format Audit card while in post-optimize state
  const appliedFixesCard = document.getElementById('applied-fixes-card');
  if (appliedFixesCard) appliedFixesCard.style.display = 'none';
  const atsAuditCard = document.getElementById('ats-audit-card');
  if (atsAuditCard) atsAuditCard.style.display = 'none';
  
  // Show the What Has Changed card
  const whatChangedCard = document.getElementById('what-changed-card');
  if (whatChangedCard) whatChangedCard.style.display = 'block';
  
  // Score delta line shown in the card head
  const delta = scoreAfter - scoreBefore;
  const arrow = delta > 0 ? '↑' : (delta < 0 ? '↓' : '=');
  const color = delta > 0 ? 'var(--green)' : (delta < 0 ? 'var(--red)' : 'var(--ink2)');
  const scoreLine = document.getElementById('what-changed-score-line');
  if (scoreLine) {
    scoreLine.innerHTML = `Score: <span style="color:var(--muted);">${scoreBefore}%</span> <span style="color:${color};font-weight:700;">${arrow} ${scoreAfter}%</span>`;
  }
  
  const countEl = document.getElementById('what-changed-count');
  if (countEl) countEl.textContent = blocks.length + (blocks.length === 1 ? ' change' : ' changes');
  
  const list = document.getElementById('what-changed-list');
  if (!list) return;
  list.innerHTML = '';
  if (!blocks.length) {
    list.innerHTML = '<div class="text-xs text-muted" style="padding:14px 0;text-align:center;">No content changes detected.</div>';
    return;
  }
  
  blocks.forEach((b, i) => {
    const div = document.createElement('div');
    div.className = 'change-item kind-' + b.kind;
    div.dataset.idx = i;
    
    const beforeText = (b.before || '').trim();
    const afterText = (b.after || '').trim();
    const truncate = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;
    
    let beforeAfterHTML = '';
    if (b.kind === 'add') {
      beforeAfterHTML = `
        <div class="change-ba-row">
          <div class="change-ba-label change-ba-add">+ Added</div>
          <div class="change-ba-text change-ba-after-text">${esc(truncate(afterText, 200))}</div>
        </div>`;
    } else if (b.kind === 'del') {
      beforeAfterHTML = `
        <div class="change-ba-row">
          <div class="change-ba-label change-ba-del">− Removed</div>
          <div class="change-ba-text change-ba-before-text">${esc(truncate(beforeText, 200))}</div>
        </div>`;
    } else {
      beforeAfterHTML = `
        <div class="change-ba-row">
          <div class="change-ba-label change-ba-del">Before</div>
          <div class="change-ba-text change-ba-before-text">${esc(truncate(beforeText, 200))}</div>
        </div>
        <div class="change-ba-row">
          <div class="change-ba-label change-ba-add">After</div>
          <div class="change-ba-text change-ba-after-text">${esc(truncate(afterText, 200))}</div>
        </div>`;
    }
    
    div.innerHTML = `
      <span class="change-dot"></span>
      <div style="flex:1;min-width:0;">
        <div class="change-title">${esc(b.title || 'Loading…')}</div>
        <div class="change-detail">${esc(b.detail || '')}</div>
        <div class="change-ba" style="margin-top:8px;">${beforeAfterHTML}</div>
      </div>`;
    div.addEventListener('mouseenter', () => highlightPreviewForBlock(b));
    div.addEventListener('mouseleave', () => clearPreviewHighlight());
    list.appendChild(div);
  });
  if (proj) proj._postOptimizeBlocks = blocks;
}

// Shows the post-Optimize view inside analyzer-content. Hides Applied Fixes and ATS Format
// Audit, shows the new "What Has Changed" card with before/after diffs and hover highlighting.
// After AI labels the blocks, persists them on proj.lastOptimize so the view survives reload.
async function showPostOptimizeView(beforeText, afterText, scoreBefore, scoreAfter) {
  const ops = computeLineDiff(beforeText, afterText);
  let blocks = groupDiffIntoBlocks(ops);
  // Filter out trivially small blocks (single-line, fewer than 3 chars of change) which clutter
  // the list without telling the user anything useful.
  blocks = blocks.filter(b => (b.before + b.after).trim().length >= 3);
  
  // First render with placeholder titles so user sees the panel immediately
  renderWhatHasChangedView(blocks, scoreBefore, scoreAfter);
  
  // Get AI titles for each block
  await titleChangeBlocks(blocks);
  
  // Re-render with the real titles
  renderWhatHasChangedView(blocks, scoreBefore, scoreAfter);
  
  // Persist on the project so reload + tab switch can restore the view without recomputing
  if (proj) {
    proj.lastOptimize = {
      beforeText: beforeText,
      afterText: afterText,
      scoreBefore: scoreBefore,
      scoreAfter: scoreAfter,
      blocks: blocks.map(b => ({
        kind: b.kind,
        before: b.before || '',
        after: b.after || '',
        title: b.title || '',
        detail: b.detail || ''
      })),
      timestamp: Date.now()
    };
    try { autoSave(); } catch(e) {}
  }
}

// Finds text in the resume preview that matches a block's content, highlights the matching
// element, and scrolls it into view. Uses textContent on candidate elements (which concatenates
// all descendant text nodes) so multi-line bullets, wrapped text, and inline-styled runs all
// match correctly. Falls back through progressively shorter substrings if the full needle fails.
function highlightPreviewForBlock(block) {
  clearPreviewHighlight();
  const page = document.getElementById('fmt-preview-page');
  if (!page) return;
  // Prefer after-text (what's in the current preview); fall back to before-text only for pure deletions.
  const searchSource = (block.after || block.before || '').trim();
  if (!searchSource) return;
  
  // Normalize whitespace function — collapses any whitespace run to a single space.
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  
  // Build a list of candidate needles, longest/most specific first.
  // 1. Each meaningful line (>=6 chars after normalization)
  // 2. Each meaningful sentence (split on period)
  // 3. The whole search source
  const lines = searchSource.split('\n').map(norm).filter(s => s.length >= 6);
  const sentences = searchSource.split(/[.!?]+/).map(norm).filter(s => s.length >= 8);
  const candidates = [...new Set([...lines, ...sentences])].sort((a, b) => b.length - a.length);
  if (!candidates.length) return;
  
  // Walk all leaf-ish elements (those that contain text but no nested block elements).
  // For each, get normalized textContent and check whether it contains any candidate.
  const allElements = page.querySelectorAll('div, p, li, h1, h2, h3, h4, h5, h6, td, span');
  
  for (const candidate of candidates) {
    // Try progressively shorter chunks (full, 80-char, 50-char, 30-char) so longer wraps still hit.
    const chunks = [candidate, candidate.slice(0, 80), candidate.slice(0, 50), candidate.slice(0, 30)]
      .filter((c, i, arr) => c.length >= 12 && arr.indexOf(c) === i);
    
    for (const chunk of chunks) {
      // Find the SMALLEST element whose textContent contains the chunk — that's the most
      // specific match (e.g., the bullet itself, not the section, not the page).
      let bestMatch = null;
      let bestSize = Infinity;
      for (const el of allElements) {
        const text = norm(el.textContent || '');
        if (text.includes(chunk)) {
          const size = text.length;
          if (size < bestSize) {
            bestSize = size;
            bestMatch = el;
          }
        }
      }
      if (bestMatch) {
        bestMatch.classList.add('fmt-change-highlight');
        try { bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e) {}
        return;
      }
    }
  }
}

// Legacy text-node walker — kept for compatibility with anything else that calls it.
function findTextNodeContaining(root, needle) {
  if (!root || !needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.includes(needle)) return node;
  }
  return null;
}

function clearPreviewHighlight() {
  document.querySelectorAll('.fmt-change-highlight').forEach(el => el.classList.remove('fmt-change-highlight'));
}

// Lets the user dismiss the post-Optimize view: hide the What Has Changed card and restore
// the Applied Fixes and ATS Format Audit cards.
function exitPostOptimizeView() {
  const analyzerEl = document.getElementById('analyzer-content');
  const postEl = document.getElementById('post-optimize-content');
  if (postEl) postEl.style.display = 'none';
  if (analyzerEl) analyzerEl.style.display = '';
  
  // Hide the new What Has Changed card
  const whatChangedCard = document.getElementById('what-changed-card');
  if (whatChangedCard) whatChangedCard.style.display = 'none';
  
  // Restore Applied Fixes card and ATS Format Audit card
  const appliedFixesCard = document.getElementById('applied-fixes-card');
  if (appliedFixesCard) appliedFixesCard.style.display = '';
  const atsAuditCard = document.getElementById('ats-audit-card');
  if (atsAuditCard) atsAuditCard.style.display = '';
  
  clearPreviewHighlight();
}

// Copies the prompt to clipboard and toasts. Modal stays open so user can paste answers.
function copyQuestionsPromptAndOpen() {
  copyQuestionsPrompt();
  toast('Prompt copied — paste it into Claude or ChatGPT');
}

async function applyPastedAnswers() {
  let text = (document.getElementById('ai-paste-answers')?.value || '').trim();
  if (!text) { toast('Paste your AI answers first'); return; }
  const isOutcome = proj?._answerMode === 'outcome';
  if (isOutcome) return applyPastedOutcomeAnswers(text);
  if (!proj?.questions?.length) { toast('No questions — analyze a job description first'); return; }

  // Scrub trailing meta-commentary that AI agents tend to append:
  // "Let me know if...", "Want me to...", "I can also...", "Happy to...", etc.
  // Also strips trailing "---" separators and signoffs.
  text = text
    .replace(/\n\s*---+\s*\n[\s\S]*$/g, '')                                                 // anything after a "---" rule
    .replace(/\n\s*(?:Let me know|Want me to|I can (?:also|further|happily)|Happy to|Would you like|Feel free to|If you'?d like)[\s\S]*$/gi, '')  // common closing offers
    .replace(/\n\s*\*\*?Note:?\*\*?[\s\S]*$/gi, '')                                         // "**Note:** ..." trailers
    .trim();

  const btn = document.getElementById('apply-answers-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Applying...'; }

  try {
    const questions = proj.questions;
    let filled = 0;

    // Strategy 1: Try to parse numbered answers (1. Answer, 2. Answer, etc.)
    // Handles formats: "1.", "1)", "**1.**", "Question 1:", "Q1.", bold headers, etc.
    const numberedPattern = /(?:^|\n)\s*(?:\*{0,2})\s*(?:Question\s*|Q)?(\d+)[.):\-]\**\s*([\s\S]+?)(?=\n\s*\**\s*(?:Question\s*|Q)?\d+[.):\-]|\n\s*#{1,3}\s|\n\s*---|\s*$)/gi;
    const numberedMatches = [...text.matchAll(numberedPattern)];

    if (numberedMatches.length >= 2) {
      // Map numbered answers to questions by number
      numberedMatches.forEach(m => {
        const idx = parseInt(m[1]) - 1;
        const answer = m[2].trim()
          .replace(/^[*_]+|[*_]+$/g, '')   // strip leading/trailing bold/italic markers
          .replace(/\*\*([^*]+)\*\*/g, '$1') // strip inline bold
          .replace(/^Answer:\s*/i, '')       // strip "Answer:" prefix
          .trim();
        if (idx >= 0 && idx < questions.length && answer) {
          const q = questions[idx];
          const ta = document.getElementById('qa-' + q.id);
          if (ta) { ta.value = answer; markAnswered(q.id); filled++; }
          q.answer = answer;
        }
      });
    }

    // Strategy 2: Split by double newlines and map sequentially
    if (filled === 0) {
      const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
      // Filter out blocks that look like questions (they start with Q: or the question text)
      const answerBlocks = blocks.filter(b =>
        !b.match(/^Q\d*[:.]/i) && !b.match(/^Question \d/i) && b.length > 10
      );
      const relevant = answerBlocks.slice(0, questions.length);
      relevant.forEach((block, idx) => {
        if (idx >= questions.length) return;
        const q = questions[idx];
        const answer = block.replace(/^A[:.:]\s*/i, '').replace(/^Answer[:.:]\s*/i, '').trim();
        if (answer) {
          const ta = document.getElementById('qa-' + q.id);
          if (ta) { ta.value = answer; markAnswered(q.id); filled++; }
          q.answer = answer;
        }
      });
    }

    // Strategy 3: If still nothing, try using Claude to match (fallback)
    if (filled === 0) {
      const questionList = questions.map((q, i) => `Q${i+1} [${q.id}]: ${q.question}`).join('\n');
      const raw = await claudeFetch(`Match these pasted AI answers to each question. Return ONLY a JSON array:
[{"id":"q_id","answer":"exact answer text"}]
Do not rephrase — use the exact answer text from the pasted content.
QUESTIONS:
${questionList}
PASTED ANSWERS:
${text.slice(0, 4000)}`, 2000);
      const matches = parseJson(raw);
      if (Array.isArray(matches)) {
        matches.forEach(m => {
          if (!m.id || !m.answer) return;
          const ta = document.getElementById('qa-' + m.id);
          if (ta) { ta.value = m.answer; markAnswered(m.id); filled++; }
          const q = questions.find(q => q.id === m.id);
          if (q) q.answer = m.answer;
        });
      }
    }

    autoSave();
    hideAnswerModal();
    // Stay on current page — don't switch tabs
    if (filled > 0) {
      toast(`✓ ${filled} answer${filled !== 1 ? 's' : ''} applied to questions`);
    } else {
      toast('Could not parse answers — try numbering them (1. Answer, 2. Answer...)');
    }
  } catch(e) {
    toast('Error: ' + e.message);
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Apply Answers →'; }
}

async function autoAnswerQuestions() {
  if (!proj?.questions?.length) { toast('No questions to answer'); return; }
  const loading = document.getElementById('ai-auto-loading');
  const btn = document.getElementById('ai-auto-btn');
  loading?.classList.add('show');
  if (btn) btn.disabled = true;
  try {
    // Build answers using resume + JD via Claude, then populate fields directly
    const jdText = g('jd-text') || proj.jdText || '';
    const resume = getResumeText();
    const questionList = proj.questions.map((q, i) => `Q${i+1} [${q.id}]: ${q.question}`).join('\n');

    const raw = await claudeFetch(`Answer these job application questions using the candidate's resume and job description. Be specific, use real details from the resume, do not fabricate metrics. Return ONLY valid JSON array:
[{"id":"q1","answer":"concise answer using resume evidence"}]
RESUME:\n${resume.slice(0,3000)}
JOB DESCRIPTION:\n${jdText.slice(0,2000)}
QUESTIONS:\n${questionList}`, 2500);

    const matches = parseJson(raw);
    if (!Array.isArray(matches)) throw new Error('Could not parse answers');

    let filled = 0;
    matches.forEach(m => {
      if (!m.id || !m.answer) return;
      const ta = document.getElementById('qa-' + m.id);
      if (ta) { ta.value = m.answer; markAnswered(m.id); filled++; }
      const q = proj.questions.find(q => q.id === m.id);
      if (q) q.answer = m.answer;
    });

    autoSave();
    hideAnswerModal();
    // Stay on current page — don't switch tabs
    toast(`✓ ${filled} question${filled !== 1 ? 's' : ''} answered`);
  } catch(e) {
    toast('Error: ' + e.message);
  }
  loading?.classList.remove('show');
  if (btn) btn.disabled = false;
}


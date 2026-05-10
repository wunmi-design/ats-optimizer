async function analyzeJD() {
  const jdText=g('jd-text');if(!jdText.trim()){toast('Paste a job description first');return;}
  if(!proj){toast('Create a project first');return;}
  // Re-running Analyze should restore the suggestions panel — the post-Optimize view is stale.
  try { exitPostOptimizeView(); } catch(e) {}
  const loading=document.getElementById('jd-loading');
  loading.querySelector('span').textContent='Studying job description...';
  loading.classList.add('show');
  try {
    const raw=await claudeFetch(`Analyze this job description. Return ONLY valid JSON:
{"title":"exact job title","company":"hiring company name — the organization, never a team or department","seniority":"entry|mid|senior|executive","yoe_min":8,"yoe_max":15,"hard_skills":["..."],"soft_skills":["..."],"tools":["..."],"key_themes":["..."],"required":["..."],"preferred":["..."],"leadership_expected":true,"people_mgmt_expected":true,"signals":["..."]}

For company: find the organization name (e.g. "Loop", "Netflix", "Verizon"). Look for "At [Company]," or "[Company]'s" or "join [Company]". Never return a team name like "Design Team" or a department like "Design" or "Engineering". If you cannot determine the company confidently, return "".

JOB DESCRIPTION:\n${jdText}`,2000);
    const analysis=parseJson(raw);
    proj.jdAnalysis=analysis; proj.jdTitle=g('jd-title')||analysis.title||''; proj.jdText=jdText;
    // Auto-fill company only if the field is empty — don't clobber what the user already typed.
    if (!g('jd-company') && analysis.company) {
      s('jd-company', analysis.company);
      proj.jdCompany = analysis.company;
    } else {
      proj.jdCompany = g('jd-company') || '';
    }
    s('jd-title',proj.jdTitle);
    renderJDAnalysis(analysis);
    await generateQuestions(analysis);
    autoSave();
    loading.classList.remove('show');
    
    // Score the resume against the JD now so user sees the original score immediately.
    // This runs only if a resume is present — otherwise we just stop after JD analysis.
    const resume = getResumeText();
    if (resume && resume.trim()) {
      // Switch to the Optimizer tab so the user sees the score appear in context.
      switchTab('analyzer');
      // Brief delay so the tab transition completes before the analysis overlay opens.
      setTimeout(() => { try { runFullAnalysis(); } catch(e) { console.warn('Initial scoring failed:', e); } }, 150);
    }
  } catch(e){toast('Error: '+e.message); loading.classList.remove('show');}
}

function renderJDAnalysis(a) {
  if(!a) return;
  document.getElementById('jd-results').style.display='block';
  document.getElementById('jd-level-badge').textContent=({entry:'Entry',mid:'Mid-level',senior:'Senior',executive:'Executive'})[a.seniority]||'Senior';
  const render=(id,items,cls)=>{const el=document.getElementById(id);if(!el||!items?.length)return;el.innerHTML=items.map(k=>`<span class="tag ${cls||''}">${esc(k)}</span>`).join('');};
  render('kw-hard',a.hard_skills,'required'); render('kw-soft',a.soft_skills,'soft'); render('kw-tools',a.tools,'tool'); render('kw-themes',a.key_themes);
  const sig=document.getElementById('jd-signals');
  if(a.signals?.length) sig.innerHTML=a.signals.map(s=>`<div class="text-xs text-muted mt-1">💡 ${esc(s)}</div>`).join('');
  const lvl=document.getElementById('ws-tgt-level');if(lvl){const m={entry:'mid',mid:'mid',senior:'senior',executive:'executive'};if(m[a.seniority])lvl.value=m[a.seniority];}
}

// ─────────────────────────────────────────────────────────
//  QUESTION ENGINE
// ─────────────────────────────────────────────────────────
async function autoFillFromWorkspace() {
  if (!proj) { toast('Open a project first'); return; }
  if (!proj.questions?.length) { toast('Analyze a job description first to generate questions'); return; }

  const loading = document.getElementById('autofill-loading');
  const btn = document.getElementById('autofill-btn');
  const msg = document.getElementById('autofill-msg');
  const resultDiv = document.getElementById('autofill-result');
  const summaryEl = document.getElementById('autofill-summary');

  loading.classList.add('show');
  btn.disabled = true;
  msg.textContent = 'Answering from your workspace...';

  const ws = collectWorkspace();
  const jdText = g('jd-text') || proj.jdText || '';

  const questionList = proj.questions
    .map((q, i) => `Q${i+1} [${q.id}] (${q.category} · ${q.priority} priority): ${q.question}`)
    .join('\n');

  const brainDump = g('ws-braindump').trim();

  const prompt = `You are a resume coach helping someone answer targeted job application questions using their career history. Answer every question specifically and concisely using the workspace data provided. Do not invent details. If a question cannot be answered from the data, say so briefly.
${brainDump ? `\nADDITIONAL CONTEXT FROM CLAUDE (use this to enrich answers):\n${brainDump.slice(0, 4000)}\n` : ''}
CANDIDATE WORKSPACE:
Name: ${ws.name}
Title: ${ws.title} | Years: ${ws.years}
Location: ${ws.location}
Most recent role: ${ws['r1-title']} at ${ws['r1-company']} (${ws['r1-dates']})
Responsibilities: ${ws['r1-duties']}
Results: ${ws['r1-results']}
Previous roles: ${ws.prev}
Team leadership: ${ws.team}
Executive influence: ${ws.exec}
Cross-functional: ${ws.xfn}
Scope note: ${ws.scope}
Business metrics: ${ws['m-biz']}
Operational metrics: ${ws['m-ops']}
Product metrics: ${ws['m-prod']}
Scale metrics: ${ws['m-scale']}
Hard skills: ${ws.hard}
Soft skills: ${ws.soft}
Tools: ${ws.tools}
Achievements: ${ws.achievements}
Career thread: ${ws.thread}
Education: ${ws.edu}
Gap/consulting: ${ws.gap}
Extra context: ${ws.extra}

TARGET ROLE: ${ws['tgt-title']} at ${ws['tgt-company']}
${jdText ? 'JOB DESCRIPTION CONTEXT:\n' + jdText.slice(0, 1500) : ''}

QUESTIONS TO ANSWER:
${questionList}

Return ONLY valid JSON:
{
  "answers": [
    {
      "id": "q1",
      "answer": "concise specific answer using real details from the workspace, 2-4 sentences"
    }
  ],
  "filled": 5,
  "gaps": ["question id of anything that genuinely cannot be answered from the workspace"]
}`;

  try {
    const raw = await claudeFetch(prompt, 3000);
    const parsed = parseJson(raw);
    const answers = parsed.answers || [];
    let filled = 0;

    answers.forEach(a => {
      if (!a.id || !a.answer) return;
      const q = proj.questions.find(q => q.id === a.id);
      if (!q) return;
      const el = document.getElementById('qa-' + a.id);
      q.answer = a.answer;
      if (el) { el.value = a.answer; markAnswered(a.id); }
      filled++;
    });

    const gaps = parsed.gaps || [];
    resultDiv.style.display = 'block';
    summaryEl.innerHTML = filled === proj.questions.length
      ? `<span style="color:var(--green);">✓ All ${filled} questions answered from your workspace.</span>`
      : `<span style="color:var(--green);">✓ ${filled} answered</span>${gaps.length ? ` · <span style="color:var(--amber);">${gaps.length} need more detail — fill those in manually below</span>` : ''}.`;

    autoSave();
    toast(`${filled} of ${proj.questions.length} questions answered`);

  } catch(e) {
    toast('Error: ' + e.message);
  }

  loading.classList.remove('show');
  btn.disabled = false;
}

// ─────────────────────────────────────────────────────────
//  COPY QUESTIONS PROMPT
// ─────────────────────────────────────────────────────────
function copyQuestionsPrompt() {
  if (!proj) { toast('Open a project first'); return; }
  const isOutcome = proj._answerMode === 'outcome';
  if (isOutcome) return copyOutcomePrompt();
  if (!proj.questions?.length) { toast('Analyze a job description first to generate questions'); return; }

  const ws = collectWorkspace();
  const jdText = g('jd-text') || proj.jdText || '';

  const questionLines = proj.questions
    .map((q, i) => `${i + 1}. [${q.category}] ${q.question}`)
    .join('\n');

  const prompt = `I am building a tailored resume for a job application and need your help answering some targeted questions about my work history. Please answer each question specifically and concisely based on the context I provide. Use real details — do not invent anything. If you need more context to answer a question well, say so briefly.

MY BACKGROUND:
Name: ${ws.name || '(not provided)'}
Current title: ${ws.title || '(not provided)'}
Years of experience: ${ws.years || '(not provided)'}
Most recent role: ${ws['r1-title'] || '(not provided)'} at ${ws['r1-company'] || '(not provided)'} (${ws['r1-dates'] || ''})
Key responsibilities: ${ws['r1-duties'] || '(not provided)'}
Key results: ${ws['r1-results'] || '(not provided)'}
Previous roles: ${ws.prev || '(not provided)'}
Team leadership: ${ws.team || '(not provided)'}
Executive influence: ${ws.exec || '(not provided)'}
Cross-functional work: ${ws.xfn || '(not provided)'}
Scope / authority note: ${ws.scope || '(not provided)'}
Key metrics — Business: ${ws['m-biz'] || '(not provided)'}
Key metrics — Operational: ${ws['m-ops'] || '(not provided)'}
Key metrics — Product/customer: ${ws['m-prod'] || '(not provided)'}
Hard skills: ${ws.hard || '(not provided)'}
Career narrative: ${ws.thread || '(not provided)'}
Extra context: ${ws.extra || '(not provided)'}

TARGET ROLE: ${ws['tgt-title'] || '(not provided)'} at ${ws['tgt-company'] || '(not provided)'}
${jdText ? `\nJOB DESCRIPTION EXCERPT:\n${jdText.slice(0, 1200)}` : ''}

QUESTIONS TO ANSWER:
${questionLines}

OUTPUT INSTRUCTIONS — read carefully:
1. Answer each question in order, numbered to match. 2–4 sentences per answer. Specific — real job titles, company names, metrics, and situations from my background above.
2. Write each answer in first person ("I led...", "I drove..."), not second person.
3. If you need follow-up information from me to sharpen an answer, ask, then incorporate my reply. CRITICAL: when you produce your FINAL response, it MUST contain the complete numbered list of ALL answers in one block — every question answered, every refinement applied. Do not deliver partial answers across multiple turns. The user will copy your final response in one go and paste it into a tool, so a partial answer breaks the workflow.
4. Do NOT add closing remarks, offers to refine ("let me know if you want..."), follow-up suggestions, or any commentary after the last numbered answer. End the response immediately after the final answer.
5. No preamble before answer 1. No headers. No section dividers. Just the numbered answers.`;

  navigator.clipboard.writeText(prompt).then(() => {
    toast('Prompt copied — paste it into Claude, then copy the full response back here');
  }).catch(() => {
    toast('Copy failed — check browser permissions');
  });
}

function clearBrainDump() {
  const el = document.getElementById('ws-braindump');
  if (el) { el.value = ''; autoSave(); toast('Brain Dump cleared'); }
}

// Builds a prompt that asks the user's external AI assistant to answer outcome questions for
// each bullet. Each question quotes the bullet so the AI can produce a relevant outcome.
function copyOutcomePrompt() {
  if (!proj?.outcomeQuestions?.length) { toast('No outcome questions yet — re-run Analyze first'); return; }
  const ws = collectWorkspace();
  const jdText = g('jd-text') || proj.jdText || '';

  const questionBlocks = proj.outcomeQuestions.map((q, i) =>
    `${i + 1}. [${q.role}]\n   Bullet: "${q.currentBullet}"\n   Q: ${q.question}`
  ).join('\n\n');

  const prompt = `I am tightening my resume's bullet points by adding measurable business outcomes. For each bullet below, I'm asking you to suggest a concrete outcome based on what my work was likely to have produced. Use realistic-sounding metrics in the right ballpark for the work described — but never fabricate specific numbers I haven't confirmed. Phrase the answer so I can verify and edit it.

MY BACKGROUND:
Name: ${ws.name || '(not provided)'}
Current title: ${ws.title || '(not provided)'}
Years of experience: ${ws.years || '(not provided)'}
Most recent role: ${ws['r1-title'] || '(not provided)'} at ${ws['r1-company'] || '(not provided)'} (${ws['r1-dates'] || ''})
Key responsibilities: ${ws['r1-duties'] || '(not provided)'}
Key results: ${ws['r1-results'] || '(not provided)'}
Key metrics — Business: ${ws['m-biz'] || '(not provided)'}
Key metrics — Operational: ${ws['m-ops'] || '(not provided)'}
Key metrics — Product/customer: ${ws['m-prod'] || '(not provided)'}
Career narrative: ${ws.thread || '(not provided)'}

TARGET ROLE: ${ws['tgt-title'] || '(not provided)'} at ${ws['tgt-company'] || '(not provided)'}
${jdText ? `\nJOB DESCRIPTION EXCERPT:\n${jdText.slice(0, 800)}` : ''}

BULLETS AND OUTCOME QUESTIONS:
${questionBlocks}

OUTPUT INSTRUCTIONS — read carefully:
1. Answer each numbered question in order. ONE sentence per answer, max 20 words. Lead with the metric or business outcome.
2. Use realistic ranges from my background where possible. If you don't have a real metric, suggest a plausible category-of-outcome the user can verify (e.g. "completion rate lift in the 20–30% range", "App Store rating from 3.x to 4.x").
3. Do NOT invent specific exact numbers. If you give a number, frame it as a range or as something the user should confirm.
4. Format each answer exactly as "1. [your answer]" — numbered to match the question.
5. No preamble. No headers. No closing remarks or follow-up offers. End immediately after the final answer.`;

  navigator.clipboard.writeText(prompt).then(() => {
    toast('Outcome prompt copied — paste it into Claude or ChatGPT');
  }).catch(() => {
    toast('Copy failed — check browser permissions');
  });
}

async function generateQuestions(analysis) {
  if(!proj) return;
  const ws=collectWorkspace();
  try {
    const raw=await claudeFetch(`You are a resume coach helping a candidate raise both their ATS match score AND their recruiter readability. Generate 5-8 targeted questions whose answers, if incorporated into the resume, would directly improve one or both.

Return ONLY valid JSON:
{"questions":[{"id":"q1","category":"metrics|leadership|skills|experience|narrative","priority":"high|medium","question":"...","placeholder":"example of the kind of answer that would help","prefilled":null}]}

Each question MUST target one of these high-leverage problems:
- A specific JD keyword/skill that is missing from the resume but the candidate likely has experience with (asking surfaces it so it can be added)
- A bullet that lacks a quantifiable outcome (asking for the metric or business result lets the bullet be rewritten with measurable impact)
- A role with thin or vague description that needs concrete scope clarification (team size, products owned, scale of users/revenue)
- A narrative gap the resume implies but doesn't explain (e.g. promotions, scope changes, transitions)
- Soft skills/leadership behaviors the JD prioritizes that aren't yet evidenced in any bullet

Question quality bar:
- Each question must point at ONE specific bullet, role, or skill — never generic ("tell us about your leadership style")
- Each must clearly state how the answer will be used (e.g. "to add a metric to your Verizon Financial Services bullet about MAU growth")
- Skip topics that are already well-covered in the resume
- Skip topics that even a great answer wouldn't change in the resume (e.g. personal preferences, hobbies, motivation)
- Order by priority: the question whose answer would most raise the score goes first

JOB REQUIRES:\n${JSON.stringify(analysis)}
CANDIDATE HAS: ${ws.name}, ${ws.title}, ${ws.years}yrs, Skills: ${ws.hard?.slice(0,200)}, Role: ${ws['r1-title']} at ${ws['r1-company']}`,1500);
    const parsed=parseJson(raw);
    proj.questions=parsed.questions||[];
    renderQuestions(proj.questions);
    // Reveal the inline questions section + Optimize Resume button now that analysis is complete
    const qaSection = document.getElementById('qa-section');
    if (qaSection) qaSection.style.display = 'block';
    // Auto-open the Answer with AI modal so the user goes straight to copying the prompt.
    if (proj.questions.length) {
      try { showAnswerModal(); } catch(e) {}
    }
    // Generate outcome questions in the background — one per bullet — so the user can fill in
    // business outcomes that bullets currently lack. These run as a separate pass with their own
    // Copy Prompt button so the user can choose to do them or skip.
    generateOutcomeQuestions().catch(e => console.warn('Outcome questions:', e));
  } catch(e){proj.questions=[];}
}

// Asks the AI to generate one outcome-elicitation question per bullet in the resume. Each
// question quotes the bullet back to the user and asks about measurable business impact. Saved to
// proj.outcomeQuestions[] with bulletId tagging so answers can be matched to bullets at apply time.
async function generateOutcomeQuestions() {
  if (!proj || !proj.ce?.roles?.length) return;
  // Build a flat list of bullets with their role context. Bullets need IDs (existing CE schema
  // already attaches r.bullets[].id) so we can match answers back later.
  const bulletList = [];
  for (const r of proj.ce.roles) {
    if (!r.bullets?.length) continue;
    for (const b of r.bullets) {
      if (!b.text || !b.text.trim()) continue;
      bulletList.push({
        bulletId: b.id,
        role: `${r.title || 'Role'} at ${r.company || 'Company'}`,
        text: b.text.trim().slice(0, 280),
      });
    }
  }
  if (!bulletList.length) { proj.outcomeQuestions = []; renderOutcomeQuestions(); return; }

  // Hydrate any existing answers so we don't lose them when regenerating.
  const previousAnswers = {};
  (proj.outcomeQuestions || []).forEach(q => {
    if (q.bulletId && q.answer) previousAnswers[q.bulletId] = q.answer;
  });

  try {
    const jdTitle = g('jd-title') || proj?.jdTitle || '';
    const jdContext = jdTitle ? `Target role: ${jdTitle}.\n` : '';
    const raw = await claudeFetch(
      `For each resume bullet below, write ONE specific question that elicits the measurable business outcome. The user will answer in their own words; their answer will later be folded into a rewritten bullet that stays around 150 characters (180 hard ceiling).\n\n` +
      `Question rules:\n` +
      `- Quote the bullet back so the user remembers what work it describes.\n` +
      `- Ask for a concrete metric, timeframe, or business outcome — engagement lift, revenue, cycle-time reduction, completion rate, NPS, retention, App Store rating, team size, scope, etc.\n` +
      `- Pick the metric type that's most relevant to the bullet. For a launch bullet, ask about adoption or rating. For a process bullet, ask about cycle-time or efficiency. For a team bullet, ask about size or growth.\n` +
      `- If the bullet already has a metric, ask whether there's an additional outcome worth adding (NEVER suggest replacing the existing metric).\n` +
      `- Keep questions short (one sentence + the quoted bullet). No multi-part questions.\n\n` +
      `Return ONLY a JSON array, in the same order as input bullets. Format:\n` +
      `[{"bulletId":"...","question":"For your work on [paraphrase]: what was the [metric type]?"}, ...]\n\n` +
      jdContext +
      `BULLETS:\n${JSON.stringify(bulletList)}`,
      3000
    );
    const cleaned = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('expected array');

    proj.outcomeQuestions = parsed.map(q => {
      const orig = bulletList.find(b => b.bulletId === q.bulletId);
      return {
        id: q.bulletId, // reuse bullet id as question id
        bulletId: q.bulletId,
        role: orig?.role || '',
        currentBullet: orig?.text || '',
        question: q.question || '',
        answer: previousAnswers[q.bulletId] || '',
      };
    }).filter(q => q.question);

    autoSave();
    renderOutcomeQuestions();
  } catch (e) {
    console.warn('generateOutcomeQuestions failed:', e);
    proj.outcomeQuestions = [];
    renderOutcomeQuestions();
  }
}

// Renders the outcome questions list inside the #outcome-section. Shows the bullet (so the user
// remembers what work it describes), the AI's outcome question, and a textarea for the answer.
// Live-saves answers on blur. Hidden if no questions or no roles.
function renderOutcomeQuestions() {
  const sec = document.getElementById('outcome-section');
  const list = document.getElementById('outcome-questions-list');
  if (!sec || !list) return;
  const qs = (proj?.outcomeQuestions) || [];
  if (!qs.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  const answered = qs.filter(q => (q.answer||'').trim()).length;
  list.innerHTML = `
    <div class="text-xs text-muted mb-2">${answered} of ${qs.length} answered</div>
    ${qs.map(q => `
      <div class="q-item" id="oq-${q.id}" style="border-left:3px solid var(--teal-lt);">
        <div class="q-priority" style="color:var(--muted);">${esc(q.role || 'Bullet')}</div>
        <div style="font-size:11px;color:var(--ink2);font-style:italic;margin:4px 0 6px 0;">"${esc(q.currentBullet||'')}"</div>
        <div class="q-text">${esc(q.question)}</div>
        <textarea id="oqa-${q.id}" style="min-height:60px;font-size:12px;" placeholder="e.g. Lifted MAU 26% in 6 months; rating moved from 3.7 → 4.5" oninput="markOutcomeAnswered('${q.id}')">${esc(q.answer||'')}</textarea>
      </div>
    `).join('')}`;
}

function markOutcomeAnswered(id) {
  const ta = document.getElementById('oqa-' + id);
  if (!ta || !proj?.outcomeQuestions) return;
  const q = proj.outcomeQuestions.find(x => x.id === id);
  if (!q) return;
  q.answer = ta.value;
  // Mirror onto the bullet itself so it's available at apply time even if outcomeQuestions
  // is regenerated. Stored at proj.ce.roles[].bullets[].outcomeNote.
  saveOutcomeNoteToBullet(q.bulletId, ta.value);
  autoSave();
}

// Writes an answer into the matching bullet's outcomeNote field. Walks all roles to find the
// bullet by id. No-op if not found (bullet may have been deleted since the question was generated).
function saveOutcomeNoteToBullet(bulletId, note) {
  if (!proj?.ce?.roles) return;
  for (const r of proj.ce.roles) {
    if (!r.bullets) continue;
    for (const b of r.bullets) {
      if (b.id === bulletId) { b.outcomeNote = (note || '').trim() || undefined; return; }
    }
  }
}

// Opens the existing Answer modal but populates it with the outcome questions instead of
// screening questions. Reuses the same paste-answers UX so the user has one mental model.
function showOutcomeAnswerModal() {
  if (!proj?.outcomeQuestions?.length) {
    toast('No outcome questions yet — re-run Analyze first');
    return;
  }
  // Toggle a flag so the existing copy/paste flow targets outcomeQuestions instead of questions.
  proj._answerMode = 'outcome';
  showAnswerModal();
}

function renderQuestions(questions) {
  const container=document.getElementById('questions-list');
  if(!questions?.length){container.innerHTML='<div class="empty-state"><div class="empty-icon">✅</div><p>No critical gaps found.<br>Your workspace covers the key requirements.</p></div>';return;}
  container.innerHTML=questions.map((q,i)=>`
    <div class="q-item" id="qi-${q.id}">
      <div class="q-priority">${q.category} · <span style="color:${q.priority==='high'?'var(--teal)':'var(--muted)'}">${q.priority} priority</span></div>
      <div class="q-text">${esc(q.question)}</div>
      <textarea id="qa-${q.id}" style="min-height:70px;font-size:12px;" placeholder="${esc(q.placeholder||'')}" oninput="markAnswered('${q.id}')">${esc(q.answer||q.prefilled||'')}</textarea>
      <div class="flex-c gap-2 mt-2">
        <button class="btn btn-secondary btn-sm" onclick="saveAnswer('${q.id}')">Save</button>
        <span class="q-skip" onclick="skipQ('${q.id}')">Skip</span>
      </div>
    </div>`).join('');
}

function markAnswered(id){
  const el=document.getElementById('qi-'+id);
  const v=g('qa-'+id);
  if(el)el.classList.toggle('answered',!!v?.trim());
  // Persist answer to proj.questions so it survives save/reload
  if(proj?.questions?.length){
    const q = proj.questions.find(q => q.id === id);
    if(q) q.answer = v || '';
  }
}
function saveAnswer(id){const q=proj.questions?.find(q=>q.id===id);if(!q)return;q.answer=g('qa-'+id);markAnswered(id);autoSave();toast('Answer saved');}
function skipQ(id){const el=document.getElementById('qi-'+id);if(el){el.style.opacity='.4';el.style.pointerEvents='none';}}

// ─────────────────────────────────────────────────────────
//  RESUME GENERATOR
// ─────────────────────────────────────────────────────────
async function generateResume() {
  if(!proj){toast('Create a project first');return;}
  const ws=collectWorkspace(); const jdText=g('jd-text');
  const loading=document.getElementById('editor-loading');
  const msg=document.getElementById('editor-msg');
  const foot=document.getElementById('resume-foot');
  foot.style.display='flex'; loading.classList.add('show'); msg.textContent='Building resume...';
  document.getElementById('resume-empty').style.display='none';
  document.getElementById('resume-editor').style.display='block';
  document.getElementById('resume-editor').textContent='';

  const qAnswers=(proj.questions||[]).filter(q=>q.answer||g('qa-'+q.id)).map(q=>`Q: ${q.question}\nA: ${q.answer||g('qa-'+q.id)}`).join('\n\n');

  const prompt=`You are an expert resume writer. Write a complete ATS-friendly resume. Return ONLY plain-text — no JSON, no commentary.
ATS RULES: No tables, no columns, no graphics. Standard headers only. Bullet points with •. Dates MM/YY. Plain text.
QUALITY RULES: Every bullet = unique verb + action + metric. Zero passive phrases. Skills section must use JD exact language. Summary names target role and opens with strongest metric.
Excluded words: ${ws.ban||'spearheaded, leveraged, utilized'}

CANDIDATE: ${ws.name}, ${ws.title}, ${ws.years} years
Location: ${ws.location} | Contact: ${ws.contact}
Summary inputs: ${ws.achievements}
UVP: ${ws.uvp}
Hard skills: ${ws.hard} | Soft: ${ws.soft} | Tools: ${ws.tools} | Certs: ${ws.certs}
Most recent: ${ws['r1-title']} · ${ws['r1-company']} · ${ws['r1-dates']} · ${ws['r1-loc']}
Duties: ${ws['r1-duties']} | Results: ${ws['r1-results']}
Previous roles: ${ws.prev}
Team: ${ws.team} | Exec influence: ${ws.exec} | XFN: ${ws.xfn} | Scope: ${ws.scope}
Metrics: ${ws['m-biz']} / ${ws['m-ops']} / ${ws['m-prod']} / ${ws['m-scale']}
Education: ${ws.edu} ${ws.training} ${ws.awards?'| Awards: '+ws.awards:''}
Gap: ${ws.gap} | Thread: ${ws.thread} | Extra: ${ws.extra}
${qAnswers?'Q&A:\n'+qAnswers:''}

TARGET: ${ws['tgt-title']} at ${ws['tgt-company']} (${ws['tgt-level']})
Fit: ${ws.fit}
${jdText?'JOB DESCRIPTION (mirror exact language for ATS):\n'+jdText:''}

OUTPUT FORMAT:
${ws.name}
${ws.location}
${ws.contact}

SUMMARY
[3-4 sentences — metric-led, names target role, ends with value proposition]

SKILLS
Leadership: ...
Strategy: ...
Practice: ...
Tools: ...

EXPERIENCE
[Title · Company · MM/YY – MM/YY · Location]
• [unique verb + action + metric]

EDUCATION
${ws.edu}
${ws.certs}
Return ONLY the plain-text resume.`;

  try {
    msg.textContent='Writing resume...';
    let draft=await claudeFetch(prompt,4500);
    draft=draft.replace(/^```[\w]*\s*/i,'').replace(/\s*```$/i,'').trim();

    msg.textContent='Running quality check...';
    const fixPrompt=`Fix these issues in the resume. Return ONLY the corrected plain-text resume:
1. Any verb used more than once as bullet first word? Change the duplicate.
2. Any bullet with no number/percentage/scale? Add one.
3. Any passive phrase ("was responsible", "helped", "assisted")? Rewrite actively.
4. Any of these banned words: ${ws.ban||'spearheaded, leveraged, utilized'}? Remove.
RESUME:\n${draft}`;
    let final=await claudeFetch(fixPrompt,4000);
    final=final.replace(/^```[\w]*\s*/i,'').replace(/\s*```$/i,'').trim();

    proj.drafts.push(final); proj._redoStack=[]; autoSave();
    showResume(final,proj.drafts.length);
    loading.classList.remove('show');
    toast('Resume v'+proj.drafts.length+' generated');
    // Do NOT auto-analyze after generating — only analyze on explicit button click
    // setTimeout(()=>rescan(),300);
  } catch(e){
    loading.classList.remove('show');
    toast('Error: '+e.message);
  }
}

// ─────────────────────────────────────────────────────────
//  SCORER
// ─────────────────────────────────────────────────────────
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return h;
}

async function runFullAnalysis(skipOverlay) {
  const resume = getResumeText();
  const jdText = g('jd-text') || proj?.jdText || '';
  if (!resume) { toast('Add resume content first'); return; }
  if (!jdText) { toast('Paste a job description in the Job Description tab first'); return; }
  // Show blocking analyze overlay (unless called from applySelectedFixes which has its own)
  const analyzeOverlay = document.getElementById('analyze-overlay');
  if (!skipOverlay && analyzeOverlay) analyzeOverlay.style.display = 'flex';
  // Only switch to analyzer if explicitly called, not on page load
  // switchTab('analyzer');
  // CRITICAL: Clear all analyzer DOM before doing anything else to prevent stale content flash
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
  const loading = document.getElementById('dash-loading');
  const msg = document.getElementById('dash-msg');

  // Check if content has changed since last analysis
  const contentHash = simpleHash(resume + jdText);
  const cachedScore = proj?._cachedScore;
  const useCachedScore = cachedScore && proj._analysisHash === contentHash;

  loading.classList.add('show');
  msg.textContent = useCachedScore ? 'Analyzing...' : 'Scoring and analyzing...';

  try {
    // analyzer-content stays hidden until data is rendered (set to block after renderDashboard).

    // Run requests sequentially to avoid rate-limit bursts
    const scoreRaw = useCachedScore
      ? JSON.stringify(cachedScore)
      : await claudeFetch(`Score this resume against the job description. Return ONLY valid JSON:
{"overall":78,"keyword_match":82,"hard_skills":88,"soft_skills":70,"title_alignment":75,"yoe_alignment":95,"summary_quality":70,"bullet_quality":75,"score_reason":"...","strengths":["..."],"gaps":["..."],"keyword_coverage":[{"keyword":"lean UX","found":true}],"top_fixes":[{"rank":1,"title":"...","desc":"...","section":"summary|bullets|skills","before":"exact verbatim text to replace","after":"exact stronger replacement using only documented results — do not fabricate metrics"}]}
SCORING RULES:
- keyword_match: % of important JD keywords found in resume. Check CAREFULLY — if the word appears ANYWHERE, it counts.
- title_alignment: 100 if resume title exactly matches JD title, lower if partial match.
- yoe_alignment: how well years of experience match JD requirements.
- summary_quality: COUNT words in the summary section. Target 50-75 words. Score 100 if in range. Penalize: >90 words (-20), <40 words (-15), filler phrases (-10), third-person language (-10).
- bullet_quality: COUNT characters in each bullet (excluding the leading bullet glyph). Target ~150 characters per bullet. Score 100 if most are in 130-170 range. Penalize: bullets >180 chars (-5 each), bullets <100 chars (-3 each, too thin), no metric/outcome (-5 each), comma-chain sentences (-5 each).
- hard_skills/soft_skills: match to JD. Also check total skill count — target 15-25 items. Penalize >30 (-10) or <10 (-10).
- overall: weighted average of all sub-scores. Mostly 85+ sub-scores = 85+ overall.
QUALITY RULES: NEVER invent metrics, percentages, or revenue figures not in the original resume. NEVER suggest competitor brand names ('Commercial Card', 'Capital One brand', etc.) — use generic terms like 'financial services products' or 'credit card products'. Only suggest fixes grounded in the candidate's actual documented work.
TOP_FIXES PRIORITY: Suggest fixes that target the LOWEST scoring dimensions first:
1. Missing JD keywords (raises keyword_match)
2. Title mismatch (raises title_alignment)
3. Summary too long/short — provide specific rewrite at 50-75 words (raises summary_quality)
4. Bullets over 180 characters — provide tighter ~150-character rewrites with metrics first (raises bullet_quality)
5. Skills over 25 or under 15 — specify items to add/remove (raises hard_skills/soft_skills)
CRITICAL RULES:
1. READ the resume carefully. Mark keyword as "found":true if it appears ANYWHERE in the resume.
2. Each "before" field must be an EXACT quote from the resume.
3. ONLY suggest improvements for content that is genuinely MISSING or WEAK.
4. Do NOT suggest adding keywords already present in the resume.
${(proj.appliedFixes||[]).length ? 'ALREADY APPLIED (do NOT re-suggest these):\n' + (proj.appliedFixes||[]).filter(f=>f).map(f=>f.title||f.text||'').filter(Boolean).join('\n') + '\n' : ''}JOB:\n${jdText.slice(0,2500)}\nRESUME:\n${resume.slice(0,2500)}`, 3000, undefined, 0, CONFIG.models.sonnet);

    const score = useCachedScore ? cachedScore : parseJson(scoreRaw);

    // Build score context for the deep analysis prompt
    const scoreContext = `CURRENT SCORES: overall=${score.overall||0}%, keywords=${score.keyword_match||0}%, hard_skills=${score.hard_skills||0}%, soft_skills=${score.soft_skills||0}%, title=${score.title_alignment||0}%, yoe=${score.yoe_alignment||0}%, summary=${score.summary_quality||0}%, bullets=${score.bullet_quality||0}%`;
    const lowScores = [
      ['keyword_match', 'Keywords', score.keyword_match],
      ['hard_skills', 'Hard Skills', score.hard_skills],
      ['soft_skills', 'Soft Skills', score.soft_skills],
      ['title_alignment', 'Title Match', score.title_alignment],
      ['summary_quality', 'Summary', score.summary_quality],
      ['bullet_quality', 'Bullets', score.bullet_quality],
    ].filter(([,, v]) => v && v < 90).sort((a,b) => a[2]-b[2]).map(([,l,v]) => `${l}=${v}%`).join(', ');

    const deepRaw = await claudeFetch(`Analyze this resume against the job description. Return ONLY valid JSON:
{"missing_keywords":[{"keyword":"exact JD term","context":"where in JD"}],"weak_phrases":[{"original":"weak phrase","stronger":"better version","reason":"why"}],"impact_issues":[{"bullet":"bullet text up to 80 chars","suggestion":"add outcome"}],"gaps":[{"text":"gap description","suggestion":"how to address"}]}
${scoreContext}
TARGET: Generate suggestions that will raise the overall score from ${score.overall||0}% to 90%+. Focus on the lowest-scoring dimensions: ${lowScores||'all areas'}.
PRIORITY ORDER — address these in order:
1. TITLE: If title_alignment < 100, the resume title MUST exactly match the JD title. Flag this first.
2. KEYWORDS: List every important JD keyword missing from the resume. Each one added raises keyword_match.
3. SUMMARY: If summary_quality < 90, count the words. If >75, provide a specific rewrite under 70 words. If <50, expand it. Rewrite must be in first-person, no filler, metric-led.
4. BULLETS: If bullet_quality < 90, find every bullet over 180 characters and rewrite it to ~150 characters. If the original bullet has a real metric, lead with it. If it has no real metric, write the rewrite WITHOUT a percentage — do NOT invent metrics and do NOT use placeholders like "X%", "[number]%", "Y%", "TBD%", or "___%". A bullet with no metric is acceptable; a bullet with a placeholder metric is NOT.
5. SKILLS: If hard_skills or soft_skills < 90, identify missing JD skills to add and non-skills to remove.
BE EXHAUSTIVE: Do not stop at 3-4 suggestions. Flag EVERY issue that is holding the score below 90. The user will apply all suggestions at once.

GOAL: Find the strongest HONEST angle this candidate has on this JD, and amplify it. The goal is NOT to make the resume look like the JD. Bridges to gaps must come from real transferable strengths, never from invented experience.

TRUTH GROUNDING (highest-priority rule):
- Suggestions must amplify what's already in the resume, not invent what's missing.
- If the JD requires a domain the candidate has not worked in (gaming, social, fintech, healthcare, etc.), do NOT suggest adding bullets, skills, or summary phrases that claim that domain. The honest move is to suggest amplifying transferable strengths (scale, platform thinking, cross-functional leadership, strategic vision) that the candidate's resume actually demonstrates.
- Do NOT suggest adding team members (researchers, content designers, engineers) to roles where they were not described.
- Do NOT suggest changing team sizes or company affiliations from what the resume states.
- Do NOT suggest lifting JD marketing phrases ("win-win-win", "talk and hang out", "players and users") into bullets describing unrelated work.
- A missing keyword is acceptable. A fabricated bullet is not. When in doubt, suggest dropping the keyword rather than forcing it.

Rules: only flag real issues. Never fabricate metrics, skills, brands, domains, team members, or accomplishments. NEVER output placeholder tokens (X%, Y%, [number], [percent], ___, TBD) in any "stronger" or "suggestion" field — if you don't have a real metric from the resume, write the suggestion without a percentage. NEVER use em dashes (—) in any rewrite. Use commas, periods, or restructure the sentence. Em dashes are an AI tell and don't sound human.
JOB:\n${jdText.slice(0,2000)}\nRESUME:\n${resume.slice(0,2500)}`, 3000);
    const auditRaw = await claudeFetch(`Audit this resume for ATS issues. Return ONLY valid JSON:
{"checks":[{"id":"c1","label":"Check name","status":"pass|fail|warn","issue":"description if fail/warn"}],"overall":"pass|warn|fail","summary":"..."}
RESUME:\n${resume.slice(0,1500)}`, 1000);

    const deep = parseJson(deepRaw);
    let audit = null;
    try { audit = parseJson(auditRaw); } catch(e) {}

    proj.scores.push(score);
    // Cache score + hash so same content = same score
    proj._cachedScore = score;
    proj._analysisHash = contentHash;
    // Persist the hash in saved data so we can detect stale scores on project reload
    proj._savedAnalysisHash = contentHash;
    if (audit) proj.atsAudit = audit;
    proj._lastDeep = deep; // persist deep analysis
    autoSave();

    // Render score ring + grid (with real data)
    renderDashboard(score);

    // Now safe to reveal analyzer panel — it has real numbers
    const analyzerContent = document.getElementById('analyzer-content');
    if (analyzerContent) analyzerContent.style.display = 'block';

    // Merge deep analysis items into the suggestions list
    renderDeepFixItems(deep);

    // Show ATS audit if issues found
    if (audit?.checks) {
      const container = document.getElementById('ats-checks');
      const card = document.getElementById('ats-audit-card');
      if (container) container.innerHTML = audit.checks.map(c =>
        `<div class="ats-row"><div class="ats-icon">${c.status==='pass'?'✅':c.status==='warn'?'⚠️':'❌'}</div><div><div class="ats-title">${esc(c.label)}</div><div class="ats-desc">${esc(c.issue||'')}</div></div></div>`
      ).join('');
      if (card) card.style.display = audit.checks.some(c => c.status !== 'pass') ? 'block' : 'none';
    }

    // Render keyword coverage
    const kwCov = document.getElementById('keyword-coverage');
    if (kwCov && deep.missing_keywords?.length) {
      const allKws = (score.keyword_coverage || []);
      // Add missing ones from deep analysis
      deep.missing_keywords.forEach(mk => {
        if (!allKws.find(k => k.keyword.toLowerCase() === mk.keyword.toLowerCase())) {
          allKws.push({ keyword: mk.keyword, found: false });
        }
      });
    }

    loading.classList.remove('show');
    document.getElementById('analyzer-content').style.display = 'block';
    updateScorePill(score.overall);
    // Hide overlay only if we showed it
    if (!skipOverlay) {
      const analyzeOverlay = document.getElementById('analyze-overlay');
      if (analyzeOverlay) analyzeOverlay.style.display = 'none';
    }
    // Switch to analyzer only after analysis completes successfully
    switchTab('analyzer');
  } catch(e) {
    loading.classList.remove('show');
    // Hide overlay only if we showed it
    if (!skipOverlay) {
      const analyzeOverlay = document.getElementById('analyze-overlay');
      if (analyzeOverlay) analyzeOverlay.style.display = 'none';
    }
    // Restore analyzer content so the previous score/suggestions stay visible
    document.getElementById('analyzer-content').style.display = 'block';
    let msg;
    if (e.message === 'RATE_LIMIT') msg = 'Rate limit reached — try again in 1 minute';
    else if (e.message === 'API_UNAVAILABLE') msg = 'API unavailable — try again shortly';
    else msg = e.message || 'Please try again';
    toast(msg);
  }
}

function renderDeepFixItems(deep) {
  const container = document.getElementById('deep-fix-items');
  if (!container) return;
  let items = [];
  let idx = 1000; // start index after score fixes

  // keyword-type items go to the right column (keyword-coverage), not here
  // collect them for merging into keyword coverage
  const deepKeywords = (deep.missing_keywords || []).map(k => k.keyword).filter(Boolean);
  if (deepKeywords.length) {
    proj._deepKeywords = deepKeywords;
    mergeDeepKeywordsIntoKwCoverage(deepKeywords);
  }
  (deep.weak_phrases || []).forEach(w => {
    items.push({ idx: idx++, badge: 'badge-weak', label: 'weak', title: w.original, desc: `→ ${w.stronger}${w.reason ? ' · ' + w.reason : ''}`, type: 'phrase', before: w.original, after: w.stronger });
  });
  (deep.impact_issues || []).forEach(b => {
    items.push({ idx: idx++, badge: 'badge-weak', label: 'impact', title: b.bullet?.slice(0,70) + (b.bullet?.length > 70 ? '…' : ''), desc: `💡 ${b.suggestion}`, type: 'impact' });
  });
  (deep.gaps || []).forEach(g => {
    items.push({ idx: idx++, badge: 'badge-gap', label: 'gap', title: g.text, desc: g.suggestion ? `💡 ${g.suggestion}` : '', type: 'gap' });
  });

  if (!items.length) { container.innerHTML = ''; return; }

  // Store for applySelectedFixes
  if (!proj._currentFixes) proj._currentFixes = [];
  items.forEach(item => {
    proj._currentFixes[item.idx] = { title: item.title, desc: item.desc, before: item.before || null, after: item.after || null };
  });

  container.innerHTML = items.map(item =>
    `<div class="fix-item" id="fix-item-${item.idx}">
      <input type="checkbox" class="fix-cb" data-idx="${item.idx}" onchange="onFixCheck()">
      <div class="fix-body">
        <span class="analysis-badge ${item.badge}" style="font-size:11px;margin-bottom:4px;display:inline-block;">${item.label}</span>
        <div class="fix-title">${esc(item.title)}</div>
      </div>
    </div>`
  ).join('');
  onFixCheck();
}

async function rescan() {
  const resume=getResumeText();const jdText=g('jd-text')||proj?.jdText||'';
  if(!resume){toast('Generate a resume first');return;}
  const text=document.getElementById('resume-editor').innerText||'';
  if(text.trim()&&proj?.drafts?.length) proj.drafts[proj.drafts.length-1]=text.trim();

  // Only show analyzer panel, don't switch tab (user controls tab navigation)
  // switchTab('analyzer');
  document.getElementById('analyzer-content').style.display='none';
  const loading=document.getElementById('dash-loading');loading.classList.add('show');
  try {
    const raw=await claudeFetch(`Score this resume against the job description. Return ONLY valid JSON:
{"overall":78,"keyword_match":82,"hard_skills":88,"soft_skills":70,"title_alignment":75,"yoe_alignment":95,"summary_quality":70,"bullet_quality":75,"score_reason":"...","strengths":["..."],"gaps":["..."],"keyword_coverage":[{"keyword":"lean UX","found":true}],"top_fixes":[{"rank":1,"title":"...","desc":"...","section":"summary|bullets|skills","before":"exact verbatim text to replace or empty string","after":"exact stronger replacement — do not fabricate metrics, use only documented results from the resume"}]}
SCORING RULES:
- keyword_match: % of JD keywords found. summary_quality: 50-75 words target, penalize >90 or <40. bullet_quality: ~150 characters target per bullet, penalize >180 chars or no metrics. hard_skills/soft_skills: match to JD + skill count 15-25 target. title_alignment: exact JD title match. overall: weighted average.
TOP_FIXES PRIORITY: 1) Missing keywords 2) Title mismatch 3) Summary length fix with rewrite 4) Long bullets with tighter rewrites 5) Skill count adjustment.
CRITICAL RULES: Read resume carefully. Mark keywords found:true if anywhere in resume. Each "before" = exact quote. Only suggest genuinely missing/weak content.
${(proj.appliedFixes||[]).length ? 'ALREADY APPLIED (do NOT re-suggest):\n' + (proj.appliedFixes||[]).filter(f=>f).map(f=>f.title||f.text||'').filter(Boolean).join('\n') + '\n' : ''}
QUALITY RULES: Do not invent metrics. Only use real documented accomplishments.
JOB:\n${jdText.slice(0,3000)}\nRESUME:\n${resume.slice(0,3000)}`,3000,undefined,undefined,CONFIG.models.sonnet);
    const score=parseJson(raw);
    proj.scores.push(score); autoSave();
    renderDashboard(score);
    loading.classList.remove('show');
    document.getElementById('analyzer-content').style.display='block';
    updateScorePill(score.overall);
  } catch(e){loading.classList.remove('show');toast('Scoring error: '+e.message);}
}

function renderDashboard(score) {
  if (!score) { console.error('renderDashboard: no score provided'); return; }
  try {
    const pct=score.overall||0;
    const circ=document.getElementById('score-circle');
    if(circ){const c=2*Math.PI*42;circ.style.strokeDashoffset=c-(pct/100)*c;circ.style.stroke=pct>=80?'var(--green)':pct>=60?'var(--teal)':'var(--red)';}
    const numEl=document.getElementById('score-num');if(numEl)numEl.textContent=pct+'%';
    // Update the label under the score: shows "original match" when the resume hasn't been
    // optimized in this project yet, or "match" once at least one fix has been applied. Lets
    // the user see at a glance whether the displayed score reflects the un-optimized resume.
    const labelEl = document.querySelector('#analyzer-content .score-ring-num .l');
    if (labelEl) {
      const hasFixes = (proj?.appliedFixes?.length || 0) > 0;
      labelEl.textContent = hasFixes ? 'match' : 'original match';
    }
  const cells=[['keyword_match','Keywords'],['hard_skills','Hard Skills'],['soft_skills','Soft Skills'],['yoe_alignment','Years of Experience'],['summary_quality','Summary'],['bullet_quality','Bullets']];
  const grid=document.getElementById('score-grid');
  if(grid)grid.innerHTML=cells.filter(([k])=>score[k]!==undefined&&score[k]!==null).map(([k,l])=>{
    const v=score[k]||0;
    const c=v>=80?'var(--green)':v>=60?'var(--teal)':'var(--red)';
    let label=l;
    // Add keyword count if Keywords cell
    if(k==='keyword_match'&&score.keyword_coverage?.length){
      const found=score.keyword_coverage.filter(kw=>kw.found).length;
      const total=score.keyword_coverage.length;
      label=`Keywords (${found}/${total})`;
    }
    return`<div class="score-cell"><div class="score-cell-val" style="color:${c}">${v}%</div><div class="score-cell-label">${label}</div></div>`;
  }).join('');
  const sumEl=document.getElementById('score-summary');if(sumEl)sumEl.textContent=score.score_reason||'';
  if(score.top_fixes?.length) proj._currentFixes=score.top_fixes;
  const fixes=document.getElementById('top-fixes');
  if(fixes&&score.top_fixes?.length){
    // Filter out fixes that have already been applied in this project
    const appliedTitles = new Set((proj.appliedFixes || []).filter(f => f && f.type === 'fix').map(f => f.title));
    const nonAppliedFixes = score.top_fixes.filter((f, i) => {
      if (!f) return false;  // skip null entries from malformed AI response
      if (appliedTitles.has(f.title)) return false;
      const item = document.getElementById('fix-item-'+i);
      return !item || !item.classList.contains('applied');
    });
    if(nonAppliedFixes.length) {
      fixes.innerHTML = nonAppliedFixes.map((f,i)=>{
        const origIdx = score.top_fixes.indexOf(f);
        const sectionLabel=f.section||'fix';
        const hasDetail = f.before && f.after;
        return`<div class="fix-item" id="fix-item-${origIdx}">
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <input type="checkbox" class="fix-cb" data-idx="${origIdx}" onchange="onFixCheck()" style="margin-top:4px;flex-shrink:0;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span class="analysis-badge badge-weak" style="font-size:11px;display:inline-block;">${esc(sectionLabel)}</span>
                <span class="fix-title" style="font-weight:600;margin:0;">${esc(f.title)}</span>
              </div>
              ${hasDetail ? `<a href="javascript:void(0)" onclick="toggleFixDetail(this)" style="color:var(--teal);font-size:12px;text-decoration:none;">Show change</a>
              <div class="fix-detail" style="display:none;margin-top:8px;padding:12px;background:var(--surface);border-radius:4px;font-size:12px;border-left:3px solid var(--teal);">
                <div style="margin-bottom:8px;">
                  <div style="color:var(--red);font-weight:600;margin-bottom:4px;">❌ Before:</div>
                  <div style="padding:8px;background:white;border-radius:3px;color:var(--red);">${esc(f.before)}</div>
                </div>
                <div style="margin-bottom:8px;">
                  <div style="color:var(--green);font-weight:600;margin-bottom:4px;">✓ After:</div>
                  <div style="padding:8px;background:white;border-radius:3px;color:var(--green);">${esc(f.after)}</div>
                </div>
                ${f.reason ? `<div style="color:var(--muted);font-size:11px;margin-top:8px;padding:8px;border-top:1px solid var(--border);font-style:italic;">${esc(f.reason)}</div>` : ''}
              </div>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    } else {
      fixes.innerHTML = '';
    }
  }
  updateFixBar();
  const kwCov=document.getElementById('keyword-coverage');
  if(kwCov&&score.keyword_coverage?.length){
    const total=score.keyword_coverage.length;
    const found=score.keyword_coverage.filter(k=>k.found).length;
    const missing=score.keyword_coverage.filter(k=>!k.found);
    const pct=total?Math.round((found/total)*100):0;
    let html='';
    if(missing.length){
      // Filter out keywords already added in this project
      const appliedKeywords = new Set((proj.appliedFixes || []).filter(f => f && f.type === 'keyword').map(f => f.text));
      const newMissing = missing.filter(k => !appliedKeywords.has(k.keyword));
      if (newMissing.length) {
        proj._missingKeywords=newMissing.map(k=>k.keyword);
        html+=`<div class="kw-missing-head">Keywords to add</div>`;
      html+=`<div class="kw-missing-row" style="border-bottom:1px solid var(--border);margin-bottom:4px;padding-bottom:6px;">
        <input type="checkbox" id="mkw-all" onchange="toggleAllMissingKw(this.checked)">
        <label for="mkw-all" style="font-weight:600;color:var(--ink);">Select all (${missing.length})</label>
      </div>`;
        html+=newMissing.map((k,i)=>`<div class="kw-missing-row">
        <input type="checkbox" id="mkw-${i}" data-kw="${esc(k.keyword)}" onchange="onMissingKwCheck()">
        <label for="mkw-${i}">${esc(k.keyword)}</label>
      </div>`).join('');
      } else {
        // All new keywords have been added
        html=``;
      }
    } else {
      html=``;
    }
    kwCov.innerHTML=html;
  }
  const str=document.getElementById('score-strengths');const gap=document.getElementById('score-gaps');
  if(str&&score.strengths?.length)str.innerHTML=score.strengths.map(s=>`<div class="text-xs" style="padding:4px 0;border-bottom:1px solid var(--border);color:var(--green);">✓ ${esc(s)}</div>`).join('');
  if(gap&&score.gaps?.length)gap.innerHTML=score.gaps.map(g=>`<div class="text-xs" style="padding:4px 0;border-bottom:1px solid var(--border);color:var(--red);">✗ ${esc(g)}</div>`).join('');
  // Update the suggestion counts after rendering
  updateSuggestionCounts();
  } catch(e) {
    console.error('renderDashboard error at:', e.message, e.stack);
    console.log('Score state:', JSON.stringify({
      hasTopFixes: !!score?.top_fixes,
      topFixesLen: score?.top_fixes?.length,
      topFixSample: score?.top_fixes?.slice(0,3),
      appliedFixesLen: proj?.appliedFixes?.length,
      appliedFixSample: (proj?.appliedFixes||[]).slice(0,3)
    }));
    toast('Error displaying analysis results: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────
//  APPLY SUGGESTIONS
// ─────────────────────────────────────────────────────────
function toggleDiff(i){const el=document.getElementById('fix-diff-'+i);if(!el)return;el.classList.toggle('show');const t=el.nextElementSibling;if(t)t.textContent=el.classList.contains('show')?'Hide change':'Show change';}
function toggleAllFixes(c){
  document.querySelectorAll('.fix-cb').forEach(cb=>{if(!cb.closest('.fix-item').classList.contains('applied'))cb.checked=c;});
  document.querySelectorAll('.kw-missing-row input[data-kw]').forEach(cb=>cb.checked=c);
  const mkwAll=document.getElementById('mkw-all');if(mkwAll)mkwAll.checked=c;
  const impAll=document.getElementById('improvements-select-all');if(impAll)impAll.checked=c;
  document.getElementById('fix-select-all').checked=c;
  updateFixBar();
}
function toggleAllImprovements(c){
  document.querySelectorAll('.fix-cb').forEach(cb=>{if(!cb.closest('.fix-item').classList.contains('applied'))cb.checked=c;});
  const fixSelAll=document.getElementById('fix-select-all');
  // Sync top-level select all only if keywords also match
  const kwCbs=document.querySelectorAll('.kw-missing-row input[data-kw]');
  const allKwChecked=[...kwCbs].every(cb=>cb.checked);
  if(fixSelAll) fixSelAll.checked = c && allKwChecked;
  updateFixBar();
}
function clearAllSelections(){
  toggleAllFixes(false);
  const selAll = document.getElementById('fix-select-all');
  if(selAll) selAll.checked=false;
}
function onFixCheck(){const all=document.querySelectorAll('.fix-cb'),checked=document.querySelectorAll('.fix-cb:checked');const fixSelAll=document.getElementById('fix-select-all');if(fixSelAll)fixSelAll.checked=all.length>0&&checked.length===all.length;updateFixBar();}
function toggleFixDetail(link) {
  const detail = link.nextElementSibling;
  if (detail && detail.classList.contains('fix-detail')) {
    detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    link.textContent = detail.style.display === 'none' ? 'Show change' : 'Hide change';
  }
}

function updateFixBar(){
  try {
    const fixN = document.querySelectorAll('.fix-cb:checked').length;
    const kwN = document.querySelectorAll('.kw-missing-row input[data-kw]:checked').length;
    const total = fixN + kwN;
    const bar = document.getElementById('fix-apply-bar');
    const cnt = document.getElementById('fix-sel-count');
    if (bar) bar.classList.toggle('show', total > 0);
    if (cnt) cnt.textContent = total;
  } catch(e) {
    console.error('updateFixBar error:', e);
  }
}

function updateSuggestionCounts(){
  try {
    // Count available (non-applied) improvements
    const nonAppliedFixes = Array.from(document.querySelectorAll('.fix-item')).filter(item => !item.classList.contains('applied')).length;
    // Count available keywords
    const allKwCbs = document.querySelectorAll('.kw-missing-row input[data-kw]').length;
  
    // Update improvements count - find the label containing improvements-select-all
    const impCheckbox = document.getElementById('improvements-select-all');
    if (impCheckbox?.parentElement) {
      impCheckbox.parentElement.innerHTML = `<input type="checkbox" id="improvements-select-all" onchange="toggleAllImprovements(this.checked)" style="accent-color:var(--teal);width:18px;height:18px;cursor:pointer;"><span>Select all (${nonAppliedFixes})</span>`;
    }
    
    // Update keywords count
    const kwCheckbox = document.getElementById('mkw-all');
    if (kwCheckbox?.parentElement) {
      kwCheckbox.parentElement.innerHTML = `<input type="checkbox" id="mkw-all" onchange="toggleAllMissingKw(this.checked)" style="accent-color:var(--teal);width:18px;height:18px;cursor:pointer;"><span>Select all (${allKwCbs})</span>`;
    }
    
    // Update top-level count
    const topCheckbox = document.getElementById('fix-select-all');
    if (topCheckbox?.parentElement) {
      topCheckbox.parentElement.innerHTML = `<input type="checkbox" id="fix-select-all" onchange="toggleAllFixes(this.checked)" style="accent-color:var(--teal);width:18px;height:18px;cursor:pointer;"><span>Select all (${nonAppliedFixes + allKwCbs})</span>`;
    }
  } catch(e) {
    console.error('updateSuggestionCounts error:', e);
  }
}

function mergeDeepKeywordsIntoKwCoverage(deepKeywords) {
  // Add deep analysis keywords to the right column if not already there
  const kwCovEl = document.getElementById('keyword-coverage');
  if (!kwCovEl) return;
  // Get existing keyword checkboxes
  const existing = new Set(
    Array.from(kwCovEl.querySelectorAll('input[data-kw]')).map(cb => cb.dataset.kw?.toLowerCase())
  );
  const toAdd = deepKeywords.filter(k => !existing.has(k.toLowerCase()));
  if (!toAdd.length) return;

  // Find or create the missing section
  let missingHead = kwCovEl.querySelector('.kw-missing-head');
  if (!missingHead) {
    // No missing section yet — create one
    const startIdx = (kwCovEl.querySelectorAll('input[data-kw]').length);
    let html = `<div class="kw-missing-head">Keywords to add</div>`;
    html += `<div class="kw-missing-row" style="border-bottom:1px solid var(--border);margin-bottom:4px;padding-bottom:6px;">
      <input type="checkbox" id="mkw-all" onchange="toggleAllMissingKw(this.checked)">
      <label for="mkw-all" style="font-weight:600;color:var(--ink);">Select all</label>
    </div>`;
    toAdd.forEach((k, i) => {
      html += `<div class="kw-missing-row">
        <input type="checkbox" id="mkw-d${i}" data-kw="${k}" onchange="onMissingKwCheck()">
        <label for="mkw-d${i}">${k}</label>
      </div>`;
    });
    kwCovEl.insertAdjacentHTML('beforeend', html);
  } else {
    // Append to existing missing list, before the apply button
    const applyBtn = kwCovEl.querySelector('.kw-apply-btn');
    const insertBefore = applyBtn || null;
    const offset = kwCovEl.querySelectorAll('input[data-kw]').length;
    toAdd.forEach((k, i) => {
      const row = document.createElement('div');
      row.className = 'kw-missing-row';
      const idx = offset + i;
      row.innerHTML = `<input type="checkbox" id="mkw-d${idx}" data-kw="${k}" onchange="onMissingKwCheck()">
        <label for="mkw-d${idx}">${k}</label>`;
      if (insertBefore) kwCovEl.insertBefore(row, insertBefore);
      else kwCovEl.appendChild(row);
    });
  }
}

function onMissingKwCheck() {
  // Sync Select All state
  const checked = document.querySelectorAll('.kw-missing-row input[data-kw]:checked');
  const allCbs = document.querySelectorAll('.kw-missing-row input[data-kw]');
  const selAll = document.getElementById('mkw-all');
  if (selAll) { selAll.checked = (checked.length === allCbs.length && checked.length > 0); }
  // Trigger the unified apply bar
  updateFixBar();
}

function toggleAllMissingKw(checked) {
  document.querySelectorAll('.kw-missing-row input[data-kw]').forEach(cb => { if(cb) cb.checked = checked; });
  onMissingKwCheck();
}

async function applyMissingKeywords() {
  const checked = Array.from(document.querySelectorAll('.kw-missing-row input:checked'));
  if (!checked.length) return;
  const keywords = checked.map(cb => cb.dataset.kw).filter(Boolean);
  const resume = getResumeText();
  if (!resume) { toast('No resume to update'); return; }

  const btn = document.getElementById('kw-apply-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

  try {
    const prompt = `Insert these missing keywords naturally into the resume where most relevant. Do not fabricate accomplishments — only add the keywords to existing sentences or skill lists where they genuinely fit. If a keyword fits multiple places, pick the strongest one. Return ONLY the complete updated resume text, no commentary.

KEYWORDS TO ADD:
${keywords.map(k => '• ' + k).join('\n')}

RESUME:
${resume}`;
    const result = await claudeFetch(prompt, 4000);
    const cleaned = deduplicateResume(result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim());
    proj.drafts.push(cleaned);
    proj._redoStack = [];
    autoSave();
    showResume(cleaned, proj.drafts.length);
    toast(`✓ Added ${keywords.length} keyword${keywords.length===1?'':'s'} — click Analyze to rescore`);
  } catch(e) {
    toast('Error adding keywords: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; onMissingKwCheck(); }
  }
}

function recordAppliedFix(type, title, text) {
  if (!proj) return;
  if (!proj.appliedFixes) proj.appliedFixes = [];
  // Avoid duplicates
  const exists = proj.appliedFixes.find(f => f.type === type && f.text === text);
  if (!exists) {
    proj.appliedFixes.push({
      type: type,  // 'fix' or 'keyword'
      title: title,
      text: text,
      timestamp: Date.now()
    });
    autoSave();
  }
}

function removeAppliedFix(type, text) {
  if (!proj || !proj.appliedFixes) return;
  proj.appliedFixes = proj.appliedFixes.filter(f => !(f.type === type && f.text === text));
  autoSave();
  renderAppliedFixes();
}

function renderAppliedFixes() {
  if (!proj || !proj.appliedFixes) {
    proj.appliedFixes = [];
  }
  const improvementsDiv = document.getElementById('applied-improvements');
  const keywordsDiv = document.getElementById('applied-keywords');
  
  const improvements = proj.appliedFixes.filter(f => f.type === 'fix');
  const keywords = proj.appliedFixes.filter(f => f.type === 'keyword');
  
  if (improvements.length) {
    improvementsDiv.innerHTML = improvements.map(f => 
      `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <span style="flex:1;">✓ ${esc(f.title)}</span>
        <button onclick="removeAppliedFix('fix', '${esc(f.text).replace(/'/g, "\'")}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12px;padding:0 4px;">✕</button>
      </div>`
    ).join('');
  } else {
    improvementsDiv.innerHTML = '<div style="color:var(--muted);font-size:12px;">None yet</div>';
  }
  
  if (keywords.length) {
    keywordsDiv.innerHTML = keywords.map(k => 
      `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <span style="flex:1;">✓ ${esc(k.text)}</span>
        <button onclick="removeAppliedFix('keyword', '${esc(k.text).replace(/'/g, "\'")}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12px;padding:0 4px;">✕</button>
      </div>`
    ).join('');
  } else {
    keywordsDiv.innerHTML = '<div style="color:var(--muted);font-size:12px;">None yet</div>';
  }
}


function deduplicateResume(text) {
  // Detect and remove duplicate role blocks. A role's identity is title + company + start-date,
  // not just the title line — same title at different employers is legitimate.
  const lines = text.split('\n');
  const seen = new Set();
  const result = [];
  let skip = 0;

  // Collapse "X · X" or "X — X" patterns where the same phrase appears twice with a separator.
  const collapseDoubledTitle = (s) => {
    const m = s.match(/^(.{8,}?)\s*[·\-—]\s*\1\s*$/i);
    return m ? m[1].trim() : s;
  };

  // Identify a role title line: bold or a substantial line that is NOT a company/date/bullet line.
  const isTitleLine = (s) => {
    const t = s.trim();
    if (!t) return false;
    if (/^\*\*[^*]+\*\*/.test(t)) return true;
    // Title heuristic: starts with capital, decent length, no leading bullet, no leading date,
    // no all-lowercase URLs, and not a Section heading like "EXPERIENCE" / "SKILLS"
    if (/^[•\-\*]/.test(t)) return false;
    if (/^\d/.test(t)) return false;
    if (/^[A-Z\s]{4,}$/.test(t)) return false; // section heading
    if (t.length < 8 || t.length > 160) return false;
    if (!/^[A-Z]/.test(t)) return false;
    return true;
  };

  // Identify a company/location/date line — typically "Company · Location MM/YY-MM/YY" or has "·"
  const COMPANY_DATE_RE = /·.*\d{2}\/\d{2}|\d{2}\/\d{2}\s*[-–—]\s*(?:\d{2}\/\d{2}|Present|Current)/i;
  const isCompanyDateLine = (s) => COMPANY_DATE_RE.test(s.trim());

  // Extract a normalized identity key from a (title, companyDate) pair
  const makeKey = (title, companyDate) => {
    const t = collapseDoubledTitle(title.replace(/\*\*/g, '').trim()).toLowerCase().replace(/\s+/g, ' ');
    const cd = (companyDate || '').toLowerCase().replace(/\s+/g, ' ');
    // Pull out start date (first MM/YY) for the identity, since same title+company at different times = different role
    const dateMatch = cd.match(/(\d{2}\/\d{2})/);
    const startDate = dateMatch ? dateMatch[1] : '';
    // Pull out company name (first chunk before first "·")
    const company = cd.split('·')[0].trim();
    return `${t}|${company}|${startDate}`;
  };

  for (let i = 0; i < lines.length; i++) {
    if (skip > 0) { skip--; continue; }
    const line = lines[i].trim();

    if (isTitleLine(line)) {
      // Look ahead to find the company/date line (could be on next line, or 2 lines down)
      let companyDate = '';
      let companyDateLineIdx = -1;
      for (let lookAhead = 1; lookAhead <= 2; lookAhead++) {
        const candidate = (lines[i + lookAhead] || '').trim();
        if (isCompanyDateLine(candidate)) {
          companyDate = candidate;
          companyDateLineIdx = i + lookAhead;
          break;
        }
        if (!candidate) break; // hit a blank line, stop looking
      }

      // Only treat as a role if we found a real company/date line OR title is bold-formatted
      const isBoldHeader = /^\*\*[^*]+\*\*/.test(line);
      if (!companyDate && !isBoldHeader) {
        result.push(lines[i]);
        continue;
      }

      const key = makeKey(line, companyDate);
      if (seen.has(key)) {
        // Skip the duplicate block: skip the title, company/date, prose, and bullets — everything
        // until we hit the next role header (a title line followed within 2 lines by a company/date line)
        // or a section heading.
        let j = (companyDateLineIdx >= 0 ? companyDateLineIdx : i) + 1;
        while (j < lines.length) {
          const next = lines[j].trim();
          // Section heading (all-caps standalone) ends the block
          if (/^[A-Z\s]{4,40}$/.test(next) && next === next.toUpperCase()) break;
          // A new role header is title-like AND has a company/date line within 2 lines
          if (isTitleLine(next)) {
            let foundCompany = false;
            for (let la = 1; la <= 2; la++) {
              const peek = (lines[j + la] || '').trim();
              if (isCompanyDateLine(peek)) { foundCompany = true; break; }
              if (!peek) break;
            }
            if (foundCompany || /^\*\*[^*]+\*\*/.test(next)) break;
          }
          j++;
        }
        skip = j - i - 1;
        continue;
      }
      seen.add(key);
    }
    // Apply doubled-title collapse to title lines we keep, in case the AI duplicated the title within a single line
    if (isTitleLine(line)) {
      const collapsed = collapseDoubledTitle(line.replace(/^\*\*/, '').replace(/\*\*$/, ''));
      if (collapsed !== line.replace(/^\*\*/, '').replace(/\*\*$/, '')) {
        // Preserve any bold markers around the collapsed title
        const wasBold = /^\*\*.+\*\*$/.test(line);
        result.push(wasBold ? `**${collapsed}**` : collapsed);
        continue;
      }
    }
    result.push(lines[i]);
  }
  return result.join('\n');
}

// Focused second-pass: removes repeated metrics across bullets within the same role.
// Single-task prompt with no competing instructions, so the dedup rule actually holds.
// Fail-safe: if the call errors, returns the original text unchanged.
// Same-employer differentiation pass. When two roles share the same company name, scan their
// bullets for high lexical overlap and rewrite the less-specific occurrence using only facts
// already in that role's existing bullets/context. If no honest differentiation is possible from
// the verified facts, the duplicate is removed rather than rewritten. Silent — no UI surface.
// Caps total skill count at 24, prioritizing skills most relevant to the JD.
// Runs after the dedup passes so it operates on a clean resume.
// If JD context isn't available or the resume already has <=30 skills, returns input unchanged.
// Limit each role's bullets to a maximum of 3. Removes extra bullets after the 3rd.
// Keeps role headers, descriptions, and maintains formatting.

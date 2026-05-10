async function applySelectedFixes(){
  // Check token limits before proceeding (only if using app's key, not user's own)
  if (window._atsUser && !hasOwnApiKey()) {
    if (!TokenTracker.canUseTokens(window._atsUser.id, CONFIG.tokens.estimatedPerOptimization)) {
      const remaining = TokenTracker.getRemaining(window._atsUser.id);
      toast(`Optimization requires ~${CONFIG.tokens.estimatedPerOptimization} tokens. You have ${remaining.daily} daily remaining, ${remaining.monthly} monthly remaining.`);
      return;
    }
  }
  
  const fixCbs = Array.from(document.querySelectorAll('.fix-cb:checked'));
  const kwCbs = Array.from(document.querySelectorAll('.kw-missing-row input[data-kw]:checked'));

  if (!fixCbs.length && !kwCbs.length) { toast('Select at least one suggestion or keyword'); return; }

  const fixes = proj._currentFixes || [];
  const selectedFixes = fixCbs.map(cb => fixes[parseInt(cb.dataset.idx)]).filter(Boolean);
  const selectedKws = kwCbs.map(cb => cb.dataset.kw).filter(Boolean);

  const resume = getResumeText();
  if (!resume) { toast('No resume to update'); return; }

  // Show blocking overlay modal — Phase 1: Optimizing
  const overlay = document.getElementById('apply-overlay');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlaySub = document.getElementById('overlay-sub');
  overlayMsg.textContent = 'Optimizing resume...';
  overlaySub.textContent = 'Applying your selected changes';
  overlay.style.display = 'flex';

  const applyBtn = document.getElementById('apply-btn');
  applyBtn.disabled = true;

  try {
    // Build combined prompt
    let promptBody = '';
    if (selectedFixes.length) {
      const fixInstructions = selectedFixes.map((f,i) => {
        if (f.before && f.after) return `FIX ${i+1} — ${f.title}\nREPLACE: ${f.before}\nWITH: ${f.after}`;
        return `FIX ${i+1} — ${f.title}: ${f.desc}`;
      }).join('\n\n');
      promptBody += `FIXES TO APPLY:\n${fixInstructions}\n\n`;
    }
    if (selectedKws.length) {
      promptBody += `KEYWORDS TO INSERT (weave naturally into existing sentences or skill lists — no fabricated accomplishments):\n${selectedKws.map(k => '• ' + k).join('\n')}\n\n`;
    }

    const jdTitle = g('jd-title') || proj?.jdTitle || '';
    const titleRule = jdTitle ? `\\n- The person's job title line (directly under their name) MUST be exactly: "${jdTitle}"` : '';
    const verifiedFacts = buildVerifiedFacts();
    const verifiedFactsBlock = verifiedFacts ? `\n\nVERIFIED FACTS — the closed world of this candidate's actual experience. You may rephrase, reorder, emphasize, or sharpen anything below. You may NOT introduce anything outside it.\n\n${verifiedFacts}` : '';
    const bulletContextBlock = buildBulletContextBlock();

    const result = await claudeFetch(
      `GOAL: Find the strongest HONEST angle this candidate has on this JD, and amplify it. The goal is NOT to make the resume look like the JD. Bridges to gaps must come from real transferable strengths, never from invented experience.
${TRUTH_GROUNDING_RULES}
Apply these changes to the resume. CRITICAL FORMATTING RULES:\n- Keep the EXACT same section structure and order as the original resume${titleRule}\n- SKILLS must stay organized in labeled categories (e.g. Leadership:, Design:, Product:, Engineering:). If the original has categories, keep them. If not, organize skills into logical categories.\n- When adding keywords to skills, place them in the correct category\n- Do NOT merge all skills into one flat list\n- FORMATTING IS SACRED: Output must use IDENTICAL format as input — same line breaks, spacing, bullet characters, section header style.\n- Do NOT reformat, restructure, merge lines, split lines, add/remove blank lines, or change bullet style.\n- Do NOT change the number of roles, reorder roles, or alter dates/companies.\n- ONLY change the specific text content requested. Everything else stays EXACTLY as-is.\n- WHEN A FIX MODIFIES A BULLET: REPLACE the original bullet with the rewritten version. Never keep both the old bullet AND a rewritten variant of it. The output must contain exactly one bullet for each accomplishment, not the original plus a near-duplicate.\n- NEVER ADD NEW BULLETS that describe the same team, product area, or accomplishment as an existing bullet. If a fix would generate a new bullet, check whether an existing bullet already covers that team/scope/metric. If yes, modify the existing bullet instead of appending a new one.
- CRITICAL: Before returning, check for duplicate job entries. If any company + title + date combination appears more than once, remove the duplicate. Each role must appear exactly once.
- CRITICAL: NEVER output placeholder metric tokens. Forbidden: "X%", "XX%", "Y%", "Z%", "[number]%", "[percent]%", "[metric]%", "___%", "TBD%", or any bracketed/blank stand-in for a number. If you don't have a real value from the original resume, write the bullet WITHOUT a percentage — a bullet with no metric is acceptable, a bullet with a placeholder metric is NOT.
- CRITICAL: Within each role, check for repeated metrics or phrases across bullets. If the same metric (e.g. '26% MAU growth') appears in more than one bullet, remove it from the less specific bullet and keep it only in the bullet that explains it most clearly.\n- NEVER FABRICATE metrics, percentages, revenue figures, outcomes, team members, products, domains, or accomplishments not present in VERIFIED FACTS. If the original says '26% MAU growth', keep that exact number. Never invent '40% user growth' or '$2M revenue' unless those exact figures exist in VERIFIED FACTS.\n- NEVER USE competitor brand names anywhere in the resume. 'Commercial Card', 'Capital One brand', 'Chase', 'Amex', etc. are competitor product names. Replace with generic terms.\n- CRITICAL: Use FIRST PERSON (I/me/my) throughout. NEVER write in third person (he/she/they/name). Remove all third-person pronouns.
- BEFORE returning the resume, scan every bullet, summary line, and skill for: (1) any metric not in VERIFIED FACTS, (2) any competitor brand name, (3) any domain/product/team-member that does not appear in VERIFIED FACTS, (4) any verbatim JD phrase grafted onto unrelated work, (5) ANY THIRD-PERSON PRONOUNS. Remove or rewrite all five.\n- SKILLS must stay in labeled categories. NEVER merge into one block.\n- Remove non-skills from the skills section: phrases like 'Business Goals', 'portfolio strategy', 'Experience Design organization' are NOT skills.\n- SUMMARY must be 50-75 words. If the current summary exceeds 75 words, trim it. NEVER let it grow beyond 75 words.\n- NEVER repeat the same phrase twice in the summary. Check for duplicates before returning.\n- The job title directly under the candidate's name MUST exactly match the JD title. Do not revert it.\n- Bullets target: ~150 characters each (180 hard ceiling). Skills target: 15-25 items in categories.\n\nReturn ONLY the complete corrected plain-text resume, no commentary.\n${verifiedFactsBlock}${bulletContextBlock}\n\n${promptBody}RESUME:\n${resume}`,
      4000
    );
    const firstPass = deduplicateResume(result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim());

    // Phase 2a: Within-role phrase dedup — catches near-duplicate bullets in the same role
    // (e.g. "Led 30 designers ship platform" + "Aligned 30 designers on product direction").
    // Runs first so the metric pass downstream sees a cleaner input.
    overlayMsg.textContent = 'Polishing...';
    overlaySub.textContent = 'Removing duplicate bullets within roles';
    const phraseDeduped = await dedupeBulletPhrases(firstPass);

    // Phase 2b: Remove repeated metrics across bullets within the same role.
    overlaySub.textContent = 'Removing duplicate metrics across bullets';
    const deduped = await dedupeBulletMetrics(phraseDeduped);

    // Phase 3: Differentiate near-duplicate bullets across roles at the same employer.
    // Rewrites the less-specific occurrence using only facts already in that role, or deletes
    // the duplicate if no honest differentiation is possible. Critical at senior levels where
    // generic same-company language reads as careless copy-paste.
    overlaySub.textContent = 'Differentiating roles at the same employer';
    const differentiated = await differentiateSameEmployerRoles(deduped);

    // Phase 4: Cross-role boilerplate dedup — catches filler phrases repeated across unrelated
    // roles (e.g. "building tools that help teams work effectively" in both Yodle and Verizon).
    overlaySub.textContent = 'Removing repeated boilerplate across roles';
    const boilerplateCleaned = await dedupeCrossRoleBoilerplate(differentiated);

    // Phase 4b: Cap bullets at 3 per role for ATS optimization.
    overlaySub.textContent = 'Limiting bullets to 3 per role';
    const bulletsCapped = capBulletsPerRole(boilerplateCleaned);

    // Phase 4c: Auto-trim to recommended length based on YOE.
    // Standard guideline: <5y=1pg, 5-10y=1-2pg, 10-15y=2pg, 15-20y=2pg, 20+y=2-3pg
    // ALWAYS call trim — it does its own internal gating (returns input unchanged if
    // both char count AND visual rendering say we fit). This catches edge cases where
    // char count is fine but visually we orphan to next page.
    const lengthAnalysis = RESUME_LENGTH.analyze(bulletsCapped);
    overlaySub.textContent = `Verifying length fits ${lengthAnalysis.recommended.label}`;
    const lengthAdjusted = await trimToTargetLength(bulletsCapped);

    // Phase 5: Cap skills at 24, prioritizing JD-relevant ones.
    overlaySub.textContent = 'Prioritizing skills for this role';
    const skillsCapped = await capSkillsTo30(lengthAdjusted);

    // Phase 6: Regex safety net — strip any placeholder tokens (X%, [number]%, ___%, etc.).
    const cleaned = stripPlaceholders(skillsCapped);
    
    // Phase 7: Replace em dashes with commas — em dashes don't sound human.
    const finalText = stripEmDashes(cleaned);

    // Phase 8: CRITICAL VALIDATION — check for third-person pronouns (he/she/they in resume content).
    // Resumes must use first person (I/me/my) or no pronouns. Third-person is unprofessional.
    const pronounCheck = validatePronounConsistency(finalText);
    if (!pronounCheck.valid) {
      // If third-person pronouns found, flag this to the user but don't block
      // (in case they intentionally want to review before auto-rewriting)
      const issueMsg = pronounCheck.issues[0];
      const suggestions = pronounCheck.suggestions.join('\n');
      const confirmRewrite = confirm(
        `⚠️ PRONOUN CHECK FAILED\n\n${issueMsg}\n\nSuggested fixes:\n${suggestions}\n\n` +
        `Resume must use FIRST PERSON (I/me/my) not third person.\n\n` +
        `OK = Continue anyway (review manually)\nCancel = Go back and edit`
      );
      if (!confirmRewrite) {
        overlayClose();
        return;
      }
    }

    // Push as a new draft so each Apply Selected click increments the version (v1 → v2 → v3...)
    proj.drafts.push(finalText);
    proj._redoStack = [];
    proj._aiApplied = true;
    proj._cachedScore = null; proj._analysisHash = null; proj.scores = [];
    autoSave();
    showResume(finalText, proj.drafts.length);

    // Mark applied items and record them
    fixCbs.forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const fix = fixes[idx];
      if (fix) recordAppliedFix('fix', fix.title, fix.title);
      cb.checked = false;
      cb.disabled = true;
      document.getElementById('fix-item-' + cb.dataset.idx)?.classList.add('applied');
    });
    kwCbs.forEach(cb => {
      const kw = cb.dataset.kw;
      recordAppliedFix('keyword', kw, kw);
      cb.checked = false;
      cb.disabled = true;
      cb.closest('.kw-missing-row')?.style.setProperty('opacity', '0.5');
    });
    renderAppliedFixes();

    const selAll = document.getElementById('fix-select-all');
    if (selAll) selAll.checked = false;
    const kwSelAll = document.getElementById('mkw-all');
    if (kwSelAll) kwSelAll.checked = false;
    updateFixBar();
    const totalApplied = selectedFixes.length + selectedKws.length;
    toast(`${totalApplied} fix${totalApplied>1?'es':''} applied`);

    // Phase 2: Scoring — update overlay message
    overlayMsg.textContent = 'Scoring resume...';
    overlaySub.textContent = 'Evaluating your updated resume against the job description';
    await runFullAnalysis(true);  // pass true to skip showing its own overlay

    // Phase 3: Sync CE fields
    try {
      const _currentTab = document.querySelector('.tab.active')?.id?.replace('tab-','');
      await parseToCE(cleaned, true);  // suppress tab switch — we'll restore the active tab below
      fillCE(proj.ce);
      // Auto-fill Job Title from posting — always match exactly
      if (proj.jdTitle) {
        document.getElementById('ce-title').value = proj.jdTitle;
      }
      autoSave();
      if (_currentTab) switchTab(_currentTab);
    } catch(ceErr) { console.warn('CE sync after apply:', ceErr); }
  } catch(e){
    let msg;
    if (e.message === 'RATE_LIMIT') msg = 'Rate limit reached — try again in 1 minute';
    else if (e.message === 'API_UNAVAILABLE') msg = 'API unavailable — try again shortly';
    else msg = 'Error: ' + (e.message || 'please try again');
    toast(msg);
  }
  applyBtn.disabled=false;
  overlay.style.display = 'none';
}

// ─────────────────────────────────────────────────────────
//  AUTO-OPTIMIZE TO 90+
// ─────────────────────────────────────────────────────────
// Triggered from the Optimize Resume button at the bottom of the Job & Questions page.
// Switches the user to the Analyzer tab and runs the same single-pass Optimize.
function optimizeFromJD() {
  switchTab('analyzer');
  // Small delay so the tab is visible before the overlay opens
  setTimeout(() => autoOptimize(), 100);
}

// Runs autoOptimize 3 times in a row. Each pass gets a fresh analysis (runFullAnalysis is called
// at the top of autoOptimize) so each round targets whatever gaps remain. The post-Optimize
// summary view runs only at the end with diff = original draft → final draft.
async function autoOptimizeExtreme() {
  if (!proj) { toast('Create a project first'); return; }
  const originalBefore = getResumeText();
  const scoreBefore = proj._cachedScore?.overall || 0;
  const passes = 3;
  for (let i = 0; i < passes; i++) {
    const isLast = i === passes - 1;
    await autoOptimize({ suppressPostView: !isLast, passLabel: `Pass ${i+1} of ${passes}` });
  }
  // Final post-view spans the WHOLE diff so the user sees what changed across all 3 passes.
  const finalDraft = getResumeText();
  const scoreAfter = proj._cachedScore?.overall || 0;
  try { await showPostOptimizeView(originalBefore, finalDraft, scoreBefore, scoreAfter); }
  catch(viewErr) { console.warn('Post-optimize view (extreme):', viewErr); }
}

async function autoOptimize(opts) {
  opts = opts || {};
  const suppressPostView = !!opts.suppressPostView;
  const passLabel = opts.passLabel || '';
  const resume = getResumeText();
  const jdText = g('jd-text') || proj?.jdText || '';
  if (!resume) { toast('Add resume content first'); return; }
  if (!jdText) { toast('Paste a job description in the Job Description tab first'); return; }
  if (!proj) { toast('Create a project first'); return; }

  // If the JD has questions and any are unanswered, give the user the chance to fill them in
  // first. Answers feed into the optimizer as verified facts and produce noticeably better
  // rewrites. We use a confirm dialog so they can choose to proceed without answering.
  // Skip this check on subsequent passes inside Optimize Extreme so we don't prompt 3x.
  if (!passLabel) {
    const unanswered = (proj.questions || []).filter(q => !q.answer || !q.answer.trim()).length;
    if (unanswered > 0) {
      const goAnswer = confirm(
        `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''} about your experience.\n\n` +
        `Answering them gives the optimizer verified facts to work with and produces a stronger rewrite.\n\n` +
        `Click OK to answer them now (recommended).\n` +
        `Click Cancel to skip and optimize anyway.`
      );
      if (goAnswer) {
        switchTab('jd');
        setTimeout(() => {
          const firstUnanswered = (proj.questions || []).find(q => !q.answer || !q.answer.trim());
          if (firstUnanswered) {
            const ta = document.getElementById('qa-' + firstUnanswered.id);
            if (ta) { ta.scrollIntoView({behavior:'smooth', block:'center'}); ta.focus(); }
          }
        }, 200);
        return;
      }
    }
  }

  const overlay = document.getElementById('apply-overlay');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlaySub = document.getElementById('overlay-sub');
  const autoBtn = document.getElementById('auto-opt-btn');
  const extremeBtn = document.getElementById('auto-opt-extreme-btn');
  if (autoBtn) autoBtn.disabled = true;
  if (extremeBtn) extremeBtn.disabled = true;

  overlay.style.display = 'flex';

  try {
    // Phase 1: Score & analyze. If the resume + JD haven't changed since last analysis,
    // runFullAnalysis returns instantly from cache (via _analysisHash). No re-scoring,
    // no token cost. We removed the cache-clear that used to force re-analysis here.
    overlayMsg.textContent = 'Analyzing resume...';
    overlaySub.textContent = 'Evaluating your resume against the job description';

    await runFullAnalysis(true);

    // runFullAnalysis clears the deep-fix-items panel and produces only 1-3 score-level top fixes.
    // The 15-30 Content Improvements + missing keywords visible in the deep analyzer come from a
    // separate runDeepAnalysis() call. Without this, Optimize would see almost nothing to apply.
    overlaySub.textContent = 'Running deep analysis for content improvements';
    try { await runDeepAnalysis(); } catch(e) { console.warn('Deep analysis during Optimize failed:', e); }

    const scoreBefore = proj._cachedScore?.overall || 0;
    // Snapshot the draft going INTO optimize so we can show a before/after diff at the end.
    const beforeDraft = getResumeText();

    // Phase 2: Gather all suggestions + missing keywords
    // _currentFixes is a sparse array — top fixes occupy 0..N, deep fixes occupy 1000+.
    // We must iterate by the actual stored index, not a dense iteration index, so each fix is
    // matched to its DOM checkbox by its real data-idx attribute.
    const fixesArr = proj._currentFixes || [];
    console.log('[Optimize] _currentFixes length:', fixesArr.length, 'filled slots:', fixesArr.filter(Boolean).length);
    console.log('[Optimize] DOM .fix-cb count:', document.querySelectorAll('.fix-cb').length);
    console.log('[Optimize] DOM .kw-missing-row input[data-kw] count:', document.querySelectorAll('.kw-missing-row input[data-kw]').length);
    const unappliedFixes = [];
    for (let i = 0; i < fixesArr.length; i++) {
      const f = fixesArr[i];
      if (!f) continue;
      const cb = document.querySelector(`.fix-cb[data-idx="${i}"]`);
      if (cb && !cb.disabled) unappliedFixes.push(f);
      else console.log(`[Optimize] Fix at index ${i} skipped — cb=${!!cb} disabled=${cb?.disabled}`);
    }
    const unappliedKws = Array.from(document.querySelectorAll('.kw-missing-row input[data-kw]'))
      .filter(cb => !cb.disabled)
      .map(cb => cb.dataset.kw);
    console.log('[Optimize] Found', unappliedFixes.length, 'fixes and', unappliedKws.length, 'keywords to apply');

    if (!unappliedFixes.length && !unappliedKws.length) {
      overlaySub.textContent = `No suggestions to apply. Score: ${scoreBefore}`;
      await new Promise(r => setTimeout(r, 1500));
      overlay.style.display = 'none';
      if (autoBtn) autoBtn.disabled = false;
      if (extremeBtn) extremeBtn.disabled = false;
      switchTab('analyzer');
      return;
    }

    // Phase 3: Apply all suggestions in a single pass
    overlayMsg.textContent = 'Optimizing resume...';
    overlaySub.textContent = `Applying ${unappliedFixes.length} fix${unappliedFixes.length===1?'':'es'} and ${unappliedKws.length} keyword${unappliedKws.length===1?'':'s'}`;

    let promptBody = '';
    if (unappliedFixes.length) {
      const fixInstructions = unappliedFixes.map((f, i) => {
        if (f.before && f.after) return `FIX ${i+1} — ${f.title}\nREPLACE: ${f.before}\nWITH: ${f.after}`;
        return `FIX ${i+1} — ${f.title}: ${f.desc}`;
      }).join('\n\n');
      promptBody += `FIXES TO APPLY:\n${fixInstructions}\n\n`;
    }
    if (unappliedKws.length) {
      promptBody += `KEYWORDS TO INSERT (weave naturally into existing sentences or skill lists — no fabricated accomplishments):\n${unappliedKws.map(k => '• ' + k).join('\n')}\n\n`;
    }

    const currentResume = getResumeText();
    const jdTitle = g('jd-title') || proj?.jdTitle || '';
    const titleRule = jdTitle ? `\\n- The person's job title line (directly under their name) MUST be exactly: "${jdTitle}"` : '';
    const verifiedFacts = buildVerifiedFacts();
    const verifiedFactsBlock = verifiedFacts ? `\n\nVERIFIED FACTS — the closed world of this candidate's actual experience. You may rephrase, reorder, emphasize, or sharpen anything below. You may NOT introduce anything outside it.\n\n${verifiedFacts}` : '';
    const bulletContextBlock = buildBulletContextBlock();

    const result = await claudeFetch(
      `GOAL: Find the strongest HONEST angle this candidate has on this JD, and amplify it. The goal is NOT to make the resume look like the JD. Bridges to gaps must come from real transferable strengths, never from invented experience.
${TRUTH_GROUNDING_RULES}
Apply these changes to the resume. CRITICAL FORMATTING RULES:\n- Keep the EXACT same section structure and order as the original resume${titleRule}\n- SKILLS must stay organized in labeled categories (e.g. Leadership:, Design:, Product:, Engineering:). If the original has categories, keep them. If not, organize skills into logical categories.\n- When adding keywords to skills, place them in the correct category\n- Do NOT merge all skills into one flat list\n- FORMATTING IS SACRED: Output must use IDENTICAL format as input — same line breaks, spacing, bullet characters, section header style.\n- Do NOT reformat, restructure, merge lines, split lines, add/remove blank lines, or change bullet style.\n- Do NOT change the number of roles, reorder roles, or alter dates/companies.\n- ONLY change the specific text content requested. Everything else stays EXACTLY as-is.\n- WHEN A FIX MODIFIES A BULLET: REPLACE the original bullet with the rewritten version. Never keep both the old bullet AND a rewritten variant of it. The output must contain exactly one bullet for each accomplishment, not the original plus a near-duplicate.\n- NEVER ADD NEW BULLETS that describe the same team, product area, or accomplishment as an existing bullet. If a fix would generate a new bullet, check whether an existing bullet already covers that team/scope/metric. If yes, modify the existing bullet instead of appending a new one.
- CRITICAL: Before returning, check for duplicate job entries. If any company + title + date combination appears more than once, remove the duplicate. Each role must appear exactly once.
- CRITICAL: NEVER output placeholder metric tokens. Forbidden: "X%", "XX%", "Y%", "Z%", "[number]%", "[percent]%", "[metric]%", "___%", "TBD%", or any bracketed/blank stand-in for a number. If you don't have a real value from the original resume, write the bullet WITHOUT a percentage — a bullet with no metric is acceptable, a bullet with a placeholder metric is NOT.
- CRITICAL: Within each role, check for repeated metrics or phrases across bullets. If the same metric (e.g. '26% MAU growth') appears in more than one bullet, remove it from the less specific bullet and keep it only in the bullet that explains it most clearly.\n- NEVER FABRICATE metrics, percentages, revenue figures, outcomes, team members, products, domains, or accomplishments not present in VERIFIED FACTS. If the original says '26% MAU growth', keep that exact number. Never invent '40% user growth' or '$2M revenue' unless those exact figures exist in VERIFIED FACTS.\n- NEVER USE competitor brand names anywhere in the resume. 'Commercial Card', 'Capital One brand', 'Chase', 'Amex', etc. are competitor product names. Replace with generic terms.\n- CRITICAL: Use FIRST PERSON (I/me/my) throughout. NEVER write in third person (he/she/they/name). Remove all third-person pronouns.
- BEFORE returning the resume, scan every bullet, summary line, and skill for: (1) any metric not in VERIFIED FACTS, (2) any competitor brand name, (3) any domain/product/team-member that does not appear in VERIFIED FACTS, (4) any verbatim JD phrase grafted onto unrelated work, (5) ANY THIRD-PERSON PRONOUNS. Remove or rewrite all five.\n- SKILLS must stay in labeled categories. NEVER merge into one block.\n- Remove non-skills from the skills section: phrases like 'Business Goals', 'portfolio strategy', 'Experience Design organization' are NOT skills.\n- SUMMARY must be 50-75 words. If the current summary exceeds 75 words, trim it. NEVER let it grow beyond 75 words.\n- NEVER repeat the same phrase twice in the summary. Check for duplicates before returning.\n- The job title directly under the candidate's name MUST exactly match the JD title. Do not revert it.\n- Bullets target: ~150 characters each (180 hard ceiling). Skills target: 15-25 items in categories.\n\nReturn ONLY the complete corrected plain-text resume, no commentary.\n${verifiedFactsBlock}${bulletContextBlock}\n\n${promptBody}RESUME:\n${currentResume}`,
      4000
    );
    const firstPass = deduplicateResume(result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim());

    overlayMsg.textContent = 'Polishing...';
    overlaySub.textContent = 'Removing duplicate bullets within roles';
    const phraseDeduped = await dedupeBulletPhrases(firstPass);

    overlaySub.textContent = 'Removing duplicate metrics across bullets';
    const deduped = await dedupeBulletMetrics(phraseDeduped);

    overlaySub.textContent = 'Differentiating roles at the same employer';
    const differentiated = await differentiateSameEmployerRoles(deduped);

    overlaySub.textContent = 'Removing repeated boilerplate across roles';
    const boilerplateCleaned = await dedupeCrossRoleBoilerplate(differentiated);

    overlaySub.textContent = 'Limiting bullets to 3 per role';
    const bulletsCapped = capBulletsPerRole(boilerplateCleaned);

    // Auto-trim to recommended length based on YOE — always call (has internal gating)
    const lengthAnalysis = RESUME_LENGTH.analyze(bulletsCapped);
    overlaySub.textContent = `Verifying length fits ${lengthAnalysis.recommended.label}`;
    const lengthAdjusted = await trimToTargetLength(bulletsCapped);

    overlaySub.textContent = 'Prioritizing skills for this role';
    const skillsCapped = await capSkillsTo30(lengthAdjusted);

    const cleaned = stripPlaceholders(skillsCapped);
    
    // Phase 7: Replace em dashes with commas — em dashes don't sound human.
    const finalText = stripEmDashes(cleaned);

    // Phase 8: CRITICAL VALIDATION — check for third-person pronouns.
    const pronounCheck = validatePronounConsistency(finalText);
    if (!pronounCheck.valid) {
      const issueMsg = pronounCheck.issues[0];
      const suggestions = pronounCheck.suggestions.join('\n');
      console.warn(`⚠️ PRONOUN CHECK: ${issueMsg}\n${suggestions}`);
      // In auto-optimize, warn but don't block — user can review and edit
      toast(`⚠️ Warning: Found third-person pronouns. Review and use first person.`);
    }

    // Push as a new draft so the version increments by exactly one
    proj.drafts.push(finalText);
    proj._redoStack = [];
    proj._aiApplied = true;
    proj._cachedScore = null; proj._analysisHash = null; proj.scores = [];
    autoSave();
    showResume(finalText, proj.drafts.length);

    // Mark all applied
    unappliedFixes.forEach(f => recordAppliedFix('fix', f.title, f.title));
    document.querySelectorAll('.fix-cb').forEach(cb => { cb.checked = false; cb.disabled = true; });
    document.querySelectorAll('.fix-item').forEach(el => el.classList.add('applied'));
    unappliedKws.forEach(kw => recordAppliedFix('keyword', kw, kw));
    document.querySelectorAll('.kw-missing-row input[data-kw]').forEach(cb => {
      cb.checked = false; cb.disabled = true;
      cb.closest('.kw-missing-row')?.style.setProperty('opacity', '0.5');
    });
    renderAppliedFixes();
    updateFixBar();

    // Sync CE
    try {
      await parseToCE(cleaned, true);  // suppress tab switch — autoOptimize ends on Analyzer
      fillCE(proj.ce);
      if (proj.jdTitle) document.getElementById('ce-title').value = proj.jdTitle;
      autoSave();
    } catch(ceErr) { console.warn('CE sync:', ceErr); }

    // Re-score so the user sees the new number after this single pass
    overlayMsg.textContent = passLabel ? `${passLabel} — scoring updated resume` : 'Scoring updated resume...';
    overlaySub.textContent = '';
    await runFullAnalysis(true);
    const scoreAfter = proj._cachedScore?.overall || 0;
    toast(`${passLabel ? passLabel + ': ' : 'Optimize complete. '}Score: ${scoreBefore} → ${scoreAfter}`);
    // Replace the suggestions panel with the post-Optimize view (score + AI-titled change list).
    if (!suppressPostView) {
      try { await showPostOptimizeView(beforeDraft, cleaned, scoreBefore, scoreAfter); }
      catch(viewErr) { console.warn('Post-optimize view:', viewErr); }
    }
  } catch(e) {
    let msg;
    if (e.message === 'RATE_LIMIT') msg = 'Rate limit reached — try again in 1 minute';
    else if (e.message === 'API_UNAVAILABLE') msg = 'API unavailable — try again shortly';
    else msg = 'Error: ' + (e.message || 'please try again');
    toast(msg);
  }

  overlay.style.display = 'none';
  if (autoBtn) autoBtn.disabled = false;
  if (extremeBtn) extremeBtn.disabled = false;
  switchTab('analyzer');
}

// ─────────────────────────────────────────────────────────
//  DEEP ANALYSIS
// ─────────────────────────────────────────────────────────
async function runDeepAnalysis() {
  const resume = getResumeText();
  const jdText = g('jd-text') || proj?.jdText || '';
  if (!resume) { toast('Add resume content first'); return; }
  if (!jdText) { toast('Add a job description first in the Job Description tab'); return; }

  const resultDiv = document.getElementById('deep-analysis-result');
  const contentDiv = document.getElementById('deep-analysis-content');
  resultDiv.style.display = 'block';
  contentDiv.innerHTML = '<div class="loading-row"><div class="spin"></div><span>Analyzing resume against job description...</span></div>';
  // Do NOT switch tabs — let user control navigation
  // switchTab('analyzer');

  try {
    const raw = await claudeFetch(`You are an expert resume coach. Analyze this resume against the job description. Return ONLY valid JSON:
{
  "gaps": [{"text": "missing skill or experience", "suggestion": "how to address it"}],
  "redundancies": [{"text": "repeated or redundant phrase", "location": "where it appears"}],
  "weak_phrases": [{"original": "weak phrase", "stronger": "stronger alternative", "reason": "why it's weak"}],
  "missing_keywords": [{"keyword": "exact JD keyword", "context": "where it appears in JD"}],
  "strong_points": ["what already aligns well"],
  "impact_issues": [{"bullet": "bullet text", "issue": "vague/no outcome", "suggestion": "add outcome"}],
  "overall_assessment": "2-3 sentence honest assessment"
}
Rules: Only flag real gaps. Do not fabricate metrics. Suggest improvements using the candidate's actual experience.
JD:\n${jdText.slice(0,3000)}\nRESUME:\n${resume.slice(0,4000)}`, 3000);

    const data = parseJson(raw);
    let html = '';

    if (data.overall_assessment) {
      html += `<div class="analysis-section"><div class="analysis-section-title">Overall</div><div style="color:#444;font-size:12px;line-height:1.6;padding:6px 0;">${esc(data.overall_assessment)}</div></div>`;
    }
    if (data.missing_keywords?.length) {
      html += `<div class="analysis-section"><div class="analysis-section-title">Missing Keywords (${data.missing_keywords.length})</div>` +
        data.missing_keywords.map(k => `<div class="analysis-item"><span class="analysis-badge badge-keyword">keyword</span><div><strong>${esc(k.keyword)}</strong>${k.context ? `<span class="text-xs text-muted"> — ${esc(k.context)}</span>` : ''}</div></div>`).join('') + '</div>';
    }
    if (data.gaps?.length) {
      html += `<div class="analysis-section"><div class="analysis-section-title">Gaps (${data.gaps.length})</div>` +
        data.gaps.map(g => `<div class="analysis-item"><span class="analysis-badge badge-gap">gap</span><div>${esc(g.text)}${g.suggestion ? `<div class="text-xs text-muted mt-1">💡 ${esc(g.suggestion)}</div>` : ''}</div></div>`).join('') + '</div>';
    }
    if (data.weak_phrases?.length) {
      html += `<div class="analysis-section"><div class="analysis-section-title">Weak Phrasing (${data.weak_phrases.length})</div>` +
        data.weak_phrases.map(w => `<div class="analysis-item"><span class="analysis-badge badge-weak">weak</span><div><span style="text-decoration:line-through;color:var(--muted);">${esc(w.original)}</span> → <strong>${esc(w.stronger)}</strong>${w.reason ? `<div class="text-xs text-muted mt-1">${esc(w.reason)}</div>` : ''}</div></div>`).join('') + '</div>';
    }
    if (data.impact_issues?.length) {
      html += `<div class="analysis-section"><div class="analysis-section-title">Low-Impact Bullets (${data.impact_issues.length})</div>` +
        data.impact_issues.map(b => `<div class="analysis-item"><span class="analysis-badge badge-weak">impact</span><div><div class="text-xs" style="color:var(--muted);">${esc(b.bullet.slice(0,80))}${b.bullet.length>80?'…':''}</div><div class="text-xs mt-1">💡 ${esc(b.suggestion)}</div></div></div>`).join('') + '</div>';
    }
    if (data.redundancies?.length) {
      html += `<div class="analysis-section"><div class="analysis-section-title">Redundancies (${data.redundancies.length})</div>` +
        data.redundancies.map(r => `<div class="analysis-item"><span class="analysis-badge badge-redundant">repeat</span><div>${esc(r.text)}<span class="text-xs text-muted"> · ${esc(r.location)}</span></div></div>`).join('') + '</div>';
    }
    if (data.strong_points?.length) {
      html += `<div class="analysis-section"><div class="analysis-section-title">Strong Points</div>` +
        data.strong_points.map(s => `<div class="analysis-item"><span class="analysis-badge badge-strong">✓</span>${esc(s)}</div>`).join('') + '</div>';
    }

    contentDiv.innerHTML = html || '<div class="text-xs text-muted">No issues found — strong alignment with the job description.</div>';

  } catch(e) {
    contentDiv.innerHTML = `<div class="text-xs" style="color:var(--red);">Analysis error: ${esc(e.message)}</div>`;
  }
}

// ─────────────────────────────────────────────────────────
//  APPLY UPDATES
// ─────────────────────────────────────────────────────────
function showApplyUpdatesPanel() {
  const card = document.getElementById('apply-updates-card');
  const checks = document.getElementById('apply-section-checks');
  if (!card || !checks || !proj?.ce) return;

  const sections = [
    { id:'summary', label:'Summary' },
    { id:'bullets', label:'All Bullets' },
    { id:'context', label:'Role Intros' },
    { id:'skills', label:'Skills' },
  ];

  checks.innerHTML = sections.map(s =>
    `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);">
      <input type="checkbox" value="${s.id}" style="accent-color:var(--teal);">
      ${s.label}
    </label>`
  ).join('');
  card.style.display = 'block';
}

async function applyUpdates() {
  const selected = Array.from(document.querySelectorAll('#apply-section-checks input:checked')).map(i => i.value);
  if (!selected.length) { toast('Select at least one section to update'); return; }
  if (!proj?.ce) { toast('No project loaded'); return; }

  const jdText = g('jd-text') || proj?.jdText || '';
  const loading = document.getElementById('apply-updates-loading');
  const btn = document.getElementById('apply-updates-btn');
  const msg = document.getElementById('apply-updates-msg');
  loading.classList.add('show'); btn.disabled = true;

  const resume = getResumeText();
  const rules = `RULES:
- Use exact phrases from the job description when relevant
- Do NOT fabricate metrics, KPIs, or outcomes
- Preserve factual accuracy — only strengthen phrasing
- Every bullet must reflect business, customer, or product impact
- Avoid vague responsibilities ("responsible for", "worked on")
- Keep bullets under 150 characters where possible
- Banned words: spearheaded, leveraged, utilized, orchestrated
- Pull from documented results in the resume (do not invent)
JD:\n${jdText.slice(0,2000)}`;

  try {
    if (selected.includes('summary')) {
      msg.textContent = 'Rewriting summary...';
      const raw = await claudeFetch(`Rewrite ONLY the professional summary of this resume. ${rules}

SUMMARY RULES:
- Length: 3–5 lines, approximately 50–100 words
- Use exact keywords from the job description — ATS depends on keyword matching
- Lead with title/seniority and strongest quantified result
- Focus on results-oriented statements — no vague phrases like "hard worker", "passionate", "dynamic", "proven track record of success"
- Every sentence must add specific value — no filler
- End with a clear value proposition tied to the target role

Return ONLY the new summary text. No labels, no quotes, nothing else.
TARGET ROLE: ${g('jd-title') || proj?.jdTitle || ''}
JD KEYWORDS TO INCLUDE: ${(g('jd-text') || proj?.jdText || '').slice(0,800)}
CURRENT SUMMARY: ${proj.ce.summary}`, 600);
      proj.ce.summary = raw.trim();
      const el = document.getElementById('ce-summary-text');
      if (el) el.value = proj.ce.summary;
    }

    if (selected.includes('context')) {
      msg.textContent = 'Rewriting role intros...';
      for (const role of (proj.ce.roles || [])) {
        if (!role.context?.trim()) continue;
        const raw = await claudeFetch(`Rewrite this role intro sentence to be more impactful. ${rules}
Keep it to 1-2 sentences max, 150 chars or less.
ROLE: ${role.title} at ${role.company}
CURRENT: ${role.context}
Return ONLY the new intro sentence.`, 300);
        role.context = raw.trim();
      }
    }

    if (selected.includes('bullets')) {
      msg.textContent = 'Rewriting bullets...';
      for (const role of (proj.ce.roles || [])) {
        if (!role.bullets?.length) continue;
        const bulletList = role.bullets.map((b,i) => `${i+1}. ${b.text}`).join('\n');
        const raw = await claudeFetch(`Rewrite these bullet points for the role "${role.title} at ${role.company}". ${rules}
Return ONLY a numbered list matching the original count. No other text.
BULLETS:\n${bulletList}`, 1500);
        const lines = raw.split('\n').filter(l => l.trim()).map(l => l.replace(/^\d+\.\s*/, '').trim());
        lines.forEach((text, i) => { if (role.bullets[i]) role.bullets[i].text = text; });
      }
    }

    if (selected.includes('skills')) {
      msg.textContent = 'Aligning skills to JD...';
      const allSkills = (proj.ce.skillGroups||[]).flatMap(sg => sg.skills.map(s => s.text));
      const raw = await claudeFetch(`From this job description, identify which of the candidate's skills are most relevant and suggest up to 3 additional skills to add that are EXPLICITLY mentioned in the JD and not already in the list. Do not fabricate. Return ONLY valid JSON:
{"relevant": ["skill1"], "add": [{"skill": "exact JD term", "group": "Leadership|UX Design|Product|Engineering"}]}
CANDIDATE SKILLS: ${allSkills.join(', ')}
JD: ${jdText.slice(0, 1500)}`, 600);
      try {
        const parsed = parseJson(raw);
        if (parsed.add?.length) {
          parsed.add.forEach(item => {
            const sg = proj.ce.skillGroups.find(g => g.label === item.group) || proj.ce.skillGroups[0];
            if (sg && !sg.skills.find(s => s.text.toLowerCase() === item.skill.toLowerCase())) {
              sg.skills.push({ id:'sk'+Date.now()+Math.random(), text: item.skill });
            }
          });
        }
      } catch(e) { console.warn('Skills update error', e); }
    }

    fillCE(proj.ce);
    renderLivePreview();
    autoSave();
    toast('Updates applied ✓');
  } catch(e) {
    toast('Update error: ' + e.message);
  }

  loading.classList.remove('show'); btn.disabled = false;
}

// ─────────────────────────────────────────────────────────
//  ATS AUDIT
// ─────────────────────────────────────────────────────────
async function runAtsAudit(){
  const resume=getResumeText();if(!resume){toast('Generate a resume first');return;}
  toast('Running ATS audit...');
  try {
    const raw=await claudeFetch(`Audit this resume for ATS issues. Return ONLY valid JSON:
{"checks":[{"id":"tables","label":"Tables/Columns","status":"pass|fail|warn","reason":"Why this matters","issue":"What was found if fail/warn"}],"overall":"pass|warn|fail","summary":"..."}
RESUME:\n${resume}`,1500);
    const audit=parseJson(raw);proj.atsAudit=audit;autoSave();
    const container=document.getElementById('ats-checks');const card=document.getElementById('ats-audit-card');
    if(container&&audit?.checks){container.innerHTML=audit.checks.map(c=>`<div class="ats-row"><div class="ats-icon">${c.status==='pass'?'✅':c.status==='warn'?'⚠️':'❌'}</div><div><div class="ats-title">${esc(c.label)}</div><div class="ats-desc">${esc(c.issue||c.reason)}</div></div></div>`).join('');}
    if(card)card.style.display='block';
    toast('ATS audit complete');
  } catch(e){toast('Audit error: '+e.message);}
}

// ─────────────────────────────────────────────────────────
//  SAVE .DOCX / PDF
// ─────────────────────────────────────────────────────────
async function saveDocx(){
  const t=getResumeText();if(!t){toast('No resume');return;}
  toast('Generating .docx...');
  if(!window.docx){await new Promise((r,j)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js';sc.onload=r;sc.onerror=j;document.head.appendChild(sc);});}
  const{Document,Packer,Paragraph,TextRun,AlignmentType,BorderStyle,LevelFormat}=window.docx;
  const FONT='Arial';const lines=t.split('\n');
  const isH=l=>l.trim().length>2&&l.trim()===l.trim().toUpperCase()&&/[A-Z]/.test(l.trim())&&!l.trim().startsWith('•');
  const isB=l=>l.trim().startsWith('•')||l.trim().startsWith('-');
  const isJ=l=>/\d{2}\/\d{2}/.test(l)&&l.trim().length<120&&!l.trim().startsWith('•');
  const ch=[];let hD=false;
  for(let i=0;i<lines.length;i++){const l=lines[i],t2=l.trim();if(!hD&&isH(t2)&&i>0)hD=true;if(!t2){if(hD)ch.push(new Paragraph({spacing:{after:60}}));continue;}
    if(!hD&&i===0)ch.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:40},children:[new TextRun({text:t2,font:FONT,size:56,bold:true})]}));
    else if(!hD)ch.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:20},children:[new TextRun({text:t2,font:FONT,size:36,color:'555555'})]}));
    else if(isH(t2))ch.push(new Paragraph({spacing:{before:160,after:60},border:{bottom:{style:BorderStyle.SINGLE,size:4,color:'CCCCCC',space:1}},children:[new TextRun({text:t2,font:FONT,size:40,bold:true,allCaps:true})]}));
    else if(isB(t2))ch.push(new Paragraph({numbering:{reference:'b',level:0},spacing:{before:30,after:30},children:[new TextRun({text:t2.replace(/^[•\-]\s*/,''),font:FONT,size:38})]}));
    else if(isJ(t2))ch.push(new Paragraph({spacing:{before:80,after:20},children:[new TextRun({text:t2,font:FONT,size:38,bold:true})]}));
    else ch.push(new Paragraph({spacing:{before:20,after:20},children:[new TextRun({text:t2,font:FONT,size:38})]}));
  }
  const doc=new Document({numbering:{config:[{reference:'b',levels:[{level:0,format:LevelFormat.BULLET,text:'\u2022',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:480,hanging:240}}}}]}]},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,right:1080,bottom:1080,left:1080}}},children:ch}]});
  const buf=await Packer.toBlob(doc);
  const name=await getResumeFilenameSmart('docx');
  if(window.showSaveFilePicker){try{const h=await window.showSaveFilePicker({suggestedName:name,types:[{description:'Word',accept:{'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['.docx']}}]});const w=await h.createWritable();await w.write(buf);await w.close();toast('Saved: '+h.name);return;}catch(e){if(e.name==='AbortError')return;}}
  const url=URL.createObjectURL(buf);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);toast('Saved as '+name);
}

function savePdf(){
  const t=getResumeText();if(!t){toast('No resume');return;}
  const win=window.open('','_blank','width=820,height=1000');if(!win){toast('Allow popups');return;}
  const html=t.split('\n').map(l=>{const e=l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if(!e.trim())return'<p style="margin:0;height:4pt;"></p>';
    if(e.trim()===e.trim().toUpperCase()&&e.trim().length>2&&!e.trim().startsWith('•'))return`<p style="font-weight:700;font-size:10pt;text-transform:uppercase;letter-spacing:.06em;border-bottom:1.5px solid #ccc;padding-bottom:2pt;margin:9pt 0 3pt;">${e}</p>`;
    if(e.trim().startsWith('•')||e.trim().startsWith('-'))return`<p style="padding-left:1.2em;text-indent:-1.2em;margin:0 0 1pt 1.2em;">${e}</p>`;
    if(/\d{2}\/\d{2}/.test(e)&&e.trim().length<120)return`<p style="font-weight:600;margin:5pt 0 1pt;">${e}</p>`;
    return`<p style="margin:2pt 0;">${e}</p>`;
  }).join('\n');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{margin:.75in;size:letter;}html,body{margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#111;}</style></head><body>${html}</body></html>`);
  win.document.close();win.setTimeout(()=>win.print(),350);
  toast('Print dialog — save as PDF');
}

// ─────────────────────────────────────────────────────────
//  FORMAT SYSTEM
// ─────────────────────────────────────────────────────────

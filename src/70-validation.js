// Validates that every role in the resume has a description (1-line context below role title).
// Consistency is critical: partial descriptions look unfinished and confuse ATS parsers.
// Returns { valid: bool, missing: [{role, idx}] } — list of roles missing descriptions.
function validateRoleDescriptions(text) {
  const lines = text.split('\n');
  const missing = [];
  let roleIdx = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect role header (contains MM/YY – MM/YY or MM/YY – Present)
    if (trimmed.match(/\d{1,2}\/\d{2}\s*[–-]\s*(?:\d{1,2}\/\d{2}|Present|Current)/)) {
      roleIdx++;
      // Look at the next 1-3 non-empty lines to see if there's a description
      // (description is a non-bullet, non-header line between role header and first bullet)
      let foundDesc = false;
      let foundBullet = false;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (next.startsWith('•') || next.startsWith('-')) {
          foundBullet = true;
          break;
        }
        // It's not a bullet — could be a description or company line
        // Company line typically contains '·' separator (e.g. "Verizon · New York, NY")
        // A description is typically longer prose without ' · '
        // But the parsed text might combine company/location on same line as role header
        // Skip lines that look like company/location only
        if (next.length > 30 && !/^[\w.&\s]+\s·\s[\w\s,]+$/.test(next)) {
          foundDesc = true;
          break;
        }
      }
      if (!foundDesc && foundBullet) {
        missing.push({ role: trimmed.substring(0, 60), idx: roleIdx, lineNum: i });
      }
    }
  }
  
  return { valid: missing.length === 0, missing };
}

// ═══════════════════════════════════════════════════════
//  RESUME LENGTH ANALYZER
// ═══════════════════════════════════════════════════════
//
// Standard industry guidelines for resume length based on years of experience (YOE):
//   < 5 years        → 1 page
//   5-10 years       → 1-2 pages
//   10-15 years      → 2 pages
//   15-20 years      → 2 pages (3 max for senior roles)
//   20+ years        → 2-3 pages (executive level)
//
// Page capacity at typical font settings (Lato 10pt, 0.5in margins): ~3500 chars/page

const RESUME_LENGTH = {
  // Estimated character capacity per page at default font settings.
  // Calibrated CONSERVATIVELY from real Lato 10pt resumes with 0.5in margins.
  // We deliberately UNDERestimate so the trim is aggressive enough to prevent
  // single-line orphans (e.g., AWARDS entry) spilling to next page.
  CHARS_PER_PAGE: 2600,
  
  // Calculate years of experience from resume text by parsing date ranges.
  // Looks for MM/YY – MM/YY or MM/YY – Present patterns in work experience.
  calculateYOE: function(text) {
    const lines = text.split('\n');
    let earliestStart = null;
    const now = new Date();
    
    // Pattern: MM/YY – MM/YY or MM/YY - MM/YY or MM/YY – Present
    const datePattern = /(\d{1,2})\/(\d{2})\s*[–\-]\s*(?:(\d{1,2})\/(\d{2})|Present|Current)/gi;
    
    for (const line of lines) {
      let match;
      const re = new RegExp(datePattern.source, datePattern.flags);
      while ((match = re.exec(line)) !== null) {
        const startMonth = parseInt(match[1]);
        const startYear = parseInt(match[2]);
        // Convert 2-digit year (e.g. 95 → 1995, 25 → 2025)
        const fullStartYear = startYear < 50 ? 2000 + startYear : 1900 + startYear;
        const startDate = new Date(fullStartYear, startMonth - 1);
        if (!earliestStart || startDate < earliestStart) {
          earliestStart = startDate;
        }
      }
    }
    
    if (!earliestStart) return 0;
    const yearsDiff = (now - earliestStart) / (1000 * 60 * 60 * 24 * 365.25);
    return Math.round(yearsDiff * 10) / 10; // Round to 1 decimal
  },
  
  // Get recommended page count based on YOE
  getRecommendedPages: function(yoe) {
    if (yoe < 5) return { min: 1, max: 1, label: '1 page' };
    if (yoe < 10) return { min: 1, max: 2, label: '1-2 pages' };
    if (yoe < 15) return { min: 2, max: 2, label: '2 pages' };
    if (yoe < 20) return { min: 2, max: 2, label: '2 pages' };  // 3 acceptable max
    return { min: 2, max: 3, label: '2-3 pages' };  // Executive level
  },
  
  // Estimate current page count from resume text length
  estimatePages: function(text) {
    const chars = text.replace(/\s+/g, ' ').length;
    return Math.round((chars / this.CHARS_PER_PAGE) * 10) / 10;
  },
  
  // Get full analysis: YOE, recommended length, current length, status
  analyze: function(text) {
    const yoe = this.calculateYOE(text);
    const recommended = this.getRecommendedPages(yoe);
    const currentPages = this.estimatePages(text);
    
    let status = 'ok';
    let action = null;
    if (currentPages > recommended.max + 0.2) {
      status = 'too_long';
      action = 'trim';
    } else if (currentPages < recommended.min - 0.3 && yoe >= 5) {
      status = 'too_short';
      action = 'expand';
    }
    
    return {
      yoe,
      recommended,
      currentPages,
      status,
      action,
      targetPages: recommended.max,
      targetChars: recommended.max * this.CHARS_PER_PAGE
    };
  }
};

// ═══════════════════════════════════════════════════════
//  BULLET CAP
// ═══════════════════════════════════════════════════════
// Limit each role's bullets to a maximum of N (default 3). Removes extra bullets after the Nth.
// Keeps role headers, descriptions, and maintains formatting.
// Bullet cap — uniform 5 max per role, AI controls actual allocation per relevance.
// The cap is a safety net, not a rule. The AI prompt drives relevance-based bullet allocation:
// most recent + most relevant role gets 4-5 bullets (FULL detail), other recent roles get 3-4,
// older roles get 1-2. Recent != Relevant — a role 4 positions down can still be highly relevant
// to the target JD, in which case it should get FULL detail.
function capBulletsPerRole(text) {
  const MAX_BULLETS = 5;
  const lines = text.split('\n');
  const result = [];
  let bulletCount = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect role header (has dates like 01/16 – 06/17 or 09/25 – Present)
    if (trimmed.match(/\d{1,2}\/\d{2}\s*[–-]\s*(?:\d{1,2}\/\d{2}|Present|Current)/)) {
      bulletCount = 0;
      result.push(line);
      continue;
    }
    
    // Check if this is a bullet (starts with • or -)
    if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
      if (bulletCount < MAX_BULLETS) {
        result.push(line);
        bulletCount++;
      }
      // Skip bullets beyond the cap
      continue;
    }
    
    // Keep all non-bullet lines (headers, descriptions, etc.)
    result.push(line);
  }
  
  return result.join('\n');
}

// ═══════════════════════════════════════════════════════
//  TRIM TO TARGET LENGTH (YOE-based)
// ═══════════════════════════════════════════════════════
// Uses AI to intelligently trim resume to fit recommended page count based on YOE.
// Drops weakest bullets first (those without metrics or that duplicate other accomplishments).
// Preserves: section structure, role headers, dates, summary, skills, education.
// ITERATIVE: Will trim up to 4 times if the resume still exceeds the target.
// VERIFIED: Measures actual rendered height after each trim — char count alone can miss
// visual overflow (orphan lines, section spacing, awards taking a full line).

// Measures the actual rendered height of resume text in pages by rendering it in a
// hidden div with the same width and styling as the live preview, then dividing the
// resulting offsetHeight by the per-page content area height.
// Returns the page count as a decimal (e.g., 2.05 = just over 2 pages), or null if
// the format functions aren't loaded yet.
function measureRenderedPages(text) {
  try {
    if (typeof fmtRenderSections !== 'function' || typeof fmtParseText !== 'function') {
      return null;
    }
    const marginIn = parseFloat(_fmt.margin || '0.5in');
    const contentWidthIn = 8.5 - (2 * marginIn);
    const contentHeightPx = (11 - 2 * marginIn) * 96; // per-page usable height
    
    // Match the PDF render line-height (1.35 for standard, 1.3 for compact)
    const lh = _fmt.template === 'compact' ? '1.3' : '1.35';
    
    const container = document.createElement('div');
    container.style.cssText = `position:absolute;left:-9999px;top:0;width:${contentWidthIn}in;visibility:hidden;font-family:${_fmt.bodyFont || 'Lato'},Arial,sans-serif;font-size:${_fmt.bodySize || 10}pt;line-height:${lh};color:${_fmt.textColor || '#111'};`;
    container.innerHTML = fmtRenderSections(fmtParseText(text));
    document.body.appendChild(container);
    const height = container.getBoundingClientRect().height;
    document.body.removeChild(container);
    
    return height / contentHeightPx;
  } catch (e) {
    console.warn('measureRenderedPages failed:', e);
    return null;
  }
}

// Parses the END year from a role header line like "Title · Company · 09/25 – Present · Location"
// Returns the year as a 4-digit number, or current year if "Present"/"Current", or null if no match.
function parseRoleEndYear(roleHeader) {
  // Match date range: MM/YY - MM/YY OR MM/YY - Present
  const match = roleHeader.match(/\d{1,2}\/(\d{2})\s*[–\-]\s*(?:(\d{1,2})\/(\d{2})|Present|Current)/i);
  if (!match) return null;
  // If "Present/Current" match[2] is undefined → use current year
  if (!match[2]) return new Date().getFullYear();
  // Otherwise convert 2-digit year to 4-digit
  const yy = parseInt(match[3], 10);
  return yy < 50 ? 2000 + yy : 1900 + yy;
}

// Identifies roles whose END year is older than the staleness threshold (default 15 years).
// Returns array of { startLine, endLine, header, endYear, age } for each stale role.
// Used to alert the user (or programmatically remove if the AI didn't follow the rule).
function findStaleRoles(text, thresholdYears) {
  const threshold = thresholdYears || 15;
  const currentYear = new Date().getFullYear();
  const lines = text.split('\n');
  const stale = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect role header: contains MM/YY range
    if (!/\d{1,2}\/\d{2}\s*[–\-]\s*(?:\d{1,2}\/\d{2}|Present|Current)/i.test(line)) continue;
    
    const endYear = parseRoleEndYear(line);
    if (!endYear) continue;
    const age = currentYear - endYear;
    if (age < threshold) continue;
    
    // Found a stale role — find its end (next role header, next ALL-CAPS section, or EOF)
    let endLine = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      // Next role header (has date range)?
      if (/\d{1,2}\/\d{2}\s*[–\-]\s*(?:\d{1,2}\/\d{2}|Present|Current)/i.test(next)) {
        endLine = j;
        break;
      }
      // Next section header (ALL CAPS)?
      if (next.length > 2 && next === next.toUpperCase() && /^[A-Z][A-Z\s&\/]+$/.test(next)) {
        endLine = j;
        break;
      }
    }
    
    stale.push({ startLine: i, endLine, header: line.trim(), endYear, age });
  }
  
  return stale;
}

// Removes stale roles (>15 years old by default) from resume text.
// Returns trimmed text only if stale roles were found; otherwise returns original.
function removeStaleRoles(text, thresholdYears) {
  const stale = findStaleRoles(text, thresholdYears);
  if (stale.length === 0) return text;
  
  const lines = text.split('\n');
  // Mark lines to remove (work backwards so indices don't shift)
  const toRemove = new Set();
  for (const role of stale) {
    for (let j = role.startLine; j < role.endLine; j++) {
      toRemove.add(j);
    }
    // Also strip trailing blank lines after the removed role
    let j = role.endLine;
    while (j < lines.length && !lines[j].trim() && !toRemove.has(j)) {
      toRemove.add(j);
      j++;
    }
  }
  
  const kept = lines.filter((_, i) => !toRemove.has(i));
  return kept.join('\n').trimEnd();
}

// AWARDS handling — rule-based assessment per industry guidelines:
// 
// REMOVE awards when:
//   - Older than 5-10 years (unless highly prestigious)
//   - Irrelevant to the industry applying to (handled by AI in main prompt)
//
// KEEP awards when:
//   - Less than 5 years old (recent → strong signal)
//   - Highly prestigious (Pulitzer, Cannes Lions, AIGA Medal, etc.)
//   - Relevant to the job
//
// In both cases: keep the resume to the recommended page length.
// When AWARDS should be kept but resume is too long → trim other content harder.
// When AWARDS can be removed → strip the section entirely.

const PRESTIGIOUS_AWARDS_KEYWORDS = [
  'pulitzer', 'nobel', 'emmy', 'grammy', 'oscar', 'academy award',
  'tony', 'cannes lion', 'james beard', 'pritzker', 'booker',
  'macarthur', 'guggenheim', 'rhodes scholar', 'fulbright',
  'aiga medal', 'webby', 'cooper hewitt', 'core77',
  'red dot best of', 'if design gold', 'fast company innovation',
  'inc 5000', 'forbes 30 under 30', 'time 100', 'wired'
];

function parseAwardYear(awardLine) {
  const years = awardLine.match(/\b(19|20)\d{2}\b/g);
  if (!years || !years.length) return null;
  return Math.max(...years.map(y => parseInt(y, 10)));
}

function isAwardPrestigious(awardLine) {
  const lower = awardLine.toLowerCase();
  return PRESTIGIOUS_AWARDS_KEYWORDS.some(kw => lower.includes(kw));
}

// Returns true if at least ONE award entry should be kept (recent OR prestigious).
// Returns false if ALL awards are old AND non-prestigious (safe to remove section).
function shouldKeepAwards(awardBodyLines) {
  const currentYear = new Date().getFullYear();
  for (const line of awardBodyLines) {
    if (!line.trim()) continue;
    const year = parseAwardYear(line);
    const age = year ? (currentYear - year) : null;
    
    // Recent (< 5 years): definitely keep
    if (age !== null && age < 5) return true;
    
    // Prestigious within a reasonable window (≤15 years): keep
    if (isAwardPrestigious(line) && (age === null || age <= 15)) return true;
    
    // No year detected on a non-prestigious line: assume kept (don't auto-strip)
    if (age === null && !isAwardPrestigious(line)) {
      // Without a year we can't apply the rule — leave it alone to be safe
      return true;
    }
  }
  return false;
}

// Find AWARDS section in resume text. Returns {start, end, bodyLines} or null.
function findAwardsSection(text) {
  const lines = text.split('\n');
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^AWARDS\s*$/i.test(lines[i].trim())) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  
  // End is either next ALL-CAPS section header, or end of file
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.length > 2 && t === t.toUpperCase() && /^[A-Z][A-Z\s&\/]+$/.test(t)) {
      end = i;
      break;
    }
  }
  
  const bodyLines = lines.slice(start + 1, end).filter(l => l.trim());
  return { start, end, bodyLines, allLines: lines };
}

// Remove AWARDS section if its contents are old/non-prestigious per the rule above.
// Returns trimmed text only if removal applied; otherwise returns original.
function removeAwardsIfStale(text) {
  const section = findAwardsSection(text);
  if (!section || section.bodyLines.length === 0) return text;
  
  if (!shouldKeepAwards(section.bodyLines)) {
    // Remove from start through end (inclusive of trailing blank if any)
    const remaining = section.allLines.slice(0, section.start).join('\n').trimEnd();
    return remaining;
  }
  return text;
}

async function trimToTargetLength(text) {
  const analysis = RESUME_LENGTH.analyze(text);
  
  // Verify with actual rendering — char estimate can miss orphan lines or whitespace
  const initialPages = measureRenderedPages(text);
  const visuallyTooLong = initialPages !== null && initialPages > analysis.targetPages + 0.02;
  
  // Skip if both char count AND rendering say we're under target
  if (analysis.status !== 'too_long' && !visuallyTooLong) {
    return text;
  }
  
  // Assess AWARDS section per industry rule (recent < 5y, or prestigious = keep)
  const awardsSection = findAwardsSection(text);
  const awardsExist = awardsSection !== null && awardsSection.bodyLines.length > 0;
  const keepAwards = awardsExist ? shouldKeepAwards(awardsSection.bodyLines) : true;
  
  // STALE ROLE REMOVAL — drop roles ended 15+ years ago (industry best practice).
  // Apply BEFORE other trimming since it saves more space than bullet trimming.
  let workingText = text;
  const staleRoles = findStaleRoles(text, 12);
  if (staleRoles.length > 0) {
    workingText = removeStaleRoles(text, 12);
    console.log(`Removed ${staleRoles.length} stale role(s) (>15 years old): ${staleRoles.map(r => r.header.substring(0, 50)).join(' | ')}`);
    // Re-check if we now fit
    const newPages = measureRenderedPages(workingText);
    if (newPages !== null && newPages <= analysis.targetPages + 0.02) {
      return workingText;
    }
  }
  
  // If awards are old/non-prestigious AND resume is over → remove them upfront
  // This gives the AI a cleaner starting point to trim within the page limit.
  if (awardsExist && !keepAwards) {
    workingText = removeAwardsIfStale(workingText);
    if (workingText !== text) {
      console.log('AWARDS removed upfront — old/non-prestigious per rule');
      // Re-check if we now fit
      const newPages = measureRenderedPages(workingText);
      if (newPages !== null && newPages <= analysis.targetPages + 0.02) {
        return workingText;
      }
    }
  }
  
  // Use 85% of target as inner goal — leaves a real buffer for rendering variance
  const safetyFactor = 0.85;
  let current = workingText;
  let currentChars = current.replace(/\s+/g, ' ').length;
  let iteration = 0;
  const MAX_ITERATIONS = 4;
  
  // Recompute keepAwards for the working text (may have removed already)
  const stillHasAwards = findAwardsSection(current) !== null;
  const awardsGuidance = !stillHasAwards
    ? 'No AWARDS section present.'
    : keepAwards
      ? 'AWARDS are recent or prestigious — KEEP them. Trim OTHER content (bullets, descriptions, older roles) harder to make room.'
      : 'AWARDS section is old/non-prestigious — you may REMOVE the entire AWARDS section if it helps fit the page limit.';
  
  while (iteration < MAX_ITERATIONS) {
    // Verify with rendering — if we already fit visually, stop iterating
    const renderedPages = measureRenderedPages(current);
    if (renderedPages !== null && renderedPages <= analysis.targetPages + 0.02) {
      console.log(`Trim verified visually: ${renderedPages.toFixed(2)} pages ≤ ${analysis.targetPages}`);
      return current;
    }
    
    iteration++;
    const iterationFactor = safetyFactor - (iteration - 1) * 0.05;
    const targetChars = Math.floor(analysis.targetChars * iterationFactor);
    const reductionPct = Math.round(((currentChars - targetChars) / currentChars) * 100);
    const visualOverflow = renderedPages !== null ? renderedPages.toFixed(2) : 'unknown';
    
    try {
      const prompt = `You are a resume editor. Trim this resume to fit STRICTLY within ${analysis.targetPages} page(s). The candidate has ${analysis.yoe} years of experience.

CURRENT: ${currentChars} characters, visually rendering at ${visualOverflow} pages
TARGET: ${targetChars} characters maximum, MUST fit on ${analysis.targetPages} page(s)
REDUCTION NEEDED: approximately ${reductionPct}% — be aggressive

CRITICAL CONSTRAINT: Output MUST fit on exactly ${analysis.targetPages} page(s).

═══════════════════════════════════════════════════════
RELEVANCE-AWARE TRIMMING (critical)
═══════════════════════════════════════════════════════
When trimming bullets, do NOT trim uniformly across roles. Apply this priority:

1. The role with the MOST EXISTING BULLETS is the candidate's most-developed/most-relevant
   role — PRESERVE all its bullets (or trim only 1, never to fewer than 4).
2. The MOST RECENT role — keep 3-4 bullets minimum (it's their current positioning).
3. Older roles with fewer bullets — trim these FIRST. A role with 2 bullets can drop to 1.
4. Empty older role descriptions can be tightened to 1 sentence.

THE GOAL: Recent and most-relevant roles must remain FULL and impressive. Older or
less-relevant roles get condensed. Never make the resume look "evenly thin" by
trimming each role uniformly — that flattens the signal.

═══════════════════════════════════════════════════════
STALE ROLE REMOVAL (apply BEFORE trimming bullets)
═══════════════════════════════════════════════════════
CURRENT YEAR: ${new Date().getFullYear()}. Modern resume best practice = last 10-15 years
of relevant experience. For each role, check END date:
- Ended ≤10 years ago: KEEP
- Ended 10-15 years ago: KEEP only if same job family as target title
- Ended >15 years ago: REMOVE the entire role (header + description + bullets) unless
  it's extremely prestigious or directly relevant

When stale roles exist, removing them is the FIRST trim move — saves more space than
trimming bullets from kept roles.

AWARDS GUIDANCE: ${awardsGuidance}

═══════════════════════════════════════════════════════
ROLE DESCRIPTION CONSISTENCY (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════
EVERY role must have a 1-sentence description (~80-140 chars) between the role header line
and its bullets. This is a CONSISTENCY rule — partial descriptions across some roles but
not others is a major formatting red flag for Director-level resumes. Recruiters can't
quickly understand role scope, ATS parsers may misclassify roles, and the resume looks
poorly maintained.

- NEVER strip a role description from any role, even older roles
- If a role is missing a description, ADD a 1-sentence one summarizing the role's scope
- Older roles may have SHORTER descriptions (~60-80 chars) but must still have one
- Recent roles may have longer descriptions (~120-140 chars)

═══════════════════════════════════════════════════════
SENIORITY PRESERVATION (non-negotiable)
═══════════════════════════════════════════════════════
- NEVER weaken the candidate's title or seniority framing
- NEVER reframe summary from Director-level to junior phrasing
- NEVER strip leadership-scope bullets (team size, distributed teams, hiring, mentoring)

═══════════════════════════════════════════════════════
PROTECTED CONTENT (must persist unless absolutely necessary)
═══════════════════════════════════════════════════════
KEEP these even when trimming:
- Role descriptions (1-line below each role title) — ALL roles, no exceptions
- Bullets with specific dramatic metrics (e.g., "30 days to 30 minutes", "300% DAU", "342M devices")
- Differentiating philosophy bullets (e.g., "Defined human-centered AI design philosophy")
- Mentoring/team-development bullets (e.g., "Mentored designers", "Hired and developed team")
- The candidate's title under their name

DROP these first when trimming (less essential):
- Excess BULLETS in older roles (drop to 2 if needed)
- Generic process bullets without metrics
- Verbose phrasing (tighten don't drop)
- Redundant bullets covering same ground as another bullet
- Stale awards (per the AWARDS GUIDANCE above)

TRIMMING RULES (in priority order):
1. Drop weakest bullets first — those without specific metrics, outcomes, or differentiated value
2. If two bullets cover similar ground, keep the one with stronger metric/specificity
3. Tighten verbose bullets to ~120 characters each (drop filler words, redundant phrases)
4. Tighten older role descriptions to ~60-80 chars (but keep ALL of them)
5. BULLET COUNT BY POSITION: Role 1 (most recent) keeps 4-5, Role 2-3 keeps 3-4, Roles 4+ keeps 2-3
6. NEVER drop role headers, dates, company names, OR role descriptions
7. NEVER drop the entire SUMMARY, SKILLS, or EDUCATION sections (just trim within them)
8. PRESERVE EXACT FORMATTING: section structure, line breaks, bullet character (•), date format

CRITICAL:
- Use FIRST PERSON (I/me/my) — never third person
- NEVER fabricate metrics or outcomes
- NEVER add new bullets or content
- NEVER weaken seniority framing in summary or title
- ALWAYS keep a role description on EVERY role (consistency is critical)
- BE AGGRESSIVE on bullets — the resume MUST fit in ${targetChars} chars
- Output the COMPLETE trimmed resume, no commentary

RESUME:
${current}`;

      const result = await claudeFetch(prompt, 4000);
      const trimmed = result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
      
      const trimmedChars = trimmed.replace(/\s+/g, ' ').length;
      if (trimmedChars > currentChars || trimmedChars < targetChars * 0.5) {
        console.warn(`Trim iteration ${iteration} safety check failed (chars: ${trimmedChars}), keeping previous`);
        break;
      }
      
      const reduction = (currentChars - trimmedChars) / currentChars;
      current = trimmed;
      currentChars = trimmedChars;
      console.log(`Trim iteration ${iteration}: ${currentChars} chars (target: ${targetChars}, reduction: ${(reduction*100).toFixed(1)}%)`);
      
      if (reduction < 0.03) {
        const checkPages = measureRenderedPages(current);
        if (checkPages !== null && checkPages > analysis.targetPages + 0.02) {
          console.warn(`Trim plateaued at ${checkPages.toFixed(2)} pages — AI can't reduce further`);
        }
        break;
      }
    } catch (e) {
      console.warn(`trimToTargetLength iteration ${iteration} failed:`, e);
      break;
    }
  }
  
  // FINAL BACKSTOP — only triggers if AWARDS still exists and is removable
  const postTrimPages = measureRenderedPages(current);
  if (postTrimPages !== null && postTrimPages > analysis.targetPages + 0.02) {
    const stale = removeAwardsIfStale(current);
    if (stale !== current) {
      const newPages = measureRenderedPages(stale);
      if (newPages !== null && newPages < postTrimPages) {
        console.log(`Final backstop removed stale AWARDS: ${postTrimPages.toFixed(2)} → ${newPages.toFixed(2)} pages`);
        return stale;
      }
    }
  }
  
  const finalPages = measureRenderedPages(current);
  if (finalPages !== null) {
    console.log(`Final trim result: ${finalPages.toFixed(2)} pages (target ${analysis.targetPages})`);
  }
  return current;
}

async function capSkillsTo30(text) {
  try {
    // Find the SKILLS section. Match from "SKILLS" header to the next ALL-CAPS section header
    // or end-of-string. The previous regex used a zero-width lookahead that matched empty trailing
    // newlines at position 0, returning a 0-length body and skipping the cap.
    const lines = text.split('\n');
    const startIdx = lines.findIndex(l => /^SKILLS\s*$/.test(l));
    if (startIdx === -1) return text;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      // Next section header: ALL CAPS, 3+ chars, just letters/spaces
      if (/^[A-Z][A-Z\s]{2,}$/.test(lines[i].trim()) && lines[i].trim() !== 'SKILLS') {
        endIdx = i;
        break;
      }
    }
    const skillLines = lines.slice(startIdx + 1, endIdx).filter(l => l.trim());
    const totalSkills = skillLines.reduce((sum, line) => {
      const items = line.replace(/^[^:]+:\s*/, '').split(',').filter(s => s.trim());
      return sum + items.length;
    }, 0);
    console.log('[capSkillsTo30] Current skill count:', totalSkills);
    if (totalSkills <= 30) return text;

    const jdText = (proj?.jdText || g('jd-text') || '').slice(0, 4000);
    const jdTitle = proj?.jdTitle || g('jd-title') || '';
    if (!jdText && !jdTitle) {
      console.warn('[capSkillsTo30] No JD context; skipping cap to avoid arbitrary trimming');
      return text;
    }

    const prompt = `Your only job: trim the SKILLS section to AT MOST 30 total skills, keeping the ones most relevant to the target job and rebalancing across groups based on what the role actually values.

JOB TITLE: ${jdTitle || '(unspecified)'}
JOB DESCRIPTION:
${jdText}

STEP 1 — DETERMINE THE ROLE'S CHARACTER. Before you trim anything, classify what kind of role this is. Read the title and description carefully. Common archetypes:
- Design leadership / UX leadership: emphasis on team leadership, design strategy, design systems, design quality, stakeholder influence. Skills in Leadership and Design groups carry more weight than Engineering or back-office Product Ops.
- Hands-on IC design (e.g. Senior Designer, Staff Designer): emphasis on craft, interaction design, prototyping, research. Design > Leadership, even if the candidate has both.
- Product management: emphasis on roadmap, KPIs, experimentation, customer insight. Product > Design.
- Engineering: emphasis on languages, frameworks, infrastructure. Engineering > Product/Design.
- Hybrid (e.g. design + web channel ownership): weight skills that span both, plus the channel-specific skills the JD names.

STEP 2 — REBALANCE GROUPS PROPORTIONALLY. The 30-skill budget should NOT be split equally. Allocate more slots to groups that match the role's character. For a design leadership role, that might look like ~10 Leadership + ~11 Design + ~6 Product + ~3 Engineering. For a PM role, it might be ~4 Leadership + ~5 Design + ~17 Product + ~4 Engineering. Pick proportions that fit THIS specific JD.

STEP 3 — WITHIN EACH GROUP, keep the skills the JD explicitly names or strongly implies, then the strongest adjacent skills, then drop the rest. Skills that don't appear in the JD AND don't directly support the role's character should go first.

OTHER RULES:
- Total cap is 30 across all groups combined.
- Drop skills entirely. Do not rename, abbreviate, merge, or move skills between groups.
- KEEP EVERY ORIGINAL GROUP. If a group is less central to the role (e.g. Engineering on a design leadership role), reduce it to a small number of skills (1–3) but DO NOT remove the group entirely. The candidate's resume structure is theirs to keep.
- Within each remaining group, list the most JD-relevant skills first.
- Do NOT change anything outside the SKILLS section: same sections, same role order, same dates, same companies, same titles, same summary, same bullet character.
- Do NOT add new skills the candidate doesn't already have. Only remove and reorder existing skills.
- Never go above 30. Going under is fine if the JD genuinely doesn't justify 30 skills.

Return ONLY the complete plain-text resume, no commentary, no code fences.

RESUME:
${text}`;
    const result = await claudeFetch(prompt, 4000);
    return result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
  } catch (e) {
    console.warn('capSkillsTo30 failed, returning original:', e);
    return text;
  }
}

async function differentiateSameEmployerRoles(text) {
  try {
    const prompt = `Your only job: when two or more roles in this resume share the same company name (e.g. multiple Verizon roles, multiple Web.com roles), check their bullets for near-duplicate language. Rewrite or remove duplicates so each role's bullets reflect that role's specific scope and constraints.

DEFINITION OF "NEAR-DUPLICATE":
Two bullets are near-duplicate if they share 6+ consecutive content words (ignoring articles/prepositions) OR they convey the same competence with cosmetic rewording. Examples that ARE near-duplicates:
- "Ensured designs were scalable and aligned with user and business outcomes" (Role A) AND "Ensured designs were scalable and aligned with user and business needs" (Role B)
- "Led cross-functional collaboration with Product and Engineering" (Role A) AND "Partnered with Product and Engineering on cross-functional collaboration" (Role B)
- "Drove customer satisfaction through design execution" (Role A) AND "Drove customer satisfaction through design priorities" (Role B)

These are NOT near-duplicates and should be left alone:
- Bullets at different employers, even if similarly worded (this pass is scoped to same-employer roles only).
- Bullets that share a metric ONLY (the metric-dedup pass handles that separately).
- Bullets that share generic verbs but describe materially different work.

WHAT TO DO when you find a near-duplicate at the same employer:
1. Identify which of the two bullets is more specific (has concrete metrics, named products, named teams, or distinctive scope). Keep that bullet unchanged.
2. For the less-specific bullet, attempt to rewrite it using ONLY facts that already appear in that role's other bullets, role summary/context, or job header (title, company, dates, location). The rewrite must reflect that role's specific scope — team size, product names, constraints, audience, technical context — drawn from text already in that role.
3. CRITICAL: do NOT introduce any new domain, scope, metric, team composition, or framing that isn't already present in that role's existing text. No fabrication. If you cannot honestly differentiate the bullet using only the role's existing facts, DELETE the duplicate bullet entirely instead of rewriting it.
4. Never invent qualifiers like "small team," "constrained context," "platform modernization," "16M households," etc. unless those exact phrases appear in that role's existing bullets/context.

OTHER RULES:
- Do NOT change anything outside of same-employer near-duplicates: same sections, same role order, same dates, same companies, same titles, same skills, same professional summary, same formatting, same bullet character.
- The professional summary at the top of the resume is out of scope.
- If no same-employer near-duplicates exist, return the resume completely unchanged.

Return ONLY the complete plain-text resume, no commentary, no code fences.

RESUME:
${text}`;
    const result = await claudeFetch(prompt, 4000);
    return result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
  } catch (e) {
    console.warn('differentiateSameEmployerRoles failed, returning original:', e);
    return text;
  }
}

// Within-role phrase dedup. Catches near-duplicate bullets inside a single role —
// "Led 30 designers ship platform" + "Aligned 30 designers on product direction"
// are the same accomplishment with cosmetic rewording. Different from dedupeBulletMetrics
// (metric-only) and differentiateSameEmployerRoles (cross-role at same company).
async function dedupeBulletPhrases(text) {
  try {
    const prompt = `Your only job: within each single role, find pairs of bullets OR role-summary + bullet that describe the same accomplishment with cosmetic rewording, and remove the less-specific one.

A "role" is one job entry. It has:
  (a) a role summary: the sentence(s) immediately after the role title/company line, before any bullets
  (b) bullets: the bulleted accomplishments

Compare:
  - Every bullet against every OTHER bullet in the SAME role
  - Every bullet against the role summary IN THE SAME role

DEFINITION OF "NEAR-DUPLICATE within a role":
Two texts are near-duplicate if they share 6+ consecutive content words, OR they describe the same accomplishment (same team, same scope, same audience, same outcome) with cosmetic verb/object rewording. Examples that ARE near-duplicates:
- "cutting design-to-implementation cycle time by 30%" in role summary AND "reducing design-to-implementation cycle time by 30%" in a bullet (same metric, same outcome, just verb swap)
- "Led distributed team of 30 designers and engineers to ship platform reaching 41M customers and 342M connected devices" AND "Aligned distributed team of 30 designers and engineers on product direction for home apps serving 41M customers" (same team size + same audience + same role context — only the verb and the object phrasing changed)
- "Delivered usable designs for AI-assisted workflows across router firmware, mobile apps, and connected device networks" AND "Led team of 4 product designers across product areas for router firmware, mobile apps, and connected device networks" (same product area list — the new bullet is a redundant variant)
- "Drove customer engagement through design execution" AND "Improved customer engagement via design priorities" (same outcome, cosmetic rewording)

These are NOT near-duplicates and should be left alone:
- Texts that share a team size or company name but describe genuinely different accomplishments (e.g. "led 30 designers to ship X" vs "hired 8 of those 30 designers" — different work)
- Texts that share generic verbs but different objects, scope, or outcomes
- Texts in different roles (handled by separate passes)

WHAT TO DO when you find a near-duplicate pair within a role:
1. Identify the more specific text (concrete metrics, named products, distinctive scope, measurable outcomes). Keep that one unchanged.
2. DELETE the less-specific text entirely. Do NOT attempt to rewrite it — within-role rewriting at this layer tends to introduce fabrication. Deletion is the safe outcome.
3. If you remove text from the role summary, ensure the summary still reads as a complete sentence. If removing text from a bullet leaves it empty or nonsensical, delete the entire bullet.

OTHER RULES:
- Do NOT change anything outside near-duplicate pairs: same sections, same role order, same dates, same companies, same titles, same skills, same professional summary, same formatting, same bullet character.
- The professional summary (the very top of the resume, before any roles) is out of scope.
- If no within-role near-duplicates exist, return the resume completely unchanged.

Return ONLY the complete plain-text resume, no commentary, no code fences.

RESUME:
${text}`;
    const result = await claudeFetch(prompt, 4000);
    return result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
  } catch (e) {
    console.warn('dedupeBulletPhrases failed, returning original:', e);
    return text;
  }
}

// Cross-role boilerplate dedup. Catches filler phrases that repeat across two or more
// unrelated roles (e.g. "building tools that help teams work effectively" appearing in
// both Home Network 2020-2022 and Yodle 2016-2017).
async function dedupeCrossRoleBoilerplate(text) {
  try {
    const prompt = `Your only job: find filler phrases that repeat across two or more roles in this resume, and remove or rewrite the less-specific occurrence.

A "boilerplate repeat" is a phrase of 6+ words that appears (verbatim or near-verbatim) in bullets under DIFFERENT roles. Examples:
- "building tools that help teams work effectively" appearing in two different roles
- "delivering high-quality experiences across multiple platforms" appearing in two different roles
- "driving design culture and craft excellence" appearing in two different roles

Rules:
- Keep the most specific occurrence (the one with concrete metrics, named products, or distinctive context). Rewrite the other to say something specific to that role using ONLY facts already present in that role's existing bullets/context, OR delete the bullet entirely if no honest differentiation is possible.
- Within a single role, do not change anything (separate dedup pass handles within-role).
- Do NOT change anything else: same sections, same role order, same dates, same companies, same titles, same skills, same summary, same bullet character.
- Do NOT add new metrics or invent details. Only remove or rewrite filler.
- If no cross-role boilerplate repeats exist, return the resume completely unchanged.

Return ONLY the complete plain-text resume, no commentary, no code fences.

RESUME:
${text}`;
    const result = await claudeFetch(prompt, 4000);
    return result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
  } catch (e) {
    console.warn('dedupeCrossRoleBoilerplate failed, returning original:', e);
    return text;
  }
}

async function dedupeBulletMetrics(text) {
  try {
    const prompt = `Your only job: within each role, ensure every metric appears AT MOST ONCE across that role's content.

A "role" is one job entry. Each role has:
  (a) a role summary line (the sentence immediately after the role header, before the bullets) — may or may not be present
  (b) a list of bullet points

CHECK BOTH (a) AND (b) TOGETHER. A metric in the role summary that also appears in a bullet IS a duplicate. A metric in two different bullets IS a duplicate.

RULES:
- If a number, percentage, or specific metric (e.g. "26% MAU growth", "300% DAU growth", "100M+ customers", "90% activation rate", "342M devices") appears more than once anywhere within the SAME role (summary + bullets combined), KEEP it in ONLY ONE location: the place where it has the most context and explanation. REMOVE it from every other place in that role.
- When removing a metric from the role summary or a bullet, rewrite that line so it still reads as a complete, natural sentence — do not leave dangling fragments, orphan clauses, or trailing prepositions.
- If a bullet becomes redundant after removing its metric (i.e. it now says nearly the same thing as another bullet), delete the redundant bullet entirely.
- Do NOT change anything else: same sections, same role order, same dates, same companies, same titles, same skills, same professional summary at the top of the resume, same formatting, same bullet character.
- Do NOT add new metrics. Do NOT invent numbers. Do NOT alter metrics that appear only once.
- The professional summary at the very top of the resume (above any role) is OUT OF SCOPE — leave it alone even if it shares a metric with a role.
- If no duplicate metrics exist anywhere within any role, return the resume completely unchanged.

Return ONLY the complete plain-text resume, no commentary, no code fences.

RESUME:
${text}`;
    const result = await claudeFetch(prompt, 4000);
    return result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
  } catch (e) {
    console.warn('dedupeBulletMetrics failed, returning original:', e);
    return text;
  }
}

// Final safety net — strips placeholder metric tokens that prompts may have leaked through.
// Pure regex, no API call, can't fail. Targets common placeholder shapes.
function stripPlaceholders(text) {
  let out = text;

  // Stage 1: Remove preposition + placeholder phrases ("by X%", "of Y%", "to [number]%", etc.)
  out = out.replace(
    /\s+(?:by|of|to|at|with|through|reaching|achieving|delivering|driving|over|up\s+to)\s+(?:approximately\s+|over\s+|up\s+to\s+|around\s+)?(?:[XYZ]{1,3}|\[[^\]]*\]|_{2,}|TB[DA])\s*%/gi,
    ''
  );

  // Stage 2: Standalone placeholder + % (handles "X% improvement", "[number]% growth")
  out = out.replace(
    /(?:^|\s)(?:[XYZ]{1,3}|\[[^\]]*\]|_{2,}|TB[DA])\s*%/gi,
    ' '
  );

  // Stage 3: Per-line cleanup — preserve leading whitespace (bullet indents), normalize the rest.
  out = out.split('\n').map(line => {
    const lead = (line.match(/^(\s*)/) || ['', ''])[1];
    const body = line.slice(lead.length)
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+$/, '');
    return lead + body;
  }).join('\n');

  return out;
}

// Replace em dashes with commas. Em dashes (—) are an AI tell — they don't sound human in
// resume copy. We replace them with comma+space, which is the natural human equivalent in
// most contexts. Examples:
//   "non-designers—partnering with research" → "non-designers, partnering with research"
//   "team — across products"                 → "team, across products"
//   "word -- word" (double hyphen as dash)   → "word, word"
//
// We deliberately LEAVE en dashes (–) alone because they're used legitimately in date ranges
// like "01/16 – 06/17". Touching them would break formatting in the EXPERIENCE section.
// Detect third-person pronouns in text. Returns array of matches with context.
// Third-person: he, she, they, it, name + pronouns
// First-person OK: I, me, my, we, us, our
function detectThirdPersonPronouns(text) {
  const matches = [];
  const lines = text.split('\n');
  
  // Pattern: standalone he/she/they/it at word boundary, or Name + pronoun
  // Also catch "they" when used as singular third-person
  const thirdPersonPatterns = [
    /\b(he|she|it)\s+(is|are|was|were|has|have|brings|builds|led|drives|creates|manages|improved|achieved|designed|developed)/gi,
    /\b(he|she|it)\b(?!\s+and)/gi,  // he/she/it not followed by "and"
    /\b(his|her|its)\b/gi,          // possessive forms
  ];
  
  lines.forEach((line, idx) => {
    thirdPersonPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        matches.push({
          line: idx,
          text: line.trim(),
          pronoun: match[1] || match[0],
          context: line.substring(Math.max(0, match.index - 20), Math.min(line.length, match.index + 50))
        });
      }
    });
  });
  
  return matches;
}

// Validate that resume content uses first person or has no pronouns.
// Returns { valid: bool, issues: string[], suggestions: string[] }
function validatePronounConsistency(text) {
  const issues = [];
  const suggestions = [];
  const thirdPersonMatches = detectThirdPersonPronouns(text);
  
  if (thirdPersonMatches.length === 0) {
    return { valid: true, issues: [], suggestions: [] };
  }
  
  // Found third-person pronouns
  issues.push(`Found ${thirdPersonMatches.length} third-person pronoun(s). Resume must use first person ("I", "me", "my") or no pronouns.`);
  
  thirdPersonMatches.slice(0, 3).forEach(match => {
    suggestions.push(`Line ${match.line + 1}: "${match.context.trim()}" → Use first person or rewrite without pronouns`);
  });
  
  return { 
    valid: false, 
    issues, 
    suggestions: suggestions.slice(0, 3)
  };
}

function stripEmDashes(text) {
  let out = text;
  
  // Replace em dashes with comma+space, absorbing any surrounding whitespace.
  out = out.replace(/\s*—\s*/g, ', ');
  
  // Replace double-hyphen used as em dash (only when surrounded by whitespace).
  out = out.replace(/\s+--\s+/g, ', ');
  
  // Cleanup: collapse double commas, fix space-before-punctuation, normalize whitespace.
  out = out.split('\n').map(line => {
    const lead = (line.match(/^(\s*)/) || ['', ''])[1];
    const body = line.slice(lead.length)
      .replace(/,\s*,/g, ',')           // ",, " or "," + ", " → ","
      .replace(/\s+([,.;:])/g, '$1')    // " ," → ","
      .replace(/\s{2,}/g, ' ')          // collapse multi-spaces
      .replace(/^[,\s]+/, '')           // strip leading comma if dash was at start of line
      .replace(/\s+$/, '');             // trailing whitespace
    return lead + body;
  }).join('\n');
  
  return out;
}

// Builds a "VERIFIED FACTS" block from the project's Content Editor data.
// This is the closed world the optimizer must work within — companies, role titles, dates,
// every existing bullet, every skill. The model may rephrase or amplify anything in this list
// but may not introduce domains, team members, products, or metrics outside it.
function buildVerifiedFacts() {
  if (!proj || !proj.ce) return '';
  const ce = proj.ce;
  const lines = [];

  if (Array.isArray(ce.roles) && ce.roles.length) {
    lines.push('CAREER HISTORY (every role, exactly as it happened):');
    ce.roles.forEach(r => {
      const title = (r.title || '').trim();
      const company = (r.company || '').trim();
      const loc = (r.location || '').trim();
      const start = (r.startDate || '').trim();
      const end = (r.endDate || '').trim();
      const dates = start || end ? `${start || '?'} – ${end || 'Present'}` : '';
      const header = [title, company ? '@ ' + company : '', loc, dates].filter(Boolean).join(' | ');
      lines.push('• ' + header);
      if (r.context && r.context.trim()) lines.push('    Context: ' + r.context.trim());
      if (Array.isArray(r.bullets) && r.bullets.length) {
        r.bullets.forEach(b => {
          const t = typeof b === 'string' ? b : (b.text || b.content || '');
          if (t.trim()) lines.push('    - ' + t.trim());
        });
      }
    });
    lines.push('');
  }

  if (Array.isArray(ce.skillGroups) && ce.skillGroups.length) {
    lines.push('SKILLS (only these are real — do not invent skills not on this list):');
    ce.skillGroups.forEach(sg => {
      const skills = (sg.skills || []).map(s => typeof s === 'string' ? s : s.text || '').filter(Boolean);
      if (skills.length) lines.push('• ' + (sg.label || 'Skills') + ': ' + skills.join(', '));
    });
    lines.push('');
  }

  if (Array.isArray(ce.edu) && ce.edu.length) {
    lines.push('EDUCATION:');
    ce.edu.forEach(e => {
      const parts = [e.degree, e.field, e.school, e.year || e.endYear].filter(Boolean);
      if (parts.length) lines.push('• ' + parts.join(', '));
    });
    lines.push('');
  }

  return lines.length ? lines.join('\n') : '';
}

// Shared truth-grounding instruction used in both applySelectedFixes and Auto-Optimize.
const TRUTH_GROUNDING_RULES = `
TRUTH GROUNDING (highest-priority rule, overrides JD-matching):
- The goal is to find the strongest HONEST angle this candidate has on this JD, and amplify it. The goal is NOT to make the resume look like the JD.
- A VERIFIED FACTS block is included below. Treat it as the closed world of the candidate's actual experience. You may rephrase, reorder, emphasize, or sharpen any fact in it. You may NOT introduce anything outside it.
- Specifically forbidden:
  • Inventing domains the candidate has not worked in (gaming, social, fintech, healthcare, etc.) — if it's not in VERIFIED FACTS, it cannot appear in the resume.
  • Inventing team members or roles (researchers, content designers, engineers) who are not described in the role's existing context or bullets.
  • Changing team sizes from what the role's existing context or bullets state.
  • Inventing products, features, or accomplishments (e.g. "social experiences and community features", "real-time chat", "moderation tools") that are not in VERIFIED FACTS.
  • Lifting verbatim phrases from the JD (e.g. "win-win-win", "talk and hang out", "players and users", "intuitive scalable experiences") into bullets that describe work where those concepts didn't apply. JD vocabulary is fine where it genuinely matches; it is fabrication where it doesn't.
- If a fix or keyword would require fabrication to apply cleanly, apply it only to the role(s) where the underlying experience actually supports it. If no role supports it, leave it out — a missing keyword is acceptable; a fabricated bullet is not.
- When the JD asks for a domain the candidate lacks, the right move is transferable framing: lead with the candidate's real scale, platform thinking, cross-functional leadership, or strategic vision — never invent the missing domain.

VOICE RULES (apply to every rewrite):
- NEVER use em dashes (—) anywhere in the resume output. Em dashes don't sound human and are an AI tell.
- When you would use an em dash for a parenthetical aside, use a comma or restructure into two sentences. Examples:
  • Wrong: "design systems that empower non-designers—partnering with research to generate ideas"
  • Right: "design systems that empower non-designers, partnering with research to generate ideas"
  • Right: "design systems that empower non-designers. I partner with research to generate ideas."
- Hyphens in compound words (non-designers, cross-functional, end-to-end) are correct and stay.
- En dashes (–) in date ranges (01/16 – 06/17) are correct and stay.
`;

// Builds the BULLET CONTEXT block injected into apply prompts. Lists every bullet that has a
// user-confirmed outcomeNote so the AI can fold the outcome into the matching bullet without
// exceeding the 30-word cap. Returns '' if no notes exist.
function buildBulletContextBlock() {
  if (!proj?.ce?.roles) return '';
  const notes = [];
  for (const r of proj.ce.roles) {
    if (!r.bullets) continue;
    for (const b of r.bullets) {
      if (b.outcomeNote && b.outcomeNote.trim()) {
        notes.push({
          role: `${r.title || ''} at ${r.company || ''}`.trim(),
          bullet: (b.text || '').trim(),
          outcome: b.outcomeNote.trim(),
        });
      }
    }
  }
  if (!notes.length) return '';
  const formatted = notes.map((n, i) =>
    `${i + 1}. [${n.role}]\n   Original bullet: "${n.bullet}"\n   Outcome to fold in: ${n.outcome}`
  ).join('\n\n');
  return `\n\nBULLET CONTEXT — the user has provided outcomes for these specific bullets. Fold each outcome INTO its matching bullet so the bullet now leads with measurable impact. CRITICAL: each rewritten bullet MUST stay under 180 characters (target ~150). Trim setup language to make room for the outcome — do NOT just append. If the outcome contains a range or hedge ("around 25%", "in the 20-30% range"), keep it as the user wrote it; do NOT pretend it's a precise figure.\n\n${formatted}\n\n`;
}


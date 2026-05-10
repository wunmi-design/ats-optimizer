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
function capBulletsPerRole(text, maxBullets) {
  const cap = maxBullets || 3;
  const lines = text.split('\n');
  const result = [];
  let bulletCount = 0;
  let inRole = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect role header (has dates like 01/16 – 06/17 or 09/25 – Present)
    if (trimmed.match(/\d{1,2}\/\d{2}\s*[–-]\s*(?:\d{1,2}\/\d{2}|Present|Current)/)) {
      inRole = true;
      bulletCount = 0;
      result.push(line);
      continue;
    }
    
    // Check if this is a bullet (starts with • or -)
    if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
      if (bulletCount < cap) {
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

// Removes the AWARDS section if it has 1-2 entries — common cause of orphan pages
// where AWARDS sits alone on the last page. Returns trimmed text only if AWARDS
// was actually removed; otherwise returns original.
function removeOrphanAwardsIfShort(text) {
  // Find AWARDS section at the end of resume
  const lines = text.split('\n');
  let awardsStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^AWARDS\s*$/i.test(lines[i].trim())) {
      awardsStart = i;
      break;
    }
  }
  if (awardsStart === -1) return text;
  
  // Count non-empty content lines after AWARDS header
  const contentLines = lines.slice(awardsStart + 1).filter(l => l.trim());
  
  // Only remove if AWARDS has 1-2 entries (orphan-prone case)
  if (contentLines.length <= 2) {
    return lines.slice(0, awardsStart).join('\n').trimEnd();
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
  
  // Use 85% of target as inner goal — leaves a real buffer for rendering variance
  const safetyFactor = 0.85;
  let current = text;
  let currentChars = current.replace(/\s+/g, ' ').length;
  let iteration = 0;
  const MAX_ITERATIONS = 4;
  
  while (iteration < MAX_ITERATIONS) {
    // Verify with rendering — if we already fit visually, stop iterating
    const renderedPages = measureRenderedPages(current);
    if (renderedPages !== null && renderedPages <= analysis.targetPages + 0.02) {
      console.log(`Trim verified visually: ${renderedPages.toFixed(2)} pages ≤ ${analysis.targetPages}`);
      return current;
    }
    
    iteration++;
    // Each iteration tightens the target by 5% to push harder when overflow persists
    const iterationFactor = safetyFactor - (iteration - 1) * 0.05;
    const targetChars = Math.floor(analysis.targetChars * iterationFactor);
    const reductionPct = Math.round(((currentChars - targetChars) / currentChars) * 100);
    const visualOverflow = renderedPages !== null ? renderedPages.toFixed(2) : 'unknown';
    
    try {
      const prompt = `You are a resume editor. Trim this resume to fit STRICTLY within ${analysis.targetPages} page(s). The candidate has ${analysis.yoe} years of experience.

CURRENT: ${currentChars} characters, visually rendering at ${visualOverflow} pages
TARGET: ${targetChars} characters maximum, MUST fit on ${analysis.targetPages} page(s)
REDUCTION NEEDED: approximately ${reductionPct}% — be aggressive

CRITICAL CONSTRAINT: Output MUST fit on exactly ${analysis.targetPages} page(s). If it spills 1 line over, that fails.

COMMON ORPHAN PROBLEM: If the AWARDS section has only 1-2 entries and the resume is barely over the page limit, REMOVE THE ENTIRE AWARDS SECTION — it commonly orphans to a 3rd page with just 1 line on it. The resume reads stronger without an isolated awards line.

TRIMMING RULES (in priority order):
1. If AWARDS has ≤2 entries and resume is near/over page limit, REMOVE the entire AWARDS section
2. Drop weakest bullets first — those without specific metrics, outcomes, or differentiated value
3. If two bullets cover similar ground, keep the one with stronger metric/specificity
4. Tighten verbose bullets to ~120 characters each (drop filler words, redundant phrases)
5. Remove role context/description lines (the 1-line text between role header and bullets) for older roles
6. Trim role context lines to ~80 chars if kept
7. Older roles (5+ years ago) should have 1-2 bullets max, not 3
8. NEVER drop role headers, dates, or company names
9. NEVER drop the entire SUMMARY, SKILLS, or EDUCATION sections (just trim within them)
10. Keep at least 1 bullet per role (preserves work history)
11. PRESERVE EXACT FORMATTING: section structure, line breaks, bullet character (•), date format

CRITICAL:
- Use FIRST PERSON (I/me/my) — never third person
- NEVER fabricate metrics or outcomes
- NEVER add new bullets or content
- BE AGGRESSIVE — the resume MUST fit in ${targetChars} chars
- Output the COMPLETE trimmed resume, no commentary

RESUME:
${current}`;

      const result = await claudeFetch(prompt, 4000);
      const trimmed = result.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
      
      // Safety check: if trim made it WORSE (longer) or removed too much (<50% target),
      // stop iterating with the previous version
      const trimmedChars = trimmed.replace(/\s+/g, ' ').length;
      if (trimmedChars > currentChars || trimmedChars < targetChars * 0.5) {
        console.warn(`Trim iteration ${iteration} safety check failed (chars: ${trimmedChars}), keeping previous`);
        break;
      }
      
      const reduction = (currentChars - trimmedChars) / currentChars;
      current = trimmed;
      currentChars = trimmedChars;
      console.log(`Trim iteration ${iteration}: ${currentChars} chars (target: ${targetChars}, reduction: ${(reduction*100).toFixed(1)}%)`);
      
      // Early exit: AI plateaued
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
  
  // FINAL BACKSTOP: Detect orphan-prone AWARDS section and remove it proactively.
  // CSS page-break-inside:avoid keeps sections together. If AWARDS has ≤2 entries AND total
  // content is close to (or over) page limit, AWARDS will orphan to next page. Detect this
  // BEFORE it happens by removing AWARDS whenever resume is near/over the limit.
  const postTrimPages = measureRenderedPages(current);
  if (postTrimPages !== null && postTrimPages > analysis.targetPages - 0.25) {
    // Content is within 0.25 pages of the limit → AWARDS might orphan. Try removing it.
    const withoutAwards = removeOrphanAwardsIfShort(current);
    if (withoutAwards !== current) {
      const newPages = measureRenderedPages(withoutAwards);
      if (newPages !== null && newPages <= postTrimPages) {
        console.log(`Removed orphan-prone AWARDS: ${postTrimPages.toFixed(2)} → ${newPages.toFixed(2)} pages`);
        return withoutAwards;
      }
    }
  }
  
  // Final verification log
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


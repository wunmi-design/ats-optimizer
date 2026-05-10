// ═══════════════════════════════════════════════════════
//  CONFIG & CONSTANTS
// ═══════════════════════════════════════════════════════
const CONFIG = {
  // Project status definitions — single source of truth
  statuses: [
    { id: 'didnt-apply', label: "Didn't Apply", cssClass: 'didnt-apply' },
    { id: 'ready-to-send', label: 'Ready to Send', cssClass: 'ready-to-send' },
    { id: 'applied', label: 'Applied', cssClass: 'applied' },
    { id: 'interviewing', label: 'Interviewing', cssClass: 'interviewing' },
    { id: 'not-pursuing', label: 'Not Pursuing', cssClass: 'not-pursuing' }
  ],
  
  // Token limits per user
  tokens: {
    dailyLimit: 50000,
    monthlyLimit: 200000,
    // Estimated tokens per operation
    estimatedPerAnalysis: 3000,        // Analyze JD + answer questions
    estimatedPerOptimization: 5500     // One optimization pass
  },
  
  // Model routing — all calls now use Opus (Sonnet routing reverted; Opus performs better)
  models: {
    opus: 'claude-opus-4-5',     // Default for all operations
    sonnet: 'claude-opus-4-5'    // Reverted: was Sonnet for scoring/titles, now Opus
  },
  
  // Helper: get status by ID
  getStatus: function(id) {
    return this.statuses.find(s => s.id === id) || { id: 'Status?', label: 'Status?', cssClass: 'none' };
  },
  
  // Helper: get label for a status ID
  getStatusLabel: function(id) {
    return this.getStatus(id).label;
  },
  
  // Helper: get CSS class for a status ID
  getStatusClass: function(id) {
    return this.getStatus(id).cssClass;
  }
};

// ═══════════════════════════════════════════════════════
//  TEMPLATE GENERATORS
// ═══════════════════════════════════════════════════════
const Templates = {
  // Generate status popup HTML with all status options
  statusPopup: function(projectId, currentStatus) {
    const options = CONFIG.statuses.map(status => 
      `<label><input type="radio" name="status-${projectId}" value="${status.id}" ${currentStatus===status.id?'checked':''} onchange="setProjectStatus('${projectId}','${status.id}')"> ${status.label}</label>`
    ).join('\n            ');
    
    return `<div class="status-popup" id="status-${projectId}" role="menu">
            ${options}
          </div>`;
  }
};

// ═══════════════════════════════════════════════════════
//  TOKEN TRACKING & LIMITS
// ═══════════════════════════════════════════════════════
const TokenTracker = {
  // Get daily usage for current user
  getDailyUsage: function(userId) {
    if (!userId) return 0;
    const key = `tokens_daily_${userId}_${new Date().toISOString().split('T')[0]}`;
    return parseInt(localStorage.getItem(key) || '0');
  },
  
  // Get monthly usage for current user
  getMonthlyUsage: function(userId) {
    if (!userId) return 0;
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const key = `tokens_monthly_${userId}_${year}-${month}`;
    return parseInt(localStorage.getItem(key) || '0');
  },
  
  // Add tokens to both daily and monthly counters
  addTokens: function(userId, amount) {
    if (!userId) return;
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `tokens_daily_${userId}_${today}`;
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const monthlyKey = `tokens_monthly_${userId}_${year}-${month}`;
    
    const currentDaily = parseInt(localStorage.getItem(dailyKey) || '0');
    const currentMonthly = parseInt(localStorage.getItem(monthlyKey) || '0');
    
    localStorage.setItem(dailyKey, currentDaily + amount);
    localStorage.setItem(monthlyKey, currentMonthly + amount);
    
    TokenTracker.updateUI(userId);
  },
  
  // Check if user has tokens available for an operation
  canUseTokens: function(userId, estimatedTokens) {
    const daily = TokenTracker.getDailyUsage(userId);
    const monthly = TokenTracker.getMonthlyUsage(userId);
    const dailyOK = daily + estimatedTokens <= CONFIG.tokens.dailyLimit;
    const monthlyOK = monthly + estimatedTokens <= CONFIG.tokens.monthlyLimit;
    return dailyOK && monthlyOK;
  },
  
  // Get remaining tokens
  getRemaining: function(userId) {
    const daily = TokenTracker.getDailyUsage(userId);
    const monthly = TokenTracker.getMonthlyUsage(userId);
    return {
      daily: CONFIG.tokens.dailyLimit - daily,
      monthly: CONFIG.tokens.monthlyLimit - monthly
    };
  },
  
  // Update UI with current usage
  updateUI: function(userId) {
    if (!userId) return;
    const daily = TokenTracker.getDailyUsage(userId);
    const monthly = TokenTracker.getMonthlyUsage(userId);
    const dailyEl = document.getElementById('daily-usage');
    const monthlyEl = document.getElementById('monthly-usage');
    if (dailyEl) dailyEl.textContent = `${daily.toLocaleString()}/${CONFIG.tokens.dailyLimit.toLocaleString()}`;
    if (monthlyEl) monthlyEl.textContent = `${monthly.toLocaleString()}/${CONFIG.tokens.monthlyLimit.toLocaleString()}`;
    
    // Color warn if approaching limits
    if (dailyEl && daily > CONFIG.tokens.dailyLimit * 0.8) {
      dailyEl.style.color = '#dc2626';
    } else if (dailyEl) {
      dailyEl.style.color = 'var(--ink)';
    }
    
    if (monthlyEl && monthly > CONFIG.tokens.monthlyLimit * 0.8) {
      monthlyEl.style.color = '#dc2626';
    } else if (monthlyEl) {
      monthlyEl.style.color = 'var(--ink)';
    }
  }
};

// ═══════════════════════════════════════════════════════
//  UI LAYER
// ═══════════════════════════════════════════════════════

// ── Tab routing ────────────────────────────────────────
// ─── SUPABASE CONFIG ─────────────────────────────────
const SUPABASE_URL = 'https://qirzmqfswcnofunxlmwr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpcnptcWZzd2Nub2Z1bnhsbXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODI4ODIsImV4cCI6MjA5MjU1ODg4Mn0.rhtDuIrFpkl2sqBHmhkpgmHADInGvgr7-sfsX9-_d28';

// ─── AUTH STATE ──────────────────────────────────────
window._atsUser = null;
window._atsToken = null;

async function supaFetch(path, opts = {}) {
  const headers = { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json', ...opts.headers };
  if (window._atsToken) headers['Authorization'] = 'Bearer ' + window._atsToken;
  const res = await fetch(SUPABASE_URL + path, { ...opts, headers });
  return res;
}

function handleAuthClick() {
  if (window._atsUser) {
    // Sign out
    window._atsUser = null;
    window._atsToken = null;
    localStorage.removeItem('ats_user');
    localStorage.removeItem('ats_token');
    localStorage.removeItem('ats_refresh');
    document.getElementById('auth-btn').textContent = 'Sign in with Google';
    document.getElementById('user-display').style.display = 'none';
    updateTabVisibility();
    proj = null;
    document.getElementById('proj-name-display').textContent = 'New Project';
    document.getElementById('proj-name-display').classList.add('placeholder');
    var resumeBody = document.querySelector('.resume-panel-body');
    if (resumeBody) resumeBody.innerHTML = '<div class="resume-empty"><div class="resume-empty-icon">📄</div><p>Resume will appear here</p></div>';
    switchTab('projects');
    renderProjGrid();
  } else {
    // Use Supabase OAuth endpoint (handles PKCE internally)
    const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname.replace(/\/$/,'') + '/');
    window.location.href = SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + redirectTo;
  }
}

function setAuthUI() {
  if (window._atsUser) {
    const profileBtn = document.getElementById('user-profile-btn');
    const avatar = document.getElementById('user-avatar');
    const firstName = document.getElementById('user-first-name');
    
    // Show user profile button
    if (profileBtn) profileBtn.style.display = 'flex';
    
    // Set user's first name
    const fullName = window._atsUser.name || window._atsUser.email || 'User';
    const first = fullName.split(' ')[0];
    if (firstName) firstName.textContent = first;
    
    // Set user's avatar if available from Google OAuth
    if (window._atsUser.picture && avatar) {
      avatar.src = window._atsUser.picture;
      avatar.style.display = 'block';
    }
    
    // Update token usage display
    TokenTracker.updateUI(window._atsUser.id);
  } else {
    const profileBtn = document.getElementById('user-profile-btn');
    if (profileBtn) profileBtn.style.display = 'none';
  }
}

async function handleAuthCallback() {
  // Supabase returns tokens in URL hash fragment
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken) {
      window._atsToken = accessToken;
      localStorage.setItem('ats_token', accessToken);
      if (refreshToken) localStorage.setItem('ats_refresh', refreshToken);
      // Get user info
      try {
        const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
          headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': SUPABASE_KEY }
        });
        const userData = await res.json();
        window._atsUser = {
          id: userData.id,
          email: userData.email,
          name: userData.user_metadata?.full_name || userData.user_metadata?.name || userData.email,
          picture: userData.user_metadata?.picture || userData.user_metadata?.avatar_url
        };
        localStorage.setItem('ats_user', JSON.stringify(window._atsUser));
      } catch(e) {
        // Fallback: parse JWT
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]));
          window._atsUser = { id: payload.sub, email: payload.email, name: payload.email };
          localStorage.setItem('ats_user', JSON.stringify(window._atsUser));
        } catch(e2) {}
      }
      window.history.replaceState({}, document.title, window.location.pathname);
      setAuthUI();
      updateTabVisibility();
      // Sync projects from cloud
      await ProjectStore.syncFromCloud();
      renderProjGrid();
      return;
    }
  }

  // Check for code in query params (fallback)
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Restore session from localStorage
  const storedToken = localStorage.getItem('ats_token');
  const storedUser = localStorage.getItem('ats_user');
  if (storedToken && storedUser) {
    window._atsToken = storedToken;
    window._atsUser = JSON.parse(storedUser);
    // Verify token is still valid
    try {
      const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'Authorization': 'Bearer ' + storedToken, 'apikey': SUPABASE_KEY }
      });
      if (res.ok) {
        setAuthUI();
        updateTabVisibility();
        await ProjectStore.syncFromCloud();
        renderProjGrid();
      } else {
        // Token expired, try refresh
        const refreshToken = localStorage.getItem('ats_refresh');
        if (refreshToken) {
          const refreshRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
            body: JSON.stringify({ refresh_token: refreshToken })
          });
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            window._atsToken = refreshData.access_token;
            localStorage.setItem('ats_token', refreshData.access_token);
            if (refreshData.refresh_token) localStorage.setItem('ats_refresh', refreshData.refresh_token);
            setAuthUI();
            updateTabVisibility();
            await ProjectStore.syncFromCloud();
            renderProjGrid();
          } else {
            // Refresh failed, clear session
            localStorage.removeItem('ats_token');
            localStorage.removeItem('ats_user');
            localStorage.removeItem('ats_refresh');
            window._atsUser = null;
            window._atsToken = null;
          }
        }
      }
    } catch(e) {
      console.error('Session restore error:', e);
    }
  }

  // If not logged in, clear UI
  if (!window._atsUser) {
    setTimeout(function() {
      proj = null;
      var nd = document.getElementById('proj-name-display');
      if (nd) { nd.textContent = ''; nd.classList.add('placeholder'); }
      var rb = document.querySelector('.resume-panel-body');
      if (rb) rb.innerHTML = '<div class="resume-empty"><div class="resume-empty-icon">📄</div><p>Resume will appear here</p></div>';
      document.querySelectorAll('.left-panel textarea, .left-panel input[type=text], .left-panel input[type=number]').forEach(function(el) { el.value = ''; });
      document.querySelectorAll('[contenteditable]').forEach(function(el) { el.textContent = ''; });
    }, 200);
  }
}

// Run auth on page load
handleAuthCallback();

const TABS = ['projects','jd','content','format','analyzer'];
const AUTH_TABS = ['jd','content','format','analyzer']; // tabs that require login
function updateTabVisibility() {
  AUTH_TABS.forEach(t => {
    var tab = document.getElementById('tab-'+t);
    if (tab) tab.style.display = window._atsUser ? '' : 'none';
  });
}
setTimeout(updateTabVisibility, 250);
function switchTab(name) {
  // Block access to auth-required tabs when not logged in
  if (!window._atsUser && AUTH_TABS.includes(name)) { return; }
  // Before switching away from content, ensure we've saved the display state
  if (name !== 'content' && proj?.drafts?.length) {
    const editor = document.getElementById('resume-editor');
    if (editor && editor.textContent.trim()) {
      // Save the currently displayed text to track it
      currentDisplayedResume = editor.textContent.trim();
      // CRITICAL: Save to localStorage before switching tabs
      console.log('switchTab away from content: saving to localStorage before switch');
      saveProject(true);
    }
  }
  
  TABS.forEach(t => {
    document.getElementById('tab-'+t)?.classList.toggle('active', t===name);
    document.getElementById('view-'+t)?.classList.toggle('active', t===name);
  });
  
  // CRITICAL FIX: Always update preview with latest draft before any tab switch
  // This ensures the preview always shows the most recent version
  console.log('switchTab: updating preview before tab switch, name:', name);
  updateLivePreview();
  
  // Show format live preview in right panel (on all tabs EXCEPT format tab, where we show format settings instead)
  // Keep preview visible on analyzer/optimizer tab so users can see updates after applying fixes
  // Show formatted preview on all tabs
  showFmtPreviewPanel(true);
  if (name === 'format') initFontDropdowns();
  if (name==='projects') renderProjGrid();
  // When switching to content tab, ALWAYS show the latest draft
  if (name === 'content' && proj) {
    // ALWAYS restore from proj.drafts, don't check if it's already displayed
    if (proj.drafts?.length) {
      const latestDraft = proj.drafts[proj.drafts.length - 1];
      console.log('switchTab to content: ALWAYS restoring draft v' + proj.drafts.length + ', length: ' + latestDraft.length);
      showResume(latestDraft, proj.drafts.length);
      currentDisplayedResume = latestDraft; // Force sync
    } else if (proj.ce) {
      // No drafts but have CE data
      const text = buildResumeTextFromCE(proj.ce);
      if (text.trim()) {
        console.log('switchTab to content: restoring from CE');
        showResume(text, 0);
        currentDisplayedResume = text;
      }
    }
  }
  // Do NOT auto-analyze when switching to analyzer tab — only analyze on explicit button click or Apply & Analyze
  // if (name==='analyzer' && proj?.drafts?.length && !document.getElementById('analyzer-content').style.display.includes('block')) {
  //   setTimeout(rescan, 50);
  // }
}

// wsTab replaced by CE accordion

// ── Toast ───────────────────────────────────────────────
function toast(msg, dur) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur||2200);
}

// ── Helpers ─────────────────────────────────────────────
function g(id) { return (document.getElementById(id)||{}).value||''; }
function s(id, val) { const el=document.getElementById(id); if(el) el.value=val||''; }
function esc(str) { return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── API key ─────────────────────────────────────────────
let _apiKey = '';
function onApiKey(v) {
  _apiKey = v.trim();
  document.getElementById('api-saved').style.display = v.startsWith('sk-ant-') ? 'inline' : 'none';
  if (_apiKey) try { localStorage.setItem('ats_key', _apiKey); } catch(e) {}
}
function getKey() {
  const k = _apiKey || g('api-in');
  if (!k) throw new Error('Enter your Anthropic API key at the top of the page.');
  if (!k.startsWith('sk-ant-')) throw new Error('Key should start with sk-ant-');
  return k;
}

// Check if user has provided their own API key (vs using app's key)
function hasOwnApiKey() {
  const inputKey = document.getElementById('api-in')?.value || '';
  const storedKey = localStorage.getItem('ats_key') || '';
  return inputKey.length > 0 || storedKey.length > 0;
}

try { const k=localStorage.getItem('ats_key'); if(k){_apiKey=k;const el=document.getElementById('api-in');if(el)el.value=k;document.getElementById('api-saved').style.display='inline';} } catch(e) {}

// ─────────────────────────────────────────────────────────

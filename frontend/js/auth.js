// ============================================================
// auth.js – Auth state, navbar, dark-mode, helpers
// ============================================================
function getToken()   { return localStorage.getItem('token'); }
function getUser()    { const u=localStorage.getItem('user'); return u?JSON.parse(u):null; }
function isLoggedIn() { return !!getToken(); }
function isAdmin()    { return getUser()?.role==='admin'; }

function saveAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = getBasePath()+'index.html';
}

function getBasePath() {
  return window.location.pathname.includes('/pages/') ? '../' : '';
}

// ── DARK / LIGHT MODE ─────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = theme==='light'
    ? '<i class="fas fa-moon"></i>'
    : '<i class="fas fa-sun"></i>';
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
}

// ── NAVBAR ────────────────────────────────────────────────────
function updateNav() {
  const authLinks  = document.getElementById('authLinks');
  const userLinks  = document.getElementById('userLinks');
  const adminLink  = document.getElementById('adminLink');
  const navUsername= document.getElementById('navUsername');
  const logoutBtn  = document.getElementById('logoutBtn');
  const themeBtn   = document.getElementById('themeToggle');

  if (isLoggedIn()) {
    const user = getUser();
    if (authLinks)   authLinks.style.display  = 'none';
    if (userLinks)   userLinks.style.display  = 'inline-flex';
    if (navUsername) navUsername.textContent  = user?.username||'';
    if (adminLink)   adminLink.style.display  = isAdmin()?'inline-flex':'none';
    loadNotifCount();
  } else {
    if (authLinks) authLinks.style.display = 'inline-flex';
    if (userLinks) userLinks.style.display = 'none';
    if (adminLink) adminLink.style.display = 'none';
  }

  if (logoutBtn) logoutBtn.addEventListener('click', e=>{ e.preventDefault(); logout(); });
  if (themeBtn)  themeBtn.addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme')||'dark';
    applyTheme(cur==='dark'?'light':'dark');
  });
}

async function loadNotifCount() {
  const badge = document.getElementById('notifBadge');
  if (!badge||!isLoggedIn()) return;
  try {
    const data = await NotifAPI.getAll();
    badge.textContent   = data.unread>0 ? data.unread : '';
    badge.style.display = data.unread>0 ? 'flex' : 'none';
  } catch {}
}

function requireAuth() {
  if (!isLoggedIn()) { window.location.href=getBasePath()+'pages/login.html'; return false; }
  return true;
}
function requireAdmin() {
  if (!isLoggedIn()||!isAdmin()) { window.location.href=getBasePath()+'index.html'; return false; }
  return true;
}

function initNavToggle() {
  const toggle   = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (toggle&&navLinks) toggle.addEventListener('click', ()=>navLinks.classList.toggle('open'));
}

// ── SHARED UTILITIES ──────────────────────────────────────────
function showAlert(boxId, message, type='error') {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.textContent = message;
  box.className   = `alert alert-${type}`;
  box.style.display='block';
  setTimeout(()=>{ box.style.display='none'; },5000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dateStr) {
  const diff=Date.now()-new Date(dateStr).getTime();
  const m=Math.floor(diff/60000);
  if (m<1) return 'just now';
  if (m<60) return `${m}m ago`;
  const h=Math.floor(m/60);
  if (h<24) return `${h}h ago`;
  const d=Math.floor(h/24);
  if (d<30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

// Render reaction bar
function renderReactions(reactions={}, postId) {
  const EMOJIS=['❤️','🔥','🤯','👏','😂'];
  const user=getUser();
  return EMOJIS.map(e=>{
    const users=reactions[e]||[];
    const active=user&&users.includes(user.id)?'active':'';
    return `<button class="reaction-btn ${active}" onclick="doReact('${postId}','${e}',this)" title="${e}">
      ${e} <span class="reaction-count">${users.length||''}</span>
    </button>`;
  }).join('');
}

async function doReact(postId, emoji, btn) {
  if (!isLoggedIn()) { window.location.href=getBasePath()+'pages/login.html'; return; }
  try {
    const data = await PostAPI.react(postId, emoji);
    // re-render the whole reactions bar
    const bar = btn.closest('.reactions-bar');
    if (bar) bar.innerHTML = renderReactions(data.reactions, postId);
  } catch {}
}

// ── WEBSOCKET CLIENT ──────────────────────────────────────────
let _ws = null;
function connectWS({ postId, onComment, onReaction, onDeleteComment } = {}) {
  // Skip WebSocket on Vercel (serverless doesn't support persistent WS)
  if (typeof window === 'undefined') return;
  // Only connect if running locally (Vercel doesn't support persistent WS)
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!isLocal) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  _ws = new WebSocket(`${proto}://${location.host}`);
  _ws.onopen = () => {
    if (postId) _ws.send(JSON.stringify({ type:'subscribe_post', postId }));
    const user = getUser();
    if (user) _ws.send(JSON.stringify({ type:'subscribe_user', userId:user.id }));
  };
  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type==='new_comment'    && onComment)       onComment(msg.comment);
      if (msg.type==='reaction'       && onReaction)      onReaction(msg.reactions);
      if (msg.type==='delete_comment' && onDeleteComment) onDeleteComment(msg.commentId);
      if (msg.type==='notification') {
        loadNotifCount(); // refresh badge
      }
    } catch {}
  };
  _ws.onclose = () => setTimeout(()=>connectWS({ postId, onComment, onReaction, onDeleteComment }),3000);
}

document.addEventListener('DOMContentLoaded', ()=>{
  initTheme();
  updateNav();
  initNavToggle();
});

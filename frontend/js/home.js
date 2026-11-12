// ============================================================
// home.js – infinite scroll, categories, trending, featured
// ============================================================
let currentPage=1, currentSearch='', currentTag='', currentCategory='';
let totalPages=1, loading=false;
const POPULAR_TAGS=['javascript','webdev','tutorial','react','nodejs','css','python','career'];

document.addEventListener('DOMContentLoaded',()=>{
  if (isLoggedIn()) {
    const btn=document.getElementById('heroStartWriting');
    if (btn) btn.href='pages/create-post.html';
  }
  loadCategories();
  renderTagFilters();
  loadTrending();
  loadFeatured();
  loadPosts(true);
  bindSearch();
  initInfiniteScroll();
});

async function loadCategories(){
  try {
    const data=await PostAPI.getCategories();
    const c=document.getElementById('categoryFilters');
    if (!c) return;
    c.innerHTML='<button class="cat-chip active" data-cat="">All</button>'+
      data.categories.map(x=>`<button class="cat-chip" data-cat="${x.slug}">${x.name} <span class="cat-count">${x.postCount||0}</span></button>`).join('');
    c.querySelectorAll('.cat-chip').forEach(btn=>{
      btn.addEventListener('click',()=>{
        c.querySelectorAll('.cat-chip').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory=btn.dataset.cat;
        resetAndLoad();
      });
    });
  } catch{}
}

function renderTagFilters(){
  const c=document.getElementById('tagFilters');
  if (!c) return;
  c.innerHTML=POPULAR_TAGS.map(t=>`<button class="tag-chip" data-tag="${t}">#${t}</button>`).join('');
  c.querySelectorAll('.tag-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const tag=btn.dataset.tag;
      if (currentTag===tag){ currentTag=''; btn.classList.remove('active'); }
      else { c.querySelectorAll('.tag-chip').forEach(b=>b.classList.remove('active')); currentTag=tag; btn.classList.add('active'); }
      resetAndLoad();
    });
  });
}

async function loadTrending(){
  try {
    const data=await PostAPI.getTrending(5);
    const list=document.getElementById('trendingList');
    if (!data.posts.length){ list.innerHTML='<p class="no-data">No trending posts yet.</p>'; return; }
    list.innerHTML=data.posts.map((p,i)=>`
      <a href="pages/post.html?id=${p.id}" class="trending-item">
        <span class="trending-num">${i+1}</span>
        <div class="trending-info">
          <span class="trending-title">${escapeHtml(p.title)}</span>
          <span class="trending-meta"><i class="fas fa-eye"></i> ${p.views} · ${escapeHtml(p.author?.username||'')} · ${timeAgo(p.createdAt)} · <i class="fas fa-clock"></i> ${p.readingTime||1}m</span>
        </div>
      </a>`).join('');
  } catch{}
}

async function loadFeatured(){
  try {
    const data=await PostAPI.getFeatured();
    if (!data.posts.length) return;
    document.getElementById('featuredSection').style.display='block';
    document.getElementById('featuredGrid').innerHTML=data.posts.map(renderPostCard).join('');
  } catch{}
}

function bindSearch(){
  const input=document.getElementById('searchInput');
  const btn=document.getElementById('searchBtn');
  const clear=document.getElementById('clearSearch');
  btn.addEventListener('click',doSearch);
  input.addEventListener('keydown',e=>{ if (e.key==='Enter') doSearch(); });
  clear.addEventListener('click',()=>{ input.value=''; currentSearch=''; clear.style.display='none'; resetAndLoad(); });
}

function doSearch(){
  const input=document.getElementById('searchInput');
  const clear=document.getElementById('clearSearch');
  currentSearch=input.value.trim();
  clear.style.display=currentSearch?'inline-block':'none';
  resetAndLoad();
}

function resetAndLoad(){
  currentPage=1; totalPages=1;
  document.getElementById('postsGrid').innerHTML='';
  loadPosts(true);
}

async function loadPosts(reset=false){
  if (loading) return;
  loading=true;
  const grid=document.getElementById('postsGrid');
  const sentinel=document.getElementById('scrollSentinel');
  if (reset) grid.innerHTML='';

  const spinner=document.createElement('div');
  spinner.className='loading-spinner'; spinner.id='loadingSpinner';
  spinner.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Loading...';
  grid.appendChild(spinner);

  try {
    const params={ page:currentPage, limit:9 };
    if (currentSearch)   params.search=currentSearch;
    if (currentTag)      params.tag=currentTag;
    if (currentCategory) params.category=currentCategory;
    const data=await PostAPI.getAll(params);
    totalPages=data.pages||1;

    document.getElementById('postsHeading').textContent=
      currentSearch ? `Search: "${currentSearch}"` :
      currentTag    ? `#${currentTag}` :
      currentCategory ? currentCategory.charAt(0).toUpperCase()+currentCategory.slice(1) : 'Latest Posts';
    document.getElementById('postsCount').textContent=data.total>0?`${data.total} post${data.total!==1?'s':''}`:'' ;

    grid.removeChild(spinner);

    if (!data.posts.length && currentPage===1) {
      grid.innerHTML=`<div class="empty-state"><i class="fas fa-ghost"></i><h3>No posts found</h3>
        <p>${currentSearch||currentTag?'Try different terms.':'Be the first to write!'}</p>
        ${isLoggedIn()?'<a href="pages/create-post.html" class="btn-primary">Write a Post</a>':''}</div>`;
      return;
    }
    data.posts.forEach(p=>{ const el=document.createElement('article'); el.className='post-card'; el.innerHTML=renderPostCardInner(p); el.onclick=()=>window.location=`pages/post.html?id=${p.id}`; grid.appendChild(el); });

    if (currentPage>=totalPages && sentinel) sentinel.style.display='none';
    else if (sentinel) sentinel.style.display='block';
  } catch(err){
    if (grid.contains(spinner)) grid.removeChild(spinner);
    grid.insertAdjacentHTML('beforeend',`<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>${err.message}</p></div>`);
  } finally { loading=false; }
}

function initInfiniteScroll(){
  const sentinel=document.getElementById('scrollSentinel');
  if (!sentinel) return;
  const obs=new IntersectionObserver(entries=>{
    if (entries[0].isIntersecting && !loading && currentPage<totalPages){
      currentPage++; loadPosts(false);
    }
  },{ rootMargin:'200px' });
  obs.observe(sentinel);
}

function renderPostCard(post){ return `<article class="post-card" onclick="window.location='pages/post.html?id=${post.id}'">${renderPostCardInner(post)}</article>`; }

function renderPostCardInner(post){
  const author=post.author||{};
  const initials=(author.username||'U').charAt(0).toUpperCase();
  const excerpt=post.excerpt||(post.content||'').replace(/<[^>]+>/g,'').substring(0,150)+'…';
  const tags=(post.tags||[]).slice(0,3).map(t=>`<span class="tag-chip-sm">#${t}</span>`).join('');
  const cover=post.coverImage?`<div class="card-cover"><img src="${post.coverImage}" alt="${escapeHtml(post.title)}" loading="lazy"/></div>`:'';
  const featured=post.featured?'<span class="featured-badge"><i class="fas fa-star"></i></span>':'';
  const catBadge=post.category?`<span class="cat-badge">${escapeHtml(post.category.name)}</span>`:'';
  const totalReactions=Object.values(post.reactions||{}).reduce((s,arr)=>s+(arr||[]).length,0);
  return `
    ${cover}
    <div class="card-body">
      <div class="card-tags">${catBadge}${tags}${featured}</div>
      <h3 class="card-title">${escapeHtml(post.title)}</h3>
      <p class="card-excerpt">${escapeHtml(excerpt)}</p>
      <div class="card-footer">
        <div class="card-author">
          <div class="avatar-sm">${initials}</div>
          <span>${escapeHtml(author.username||'')}</span>
          <span class="dot">·</span><span>${timeAgo(post.createdAt)}</span>
          <span class="dot">·</span><span><i class="fas fa-clock"></i> ${post.readingTime||1}m</span>
        </div>
        <div class="card-meta">
          <span><i class="fas fa-eye"></i> ${post.views||0}</span>
          ${totalReactions?`<span>😊 ${totalReactions}</span>`:''}
          <span><i class="fas fa-comment"></i> ${post.commentCount||0}</span>
          ${isLoggedIn()?`<button class="bookmark-btn-sm${post.bookmarked?' bookmarked':''}" onclick="event.stopPropagation();toggleBookmark(event,'${post.id}',this)" aria-label="${post.bookmarked?'Remove bookmark':'Bookmark post'}"><i class="fa${post.bookmarked?'s':'r'} fa-bookmark"></i></button>`:''}
        </div>
      </div>
    </div>`;
}

async function toggleBookmark(e,postId,btn){
  e.preventDefault();
  if (!isLoggedIn()){ window.location.href='pages/login.html'; return; }
  try {
    const data=await BookmarkAPI.toggle(postId);
    btn.classList.toggle('bookmarked',data.bookmarked);
    btn.innerHTML=`<i class="fa${data.bookmarked?'s':'r'} fa-bookmark"></i>`;
  } catch{}
}

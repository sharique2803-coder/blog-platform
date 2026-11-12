// ============================================================
// post.js – single post, TOC, progress bar, reactions, WS
// ============================================================
const postId = new URLSearchParams(window.location.search).get('id');

document.addEventListener('DOMContentLoaded', async ()=>{
  if (!postId){ showError(); return; }
  await loadPost();
  await loadComments();
  bindCommentForm();
  bindDeleteModal();
  initReadingProgress();
  // Connect WebSocket for live comments + reactions
  connectWS({ postId,
    onComment:       (c)=>liveAddComment(c),
    onReaction:      (r)=>liveUpdateReactions(r),
    onDeleteComment: (id)=>liveRemoveComment(id),
  });
});

// ── PROGRESS BAR ──────────────────────────────────────────────
function initReadingProgress(){
  const bar=document.getElementById('readProgressBar');
  if (!bar) return;
  window.addEventListener('scroll',()=>{
    const doc=document.documentElement;
    const pct=doc.scrollTop/(doc.scrollHeight-doc.clientHeight)*100;
    bar.style.width=Math.min(100,pct)+'%';
  },{ passive:true });
}

// ── TABLE OF CONTENTS ─────────────────────────────────────────
function buildTOC(content){
  const tmp=document.createElement('div');
  tmp.innerHTML=content;
  const headings=[...tmp.querySelectorAll('h1,h2,h3')];
  if (headings.length<2) return;

  const toc=document.getElementById('tocContainer');
  if (!toc) return;
  headings.forEach((h,i)=>{ h.id=`heading-${i}`; });
  // Update live DOM headings too
  document.querySelectorAll('#postBody h1,#postBody h2,#postBody h3').forEach((h,i)=>{ h.id=`heading-${i}`; });
  toc.innerHTML=`<div class="toc-box" role="navigation" aria-label="Table of contents">
    <p class="toc-title"><i class="fas fa-list"></i> Contents</p>
    <ol class="toc-list">
      ${headings.map((h,i)=>`<li class="toc-${h.tagName.toLowerCase()}"><a href="#heading-${i}">${escapeHtml(h.textContent)}</a></li>`).join('')}
    </ol>
  </div>`;
  toc.style.display='block';
}

// ── LOAD POST ─────────────────────────────────────────────────
async function loadPost(){
  try {
    const data=await PostAPI.getById(postId);
    renderPost(data.post);
    loadRelated();
  } catch { showError(); }
}

function renderPost(post){
  document.title=`BlogSpace – ${post.title}`;
  const user=getUser();

  document.getElementById('postLoading').style.display='none';
  document.getElementById('postContent').style.display='block';
  document.getElementById('commentsSection').style.display='block';

  document.getElementById('postTitle').textContent=post.title;
  document.getElementById('postBody').innerHTML=post.content;
  document.getElementById('viewCount').textContent=post.views;
  document.getElementById('readingTime').textContent=post.readingTime||1;
  document.getElementById('likeBtnCount').textContent=(post.likes||[]).length;

  buildTOC(post.content);

  // Author bar
  const author=post.author||{};
  const initials=(author.username||'U').charAt(0).toUpperCase();
  document.getElementById('authorAvatar').textContent=initials;
  document.getElementById('authorName').textContent=author.username||'Unknown';
  document.getElementById('postDate').textContent=timeAgo(post.createdAt);
  document.getElementById('authorLink').href=`author.html?id=${author.id}`;

  // Badges
  if (author.badges?.length){
    document.getElementById('authorBadges').innerHTML=
      author.badges.map(b=>`<span class="user-badge" title="${b.label}">🏅 ${b.label}</span>`).join('');
  }

  // Follow button
  if (user && author.id && author.id!==user.id){
    const followBtn=document.getElementById('followAuthorBtn');
    followBtn.style.display='inline-flex';
    loadFollowStatus(author.id,followBtn);
    followBtn.addEventListener('click',()=>toggleFollow(author.id,followBtn));
  }

  // Tags & category
  const tags=(post.tags||[]).map(t=>`<span class="tag-chip-sm">#${t}</span>`).join('');
  const cat=post.category?`<span class="cat-badge">${escapeHtml(post.category.name)}</span>`:'';
  document.getElementById('postTags').innerHTML=cat+tags;

  if (post.coverImage){
    document.getElementById('coverImg').src=post.coverImage;
    document.getElementById('postCover').style.display='block';
  }

  // Reactions bar
  document.getElementById('reactionsBar').innerHTML=renderReactions(post.reactions||{}, postId);

  // Like button
  const likeBtn=document.getElementById('likeBtn');
  if (user&&(post.likes||[]).includes(user.id)) likeBtn.classList.add('liked');
  likeBtn.addEventListener('click', async ()=>{
    if (!isLoggedIn()){ window.location.href='login.html'; return; }
    try {
      const data=await PostAPI.like(postId);
      document.getElementById('likeBtnCount').textContent=data.likesCount;
      likeBtn.classList.toggle('liked',data.liked);
    } catch{}
  });

  // Bookmark
  const bookmarkBtn=document.getElementById('bookmarkBtn');
  const bookmarkLabel=document.getElementById('bookmarkLabel');
  if (post.bookmarked){ bookmarkBtn.classList.add('bookmarked'); bookmarkLabel.textContent='Saved'; bookmarkBtn.querySelector('i').className='fas fa-bookmark'; }
  bookmarkBtn.addEventListener('click', async ()=>{
    if (!isLoggedIn()){ window.location.href='login.html'; return; }
    try {
      const data=await BookmarkAPI.toggle(postId);
      bookmarkBtn.classList.toggle('bookmarked',data.bookmarked);
      bookmarkLabel.textContent=data.bookmarked?'Saved':'Save';
      bookmarkBtn.querySelector('i').className=data.bookmarked?'fas fa-bookmark':'far fa-bookmark';
    } catch{}
  });

  // Reading List
  const rlBtn=document.getElementById('readingListBtn');
  if (rlBtn){
    if (post.inReadingList){ rlBtn.classList.add('active'); rlBtn.innerHTML='<i class="fas fa-book-open"></i> In List'; }
    rlBtn.addEventListener('click', async ()=>{
      if (!isLoggedIn()){ window.location.href='login.html'; return; }
      try {
        const data=await ReadingListAPI.toggle(postId);
        rlBtn.classList.toggle('active',data.inList);
        rlBtn.innerHTML=data.inList?'<i class="fas fa-book-open"></i> In List':'<i class="fas fa-book"></i> Read Later';
      } catch{}
    });
  }

  // Share
  const url=encodeURIComponent(window.location.href);
  const title=encodeURIComponent(post.title);
  document.getElementById('shareTwitter')?.addEventListener('click',()=>window.open(`https://twitter.com/intent/tweet?text=${title}&url=${url}`,'_blank'));
  document.getElementById('shareLinkedIn')?.addEventListener('click',()=>window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`,'_blank'));
  document.getElementById('shareCopy')?.addEventListener('click',()=>{
    navigator.clipboard.writeText(window.location.href).then(()=>{
      const btn=document.getElementById('shareCopy');
      btn.innerHTML='<i class="fas fa-check"></i>';
      setTimeout(()=>btn.innerHTML='<i class="fas fa-link"></i>',2000);
    });
  });

  // Author controls
  if (user&&post.author&&post.author.id===user.id){
    document.getElementById('postActionsTop').style.display='flex';
    document.getElementById('editPostBtn').href=`create-post.html?id=${post.id}`;
    document.getElementById('revisionsBtn').style.display='inline-flex';
    document.getElementById('deletePostBtn').addEventListener('click',()=>{ document.getElementById('deleteModal').style.display='flex'; });
    document.getElementById('revisionsBtn').addEventListener('click',()=>loadRevisions(post.id));
  }
}

function liveUpdateReactions(reactions){
  document.getElementById('reactionsBar').innerHTML=renderReactions(reactions, postId);
}

function showError(){
  document.getElementById('postLoading').style.display='none';
  document.getElementById('postError').style.display='block';
}

// ── FOLLOW ────────────────────────────────────────────────────
async function loadFollowStatus(authorId,btn){ try{ const d=await FollowAPI.status(authorId); renderFollowBtn(btn,d.following); }catch{} }
async function toggleFollow(authorId,btn){ try{ const d=await FollowAPI.toggle(authorId); renderFollowBtn(btn,d.following); }catch{} }
function renderFollowBtn(btn,following){ btn.innerHTML=following?'<i class="fas fa-user-check"></i> Following':'<i class="fas fa-user-plus"></i> Follow'; btn.className=following?'btn-outline-sm following':'btn-outline-sm'; }

// ── RELATED ───────────────────────────────────────────────────
async function loadRelated(){
  try {
    const data=await PostAPI.getRelated(postId);
    if (!data.posts.length) return;
    document.getElementById('relatedSection').style.display='block';
    document.getElementById('relatedGrid').innerHTML=data.posts.map(p=>{
      const initials=(p.author?.username||'U').charAt(0).toUpperCase();
      return `<a href="post.html?id=${p.id}" class="related-card">
        ${p.coverImage?`<img src="${p.coverImage}" alt="" class="related-cover" loading="lazy"/>`:''}
        <div class="related-body"><h4>${escapeHtml(p.title)}</h4>
          <span class="related-meta"><div class="avatar-sm">${initials}</div>${escapeHtml(p.author?.username||'')} · ${timeAgo(p.createdAt)} · <i class="fas fa-clock"></i> ${p.readingTime||1}m</span>
        </div></a>`;
    }).join('');
  } catch{}
}

// ── REVISIONS ─────────────────────────────────────────────────
async function loadRevisions(pid){
  try {
    const data=await PostAPI.getRevisions(pid);
    const modal=document.getElementById('revisionsModal');
    const list=document.getElementById('revisionsList');
    if (!data.revisions.length){ list.innerHTML='<p class="text-muted">No revisions saved yet.</p>'; }
    else {
      list.innerHTML=data.revisions.map(r=>`
        <div class="revision-item">
          <div><strong>${escapeHtml(r.title)}</strong><span class="text-muted" style="font-size:.8rem;margin-left:.5rem;">${timeAgo(r.created_at)}</span></div>
          <button class="btn-outline-sm" onclick="restoreRevision('${pid}','${r.id}')"><i class="fas fa-undo"></i> Restore</button>
        </div>`).join('');
    }
    modal.style.display='flex';
  } catch(err){ alert(err.message); }
}

async function restoreRevision(pid, revId){
  if (!confirm('Restore this revision? Current content will be saved as a new revision.')) return;
  try {
    const data=await PostAPI.restoreRev(pid, revId);
    document.getElementById('postBody').innerHTML=data.post.content;
    document.getElementById('postTitle').textContent=data.post.title;
    document.getElementById('revisionsModal').style.display='none';
    alert('Revision restored!');
  } catch(err){ alert(err.message); }
}

// ── DELETE MODAL ──────────────────────────────────────────────
function bindDeleteModal(){
  document.getElementById('cancelDelete')?.addEventListener('click',()=>document.getElementById('deleteModal').style.display='none');
  document.getElementById('confirmDelete')?.addEventListener('click', async ()=>{
    try{ await PostAPI.delete(postId); window.location.href='../index.html'; }
    catch(err){ alert(err.message); }
  });
  document.getElementById('closeRevisions')?.addEventListener('click',()=>document.getElementById('revisionsModal').style.display='none');
}

// ── COMMENTS ─────────────────────────────────────────────────
let commentSort='new';

async function loadComments(){
  const list=document.getElementById('commentsList');
  try {
    const data=await CommentAPI.getByPost(postId, commentSort);
    document.getElementById('commentCountBadge').textContent=data.count;
    list.innerHTML=data.comments.length
      ? data.comments.map(renderComment).join('')
      : '<p class="no-comments">No comments yet. Be the first!</p>';
    bindCommentActions();
  } catch{ list.innerHTML='<p class="error-text">Failed to load comments.</p>'; }
  if (isLoggedIn()) document.getElementById('commentForm').style.display='block';
  else              document.getElementById('loginPrompt').style.display='block';
}

function renderComment(c, isReply=false){
  const user=getUser();
  const author=c.author||{};
  const initials=(author.username||'U').charAt(0).toUpperCase();
  const isOwner=user&&c.author&&c.author.id===user.id;
  const score=c.score||0;
  const replies=(c.replies||[]).map(r=>renderComment(r,true)).join('');
  const mention=content=>content.replace(/@([a-zA-Z0-9_]+)/g,'<span class="mention">@$1</span>');

  return `<div class="comment-item${isReply?' reply-item':''}" id="comment-${c.id}" role="article">
    <div class="comment-avatar" aria-hidden="true">${initials}</div>
    <div class="comment-main">
      <div class="comment-header">
        <a href="author.html?id=${author.id}" class="comment-author-link"><strong>${escapeHtml(author.username||'')}</strong></a>
        <span class="comment-date">${timeAgo(c.createdAt)}</span>
        <div class="comment-actions">
          <button class="vote-btn upvote${(c.upvotes||[]).includes(user?.id)?'  voted':''}" data-id="${c.id}" title="Upvote" aria-label="Upvote comment"><i class="fas fa-arrow-up"></i> <span>${(c.upvotes||[]).length}</span></button>
          <button class="vote-btn downvote${(c.downvotes||[]).includes(user?.id)?' voted':''}" data-id="${c.id}" title="Downvote" aria-label="Downvote comment"><i class="fas fa-arrow-down"></i> <span>${(c.downvotes||[]).length}</span></button>
          ${isLoggedIn()?`<button class="btn-icon reply-toggle" data-id="${c.id}" aria-label="Reply"><i class="fas fa-reply"></i></button>`:''}
          ${isOwner?`<button class="btn-icon edit-comment" data-id="${c.id}" aria-label="Edit comment"><i class="fas fa-edit"></i></button>
                     <button class="btn-icon delete-comment" data-id="${c.id}" aria-label="Delete comment"><i class="fas fa-trash"></i></button>`:''}
        </div>
      </div>
      <p class="comment-content" id="content-${c.id}">${mention(escapeHtml(c.content))}</p>
      <div class="comment-edit-form" id="editForm-${c.id}" style="display:none;">
        <textarea class="edit-textarea" id="editText-${c.id}">${escapeHtml(c.content)}</textarea>
        <div class="edit-actions">
          <button class="btn-primary-sm save-edit" data-id="${c.id}">Save</button>
          <button class="btn-ghost cancel-edit" data-id="${c.id}">Cancel</button>
        </div>
      </div>
      <div class="reply-form-wrap" id="replyForm-${c.id}" style="display:none;">
        <textarea class="reply-textarea" id="replyText-${c.id}" placeholder="@${escapeHtml(author.username||'')} " rows="2" aria-label="Write reply"></textarea>
        <div class="edit-actions">
          <button class="btn-primary-sm submit-reply" data-id="${c.id}">Reply</button>
          <button class="btn-ghost cancel-reply" data-id="${c.id}">Cancel</button>
        </div>
      </div>
      ${replies?`<div class="replies-list">${replies}</div>`:''}
    </div>
  </div>`;
}

function bindCommentActions(){
  document.querySelectorAll('.delete-comment').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if (!confirm('Delete this comment?')) return;
      try{ await CommentAPI.delete(btn.dataset.id); document.getElementById(`comment-${btn.dataset.id}`)?.remove(); updateCommentCount(-1); }
      catch(err){ alert(err.message); }
    });
  });
  document.querySelectorAll('.edit-comment').forEach(btn=>{
    btn.addEventListener('click',()=>{ document.getElementById(`editForm-${btn.dataset.id}`).style.display='block'; document.getElementById(`content-${btn.dataset.id}`).style.display='none'; });
  });
  document.querySelectorAll('.cancel-edit').forEach(btn=>{
    btn.addEventListener('click',()=>{ document.getElementById(`editForm-${btn.dataset.id}`).style.display='none'; document.getElementById(`content-${btn.dataset.id}`).style.display='block'; });
  });
  document.querySelectorAll('.save-edit').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const content=document.getElementById(`editText-${btn.dataset.id}`).value.trim();
      if (!content) return;
      try{
        const data=await CommentAPI.update(btn.dataset.id,{ content });
        document.getElementById(`content-${btn.dataset.id}`).textContent=data.comment.content;
        document.getElementById(`editForm-${btn.dataset.id}`).style.display='none';
        document.getElementById(`content-${btn.dataset.id}`).style.display='block';
      } catch(err){ alert(err.message); }
    });
  });
  document.querySelectorAll('.reply-toggle').forEach(btn=>{
    btn.addEventListener('click',()=>{ const f=document.getElementById(`replyForm-${btn.dataset.id}`); f.style.display=f.style.display==='none'?'block':'none'; });
  });
  document.querySelectorAll('.cancel-reply').forEach(btn=>{
    btn.addEventListener('click',()=>{ document.getElementById(`replyForm-${btn.dataset.id}`).style.display='none'; });
  });
  document.querySelectorAll('.submit-reply').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const content=document.getElementById(`replyText-${btn.dataset.id}`).value.trim();
      if (!content) return;
      try{
        const data=await CommentAPI.add(postId,{ content, parentId:btn.dataset.id });
        const div=document.querySelector(`#comment-${btn.dataset.id} .replies-list`);
        const html=renderComment(data.comment,true);
        if (div) div.insertAdjacentHTML('beforeend',html);
        else document.querySelector(`#comment-${btn.dataset.id} .comment-main`).insertAdjacentHTML('beforeend',`<div class="replies-list">${html}</div>`);
        document.getElementById(`replyText-${btn.dataset.id}`).value='';
        document.getElementById(`replyForm-${btn.dataset.id}`).style.display='none';
        bindCommentActions(); updateCommentCount(1);
      } catch(err){ alert(err.message); }
    });
  });
  // Voting
  document.querySelectorAll('.vote-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if (!isLoggedIn()){ window.location.href='login.html'; return; }
      const dir=btn.classList.contains('upvote')?'up':'down';
      try{
        const data=await CommentAPI.vote(btn.dataset.id,dir);
        const item=document.getElementById(`comment-${btn.dataset.id}`);
        item.querySelectorAll('.upvote span')[0].textContent=data.upvotes;
        item.querySelectorAll('.downvote span')[0].textContent=data.downvotes;
      } catch(err){ alert(err.message); }
    });
  });
}

function bindCommentForm(){
  const form=document.getElementById('commentForm');
  const input=document.getElementById('commentInput');
  const counter=document.getElementById('charCount');
  const sortBtns=document.querySelectorAll('.sort-btn');

  input?.addEventListener('input',()=>counter.textContent=`${input.value.length} / 1000`);

  sortBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      sortBtns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      commentSort=btn.dataset.sort;
      loadComments();
    });
  });

  form?.addEventListener('submit', async e=>{
    e.preventDefault();
    const content=input.value.trim();
    if (!content) return;
    const btn=form.querySelector('button[type=submit]');
    btn.disabled=true; btn.textContent='Posting...';
    try{
      const data=await CommentAPI.add(postId,{ content });
      // live add handled by WS; but also add locally as fallback
      liveAddComment(data.comment, true);
      input.value=''; counter.textContent='0 / 1000';
    } catch(err){ alert(err.message); }
    finally{ btn.disabled=false; btn.textContent='Post Comment'; }
  });
}

function liveAddComment(comment, fromSelf=false){
  const list=document.getElementById('commentsList');
  const noC=list.querySelector('.no-comments');
  if (noC) noC.remove();
  // Avoid duplicate if WS echoes back the user's own comment
  if (document.getElementById(`comment-${comment.id}`)) return;
  list.insertAdjacentHTML('afterbegin',renderComment(comment));
  bindCommentActions();
  updateCommentCount(1);
}

function liveRemoveComment(commentId){
  document.getElementById(`comment-${commentId}`)?.remove();
  updateCommentCount(-1);
}

function updateCommentCount(delta){
  const badge=document.getElementById('commentCountBadge');
  if (badge) badge.textContent=Math.max(0,parseInt(badge.textContent||'0')+delta);
}

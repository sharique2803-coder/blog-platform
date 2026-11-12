// ============================================================
// create-post.js – Quill editor, auto-save, image upload, scheduling
// ============================================================
const editId = new URLSearchParams(window.location.search).get('id');
const DRAFT_KEY = editId ? `draft_edit_${editId}` : 'draft_new';
let quill = null;
let autoSaveTimer = null;

document.addEventListener('DOMContentLoaded', async ()=>{
  if (!requireAuth()) return;
  await loadCategories();
  initQuill();
  if (editId){
    document.getElementById('editorTitle').innerHTML='<i class="fas fa-edit"></i> Edit Post';
    document.getElementById('submitLabel').textContent='Update Post';
    await loadExistingPost();
  } else {
    loadDraft();
  }
  bindFormEvents();
  startAutoSave();
});

// ── QUILL RICH TEXT EDITOR ────────────────────────────────────
function initQuill(){
  quill = new Quill('#quillEditor', {
    theme: 'snow',
    placeholder: 'Write your post here...',
    modules: {
      toolbar: {
        container: [
          [{ header:[1,2,3,false] }],
          ['bold','italic','underline','strike'],
          ['blockquote','code-block'],
          [{ list:'ordered'},{ list:'bullet'}],
          ['link','image'],
          [{ color:[] },{ background:[] }],
          ['clean'],
        ],
        handlers: { image: imageUploadHandler },
      },
    },
  });
  // Update char count on change
  quill.on('text-change',()=>{
    const len=quill.getText().trim().length;
    document.getElementById('contentCount').textContent=`${len} characters`;
  });
}

async function imageUploadHandler(){
  const input=document.createElement('input');
  input.type='file'; input.accept='image/*';
  input.onchange=async ()=>{
    const file=input.files[0]; if (!file) return;
    const fd=new FormData(); fd.append('image',file);
    try {
      const data=await PostAPI.uploadImage(fd);
      const range=quill.getSelection(true);
      quill.insertEmbed(range.index,'image',`http://localhost:5000${data.url}`);
    } catch(err){ alert('Image upload failed: '+err.message); }
  };
  input.click();
}

// ── CATEGORIES ────────────────────────────────────────────────
async function loadCategories(){
  try {
    const data=await PostAPI.getCategories();
    const sel=document.getElementById('category');
    if (!sel) return;
    data.categories.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
  } catch{}
}

// ── EXISTING POST (EDIT MODE) ─────────────────────────────────
async function loadExistingPost(){
  try {
    const data=await PostAPI.getById(editId);
    const post=data.post;
    const user=getUser();
    if (!user||post.author._id!==user.id){ alert('Not authorized to edit this post.'); window.location.href='../index.html'; return; }
    document.getElementById('title').value=post.title;
    quill.clipboard.dangerouslyPasteHTML(post.content);
    document.getElementById('excerpt').value=post.excerpt||'';
    document.getElementById('coverImage').value=post.coverImage||'';
    document.getElementById('tags').value=(post.tags||[]).join(', ');
    document.getElementById('published').checked=post.published;
    if (post.publishAt) document.getElementById('publishAt').value=post.publishAt.slice(0,16);
    if (post.category){ const sel=document.getElementById('category'); if (sel) sel.value=post.category.id; }
    updateTagPreview((post.tags||[]).join(', '));
    updateCoverPreview(post.coverImage);
    document.getElementById('contentCount').textContent=`${quill.getText().trim().length} characters`;
  } catch(err){ showAlert('alertBox',err.message); }
}

// ── DRAFT AUTO-SAVE ───────────────────────────────────────────
function startAutoSave(){
  autoSaveTimer=setInterval(saveDraft, 30000);
  document.getElementById('saveDraftBtn')?.addEventListener('click', saveDraft);
}

function saveDraft(){
  const draft={
    title:     document.getElementById('title').value,
    content:   quill ? quill.root.innerHTML : '',
    excerpt:   document.getElementById('excerpt').value,
    coverImage:document.getElementById('coverImage').value,
    tags:      document.getElementById('tags').value,
    savedAt:   new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  const status=document.getElementById('autoSaveStatus');
  if (status){ status.textContent='Draft saved '+new Date().toLocaleTimeString(); status.className='autosave-status saved'; setTimeout(()=>{ status.className='autosave-status'; },3000); }
}

function loadDraft(){
  const raw=localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  const draft=JSON.parse(raw);
  // Only offer to restore if less than 24h old
  const age=(Date.now()-new Date(draft.savedAt).getTime())/3600000;
  if (age>24){ localStorage.removeItem(DRAFT_KEY); return; }
  if (!confirm(`Restore draft saved at ${new Date(draft.savedAt).toLocaleTimeString()}?`)) return;
  document.getElementById('title').value=draft.title||'';
  if (quill) quill.clipboard.dangerouslyPasteHTML(draft.content||'');
  document.getElementById('excerpt').value=draft.excerpt||'';
  document.getElementById('coverImage').value=draft.coverImage||'';
  document.getElementById('tags').value=draft.tags||'';
  updateTagPreview(draft.tags||'');
  updateCoverPreview(draft.coverImage||'');
}

// ── FORM EVENTS ───────────────────────────────────────────────
function bindFormEvents(){
  const title=document.getElementById('title');
  const excerpt=document.getElementById('excerpt');
  const coverInput=document.getElementById('coverImage');
  const tagsInput=document.getElementById('tags');
  const form=document.getElementById('postForm');
  const published=document.getElementById('published');
  const publishAt=document.getElementById('publishAt');

  title.addEventListener('input',()=>{ document.getElementById('titleCount').textContent=`${title.value.length} / 150`; });
  excerpt.addEventListener('input',()=>{ document.getElementById('excerptCount').textContent=`${excerpt.value.length} / 300`; });
  tagsInput.addEventListener('input',()=>updateTagPreview(tagsInput.value));
  coverInput.addEventListener('input',()=>updateCoverPreview(coverInput.value.trim()));
  document.getElementById('removeCover')?.addEventListener('click',()=>{ coverInput.value=''; updateCoverPreview(''); });
  published.addEventListener('change',()=>{
    document.getElementById('submitLabel').textContent=
      editId ? 'Update Post' : (published.checked ? 'Publish Post' : 'Save Draft');
  });
  publishAt.addEventListener('change',()=>{
    if (publishAt.value) published.checked=false;
    document.getElementById('scheduleStatus').textContent=
      publishAt.value ? `⏰ Scheduled for ${new Date(publishAt.value).toLocaleString()}` : '';
  });

  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const titleVal=title.value.trim();
    const contentVal=quill ? quill.root.innerHTML : '';
    if (!titleVal) { showAlert('alertBox','Title is required'); return; }
    if (!contentVal||quill.getText().trim().length<10) { showAlert('alertBox','Content is too short'); return; }
    const tags=tagsInput.value.split(',').map(t=>t.trim()).filter(Boolean);
    const body={ title:titleVal, content:contentVal, excerpt:excerpt.value.trim(),
      coverImage:coverInput.value.trim(), tags, categoryId:document.getElementById('category')?.value||null,
      published:published.checked, publishAt:publishAt.value||null };
    const btn=document.getElementById('submitBtn');
    btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Saving...';
    try {
      let data;
      if (editId) data=await PostAPI.update(editId,body);
      else        data=await PostAPI.create(body);
      localStorage.removeItem(DRAFT_KEY);
      window.location.href=`post.html?id=${data.post._id||data.post.id}`;
    } catch(err){
      showAlert('alertBox',err.message);
      btn.disabled=false;
      btn.innerHTML=`<i class="fas fa-paper-plane"></i> <span id="submitLabel">${editId?'Update Post':'Publish Post'}</span>`;
    }
  });
}

function updateTagPreview(val){
  const tags=val.split(',').map(t=>t.trim()).filter(Boolean);
  document.getElementById('tagPreview').innerHTML=tags.map(t=>`<span class="tag-chip-sm">#${t}</span>`).join('');
}
function updateCoverPreview(url){
  const preview=document.getElementById('coverPreview');
  const img=document.getElementById('coverPreviewImg');
  if (url){ img.src=url; preview.style.display='block'; } else { preview.style.display='none'; }
}

// ============================================================
// dashboard.js – User dashboard & profile
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  await loadProfile();
  await loadMyPosts();
  bindProfileEdit();
});

async function loadProfile() {
  try {
    const data = await AuthAPI.getMe();
    const user = data.user;

    // Update stored user
    localStorage.setItem('user', JSON.stringify({ id: user.id, username: user.username, email: user.email }));

    const initials = user.username.charAt(0).toUpperCase();
    document.getElementById('profileAvatar').textContent  = initials;
    document.getElementById('profileUsername').textContent = user.username;
    document.getElementById('profileEmail').textContent    = user.email;
    document.getElementById('profileBio').textContent      = user.bio || 'No bio yet.';

    // Pre-fill edit form
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editBio').value      = user.bio || '';
  } catch (err) {
    console.error(err);
  }
}

async function loadMyPosts() {
  const list = document.getElementById('myPostsList');
  try {
    const data = await PostAPI.getMy();
    const posts = data.posts;

    // Stats
    const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
    const totalLikes = posts.reduce((sum, p) => sum + (p.likes || []).length, 0);
    document.getElementById('statPosts').textContent = posts.length;
    document.getElementById('statViews').textContent = totalViews;
    document.getElementById('statLikes').textContent = totalLikes;

    if (posts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-feather-alt"></i>
          <h3>No posts yet</h3>
          <p>Share your first idea with the world!</p>
          <a href="create-post.html" class="btn-primary">Write a Post</a>
        </div>`;
      return;
    }

    list.innerHTML = posts.map(renderMyPostRow).join('');
    bindMyPostActions();
  } catch (err) {
    list.innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

function renderMyPostRow(post) {
  const date     = new Date(post.createdAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  const status   = post.published
    ? '<span class="badge badge-green">Published</span>'
    : '<span class="badge badge-grey">Draft</span>';

  return `
  <div class="my-post-row">
    <div class="my-post-info">
      <a href="post.html?id=${post._id}" class="my-post-title">${escapeHtml(post.title)}</a>
      <div class="my-post-meta">
        ${status}
        <span><i class="fas fa-calendar-alt"></i> ${date}</span>
        <span><i class="fas fa-eye"></i> ${post.views || 0}</span>
        <span><i class="fas fa-heart"></i> ${(post.likes || []).length}</span>
        <span><i class="fas fa-comment"></i> ${post.commentCount || 0}</span>
      </div>
    </div>
    <div class="my-post-actions">
      <a href="create-post.html?id=${post._id}" class="btn-outline-sm" title="Edit"><i class="fas fa-edit"></i></a>
      <button class="btn-danger-sm delete-my-post" data-id="${post._id}" title="Delete"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

let pendingDeleteId = null;

function bindMyPostActions() {
  document.querySelectorAll('.delete-my-post').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingDeleteId = btn.dataset.id;
      document.getElementById('deleteModal').style.display = 'flex';
    });
  });
}

function bindProfileEdit() {
  const modal      = document.getElementById('editProfileModal');
  const editBtn    = document.getElementById('editProfileBtn');
  const cancelBtn  = document.getElementById('cancelEdit');
  const confirmDel = document.getElementById('confirmDelete');
  const cancelDel  = document.getElementById('cancelDelete');
  const form       = document.getElementById('editProfileForm');

  editBtn.addEventListener('click',   () => { modal.style.display = 'flex'; });
  cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click',     (e) => { if (e.target === modal) modal.style.display = 'none'; });

  cancelDel?.addEventListener('click', () => {
    document.getElementById('deleteModal').style.display = 'none';
    pendingDeleteId = null;
  });

  confirmDel?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      await PostAPI.delete(pendingDeleteId);
      document.getElementById('deleteModal').style.display = 'none';
      await loadMyPosts();
    } catch (err) { alert(err.message); }
    pendingDeleteId = null;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('editUsername').value.trim();
    const bio      = document.getElementById('editBio').value.trim();

    try {
      const data = await AuthAPI.updateProfile({ username, bio });
      saveAuth(getToken(), { id: data.user.id, username: data.user.username, email: data.user.email });
      await loadProfile();
      updateNav();
      modal.style.display = 'none';
      showProfileAlert('Profile updated!', 'success');
    } catch (err) {
      showProfileAlert(err.message, 'error');
    }
  });
}

function showProfileAlert(message, type) {
  const box = document.getElementById('profileAlertBox');
  if (!box) return;
  box.textContent = message;
  box.className = `alert alert-${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

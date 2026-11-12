// ============================================================
// api.js – Centralised API helper
// ============================================================
// Relative URL — works on both localhost and Vercel
const API_BASE = '/api';

async function apiFetch(endpoint, options = {}) {
  const token   = localStorage.getItem('token');
  const headers = { ...(options.headers || {}) };
  // Don't force JSON content-type for FormData (file uploads)
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data     = await response.json();
  if (!response.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}

const AuthAPI = {
  register:      (b) => apiFetch('/auth/register', { method:'POST', body:JSON.stringify(b) }),
  login:         (b) => apiFetch('/auth/login',    { method:'POST', body:JSON.stringify(b) }),
  getMe:         ()  => apiFetch('/auth/me'),
  updateProfile: (b) => apiFetch('/auth/profile',  { method:'PUT',  body:JSON.stringify(b) }),
};

const PostAPI = {
  getAll:       (p={}) => apiFetch(`/posts?${new URLSearchParams(p)}`),
  getById:      (id)   => apiFetch(`/posts/${id}`),
  getMy:        ()     => apiFetch('/posts/user/my'),
  getTrending:  (l=6)  => apiFetch(`/posts/trending?limit=${l}`),
  getFeatured:  ()     => apiFetch('/posts/featured'),
  getRelated:   (id)   => apiFetch(`/posts/${id}/related`),
  getCategories:()     => apiFetch('/posts/categories'),
  getExplore:   ()     => apiFetch('/posts/explore'),
  getAnalytics: (d=30) => apiFetch(`/posts/analytics?days=${d}`),
  getRevisions: (id)   => apiFetch(`/posts/${id}/revisions`),
  restoreRev:   (id,r) => apiFetch(`/posts/${id}/revisions/${r}/restore`, { method:'POST' }),
  create:       (b)    => apiFetch('/posts',        { method:'POST',   body:JSON.stringify(b) }),
  update:       (id,b) => apiFetch(`/posts/${id}`,  { method:'PUT',    body:JSON.stringify(b) }),
  delete:       (id)   => apiFetch(`/posts/${id}`,  { method:'DELETE' }),
  like:         (id)   => apiFetch(`/posts/${id}/like`,  { method:'PUT' }),
  react:        (id,e) => apiFetch(`/posts/${id}/react`, { method:'PUT', body:JSON.stringify({ emoji:e }) }),
  uploadImage:  (fd)   => apiFetch('/posts/upload',      { method:'POST', body:fd }),
};

const CommentAPI = {
  getByPost: (pid,s)  => apiFetch(`/comments/${pid}${s?'?sort='+s:''}`),
  add:       (pid,b)  => apiFetch(`/comments/${pid}`,     { method:'POST',   body:JSON.stringify(b) }),
  update:    (id,b)   => apiFetch(`/comments/${id}`,      { method:'PUT',    body:JSON.stringify(b) }),
  delete:    (id)     => apiFetch(`/comments/${id}`,      { method:'DELETE' }),
  like:      (id)     => apiFetch(`/comments/${id}/like`, { method:'PUT' }),
  vote:      (id,d)   => apiFetch(`/comments/${id}/vote`, { method:'PUT', body:JSON.stringify({ direction:d }) }),
};

const BookmarkAPI = {
  getAll:  ()   => apiFetch('/bookmarks'),
  toggle:  (id) => apiFetch(`/bookmarks/${id}`, { method:'PUT' }),
};

const ReadingListAPI = {
  getAll:  ()   => apiFetch('/reading-list'),
  toggle:  (id) => apiFetch(`/reading-list/${id}`,       { method:'PUT' }),
  markRead:(id) => apiFetch(`/reading-list/${id}/read`,   { method:'PUT' }),
};

const NotifAPI = {
  getAll:   ()    => apiFetch('/notifications'),
  markAll:  ()    => apiFetch('/notifications/read',      { method:'PUT' }),
  markOne:  (id)  => apiFetch(`/notifications/${id}/read`,{ method:'PUT' }),
  clearAll: ()    => apiFetch('/notifications',           { method:'DELETE' }),
};

const FollowAPI = {
  toggle:    (uid) => apiFetch(`/follow/${uid}`,            { method:'PUT' }),
  status:    (uid) => apiFetch(`/follow/${uid}/status`),
  followers: (uid) => apiFetch(`/follow/${uid}/followers`),
  following: (uid) => apiFetch(`/follow/${uid}/following`),
};

const AuthorAPI = {
  getProfile: (id) => apiFetch(`/authors/${id}`),
};

const AdminAPI = {
  getStats:      ()     => apiFetch('/admin/stats'),
  getUsers:      (p=1)  => apiFetch(`/admin/users?page=${p}`),
  banUser:       (id)   => apiFetch(`/admin/users/${id}/ban`,      { method:'PUT' }),
  setRole:       (id,r) => apiFetch(`/admin/users/${id}/role`,     { method:'PUT', body:JSON.stringify({role:r}) }),
  getPosts:      (p=1)  => apiFetch(`/admin/posts?page=${p}`),
  deletePost:    (id)   => apiFetch(`/admin/posts/${id}`,          { method:'DELETE' }),
  toggleFeature: (id)   => apiFetch(`/admin/posts/${id}/feature`,  { method:'PUT' }),
  getReports:    ()     => apiFetch('/admin/reports'),
  resolveReport: (id)   => apiFetch(`/admin/reports/${id}/resolve`,{ method:'PUT' }),
};

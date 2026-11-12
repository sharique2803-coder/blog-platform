// ============================================================
// login.js
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Redirect if already logged in
  if (isLoggedIn()) { window.location.href = '../index.html'; return; }

  const form       = document.getElementById('loginForm');
  const toggleBtn  = document.getElementById('togglePw');
  const pwInput    = document.getElementById('password');

  // Toggle password visibility
  toggleBtn.addEventListener('click', () => {
    const isText = pwInput.type === 'text';
    pwInput.type = isText ? 'password' : 'text';
    toggleBtn.innerHTML = isText ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    let valid = true;

    if (!email) { showFieldError('emailError', 'Email is required'); valid = false; }
    if (!password) { showFieldError('passwordError', 'Password is required'); valid = false; }
    if (!valid) return;

    const btn = document.getElementById('loginBtn');
    setLoading(btn, true);

    try {
      const data = await AuthAPI.login({ email, password });
      saveAuth(data.token, data.user);
      window.location.href = '../index.html';
    } catch (err) {
      showAlert('alertBox', err.message);
    } finally {
      setLoading(btn, false);
    }
  });
});

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearErrors() {
  ['emailError', 'passwordError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<i class="fas fa-circle-notch fa-spin"></i> Logging in...'
    : '<span>Login</span><i class="fas fa-arrow-right"></i>';
}

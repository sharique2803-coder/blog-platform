// ============================================================
// register.js
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) { window.location.href = '../index.html'; return; }

  const form      = document.getElementById('registerForm');
  const pwInput   = document.getElementById('password');
  const toggle1   = document.getElementById('togglePw');
  const toggle2   = document.getElementById('togglePw2');
  const confInput = document.getElementById('confirmPassword');

  toggle1.addEventListener('click', () => toggleVisibility(pwInput, toggle1));
  toggle2.addEventListener('click', () => toggleVisibility(confInput, toggle2));

  // Password strength meter
  pwInput.addEventListener('input', () => {
    const strength = calcStrength(pwInput.value);
    const fill = document.getElementById('strengthFill');
    fill.style.width = `${strength.pct}%`;
    fill.className = `strength-fill strength-${strength.level}`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const username  = document.getElementById('username').value.trim();
    const email     = document.getElementById('email').value.trim();
    const password  = pwInput.value;
    const confirm   = confInput.value;
    let valid = true;

    if (!username || username.length < 3) { showFieldError('usernameError', 'Username must be at least 3 characters'); valid = false; }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { showFieldError('emailError', 'Please enter a valid email'); valid = false; }
    if (!password || password.length < 6) { showFieldError('passwordError', 'Password must be at least 6 characters'); valid = false; }
    if (password !== confirm) { showFieldError('confirmError', 'Passwords do not match'); valid = false; }
    if (!valid) return;

    const btn = document.getElementById('registerBtn');
    setLoading(btn, true);

    try {
      const data = await AuthAPI.register({ username, email, password });
      saveAuth(data.token, data.user);
      window.location.href = '../index.html';
    } catch (err) {
      showAlert('alertBox', err.message);
    } finally {
      setLoading(btn, false);
    }
  });
});

function toggleVisibility(input, btn) {
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.innerHTML = isText ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}

function calcStrength(pw) {
  let score = 0;
  if (pw.length >= 6)  score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = ['weak','weak','fair','good','strong','strong'];
  return { pct: (score / 5) * 100, level: levels[score] };
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearErrors() {
  ['usernameError','emailError','passwordError','confirmError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<i class="fas fa-circle-notch fa-spin"></i> Creating account...'
    : '<span>Create Account</span><i class="fas fa-arrow-right"></i>';
}

const api = window.szivacs;
const savedTheme = localStorage.getItem('szivacs-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('loginLogoImg').src = savedTheme === 'light' ? '../szivacs_big_black.png' : '../szivacs_big.png';

document.getElementById('loginBtn').addEventListener('click', async () => {
  const btn = document.getElementById('loginBtn');
  const loading = document.getElementById('loginLoading');
  const error = document.getElementById('loginError');
  btn.disabled = true;
  loading.classList.remove('hidden');
  error.classList.add('hidden');
  try {
    await api.login();
    await api.loadDashboard();
  } catch (e) {
    error.textContent = e.message;
    error.classList.remove('hidden');
    btn.disabled = false;
    loading.classList.add('hidden');
  }
});

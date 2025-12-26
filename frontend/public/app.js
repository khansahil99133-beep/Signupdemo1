// File: app.js
// Why: Client-side UX + submits signup to backend + subtle homepage animation.
(function () {
  'use strict';

  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  const form = $('#signupForm');
  const year = $('#year');
  const nameInput = $('#name');
  const password = $('#password');
  const toggles = $$('.toggle');
  const errorFor = (name) => document.querySelector(`[data-error-for="${name}"]`);

  year && (year.textContent = new Date().getFullYear().toString());

  // Prevent spaces in username
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      nameInput.value = nameInput.value.replace(/\s+/g, '');
    });
  }

  // Show/hide password
  if (toggles.length) {
    toggles.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const field = targetId ? document.getElementById(targetId) : btn.parentElement?.querySelector('input');
        if (!field) return;
        const t = field.getAttribute('type') === 'password' ? 'text' : 'password';
        field.setAttribute('type', t);
        btn.setAttribute('aria-pressed', t === 'text' ? 'true' : 'false');
      });
    });
  }

  // Form validation helpers
  function getFormData(formEl) {
    const fd = new FormData(formEl);
    const obj = {};
    for (const [k, v] of fd.entries()) {
      // If multiple fields share the same name, collect as array
      if (obj[k] !== undefined) {
        obj[k] = Array.isArray(obj[k]) ? [...obj[k], v] : [obj[k], v];
      } else {
        obj[k] = v;
      }
    }
    return obj;
  }

  const LOCAL_API_BASE = 'http://localhost:5050';
  const REMOTE_API_BASE = 'https://signup-2wle.onrender.com';

  function getDefaultApiBase() {
    const hostname = window.location?.hostname?.toLowerCase?.() ?? '';
    const localHosts = ['localhost', '127.0.0.1', '::1'];
    if (localHosts.includes(hostname)) {
      return LOCAL_API_BASE;
    }
    return REMOTE_API_BASE;
  }

  async function apiSignup(payload) {
    const base = window.__API_BASE__ || getDefaultApiBase();
    const res = await fetch(base + '/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Signup failed');
    }
    return res.json();
  }

  function setError(name, message) {
    const el = errorFor(name);
    if (el) el.textContent = message || '';
  }

  function clearErrors() {
    $$('.error').forEach((el) => { el.textContent = ''; });
  }

  function normalizeTelegram(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return '';
    const handle = raw.startsWith('@') ? raw.slice(1) : raw;
    return '@' + handle;
  }

  function isValidTelegram(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return false;
    const handle = raw.startsWith('@') ? raw.slice(1) : raw;
    return /^[a-zA-Z0-9_]{5,32}$/.test(handle);
  }

  // Submit handler
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = getFormData(form);
      clearErrors();

      // minimal checks
      const name = (data.name || '').toString().trim();
      const email = (data.email || '').toString().trim();
      const pwd = (data.password || '').toString();
      const confirm = (data.confirmPassword || '').toString();
      const telegram = (data.telegram || '').toString().trim();
      let hasError = false;

      if (!name) {
        setError('name', 'Username is required.');
        hasError = true;
      } else if (/\s/.test(name)) {
        setError('name', 'Username cannot include spaces.');
        hasError = true;
      }
      if (!pwd) {
        setError('password', 'Password is required.');
        hasError = true;
      }
      if (!confirm) {
        setError('confirmPassword', 'Please re-enter your password.');
        hasError = true;
      } else if (pwd && confirm !== pwd) {
        setError('confirmPassword', 'Passwords do not match.');
        hasError = true;
      }
      if (!isValidTelegram(telegram)) {
        setError('telegram', 'Telegram username required (5-32 chars, letters/numbers/_).');
        hasError = true;
      }
      if (hasError) return;

      try {
        data.name = name;
        data.email = email;
        data.telegram = normalizeTelegram(telegram);
        delete data.confirmPassword;
        const resp = await apiSignup(data);
        form.reset();
        const qp = new URLSearchParams({
          name: resp.user?.name || '',
          username: resp.user?.name || name || '',
          password: pwd || '',
        });
        window.location.href = 'success.html?' + qp.toString();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  }

  // Demo links
  const signin = $('#goToSignIn');
  if (signin && signin.getAttribute('href') === '#') {
    signin.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Navigate to Sign in (demo)');
    });
  }

  // ====== Billboard animation (particles) ======
  const billboard = document.querySelector('.billboard');
  if (billboard) {
    const canvas = document.createElement('canvas');
    canvas.className = 'bg-canvas';
    billboard.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let w, h, particles = [], rafId;
    const COUNT = 60;

    function resize() {
      w = canvas.width = billboard.clientWidth;
      h = canvas.height = billboard.clientHeight || Math.max(220, window.innerHeight * 0.35);
    }

    function init() {
      particles = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 1 + Math.random() * 2.5,
        a: 0.2 + Math.random() * 0.6
      }));
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      // gradient backdrop subtle glow
      const g = ctx.createRadialGradient(w*0.7, h*0.3, 20, w*0.7, h*0.3, Math.max(w, h));
      g.addColorStop(0, 'rgba(59,130,246,0.10)'); // blue
      g.addColorStop(1, 'rgba(99,102,241,0.00)'); // indigo
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // particles
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      });

      // connecting lines
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < 120*120) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.stroke();
      rafId = requestAnimationFrame(tick);
    }

    const onResize = () => { resize(); init(); };
    window.addEventListener('resize', onResize);
    onResize();
    tick();

    // cleanup when navigating SPA (if ever)
    window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
  }
})();

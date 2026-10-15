// Registers Eveee — Application Logic & Animation Engine
const API_BASE = window.location.origin;

let state = {
  events: [],
  filteredEvents: [],
  activeFilter: 'all',
  users: [],
  usersPagination: { page: 1, limit: 8, total: 0 },
  searchQuery: '',
  searchTimeout: null,
  allUsersList: [],
  soundEnabled: true
};

// Web Audio API Synthesizer for Interactive Haptic Chimes
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, type = 'sine', duration = 0.12, gainVal = 0.1) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio context may be restricted before user gesture
  }
}

function playChime(kind = 'pop') {
  if (!state.soundEnabled) return;
  if (kind === 'pop') {
    playTone(520, 'sine', 0.08, 0.08);
  } else if (kind === 'success') {
    playTone(523.25, 'triangle', 0.15, 0.12);
    setTimeout(() => playTone(659.25, 'triangle', 0.18, 0.12), 80);
    setTimeout(() => playTone(783.99, 'triangle', 0.28, 0.15), 160);
  } else if (kind === 'error') {
    playTone(300, 'sawtooth', 0.2, 0.1);
    setTimeout(() => playTone(240, 'sawtooth', 0.25, 0.1), 100);
  }
}

function toggleAudio() {
  state.soundEnabled = !state.soundEnabled;
  document.getElementById('sound-icon').textContent = state.soundEnabled ? '🔊' : '🔇';
  showToast(state.soundEnabled ? 'Audio Chimes Enabled' : 'Audio Muted', 'info');
  if (state.soundEnabled) playChime('pop');
}

// ----------------- PARTICLE / CONFETTI FX ENGINE -----------------
const fxCanvas = document.getElementById('fx-canvas');
const fxCtx = fxCanvas.getContext('2d');
let particles = [];
let animFrameId = null;

function resizeCanvas() {
  fxCanvas.width = window.innerWidth;
  fxCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function launchConfetti(x = window.innerWidth / 2, y = window.innerHeight / 2) {
  const colors = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#38bdf8', '#ffffff'];
  for (let i = 0; i < 90; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 12 + 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      decay: Math.random() * 0.018 + 0.012,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 14
    });
  }

  if (!animFrameId) {
    animFrameId = requestAnimationFrame(updateParticles);
  }
}

function updateParticles() {
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.25; // gravity
    p.vx *= 0.98; // drag
    p.alpha -= p.decay;
    p.rotation += p.rotSpeed;

    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }

    fxCtx.save();
    fxCtx.globalAlpha = p.alpha;
    fxCtx.translate(p.x, p.y);
    fxCtx.rotate((p.rotation * Math.PI) / 180);
    fxCtx.fillStyle = p.color;
    fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    fxCtx.restore();
  }

  if (particles.length > 0) {
    animFrameId = requestAnimationFrame(updateParticles);
  } else {
    animFrameId = null;
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }
}

// ----------------- INITIALIZATION -----------------
document.addEventListener('DOMContentLoaded', () => {
  loadEvents();
  loadUsers(1);
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('btn-api-info').addEventListener('click', () => {
    playChime('pop');
    openModal('modal-api-info');
  });

  const methodSelect = document.getElementById('tester-method');
  if (methodSelect) {
    methodSelect.addEventListener('change', (e) => {
      const bodyBox = document.getElementById('runner-body-box');
      if (e.target.value === 'POST' || e.target.value === 'PUT') {
        bodyBox.style.display = 'flex';
      } else {
        bodyBox.style.display = 'none';
      }
    });
    methodSelect.dispatchEvent(new Event('change'));
  }
}

// ----------------- TABS -----------------
function switchTab(tabId) {
  playChime('pop');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-section').forEach(sec => sec.classList.remove('active'));

  const activeBtn = document.getElementById(`tab-${tabId}-btn`);
  const activeSec = document.getElementById(`section-${tabId}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activeSec) activeSec.classList.add('active');

  if (tabId === 'events') loadEvents();
  if (tabId === 'users') loadUsers(state.usersPagination.page, state.searchQuery);
}

// ----------------- EVENTS MODULE -----------------
async function loadEvents(isManualRefresh = false) {
  if (isManualRefresh) playChime('pop');

  const grid = document.getElementById('events-grid');
  grid.innerHTML = `
    <div class="loading-state">
      <div class="spinner-neon"></div>
      <p class="loading-text">Synchronizing campus events from MySQL...</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const events = await res.json();
    state.events = events;

    animateCounter('total-events-count', events.length);
    document.getElementById('tab-events-badge').textContent = events.length;

    applyEventFilter();

  } catch (err) {
    grid.innerHTML = `
      <div class="loading-state">
        <p style="color: var(--neon-rose);">Failed to load events: ${err.message}</p>
        <button class="btn btn-secondary btn-sm" onclick="loadEvents()">Try Again</button>
      </div>
    `;
  }
}

function filterEvents(type) {
  playChime('pop');
  state.activeFilter = type;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  const activeChip = document.getElementById(`filter-${type}`);
  if (activeChip) activeChip.classList.add('active');
  applyEventFilter();
}

function applyEventFilter() {
  const grid = document.getElementById('events-grid');
  let list = state.events;

  if (state.activeFilter === 'open') {
    list = state.events.filter(e => (Number(e.registered) || 0) < Number(e.capacity));
  } else if (state.activeFilter === 'popular') {
    list = state.events.filter(e => {
      const reg = Number(e.registered) || 0;
      const cap = Number(e.capacity) || 0;
      return reg >= cap || (cap - reg) <= 5;
    });
  }

  state.filteredEvents = list;

  if (!list.length) {
    grid.innerHTML = `
      <div class="loading-state">
        <p>No events found for this filter. Check "All Events" or create one!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = list.map((event, index) => {
    const registered = Number(event.registered) || 0;
    const capacity = Number(event.capacity) || 0;
    const pct = capacity > 0 ? Math.min(100, Math.round((registered / capacity) * 100)) : 0;
    const isFull = registered >= capacity;
    const available = Math.max(0, capacity - registered);
    const daysLeft = calculateDaysLeft(event.event_date);

    return `
      <div class="event-card" style="animation-delay: ${index * 0.08}s">
        <div>
          <div class="event-card-header">
            <h3 class="event-title">${escapeHtml(event.title)}</h3>
            <span class="event-badge ${isFull ? 'badge-full' : 'badge-open'}">
              ${isFull ? '🔥 FULL' : `🟢 ${available} Open`}
            </span>
          </div>

          <div class="event-meta">
            <div class="event-meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span>${escapeHtml(event.venue)}</span>
            </div>
            <div class="event-meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              <span>${event.event_date}</span>
              ${daysLeft ? `<span class="days-left-chip">${daysLeft}</span>` : ''}
            </div>
          </div>

          <div class="capacity-tracker">
            <div class="capacity-header">
              <span style="color: var(--text-muted);">Enrollment Progress</span>
              <span><strong>${registered}</strong> / ${capacity} seats (${pct}%)</span>
            </div>
            <div class="capacity-progress-bg">
              <div class="capacity-progress-fill ${isFull ? 'full' : ''}" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>

        <div class="event-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="openAttendeesModal(${event.id}, '${escapeJs(event.title)}')">
            <span>📋 Attendees (${registered})</span>
          </button>
          <button class="btn btn-primary btn-sm btn-sparkle" ${isFull ? 'disabled' : ''} onclick="openRegisterModal(${event.id}, '${escapeJs(event.title)}')">
            <span>${isFull ? 'Event Full' : '✨ Register'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function calculateDaysLeft(dateStr) {
  if (!dateStr) return null;
  const eventDate = new Date(dateStr);
  const now = new Date();
  const diffTime = eventDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `⏳ in ${diffDays} days`;
  if (diffDays === 0) return `⚡ Today!`;
  return `✓ Past Event`;
}

// ----------------- USERS MODULE -----------------
async function loadUsers(page = 1, search = '') {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="loading-state">
        <div class="spinner-neon"></div>
        <p class="loading-text">Loading student records from MySQL...</p>
      </td>
    </tr>
  `;

  try {
    const url = `${API_BASE}/users?page=${page}&limit=${state.usersPagination.limit}&name=${encodeURIComponent(search)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();

    state.users = result.data || [];
    state.usersPagination = {
      page: result.page,
      limit: result.limit,
      total: result.total
    };

    animateCounter('total-users-count', result.total);
    document.getElementById('tab-users-badge').textContent = result.total;
    updateUserPaginationControls();

    if (!state.users.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            No students found matching "<strong>${escapeHtml(search)}</strong>".
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.users.map(u => {
      const initial = u.name ? u.name.charAt(0).toUpperCase() : '?';
      return `
        <tr>
          <td style="color: var(--color-indigo); font-family: 'JetBrains Mono', monospace; font-size: 0.86rem; font-weight: 700;">#${u.id}</td>
          <td>
            <div class="user-cell">
              <div class="user-avatar">${initial}</div>
              <span class="user-name-text">${escapeHtml(u.name)}</span>
            </div>
          </td>
          <td style="color: var(--color-cyan); font-family: 'JetBrains Mono', monospace; font-size: 0.86rem; font-weight: 500;">${escapeHtml(u.email)}</td>
          <td><span style="background: #f1f5f9; color: var(--text-primary); border: 1px solid #e2e8f0; padding: 0.25rem 0.65rem; border-radius: 6px; font-weight: 600;">${u.age} yrs</span></td>
          <td style="color: var(--text-muted); font-size: 0.84rem;">${formatDate(u.created_at)}</td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${u.id}, '${escapeJs(u.name)}', '${escapeJs(u.email)}', ${u.age})">Edit</button>
              <button class="btn btn-danger-outline btn-sm" onclick="deleteUser(${u.id}, '${escapeJs(u.name)}')">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--neon-rose);">
          Error loading users: ${err.message}
        </td>
      </tr>
    `;
  }
}

function onSearchUsers(val) {
  state.searchQuery = val.trim();
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) clearBtn.style.display = state.searchQuery ? 'block' : 'none';

  clearTimeout(state.searchTimeout);
  state.searchTimeout = setTimeout(() => {
    loadUsers(1, state.searchQuery);
  }, 280);
}

function clearUserSearch() {
  document.getElementById('user-search-input').value = '';
  document.getElementById('clear-search-btn').style.display = 'none';
  state.searchQuery = '';
  loadUsers(1, '');
}

function updateUserPaginationControls() {
  const { page, limit, total } = state.usersPagination;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);

  document.getElementById('users-pagination-text').textContent = `Showing ${start}–${end} of ${total} students`;
  document.getElementById('current-page-indicator').textContent = `Page ${page} of ${totalPages}`;

  document.getElementById('btn-prev-page').disabled = page <= 1;
  document.getElementById('btn-next-page').disabled = page >= totalPages;
}

function changeUserPage(delta) {
  playChime('pop');
  const newPage = state.usersPagination.page + delta;
  loadUsers(newPage, state.searchQuery);
}

// ----------------- REGISTRATION FLOW WITH CONFETTI -----------------
async function openRegisterModal(eventId, eventTitle) {
  playChime('pop');
  document.getElementById('register-event-id').value = eventId;
  document.getElementById('register-modal-event-title').textContent = `Event: ${eventTitle}`;

  const select = document.getElementById('register-user-select');
  select.innerHTML = '<option value="">Loading students...</option>';
  openModal('modal-register');

  try {
    const res = await fetch(`${API_BASE}/users?limit=50`);
    const data = await res.json();
    state.allUsersList = data.data || [];

    if (!state.allUsersList.length) {
      select.innerHTML = '<option value="">No students available. Enroll one first!</option>';
      return;
    }

    select.innerHTML = '<option value="">Choose student profile...</option>' + state.allUsersList.map(u => `
      <option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>
    `).join('');

  } catch (err) {
    select.innerHTML = `<option value="">Error loading students: ${err.message}</option>`;
  }
}

async function submitRegistration(e) {
  e.preventDefault();
  const eventId = document.getElementById('register-event-id').value;
  const userId = parseInt(document.getElementById('register-user-select').value);

  if (!userId) {
    playChime('error');
    showToast('Please select a student', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-registration');
  btn.disabled = true;
  btn.textContent = 'Enrolling...';

  try {
    const res = await fetch(`${API_BASE}/events/${eventId}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Registration failed');
    }

    // Celebration feedback!
    playChime('success');
    launchConfetti();
    showToast('🎉 Student successfully registered for event!', 'success');
    closeModal('modal-register');
    loadEvents();

  } catch (err) {
    playChime('error');
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🎉 Confirm & Register</span>';
  }
}

// ----------------- ATTENDEES MODULE -----------------
async function openAttendeesModal(eventId, eventTitle) {
  playChime('pop');
  document.getElementById('attendees-modal-title').textContent = `${eventTitle}`;
  const container = document.getElementById('attendees-list-container');
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner-neon"></div>
      <p class="loading-text">Fetching enrolled participants...</p>
    </div>
  `;
  openModal('modal-attendees');

  try {
    const res = await fetch(`${API_BASE}/events/${eventId}/attendees`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    document.getElementById('attendees-modal-subtitle').textContent = 
      `${data.registered} enrolled of ${data.capacity} maximum capacity`;

    if (!data.attendees || !data.attendees.length) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No students enrolled for this event yet. Be the first to register!
        </div>
      `;
      return;
    }

    container.innerHTML = data.attendees.map(a => `
      <div class="attendee-item">
        <div class="attendee-info">
          <div class="user-avatar">${a.name ? a.name.charAt(0).toUpperCase() : '?'}</div>
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(a.name)}</div>
            <div style="font-size: 0.84rem; color: var(--color-cyan); font-family: 'JetBrains Mono', monospace; font-weight: 500;">${escapeHtml(a.email)}</div>
            <div class="attendee-registered-at">Registered on: ${formatDate(a.registered_at)}</div>
          </div>
        </div>
        <button class="btn btn-danger-outline btn-sm" onclick="cancelRegistration(${eventId}, ${a.id}, '${escapeJs(a.name)}')">
          Cancel Sign-up
        </button>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--neon-rose);">
        Failed to load attendees: ${err.message}
      </div>
    `;
  }
}

async function cancelRegistration(eventId, userId, userName) {
  if (!confirm(`Cancel registration for ${userName}?`)) return;

  try {
    const res = await fetch(`${API_BASE}/events/${eventId}/register/${userId}`, {
      method: 'DELETE'
    });
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Failed to cancel registration');

    playChime('pop');
    showToast(`Registration cancelled for ${userName}`, 'info');
    closeModal('modal-attendees');
    loadEvents();

  } catch (err) {
    playChime('error');
    showToast(err.message, 'error');
  }
}

// ----------------- CREATE/EDIT USER -----------------
function openCreateUserModal() {
  playChime('pop');
  document.getElementById('form-create-user').reset();
  openModal('modal-create-user');
}

async function submitCreateUser(e) {
  e.preventDefault();
  const name = document.getElementById('user-name').value.trim();
  const email = document.getElementById('user-email').value.trim();
  const age = parseInt(document.getElementById('user-age').value);

  try {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, age })
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = data.errors ? data.errors.join(', ') : (data.error || 'Failed to enroll student');
      throw new Error(msg);
    }

    playChime('success');
    launchConfetti();
    showToast(`✨ Student ${name} enrolled successfully!`, 'success');
    closeModal('modal-create-user');
    loadUsers(state.usersPagination.page, state.searchQuery);

  } catch (err) {
    playChime('error');
    showToast(err.message, 'error');
  }
}

function openEditUserModal(id, name, email, age) {
  playChime('pop');
  document.getElementById('edit-user-id').value = id;
  document.getElementById('edit-user-name').value = name;
  document.getElementById('edit-user-email').value = email;
  document.getElementById('edit-user-age').value = age;
  openModal('modal-edit-user');
}

async function submitEditUser(e) {
  e.preventDefault();
  const id = document.getElementById('edit-user-id').value;
  const name = document.getElementById('edit-user-name').value.trim();
  const email = document.getElementById('edit-user-email').value.trim();
  const age = parseInt(document.getElementById('edit-user-age').value);

  try {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, age })
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = data.errors ? data.errors.join(', ') : (data.error || 'Failed to update student');
      throw new Error(msg);
    }

    playChime('success');
    showToast(`Student #${id} updated!`, 'success');
    closeModal('modal-edit-user');
    loadUsers(state.usersPagination.page, state.searchQuery);

  } catch (err) {
    playChime('error');
    showToast(err.message, 'error');
  }
}

async function deleteUser(id, name) {
  if (!confirm(`Are you sure you want to remove student "${name}" (#${id})? This will also remove any event registrations.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to delete student');

    playChime('pop');
    showToast(`Student "${name}" deleted.`, 'info');
    loadUsers(state.usersPagination.page, state.searchQuery);
    loadEvents();

  } catch (err) {
    playChime('error');
    showToast(err.message, 'error');
  }
}

// ----------------- CREATE EVENT -----------------
function openCreateEventModal() {
  playChime('pop');
  document.getElementById('form-create-event').reset();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('event-date').value = today;
  openModal('modal-create-event');
}

async function submitCreateEvent(e) {
  e.preventDefault();
  const title = document.getElementById('event-title').value.trim();
  const venue = document.getElementById('event-venue').value.trim();
  const event_date = document.getElementById('event-date').value;
  const capacity = parseInt(document.getElementById('event-capacity').value);

  try {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, venue, event_date, capacity })
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = data.errors ? data.errors.join(', ') : (data.error || 'Failed to create event');
      throw new Error(msg);
    }

    playChime('success');
    launchConfetti();
    showToast(`🎉 Event "${title}" published live!`, 'success');
    closeModal('modal-create-event');
    loadEvents();

  } catch (err) {
    playChime('error');
    showToast(err.message, 'error');
  }
}

// ----------------- API CONSOLE -----------------
function runPreset(method, url, body) {
  playChime('pop');
  document.getElementById('tester-method').value = method;
  document.getElementById('tester-url').value = url;
  const bodyBox = document.getElementById('runner-body-box');
  const bodyInput = document.getElementById('tester-body');

  if (body) {
    bodyBox.style.display = 'flex';
    bodyInput.value = JSON.stringify(body, null, 2);
  } else {
    bodyBox.style.display = (method === 'POST' || method === 'PUT') ? 'flex' : 'none';
    bodyInput.value = '';
  }

  executeApiTest();
}

async function executeApiTest() {
  playChime('pop');
  const method = document.getElementById('tester-method').value;
  let url = document.getElementById('tester-url').value.trim();
  if (!url.startsWith('/')) url = '/' + url;

  const outputEl = document.getElementById('tester-output');
  const badgeEl = document.getElementById('response-status-badge');
  const bodyText = document.getElementById('tester-body').value.trim();

  outputEl.textContent = 'Sending request to Express server...';
  badgeEl.className = 'status-badge-idle';
  badgeEl.textContent = 'Status: Sending...';

  const startTime = performance.now();

  try {
    const options = {
      method,
      headers: { 'Accept': 'application/json' }
    };

    if ((method === 'POST' || method === 'PUT') && bodyText) {
      options.headers['Content-Type'] = 'application/json';
      options.body = bodyText;
    }

    const res = await fetch(`${API_BASE}${url}`, options);
    const duration = Math.round(performance.now() - startTime);

    const isJson = res.headers.get('content-type')?.includes('application/json');
    let data;
    if (isJson) {
      data = await res.json();
      outputEl.textContent = JSON.stringify(data, null, 2);
    } else {
      outputEl.textContent = await res.text();
    }

    badgeEl.textContent = `${res.status} ${res.statusText} (${duration}ms)`;
    badgeEl.className = res.ok ? 'status-badge-success' : 'status-badge-error';

    if (res.ok) playChime('pop');
    else playChime('error');

  } catch (err) {
    const duration = Math.round(performance.now() - startTime);
    outputEl.textContent = `Network / Execution Error:\n${err.message}`;
    badgeEl.textContent = `Error (${duration}ms)`;
    badgeEl.className = 'status-badge-error';
    playChime('error');
  }
}

// ----------------- MODALS & TOASTS -----------------
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

window.onclick = function(e) {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
};

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3600);
}

// Counter animation
function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  if (start === target) {
    el.textContent = target;
    return;
  }
  let current = start;
  const step = target > start ? 1 : -1;
  const interval = setInterval(() => {
    current += step;
    el.textContent = current;
    if (current === target) clearInterval(interval);
  }, 40);
}

// Helper utilities
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

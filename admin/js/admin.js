/**
 * Admin Panel — Groepenkastenservice Maassluis
 *
 * Auth: token stored in sessionStorage (cleared on tab close)
 * All admin API calls include X-Admin-Token header
 */

const ADMIN_API = '/api/admin';
let adminToken = ''; // bevat het wachtwoord na inloggen
let currentPage = 'dashboard';
let availYear, availMonth;
let allContent = {};

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

function adminLogin() {
  const token = document.getElementById('admin-token-input').value.trim();
  if (!token) return;

  // Verify token by making a quick API call
  fetch(`${ADMIN_API}/bookings?month=${getCurrentMonthStr()}`, {
    headers: { 'X-Admin-Password': token }
  }).then(r => {
    if (r.ok) {
      adminToken = token;
      sessionStorage.setItem('adminToken', token);
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('admin-app').classList.remove('hidden');
      document.getElementById('login-error').style.display = 'none';
      initAdmin();
    } else {
      document.getElementById('login-error').style.display = 'block';
    }
  }).catch(() => {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('login-error').textContent = 'Verbindingsfout. Is de server actief?';
  });
}

function adminLogout() {
  adminToken = '';
  sessionStorage.removeItem('adminToken');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('admin-app').classList.add('hidden');
  document.getElementById('admin-token-input').value = '';
}

document.getElementById('admin-token-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') adminLogin();
});

// Auto-login from session
window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('adminToken');
  if (saved) {
    document.getElementById('admin-token-input').value = saved;
    adminToken = saved;
    adminLogin();
  }
});

// ─────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────

function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.remove('hidden');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

  // Load page data
  if (page === 'dashboard') loadDashboard();
  if (page === 'availability') loadAvailability();
  if (page === 'bookings') loadBookings();
  if (page === 'content') loadContent();
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

function initAdmin() {
  const now = new Date();
  availYear = now.getFullYear();
  availMonth = now.getMonth() + 1;

  // Set default filter month
  document.getElementById('filter-month').value = getCurrentMonthStr();

  loadDashboard();
}

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────

async function loadDashboard() {
  try {
    const bookings = await adminFetch(`${ADMIN_API}/bookings`);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const confirmed = bookings.filter(b => b.status === 'confirmed');
    const completed = bookings.filter(b => b.status === 'completed');
    const revenue = confirmed.concat(completed).reduce((s, b) => s + (b.total_eur || 0), 0);

    document.getElementById('stat-total').textContent = bookings.length;
    document.getElementById('stat-confirmed').textContent = confirmed.length;
    document.getElementById('stat-completed').textContent = completed.length;
    document.getElementById('stat-revenue').textContent = `€${fmtPrice(revenue)}`;

    // Upcoming bookings (future, confirmed)
    const upcoming = bookings
      .filter(b => b.status === 'confirmed' && new Date(b.date + 'T12:00:00Z') >= now)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);

    const tbody = document.getElementById('upcoming-tbody');
    if (upcoming.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">Geen aankomende boekingen</td></tr>';
    } else {
      tbody.innerHTML = upcoming.map(b => bookingRow(b)).join('');
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

// ─────────────────────────────────────────────
// Availability
// ─────────────────────────────────────────────

async function loadAvailability() {
  const monthStr = `${availYear}-${String(availMonth).padStart(2, '0')}`;
  const monthLabel = new Date(availYear, availMonth - 1, 1)
    .toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  document.getElementById('avail-month-label').textContent = monthLabel;

  try {
    const data = await adminFetch(`${ADMIN_API}/availability?month=${monthStr}`);
    renderAvailCalendar(data);
  } catch (e) {
    console.error('Availability load error:', e);
  }
}

function renderAvailCalendar(data) {
  const grid = document.getElementById('avail-cal-grid');
  grid.innerHTML = '';

  ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'avail-weekday-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(availYear, availMonth - 1, 1).getDay();
  const offset = (firstDay === 0) ? 6 : firstDay - 1;
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.style.minHeight = '80px';
    grid.appendChild(empty);
  }

  const daysInMonth = new Date(availYear, availMonth, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${availYear}-${String(availMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayDate = new Date(dateStr + 'T12:00:00Z');
    const dayOfWeek = dayDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPast = dayDate < today;

    const cell = document.createElement('div');
    cell.className = 'avail-day';
    if (isWeekend) cell.classList.add('weekend');
    if (isPast) cell.classList.add('past');

    const numEl = document.createElement('div');
    numEl.className = 'avail-day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (!isWeekend) {
      const dayData = data[dateStr] || { am: { available: true, booked: null, blocked: false }, pm: { available: true, booking: null, blocked: false } };
      const slotsEl = document.createElement('div');
      slotsEl.className = 'avail-slots';

      ['am', 'pm'].forEach(slot => {
        const slotData = dayData[slot] || {};
        const btn = document.createElement('button');
        btn.className = 'avail-slot';
        btn.textContent = slot === 'am' ? '09–13' : '13–17';

        if (slotData.booking) {
          btn.classList.add('booked');
          btn.title = `Geboekt: ${slotData.booking.customer?.name || '?'} — klik voor details`;
          if (!isPast) {
            btn.addEventListener('click', () => showBookingModal(slotData.booking));
          }
        } else if (slotData.blocked) {
          btn.classList.add('blocked');
          btn.title = 'Geblokkeerd — klik om vrij te geven';
          if (!isPast) {
            btn.addEventListener('click', () => toggleBlock(dateStr, slot, false));
          }
        } else {
          btn.classList.add('available');
          btn.title = 'Beschikbaar — klik om te blokkeren';
          if (!isPast) {
            btn.addEventListener('click', () => toggleBlock(dateStr, slot, true));
          }
        }

        slotsEl.appendChild(btn);
      });

      cell.appendChild(slotsEl);
    }

    grid.appendChild(cell);
  }
}

async function toggleBlock(date, slot, block) {
  try {
    const body = { date };
    body[slot] = block;
    await adminFetch(`${ADMIN_API}/availability`, { method: 'PUT', body });
    await loadAvailability();
    showToast(block ? 'Tijdslot geblokkeerd' : 'Tijdslot vrijgegeven', 'success');
  } catch (e) {
    showToast('Fout bij bijwerken beschikbaarheid', 'error');
  }
}

function availPrev() {
  availMonth--;
  if (availMonth < 1) { availMonth = 12; availYear--; }
  loadAvailability();
}

function availNext() {
  availMonth++;
  if (availMonth > 12) { availMonth = 1; availYear++; }
  loadAvailability();
}

// ─────────────────────────────────────────────
// Bookings
// ─────────────────────────────────────────────

async function loadBookings() {
  const month = document.getElementById('filter-month').value;
  const status = document.getElementById('filter-status').value;

  let url = `${ADMIN_API}/bookings`;
  const params = [];
  if (month) params.push(`month=${month}`);
  if (status) params.push(`status=${status}`);
  if (params.length) url += '?' + params.join('&');

  try {
    const bookings = await adminFetch(url);
    const tbody = document.getElementById('all-bookings-tbody');
    const emptyEl = document.getElementById('bookings-empty');

    if (bookings.length === 0) {
      tbody.innerHTML = '';
      emptyEl.classList.remove('hidden');
    } else {
      emptyEl.classList.add('hidden');
      tbody.innerHTML = bookings.map(b => bookingRow(b, true)).join('');
    }
  } catch (e) {
    showToast('Fout bij laden boekingen', 'error');
  }
}

function bookingRow(b, showAddress = false) {
  const slotLabel = b.slot === 'am' ? '09:00–13:00' : '13:00–17:00';
  const dateLabel = new Date(b.date + 'T12:00:00Z').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const statusClass = `status-${b.status}`;
  const statusLabel = { confirmed: 'Bevestigd', completed: 'Voltooid', cancelled: 'Geannuleerd' }[b.status] || b.status;

  return `<tr>
    <td>${dateLabel}</td>
    <td>${slotLabel}</td>
    <td><strong>${escHtml(b.customer?.name || '?')}</strong><br><small style="color:#94a3b8">${escHtml(b.customer?.phone || '')}</small></td>
    ${showAddress ? `<td style="font-size:.82rem">${escHtml(b.customer?.address || '')} <small style="color:#94a3b8">(${b.distance_km} km)</small></td>` : ''}
    <td>€${fmtPrice(b.total_eur)}</td>
    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
    <td><button class="btn btn-outline btn-sm" onclick="showBookingModal(${escAttr(JSON.stringify(b))})">Details</button></td>
  </tr>`;
}

function showBookingModal(booking) {
  if (typeof booking === 'string') booking = JSON.parse(booking);
  const modal = document.getElementById('booking-modal');
  const content = document.getElementById('modal-content');
  const actions = document.getElementById('modal-actions');

  const slotLabel = booking.slot === 'am' ? '09:00–13:00' : '13:00–17:00';
  const dateLabel = new Date(booking.date + 'T12:00:00Z').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const servicesText = (booking.services || []).map(s => `${s.name} — €${fmtPrice(s.price)}`).join('<br>');
  const statusLabel = { confirmed: 'Bevestigd', completed: 'Voltooid', cancelled: 'Geannuleerd' }[booking.status] || booking.status;

  content.innerHTML = `
    <div class="detail-row"><span class="detail-label">Datum</span><span class="detail-val">${dateLabel}</span></div>
    <div class="detail-row"><span class="detail-label">Tijdslot</span><span class="detail-val">${slotLabel}</span></div>
    <div class="detail-row"><span class="detail-label">Status</span><span class="detail-val"><span class="status-badge status-${booking.status}">${statusLabel}</span></span></div>
    <div class="detail-row"><span class="detail-label">Naam</span><span class="detail-val">${escHtml(booking.customer?.name)}</span></div>
    <div class="detail-row"><span class="detail-label">Telefoon</span><span class="detail-val"><a href="tel:${escHtml(booking.customer?.phone)}">${escHtml(booking.customer?.phone)}</a></span></div>
    <div class="detail-row"><span class="detail-label">E-mail</span><span class="detail-val"><a href="mailto:${escHtml(booking.customer?.email)}">${escHtml(booking.customer?.email)}</a></span></div>
    <div class="detail-row"><span class="detail-label">Adres</span><span class="detail-val">${escHtml(booking.customer?.address)}<br><small style="color:#94a3b8">${escHtml(booking.customer?.postcode)} · ${booking.distance_km} km</small></span></div>
    <div class="detail-row"><span class="detail-label">Werkzaamheden</span><span class="detail-val" style="font-size:.85rem">${servicesText}</span></div>
    ${booking.surcharge_eur > 0 ? `<div class="detail-row"><span class="detail-label">Reistoeslag</span><span class="detail-val">€${fmtPrice(booking.surcharge_eur)}</span></div>` : ''}
    <div class="detail-row"><span class="detail-label">Totaal</span><span class="detail-val" style="font-weight:700;color:#1B4F8A">€${fmtPrice(booking.total_eur)}</span></div>
    ${booking.notes ? `<div class="detail-row"><span class="detail-label">Notities klant</span><span class="detail-val">${escHtml(booking.notes)}</span></div>` : ''}
    <div class="detail-row"><span class="detail-label">Aangemaakt</span><span class="detail-val" style="font-size:.82rem">${new Date(booking.created_at).toLocaleString('nl-NL')}</span></div>
  `;

  actions.innerHTML = '';
  if (booking.status === 'confirmed') {
    actions.innerHTML += `<button class="btn btn-success btn-sm" onclick="updateBookingStatus('${booking.id}','completed')">✓ Markeer voltooid</button>`;
    actions.innerHTML += `<button class="btn btn-danger btn-sm" onclick="updateBookingStatus('${booking.id}','cancelled')">✗ Annuleer</button>`;
  }
  if (booking.status === 'cancelled') {
    actions.innerHTML += `<button class="btn btn-primary btn-sm" onclick="updateBookingStatus('${booking.id}','confirmed')">↺ Herstel</button>`;
  }

  modal.classList.remove('hidden');
}

function closeModal(e) {
  if (e.target === document.getElementById('booking-modal')) {
    document.getElementById('booking-modal').classList.add('hidden');
  }
}

async function updateBookingStatus(id, status) {
  try {
    await adminFetch(`${ADMIN_API}/bookings/${id}`, { method: 'PATCH', body: { status } });
    document.getElementById('booking-modal').classList.add('hidden');
    showToast(`Status bijgewerkt naar: ${status}`, 'success');
    loadDashboard();
    if (currentPage === 'bookings') loadBookings();
    if (currentPage === 'availability') loadAvailability();
  } catch (e) {
    showToast('Fout bij bijwerken status', 'error');
  }
}

function exportCSV() {
  const month = document.getElementById('filter-month').value;
  const url = `/api/admin/export${month ? `?month=${month}` : ''}`;
  window.location.href = url + (url.includes('?') ? '&' : '?') + `password=${adminToken}`;
}

// ─────────────────────────────────────────────
// Content editor
// ─────────────────────────────────────────────

async function loadContent() {
  try {
    const content = await fetch('/api/content').then(r => r.json());
    allContent = content;

    if (content.contact) {
      document.getElementById('cf-phone').value = content.contact.phone || '';
      document.getElementById('cf-email').value = content.contact.email || '';
      document.getElementById('cf-kvk').value = content.contact.kvk || '';
      document.getElementById('cf-btw').value = content.contact.btw || '';
    }
    if (content.meta) {
      document.getElementById('cf-meta-title').value = content.meta.title || '';
      document.getElementById('cf-meta-desc').value = content.meta.description || '';
      document.getElementById('cf-meta-keywords').value = content.meta.keywords || '';
    }
    if (content.hero) {
      document.getElementById('cf-hero-title').value = content.hero.title || '';
      document.getElementById('cf-hero-sub').value = content.hero.subtitle || '';
    }
  } catch (e) {
    showToast('Fout bij laden inhoud', 'error');
  }
}

async function saveContact() {
  try {
    await adminFetch(`${ADMIN_API}/content`, {
      method: 'PUT',
      body: {
        contact: {
          phone: document.getElementById('cf-phone').value.trim(),
          email: document.getElementById('cf-email').value.trim(),
          kvk: document.getElementById('cf-kvk').value.trim(),
          btw: document.getElementById('cf-btw').value.trim(),
        }
      }
    });
    showToast('Contactgegevens opgeslagen!', 'success');
  } catch {
    showToast('Opslaan mislukt', 'error');
  }
}

async function saveMeta() {
  try {
    await adminFetch(`${ADMIN_API}/content`, {
      method: 'PUT',
      body: {
        meta: {
          title: document.getElementById('cf-meta-title').value.trim(),
          description: document.getElementById('cf-meta-desc').value.trim(),
          keywords: document.getElementById('cf-meta-keywords').value.trim(),
        }
      }
    });
    showToast('SEO instellingen opgeslagen!', 'success');
  } catch {
    showToast('Opslaan mislukt', 'error');
  }
}

async function saveHero() {
  try {
    await adminFetch(`${ADMIN_API}/content`, {
      method: 'PUT',
      body: {
        hero: {
          title: document.getElementById('cf-hero-title').value.trim(),
          subtitle: document.getElementById('cf-hero-sub').value.trim(),
        }
      }
    });
    showToast('Hero tekst opgeslagen!', 'success');
  } catch {
    showToast('Opslaan mislukt', 'error');
  }
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminToken,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) { adminLogout(); throw new Error('Unauthorized'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'API fout');
  }
  return res.json();
}

function getCurrentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmtPrice(n) {
  return Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

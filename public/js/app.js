/**
 * Groepenkastenservice Maassluis — Wizard App
 *
 * Sections:
 *  1. Config & State
 *  2. Wizard Navigation
 *  3. Step 1 — Tile Service Selection
 *  4. Quote Sidebar
 *  5. Step 2 — Postcode Check
 *  6. Step 2 — Photo Upload
 *  7. Step 3 — Calendar
 *  8. Step 4 — Booking Form
 *  9. Content Loader (CMS)
 * 10. FAQ
 * 11. Utilities
 * 12. Init
 */

// ═══════════════════════════════════════════════════════════
// 1. CONFIG & STATE
// ═══════════════════════════════════════════════════════════

const API = '/api';

const state = {
  currentStep: 1,

  // Step 1 — services
  selectedKast: null,          // { id, name, price }
  selectedExtras: new Map(),   // id → { id, name, price }

  // Step 2 — postcode
  postcodeRaw: '',
  distanceKm: 0,
  surchargeEur: 0,
  distanceLat: null,
  distanceLon: null,
  postcodeChecked: false,

  // Step 2 — photo
  photoId: null,
  photoName: null,

  // Step 3 — calendar
  selectedDate: null,
  selectedSlot: null,
  calYear: null,
  calMonth: null,              // 1-based
  availability: {},

  // CMS
  content: {},
};

// ═══════════════════════════════════════════════════════════
// 2. WIZARD NAVIGATION
// ═══════════════════════════════════════════════════════════

// Called inline from HTML buttons as well as internally
function wizGoTo(step) {
  // Validate step 1 — need at least one service
  if (step > 1 && state.currentStep === 1) {
    if (!state.selectedKast && state.selectedExtras.size === 0) {
      showInlineError('step1-next', 'Selecteer minimaal één werkzaamheid.');
      return;
    }
  }

  // Validate step 2 → step 3: photo is mandatory
  if (step > 2 && state.currentStep === 2) {
    if (!state.photoId) {
      const pr = document.getElementById('photo-result');
      pr.className = 'photo-result error';
      pr.textContent = 'Upload een foto van uw groepenkast (verplicht).';
      pr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
  }

  const panels = document.querySelectorAll('.wiz-panel');
  panels.forEach(p => p.classList.remove('active'));

  const target = document.getElementById(`wiz-step-${step}`);
  if (target) target.classList.add('active');

  // Update progress
  document.querySelectorAll('.wiz-prog-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (s === step) el.classList.add('active');
    else if (s < step) el.classList.add('done');
  });

  state.currentStep = step;

  // Update quote badge
  const badge = document.getElementById('quote-step-badge');
  if (badge) badge.textContent = `Stap ${step} van 4`;

  // Step-specific actions
  if (step === 3 && !state.calYear) {
    initCalendar();
  }
  if (step === 4) {
    renderFormRecap();
  }

  // Scroll wizard into view
  document.getElementById('wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showInlineError(btnId, msg) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  let err = btn.parentElement.querySelector('.inline-err');
  if (!err) {
    err = document.createElement('span');
    err.className = 'inline-err';
    btn.parentElement.appendChild(err);
  }
  err.textContent = msg;
  setTimeout(() => { if (err.parentElement) err.parentElement.removeChild(err); }, 3000);
}

// ═══════════════════════════════════════════════════════════
// 3. STEP 1 — TILE SERVICE SELECTION
// ═══════════════════════════════════════════════════════════

function initTiles() {
  // Radio tiles (kast type — only one at a time)
  document.querySelectorAll('.tile-radio').forEach(tile => {
    tile.addEventListener('click', () => {
      const id    = tile.dataset.id;
      const name  = tile.dataset.name;
      const price = parseInt(tile.dataset.price, 10);

      if (tile.classList.contains('selected')) {
        // Deselect
        tile.classList.remove('selected');
        state.selectedKast = null;
      } else {
        // Deselect others in same group
        const group = tile.dataset.group;
        document.querySelectorAll(`.tile-radio[data-group="${group}"]`).forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        state.selectedKast = { id, name, price };
      }
      updateQuote();
    });
  });

  // Checkbox tiles (extras — multiple)
  document.querySelectorAll('.tile-check').forEach(tile => {
    tile.addEventListener('click', () => {
      const id    = tile.dataset.id;
      const name  = tile.dataset.name;
      const price = parseInt(tile.dataset.price, 10);

      if (tile.classList.contains('selected')) {
        tile.classList.remove('selected');
        state.selectedExtras.delete(id);
      } else {
        tile.classList.add('selected');
        state.selectedExtras.set(id, { id, name, price });
      }
      updateQuote();
    });
  });
}

function getSelectedItems() {
  const items = [];
  if (state.selectedKast) items.push(state.selectedKast);
  for (const item of state.selectedExtras.values()) items.push(item);
  return items;
}

function getSubtotal() {
  return getSelectedItems().reduce((sum, i) => sum + i.price, 0);
}

// ═══════════════════════════════════════════════════════════
// 4. QUOTE SIDEBAR
// ═══════════════════════════════════════════════════════════

function updateQuote() {
  const items    = getSelectedItems();
  const subtotal = getSubtotal();
  const total    = subtotal + state.surchargeEur;

  const emptyEl   = document.getElementById('quote-empty');
  const itemsEl   = document.getElementById('quote-items');
  const totalsEl  = document.getElementById('quote-totals');

  if (items.length === 0 && state.surchargeEur === 0) {
    emptyEl.classList.remove('hidden');
    itemsEl.innerHTML = '';
    totalsEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  totalsEl.classList.remove('hidden');

  // Build items list
  itemsEl.innerHTML = items.map(i =>
    `<li class="qt-row"><span>${escHtml(i.name)}</span><span>€ ${fmtPrice(i.price)}</span></li>`
  ).join('');

  // Surcharge row
  if (state.surchargeEur > 0) {
    const surchargeKm = Math.round(state.distanceKm - 20);
    itemsEl.innerHTML += `<li class="qt-row qt-surcharge-item"><span>Reistoeslag (${surchargeKm} km)</span><span>€ ${fmtPrice(state.surchargeEur)}</span></li>`;
  }

  // Totals
  document.getElementById('qt-subtotal').textContent = `€ ${fmtPrice(subtotal)}`;

  const surchargeRow = document.getElementById('qt-surcharge-row');
  if (state.surchargeEur > 0) {
    surchargeRow.classList.remove('hidden');
    document.getElementById('qt-surcharge-km').textContent = Math.round(state.distanceKm - 20);
    document.getElementById('qt-surcharge').textContent = `€ ${fmtPrice(state.surchargeEur)}`;
  } else {
    surchargeRow.classList.add('hidden');
  }

  document.getElementById('qt-total').textContent = `€ ${fmtPrice(total)}`;

  // Slot box
  const slotBox = document.getElementById('quote-slot-box');
  const slotLabel = document.getElementById('quote-slot-label');
  if (state.selectedDate && state.selectedSlot) {
    const dayLabel = new Date(state.selectedDate + 'T12:00:00Z').toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    });
    const slotTime = state.selectedSlot === 'am' ? '09:00 – 13:00' : '13:00 – 17:00';
    slotLabel.textContent = `📅 ${dayLabel} · ${slotTime}`;
    slotBox.classList.remove('hidden');
  } else {
    slotBox.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
// 5. STEP 2 — POSTCODE CHECK
// ═══════════════════════════════════════════════════════════

function initPostcode() {
  const btn   = document.getElementById('postcode-btn');
  const input = document.getElementById('postcode-input');
  btn.addEventListener('click', checkPostcode);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkPostcode(); } });
}

async function checkPostcode() {
  const input  = document.getElementById('postcode-input');
  const result = document.getElementById('postcode-result');
  const raw    = input.value.replace(/\s/g, '').toUpperCase();

  if (!/^\d{4}[A-Z]{2}$/.test(raw)) {
    result.className = 'postcode-result error';
    result.textContent = 'Voer een geldige postcode in (bijv. 3141 AP)';
    return;
  }

  result.className = 'postcode-result';
  result.textContent = 'Postcode controleren…';

  try {
    const query = `${raw.slice(0, 4)} ${raw.slice(4)}`;
    const url   = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(query)}&country=NL&format=json&limit=1`;
    const geo   = await fetch(url, { headers: { 'Accept-Language': 'nl' } }).then(r => r.json());

    if (!geo.length) {
      result.className = 'postcode-result error';
      result.textContent = 'Postcode niet gevonden. Controleer en probeer opnieuw.';
      return;
    }

    const lat = parseFloat(geo[0].lat);
    const lon = parseFloat(geo[0].lon);

    const distRes = await fetch(`${API}/distance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon }),
    }).then(r => r.json());

    state.distanceKm  = distRes.distance_km;
    state.surchargeEur = distRes.surcharge_eur;
    state.distanceLat  = lat;
    state.distanceLon  = lon;
    state.postcodeRaw  = raw;
    state.postcodeChecked = true;

    if (distRes.within_free_zone) {
      result.className = 'postcode-result ok';
      result.textContent = `✓ Binnen rijbereik (${distRes.distance_km} km) — geen reistoeslag`;
    } else {
      result.className = 'postcode-result ok-surcharge';
      result.textContent = `${distRes.distance_km} km — reistoeslag +€${fmtPrice(distRes.surcharge_eur)} (${distRes.surcharge_km} km × €0,40)`;
    }

    updateQuote();

  } catch (err) {
    result.className = 'postcode-result error';
    result.textContent = 'Kon postcode niet controleren. Probeer het opnieuw.';
    console.error('Postcode check error:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// 6. STEP 2 — PHOTO UPLOAD
// ═══════════════════════════════════════════════════════════

function initPhotoUpload() {
  const dropZone  = document.getElementById('photo-drop');
  const fileInput = document.getElementById('photo-input');
  const dropInner = document.getElementById('photo-drop-inner');

  // Click on drop zone → trigger file input
  dropInner.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handlePhotoFile(fileInput.files[0]);
    }
  });

  // Drag-and-drop
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handlePhotoFile(file);
  });

  // Remove button
  document.getElementById('photo-remove').addEventListener('click', () => {
    clearPhoto();
  });
}

async function handlePhotoFile(file) {
  const resultEl    = document.getElementById('photo-result');
  const previewWrap = document.getElementById('photo-preview-wrap');
  const previewImg  = document.getElementById('photo-preview-img');
  const uploadingEl = document.getElementById('photo-uploading');
  const dropInner   = document.getElementById('photo-drop-inner');

  if (!file.type.startsWith('image/')) {
    resultEl.className = 'photo-result error';
    resultEl.textContent = 'Alleen afbeeldingen zijn toegestaan (JPG, PNG, HEIC, enz.)';
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    resultEl.className = 'photo-result error';
    resultEl.textContent = 'Bestand is te groot. Maximum is 15 MB.';
    return;
  }

  // Show preview immediately (local blob URL)
  const blobUrl = URL.createObjectURL(file);
  previewImg.src = blobUrl;
  previewWrap.classList.remove('hidden');
  dropInner.classList.add('hidden');

  // Show uploading state
  uploadingEl.classList.remove('hidden');
  resultEl.className = 'photo-result';
  resultEl.textContent = '';
  state.photoId = null;

  try {
    const formData = new FormData();
    formData.append('photo', file);

    const res  = await fetch(`${API}/upload`, { method: 'POST', body: formData });
    const data = await res.json();

    uploadingEl.classList.add('hidden');

    if (!res.ok) {
      resultEl.className = 'photo-result error';
      resultEl.textContent = data.error || 'Upload mislukt. Probeer opnieuw.';
      return;
    }

    state.photoId   = data.photo_id;
    state.photoName = data.original_name;
    resultEl.className = 'photo-result ok';
    resultEl.textContent = `✓ Foto geüpload (${data.size_kb} KB)`;

  } catch (err) {
    uploadingEl.classList.add('hidden');
    resultEl.className = 'photo-result error';
    resultEl.textContent = 'Verbindingsfout bij uploaden. Probeer opnieuw.';
    console.error('Photo upload error:', err);
  }
}

function clearPhoto() {
  const previewWrap = document.getElementById('photo-preview-wrap');
  const previewImg  = document.getElementById('photo-preview-img');
  const dropInner   = document.getElementById('photo-drop-inner');
  const resultEl    = document.getElementById('photo-result');
  const fileInput   = document.getElementById('photo-input');

  // Release object URL
  if (previewImg.src && previewImg.src.startsWith('blob:')) {
    URL.revokeObjectURL(previewImg.src);
  }
  previewImg.src = '';
  previewWrap.classList.add('hidden');
  dropInner.classList.remove('hidden');
  resultEl.className = 'photo-result';
  resultEl.textContent = '';
  fileInput.value = '';
  state.photoId   = null;
  state.photoName = null;
}

// ═══════════════════════════════════════════════════════════
// 7. STEP 3 — CALENDAR
// ═══════════════════════════════════════════════════════════

function initCalendar() {
  const now = new Date();
  state.calYear  = now.getFullYear();
  state.calMonth = now.getMonth() + 1;

  document.getElementById('cal-prev').addEventListener('click', () => {
    const now2 = new Date();
    if (state.calYear === now2.getFullYear() && state.calMonth === now2.getMonth() + 1) return;
    state.calMonth--;
    if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; }
    loadAndRenderCalendar();
  });

  document.getElementById('cal-next').addEventListener('click', () => {
    state.calMonth++;
    if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; }
    loadAndRenderCalendar();
  });

  loadAndRenderCalendar();
}

async function loadAndRenderCalendar() {
  const monthStr  = `${state.calYear}-${String(state.calMonth).padStart(2, '0')}`;
  const loadingEl = document.getElementById('cal-loading');
  const gridEl    = document.getElementById('calendar-grid');

  loadingEl.classList.remove('hidden');
  gridEl.style.opacity = '.4';

  try {
    const data = await fetch(`${API}/availability?month=${monthStr}`).then(r => r.json());
    state.availability = data;
  } catch {
    state.availability = {};
  }

  loadingEl.classList.add('hidden');
  gridEl.style.opacity = '1';
  renderCalendar();
}

function renderCalendar() {
  const monthStr  = `${state.calYear}-${String(state.calMonth).padStart(2, '0')}`;
  const monthLabel = new Date(state.calYear, state.calMonth - 1, 1)
    .toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

  document.getElementById('cal-month-label').textContent = monthLabel;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // Weekday headers
  ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-weekday-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  // First day offset (Monday = 0)
  const firstDay = new Date(state.calYear, state.calMonth - 1, 1).getDay();
  const offset   = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day other-month';
    grid.appendChild(empty);
  }

  const daysInMonth = new Date(state.calYear, state.calMonth, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${state.calYear}-${String(state.calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayDate  = new Date(dateStr + 'T12:00:00Z');
    const dayOfWeek = dayDate.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPast    = dayDate < today;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (isWeekend) cell.classList.add('weekend');
    if (isPast) cell.classList.add('past');

    const numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (!isWeekend && !isPast) {
      const avail   = state.availability[dateStr];
      const slotsEl = document.createElement('div');
      slotsEl.className = 'cal-slots';

      ['am', 'pm'].forEach(slot => {
        const slotEl    = document.createElement('div');
        const isAvail   = avail ? avail[slot] : false;
        const isSelected = state.selectedDate === dateStr && state.selectedSlot === slot;
        const label     = slot === 'am' ? '09–13' : '13–17';

        slotEl.className = `cal-slot ${isSelected ? 'selected' : (isAvail ? 'available' : 'full')}`;
        slotEl.textContent = label;
        slotEl.title = isAvail
          ? `${dateStr} — ${slot === 'am' ? '09:00–13:00' : '13:00–17:00'}`
          : 'Volgeboekt';

        if (isAvail && !isSelected) {
          slotEl.addEventListener('click', () => {
            state.selectedDate = dateStr;
            state.selectedSlot = slot;
            renderCalendar();
            updateQuote();
            document.getElementById('step3-next').disabled = false;
          });
        } else if (isSelected) {
          slotEl.addEventListener('click', () => {
            state.selectedDate = null;
            state.selectedSlot = null;
            renderCalendar();
            updateQuote();
            document.getElementById('step3-next').disabled = true;
          });
        }

        slotsEl.appendChild(slotEl);
      });

      cell.appendChild(slotsEl);
    }

    grid.appendChild(cell);
  }
}

// ═══════════════════════════════════════════════════════════
// 8. STEP 4 — BOOKING FORM
// ═══════════════════════════════════════════════════════════

function renderFormRecap() {
  const recap = document.getElementById('form-recap');
  if (!recap) return;

  const items   = getSelectedItems();
  const total   = getSubtotal() + state.surchargeEur;
  const slotTxt = state.selectedDate && state.selectedSlot
    ? (() => {
        const d = new Date(state.selectedDate + 'T12:00:00Z').toLocaleDateString('nl-NL', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
        });
        const t = state.selectedSlot === 'am' ? '09:00 – 13:00' : '13:00 – 17:00';
        return `📅 ${d} · ${t}`;
      })()
    : '—';

  recap.innerHTML = `
    <div class="recap-title">Samenvatting uw aanvraag</div>
    <div class="recap-rows">
      ${items.map(i => `<div class="recap-row"><span>${escHtml(i.name)}</span><span>€ ${fmtPrice(i.price)}</span></div>`).join('')}
      ${state.surchargeEur > 0 ? `<div class="recap-row"><span>Reistoeslag</span><span>€ ${fmtPrice(state.surchargeEur)}</span></div>` : ''}
      <div class="recap-row recap-total"><span>Totaal excl. BTW</span><span>€ ${fmtPrice(total)}</span></div>
    </div>
    <div class="recap-slot">${escHtml(slotTxt)}</div>
  `;
}

function initBookingForm() {
  document.getElementById('booking-form').addEventListener('submit', submitBooking);
}

async function submitBooking(e) {
  e.preventDefault();

  const form  = e.target;
  const btn   = document.getElementById('book-submit-btn');
  const name  = form.name.value.trim();
  const email = form.email.value.trim();
  const address = form.address.value.trim();

  // Clear errors
  [form.name, form.email, form.address].forEach(f => f.classList.remove('error'));

  let valid = true;
  if (!name)                  { form.name.classList.add('error');    valid = false; }
  if (!email || !email.includes('@')) { form.email.classList.add('error');   valid = false; }
  if (!address)               { form.address.classList.add('error'); valid = false; }

  if (!state.selectedDate || !state.selectedSlot) {
    alert('Ga terug naar stap 3 en selecteer een datum en tijdsblok.');
    return;
  }
  if (!state.photoId) {
    alert('Upload eerst een foto van uw groepenkast (stap 2).');
    return;
  }
  if (!valid) {
    alert('Vul alle verplichte velden in (gemarkeerd met *)');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Bezig met versturen…';

  const items = getSelectedItems();

  try {
    const res = await fetch(`${API}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: state.selectedDate,
        slot: state.selectedSlot,
        customer: {
          name,
          email,
          postcode: state.postcodeRaw || '',
          address,
        },
        services: items.map(i => ({ name: i.name, price: i.price })),
        total: getSubtotal() + state.surchargeEur,
        distance_km: state.distanceKm,
        surcharge_eur: state.surchargeEur,
        notes: form.notes.value.trim(),
        photo_id: state.photoId,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      showSuccess(data.message);
    } else {
      alert(data.error || 'Er is een fout opgetreden. Probeer het opnieuw.');
      btn.disabled = false;
      btn.textContent = 'Aanvraag versturen ✓';
    }
  } catch {
    alert('Verbindingsfout. Controleer uw internetverbinding en probeer opnieuw.');
    btn.disabled = false;
    btn.textContent = 'Aanvraag versturen ✓';
  }
}

function showSuccess(message) {
  document.getElementById('wizard').style.display = 'none';
  const successSection = document.getElementById('booking-success');
  successSection.style.display = '';
  document.getElementById('success-message').textContent = message;
  successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════════════
// 9. CONTENT LOADER (CMS)
// ═══════════════════════════════════════════════════════════

async function loadContent() {
  try {
    const content = await fetch(`${API}/content`).then(r => r.json());
    state.content = content;

    // Meta / SEO
    if (content.meta?.title) document.title = content.meta.title;
    if (content.meta?.description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', content.meta.description);
    }

    // Email
    const email = content.contact?.email;
    if (email) {
      document.querySelectorAll('#footer-email').forEach(el => {
        el.textContent = email;
        el.href = `mailto:${email}`;
      });
    }

    // KVK / BTW
    if (content.contact?.kvk) {
      const el = document.getElementById('footer-kvk');
      if (el) el.textContent = `KVK: ${content.contact.kvk}`;
    }
    if (content.contact?.btw) {
      const el = document.getElementById('footer-btw');
      if (el) el.textContent = `BTW: ${content.contact.btw}`;
    }

    // FAQ
    if (content.faq?.length) renderFAQ(content.faq);

    // SEO content blocks
    if (content.seo_content?.blocks?.length) renderSEOBlocks(content.seo_content.blocks);

  } catch (err) {
    console.error('Content load error:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// 10. FAQ
// ═══════════════════════════════════════════════════════════

function renderFAQ(faqItems) {
  const list = document.getElementById('faq-list');
  list.innerHTML = faqItems.map((item, i) => `
    <div class="faq-item">
      <div class="faq-q" data-idx="${i}" role="button" tabindex="0" aria-expanded="false">
        ${escHtml(item.question)}
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a" id="faq-a-${i}">${escHtml(item.answer)}</div>
    </div>
  `).join('');

  list.querySelectorAll('.faq-q').forEach(q => {
    const toggle = () => {
      const idx    = q.dataset.idx;
      const answer = document.getElementById(`faq-a-${idx}`);
      const isOpen = q.classList.contains('open');
      list.querySelectorAll('.faq-q').forEach(el => el.classList.remove('open'));
      list.querySelectorAll('.faq-a').forEach(el => el.classList.remove('open'));
      if (!isOpen) { q.classList.add('open'); answer.classList.add('open'); }
    };
    q.addEventListener('click', toggle);
    q.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  // FAQ Schema.org
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
  const schemaEl = document.getElementById('faq-schema');
  if (schemaEl) schemaEl.textContent = JSON.stringify(schema);
}

function renderSEOBlocks(blocks) {
  const container = document.getElementById('seo-blocks');
  if (!container) return;
  container.innerHTML = blocks.map(b => `
    <div class="seo-block">
      <h3>${escHtml(b.heading)}</h3>
      <p>${escHtml(b.text)}</p>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════
// 11. UTILITIES
// ═══════════════════════════════════════════════════════════

function fmtPrice(n) {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════
// 12. INIT
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Footer year
  const yrEl = document.getElementById('footer-year');
  if (yrEl) yrEl.textContent = new Date().getFullYear();

  // Load CMS content (non-blocking)
  loadContent();

  // Init wizard modules
  initTiles();
  initPostcode();
  initPhotoUpload();
  initBookingForm();

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});

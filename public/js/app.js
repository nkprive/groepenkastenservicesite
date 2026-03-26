/**
 * Groepenkastenservice Maassluis — Frontend App
 *
 * Sections:
 *  1. Config & State
 *  2. Price Calculator
 *  3. Postcode Check
 *  4. Calendar
 *  5. Booking Form
 *  6. Content Loader (CMS)
 *  7. FAQ
 *  8. Utilities
 *  9. Init
 */

// ═══════════════════════════════════════════════════════════
// 1. CONFIG & STATE
// ═══════════════════════════════════════════════════════════

const API = '/api';

// Services definition (mirrors server-side knowledge)
const SERVICES = {
  // Radio group: groepenkast type
  kast: {
    'kast-1f-8':  { name: 'Groepenkast 1-fase · 8 groepen',  price: 600 },
    'kast-1f-12': { name: 'Groepenkast 1-fase · 12 groepen', price: 700 },
    'kast-3f-8':  { name: 'Groepenkast 3-fase · 8 groepen',  price: 900 },
    'kast-3f-12': { name: 'Groepenkast 3-fase · 12 groepen', price: 1100 },
  },
  // Checkboxes
  checkboxes: {
    'extra-groep': { name: 'Extra groep aanleggen',          price: 200 },
    'kookgroep':   { name: 'Kookgroep installatie',          price: 250 },
    'aardlek':     { name: 'Aardlekschakelaar vervangen',    price: 150 },
    'wandcontact': { name: 'Wandcontactdoos in meterkast',   price: 75  },
    'beltrafo':    { name: 'Beltrafo toevoegen',             price: 60  },
    'kruipruimte': { name: 'Kruipruimte toeslag',            price: 80  },
    'keuring':     { name: 'Keuringsrapport (NEN 1010)',     price: 150 },
  },
};

const state = {
  selectedKast: null,      // key from SERVICES.kast
  selectedExtras: new Set(), // keys from SERVICES.checkboxes
  subtotal: 0,
  distanceKm: 0,
  surchargeEur: 0,
  distanceLat: null,
  distanceLon: null,
  postcodeValid: false,
  selectedDate: null,      // 'YYYY-MM-DD'
  selectedSlot: null,      // 'am' | 'pm'
  calYear: null,
  calMonth: null,          // 1-based
  availability: {},        // { 'YYYY-MM-DD': { am: bool, pm: bool } }
  content: {},             // From content.json
};

// ═══════════════════════════════════════════════════════════
// 2. PRICE CALCULATOR
// ═══════════════════════════════════════════════════════════

function initCalculator() {
  // Radio buttons (kast type)
  document.querySelectorAll('input[name="kast"]').forEach(input => {
    input.addEventListener('change', () => {
      state.selectedKast = input.checked ? input.value : null;
      updateCalculator();
    });
  });

  // Checkboxes
  Object.keys(SERVICES.checkboxes).forEach(key => {
    const input = document.querySelector(`input[name="${key}"]`);
    if (!input) return;
    input.addEventListener('change', () => {
      if (input.checked) state.selectedExtras.add(key);
      else state.selectedExtras.delete(key);
      updateCalculator();
    });
  });
}

function updateCalculator() {
  const items = getSelectedItems();
  state.subtotal = items.reduce((sum, i) => sum + i.price, 0);

  const isEmpty = items.length === 0;
  const priceEmpty = document.getElementById('price-empty');
  const priceList = document.getElementById('price-list');
  const priceDistanceWrap = document.getElementById('price-distance');
  const priceTotalBlock = document.getElementById('price-total-block');
  const bookBtnWrap = document.getElementById('book-btn-wrap');

  if (isEmpty) {
    priceEmpty.classList.remove('hidden');
    priceList.classList.add('hidden');
    priceDistanceWrap.classList.add('hidden');
    priceTotalBlock.classList.add('hidden');
    bookBtnWrap.classList.add('hidden');
    return;
  }

  // Populate price list
  priceEmpty.classList.add('hidden');
  priceList.classList.remove('hidden');
  priceDistanceWrap.classList.remove('hidden');
  priceTotalBlock.classList.remove('hidden');
  bookBtnWrap.classList.remove('hidden');

  priceList.innerHTML = items.map(i =>
    `<li><span class="item-name">${escHtml(i.name)}</span><span class="item-price">€ ${fmtPrice(i.price)}</span></li>`
  ).join('');

  renderPriceTotals();
}

function getSelectedItems() {
  const items = [];
  if (state.selectedKast && SERVICES.kast[state.selectedKast]) {
    items.push(SERVICES.kast[state.selectedKast]);
  }
  for (const key of state.selectedExtras) {
    if (SERVICES.checkboxes[key]) items.push(SERVICES.checkboxes[key]);
  }
  return items;
}

function renderPriceTotals() {
  const total = state.subtotal + state.surchargeEur;
  document.getElementById('subtotal-val').textContent = `€ ${fmtPrice(state.subtotal)}`;
  document.getElementById('total-val').textContent = `€ ${fmtPrice(total)}`;

  const surchargeRow = document.getElementById('surcharge-row');
  if (state.surchargeEur > 0) {
    surchargeRow.classList.remove('hidden');
    document.getElementById('surcharge-km').textContent = Math.round(state.distanceKm - 20);
    document.getElementById('surcharge-val').textContent = `€ ${fmtPrice(state.surchargeEur)}`;
  } else {
    surchargeRow.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
// 3. POSTCODE CHECK
// ═══════════════════════════════════════════════════════════

function initPostcode() {
  const btn = document.getElementById('postcode-btn');
  const input = document.getElementById('postcode-input');
  btn.addEventListener('click', checkPostcode);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') checkPostcode(); });
}

async function checkPostcode() {
  const input = document.getElementById('postcode-input');
  const result = document.getElementById('postcode-result');
  const raw = input.value.replace(/\s/g, '').toUpperCase();

  // Dutch postcode: 4 digits + 2 letters
  if (!/^\d{4}[A-Z]{2}$/.test(raw)) {
    result.className = 'postcode-result error';
    result.textContent = 'Voer een geldige postcode in (bijv. 3141 AP)';
    return;
  }

  result.className = 'postcode-result';
  result.textContent = 'Postcode controleren…';

  try {
    // Geocode via Nominatim (OSM) — free, no API key needed
    const query = `${raw.slice(0, 4)} ${raw.slice(4)}`;
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(query)}&country=NL&format=json&limit=1`;
    const geo = await fetch(url, { headers: { 'Accept-Language': 'nl' } }).then(r => r.json());

    if (!geo.length) {
      result.className = 'postcode-result error';
      result.textContent = 'Postcode niet gevonden. Controleer en probeer opnieuw.';
      return;
    }

    const lat = parseFloat(geo[0].lat);
    const lon = parseFloat(geo[0].lon);

    // Calculate distance on server
    const distRes = await fetch(`${API}/distance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon }),
    }).then(r => r.json());

    state.distanceKm = distRes.distance_km;
    state.surchargeEur = distRes.surcharge_eur;
    state.distanceLat = lat;
    state.distanceLon = lon;
    state.postcodeValid = true;

    if (distRes.within_free_zone) {
      result.className = 'postcode-result ok';
      result.textContent = `✓ Binnen rijbereik (${distRes.distance_km} km) — geen reistoeslag`;
    } else {
      result.className = 'postcode-result ok-surcharge';
      result.textContent = `${distRes.distance_km} km — reistoeslag +€${fmtPrice(distRes.surcharge_eur)} (${distRes.surcharge_km} km × €0,40)`;
    }

    renderPriceTotals();

  } catch (err) {
    result.className = 'postcode-result error';
    result.textContent = 'Kon postcode niet controleren. Probeer het opnieuw.';
    console.error('Postcode check error:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// 4. CALENDAR
// ═══════════════════════════════════════════════════════════

function initCalendar() {
  const now = new Date();
  state.calYear = now.getFullYear();
  state.calMonth = now.getMonth() + 1; // 1-based

  document.getElementById('cal-prev').addEventListener('click', () => {
    const now2 = new Date();
    if (state.calYear === now2.getFullYear() && state.calMonth === now2.getMonth() + 1) return; // Don't go to past
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
  const monthStr = `${state.calYear}-${String(state.calMonth).padStart(2, '0')}`;
  document.getElementById('cal-loading').classList.remove('hidden');
  document.getElementById('calendar-grid').style.opacity = '.4';

  try {
    const data = await fetch(`${API}/availability?month=${monthStr}`).then(r => r.json());
    state.availability = data;
  } catch {
    state.availability = {};
  }

  document.getElementById('cal-loading').classList.add('hidden');
  document.getElementById('calendar-grid').style.opacity = '1';
  renderCalendar();
}

function renderCalendar() {
  const monthStr = `${state.calYear}-${String(state.calMonth).padStart(2, '0')}`;
  const monthLabel = new Date(state.calYear, state.calMonth - 1, 1)
    .toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = monthLabel;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // Weekday headers (Ma Di Wo Do Vr Za Zo)
  ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-weekday-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  // First day of month — what weekday is it? (0=Sun, 1=Mon, …)
  const firstDay = new Date(state.calYear, state.calMonth - 1, 1).getDay();
  // Adjust so Monday = 0
  const offset = (firstDay === 0) ? 6 : firstDay - 1;

  // Leading empty cells
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day other-month';
    grid.appendChild(empty);
  }

  const daysInMonth = new Date(state.calYear, state.calMonth, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${state.calYear}-${String(state.calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayDate = new Date(dateStr + 'T12:00:00Z');
    const dayOfWeek = dayDate.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPast = dayDate < today;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (isWeekend) cell.classList.add('weekend');
    if (isPast) cell.classList.add('past');

    const numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (!isWeekend && !isPast) {
      const avail = state.availability[dateStr];
      const slotsEl = document.createElement('div');
      slotsEl.className = 'cal-slots';

      ['am', 'pm'].forEach(slot => {
        const slotEl = document.createElement('div');
        const isAvail = avail ? avail[slot] : false;
        const isSelected = state.selectedDate === dateStr && state.selectedSlot === slot;
        const label = slot === 'am' ? '09–13' : '13–17';

        slotEl.className = `cal-slot ${isSelected ? 'selected' : (isAvail ? 'available' : 'full')}`;
        slotEl.textContent = label;
        slotEl.title = isAvail ? `${dateStr} — ${slot === 'am' ? '09:00–13:00' : '13:00–17:00'} (beschikbaar)` : 'Volgeboekt';

        if (isAvail && !isSelected) {
          slotEl.addEventListener('click', () => selectSlot(dateStr, slot));
        } else if (isSelected) {
          slotEl.addEventListener('click', () => deselectSlot());
        }

        slotsEl.appendChild(slotEl);
      });

      cell.appendChild(slotsEl);
    }

    grid.appendChild(cell);
  }
}

function selectSlot(date, slot) {
  state.selectedDate = date;
  state.selectedSlot = slot;
  renderCalendar();
  showBookingForm(date, slot);
}

function deselectSlot() {
  state.selectedDate = null;
  state.selectedSlot = null;
  renderCalendar();
  document.getElementById('booking-form-wrap').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// 5. BOOKING FORM
// ═══════════════════════════════════════════════════════════

function initBookingForm() {
  document.getElementById('go-to-book-btn').addEventListener('click', () => {
    const bookingSection = document.getElementById('booking');
    bookingSection.style.display = '';
    bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('booking-form').addEventListener('submit', submitBooking);
}

function showBookingForm(date, slot) {
  const wrap = document.getElementById('booking-form-wrap');
  wrap.style.display = '';

  const dayLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  });
  const slotLabel = slot === 'am' ? '09:00 – 13:00' : '13:00 – 17:00';
  document.getElementById('selected-slot-label').textContent = `📅 ${dayLabel} · ${slotLabel}`;

  // Fill form summary
  const items = getSelectedItems();
  const total = state.subtotal + state.surchargeEur;
  const summaryEl = document.getElementById('form-summary-services');
  summaryEl.innerHTML = items.map(i => `<div>• ${escHtml(i.name)} — €${fmtPrice(i.price)}</div>`).join('');
  if (state.surchargeEur > 0) {
    summaryEl.innerHTML += `<div>• Reistoeslag (${Math.round(state.distanceKm - 20)} km × €0,40) — €${fmtPrice(state.surchargeEur)}</div>`;
  }
  document.getElementById('form-summary-total').textContent = `Totaal: € ${fmtPrice(total)}`;

  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function submitBooking(e) {
  e.preventDefault();

  const form = e.target;
  const btn = document.getElementById('book-submit-btn');

  // Validate required fields
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const address = form.address.value.trim();

  let valid = true;
  [form.name, form.email, form.phone, form.address].forEach(f => f.classList.remove('error'));

  if (!name) { form.name.classList.add('error'); valid = false; }
  if (!email || !email.includes('@')) { form.email.classList.add('error'); valid = false; }
  if (!phone) { form.phone.classList.add('error'); valid = false; }
  if (!address) { form.address.classList.add('error'); valid = false; }

  if (!state.selectedDate || !state.selectedSlot) {
    alert('Selecteer eerst een datum en tijdsblok in de agenda.');
    return;
  }
  if (!valid) {
    alert('Vul alle verplichte velden in (gemarkeerd met *)');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Bezig met inplannen…';

  const items = getSelectedItems();
  const postcode = document.getElementById('postcode-input').value.trim();

  try {
    const res = await fetch(`${API}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: state.selectedDate,
        slot: state.selectedSlot,
        customer: { name, email, phone, postcode, address },
        services: items.map(i => ({ name: i.name, price: i.price })),
        total: state.subtotal + state.surchargeEur,
        distance_km: state.distanceKm,
        surcharge_eur: state.surchargeEur,
        notes: form.notes.value.trim(),
      }),
    });

    const data = await res.json();

    if (res.ok) {
      showSuccess(data.message);
    } else {
      alert(data.error || 'Er is een fout opgetreden. Probeer het opnieuw.');
      btn.disabled = false;
      btn.textContent = 'Afspraak Bevestigen';
    }
  } catch {
    alert('Verbindingsfout. Controleer uw internetverbinding en probeer opnieuw.');
    btn.disabled = false;
    btn.textContent = 'Afspraak Bevestigen';
  }
}

function showSuccess(message) {
  document.getElementById('booking').style.display = 'none';
  const successSection = document.getElementById('booking-success');
  successSection.style.display = '';
  document.getElementById('success-message').textContent = message;
  successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════════════
// 6. CONTENT LOADER (CMS)
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

    // Contact info — update throughout page
    const phone = content.contact?.phone;
    const email = content.contact?.email;
    if (phone) {
      const tel = phone.replace(/-/g, '');
      document.querySelectorAll('[id$="phone"], [id$="phone-num"]').forEach(el => {
        el.textContent = phone;
        if (el.tagName === 'A' || el.closest('a')) {
          const link = el.closest('a') || el;
          link.href = `tel:${tel}`;
        }
      });
      document.querySelectorAll('a[href^="tel:"]').forEach(a => { a.href = `tel:${tel}`; });
      document.querySelectorAll('#success-phone').forEach(el => { el.textContent = phone; });
      document.querySelectorAll('#success-phone-link').forEach(el => { el.href = `tel:${tel}`; });
    }
    if (email) {
      document.querySelectorAll('#footer-email').forEach(el => {
        el.textContent = email;
        el.href = `mailto:${email}`;
      });
    }
    if (content.contact?.kvk) {
      document.getElementById('footer-kvk').textContent = `KVK: ${content.contact.kvk}`;
    }
    if (content.contact?.btw) {
      document.getElementById('footer-btw').textContent = `BTW: ${content.contact.btw}`;
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
// 7. FAQ
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
      const idx = q.dataset.idx;
      const answer = document.getElementById(`faq-a-${idx}`);
      const isOpen = q.classList.contains('open');
      // Close all
      list.querySelectorAll('.faq-q').forEach(el => el.classList.remove('open'));
      list.querySelectorAll('.faq-a').forEach(el => el.classList.remove('open'));
      if (!isOpen) { q.classList.add('open'); answer.classList.add('open'); }
    };
    q.addEventListener('click', toggle);
    q.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  // FAQ Schema.org
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqItems.map(item => ({
      '@type': 'Question',
      'name': item.question,
      'acceptedAnswer': { '@type': 'Answer', 'text': item.answer },
    })),
  };
  document.getElementById('faq-schema').textContent = JSON.stringify(schema);
}

function renderSEOBlocks(blocks) {
  const container = document.getElementById('seo-blocks');
  container.innerHTML = blocks.map(b => `
    <div class="seo-block">
      <h3>${escHtml(b.heading)}</h3>
      <p>${escHtml(b.text)}</p>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════
// 8. UTILITIES
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
// 9. INIT
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Footer year
  document.getElementById('footer-year').textContent = new Date().getFullYear();

  // Load CMS content first (non-blocking)
  loadContent();

  // Init modules
  initCalculator();
  initPostcode();
  initCalendar();
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

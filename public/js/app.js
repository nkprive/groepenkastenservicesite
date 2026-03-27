/**
 * Groepenkastenservice Maassluis — Progressive Reveal App
 *
 * UX flow (no "next" buttons):
 *  1. Service tile click  → reveals Situatie block
 *  2. Photo uploaded      → reveals Datum block, loads calendar
 *  3. Calendar slot click → reveals Gegevens block, scrolls to form
 *  4. Form submit         → shows success screen
 *
 * Quote sidebar stays sticky and updates live throughout.
 */

const API = '/api';

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

const state = {
  selectedKast:   null,
  selectedExtras: new Map(),

  postcodeRaw:     '',
  distanceKm:      0,
  surchargeEur:    0,
  postcodeChecked: false,

  photoId:   null,
  photoName: null,

  selectedDate: null,
  selectedSlot: null,
  calYear:    null,
  calMonth:   null,
  availability: {},

  calendarLoaded: false,
  content: {},
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function fmtPrice(n) {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getSelectedItems() {
  const items = [];
  if (state.selectedKast) items.push(state.selectedKast);
  state.selectedExtras.forEach(item => items.push(item));
  return items;
}

function getSubtotal() {
  return getSelectedItems().reduce((s, i) => s + i.price, 0);
}

function revealBlock(id) {
  const el = document.getElementById(id);
  if (!el || el.classList.contains('open')) return;
  el.classList.add('open');
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

function setBlockNum(el, st) {
  if (!el) return;
  el.classList.remove('active', 'done');
  if (st === 'active') el.classList.add('active');
  if (st === 'done')   el.classList.add('done');
}

// ═══════════════════════════════════════════════════════════
// QUOTE SIDEBAR
// ═══════════════════════════════════════════════════════════

function updateQuote() {
  const items    = getSelectedItems();
  const subtotal = getSubtotal();
  const total    = subtotal + state.surchargeEur;

  const emptyEl  = document.getElementById('quote-empty');
  const itemsEl  = document.getElementById('quote-items');
  const totalsEl = document.getElementById('quote-totals');
  const slotBox  = document.getElementById('quote-slot-box');

  if (items.length === 0 && !state.surchargeEur) {
    emptyEl.classList.remove('hidden');
    itemsEl.innerHTML = '';
    totalsEl.classList.add('hidden');
    slotBox.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  totalsEl.classList.remove('hidden');

  itemsEl.innerHTML = items.map(i =>
    `<li><span class="qi-name">${escHtml(i.name)}</span><span class="qi-price">&#8364; ${fmtPrice(i.price)}</span></li>`
  ).join('');

  const surchargeRow = document.getElementById('qt-surcharge-row');
  if (state.surchargeEur > 0) {
    surchargeRow.classList.remove('hidden');
    document.getElementById('qt-surcharge-km').textContent = Math.round(state.distanceKm - 20);
    document.getElementById('qt-surcharge').textContent = `\u20ac ${fmtPrice(state.surchargeEur)}`;
  } else {
    surchargeRow.classList.add('hidden');
  }

  document.getElementById('qt-total').textContent = `\u20ac ${fmtPrice(total)}`;

  if (state.selectedDate && state.selectedSlot) {
    const day  = new Date(state.selectedDate + 'T12:00:00Z')
      .toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const time = state.selectedSlot === 'am' ? '09:00 \u2013 13:00' : '13:00 \u2013 17:00';
    document.getElementById('quote-slot-label').textContent = `\uD83D\uDCC5 ${day} \u00b7 ${time}`;
    slotBox.classList.remove('hidden');
  } else {
    slotBox.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 1 — SERVICE TILES
// ═══════════════════════════════════════════════════════════

function initTiles() {
  const bnum1 = document.getElementById('bnum-1');

  document.querySelectorAll('.svc-tile-radio').forEach(tile => {
    tile.addEventListener('click', () => {
      const group = tile.dataset.group;
      const id    = tile.dataset.id;
      const name  = tile.dataset.name;
      const price = parseInt(tile.dataset.price, 10);

      if (tile.classList.contains('selected')) {
        tile.classList.remove('selected');
        state.selectedKast = null;
      } else {
        document.querySelectorAll(`.svc-tile-radio[data-group="${group}"]`)
          .forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        state.selectedKast = { id, name, price };
      }
      onServiceChange(bnum1);
    });
  });

  document.querySelectorAll('.svc-tile-check').forEach(tile => {
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
      onServiceChange(bnum1);
    });
  });
}

function onServiceChange(bnum1) {
  const hasService = state.selectedKast || state.selectedExtras.size > 0;
  updateQuote();
  if (hasService) {
    setBlockNum(bnum1, 'done');
    revealBlock('block-situatie');
    setBlockNum(document.getElementById('bnum-2'), 'active');
  } else {
    setBlockNum(bnum1, 'active');
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 2 — POSTCODE
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
  result.textContent = 'Controleren\u2026';

  try {
    const query = raw.slice(0, 4) + ' ' + raw.slice(4);
    const geo   = await fetch(
      'https://nominatim.openstreetmap.org/search?postalcode=' + encodeURIComponent(query) + '&country=NL&format=json&limit=1',
      { headers: { 'Accept-Language': 'nl' } }
    ).then(r => r.json());

    if (!geo.length) {
      result.className = 'postcode-result error';
      result.textContent = 'Postcode niet gevonden.';
      return;
    }

    const distRes = await fetch(API + '/distance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: parseFloat(geo[0].lat), lon: parseFloat(geo[0].lon) }),
    }).then(r => r.json());

    state.distanceKm   = distRes.distance_km;
    state.surchargeEur = distRes.surcharge_eur;
    state.postcodeRaw  = raw;
    state.postcodeChecked = true;

    if (distRes.within_free_zone) {
      result.className = 'postcode-result ok';
      result.textContent = '\u2713 Binnen rijbereik (' + distRes.distance_km + ' km) \u2014 geen reistoeslag';
    } else {
      result.className = 'postcode-result ok-surcharge';
      result.textContent = distRes.distance_km + ' km \u2014 reistoeslag +\u20ac' + fmtPrice(distRes.surcharge_eur) + ' (' + distRes.surcharge_km + ' km \u00d7 \u20ac0,40)';
    }
    updateQuote();
  } catch (err) {
    result.className = 'postcode-result error';
    result.textContent = 'Kon postcode niet controleren. Probeer opnieuw.';
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 2 — PHOTO UPLOAD
// ═══════════════════════════════════════════════════════════

function initPhotoUpload() {
  const dropZone  = document.getElementById('photo-drop');
  const fileInput = document.getElementById('photo-input');
  const dropInner = document.getElementById('photo-drop-inner');

  dropInner.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handlePhotoFile(fileInput.files[0]);
  });
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handlePhotoFile(file);
  });
  document.getElementById('photo-remove').addEventListener('click', clearPhoto);
}

async function handlePhotoFile(file) {
  var resultEl    = document.getElementById('photo-result');
  var previewWrap = document.getElementById('photo-preview-wrap');
  var previewImg  = document.getElementById('photo-preview-img');
  var uploadingEl = document.getElementById('photo-uploading');
  var dropInner   = document.getElementById('photo-drop-inner');

  if (!file.type.startsWith('image/')) {
    resultEl.className = 'photo-result error';
    resultEl.textContent = 'Alleen afbeeldingen toegestaan (JPG, PNG, HEIC\u2026)';
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    resultEl.className = 'photo-result error';
    resultEl.textContent = 'Bestand te groot \u2014 maximum is 15 MB.';
    return;
  }

  if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
  previewImg.src = URL.createObjectURL(file);
  previewWrap.classList.remove('hidden');
  dropInner.classList.add('hidden');
  uploadingEl.classList.remove('hidden');
  resultEl.className = 'photo-result';
  resultEl.textContent = '';
  state.photoId = null;

  try {
    var form = new FormData();
    form.append('photo', file);
    var res  = await fetch(API + '/upload', { method: 'POST', body: form });
    var data = await res.json();
    uploadingEl.classList.add('hidden');

    if (!res.ok) {
      resultEl.className = 'photo-result error';
      resultEl.textContent = data.error || 'Upload mislukt. Probeer opnieuw.';
      return;
    }

    state.photoId   = data.photo_id;
    state.photoName = data.original_name;
    resultEl.className = 'photo-result ok';
    resultEl.textContent = '\u2713 Foto ge\u00fcpload (' + data.size_kb + ' KB)';
    onPhotoUploaded();

  } catch (e) {
    document.getElementById('photo-uploading').classList.add('hidden');
    resultEl.className = 'photo-result error';
    resultEl.textContent = 'Verbindingsfout bij uploaden. Probeer opnieuw.';
  }
}

function clearPhoto() {
  var previewImg = document.getElementById('photo-preview-img');
  if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
  previewImg.src = '';
  document.getElementById('photo-preview-wrap').classList.add('hidden');
  document.getElementById('photo-drop-inner').classList.remove('hidden');
  document.getElementById('photo-result').className = 'photo-result';
  document.getElementById('photo-result').textContent = '';
  document.getElementById('photo-input').value = '';
  state.photoId   = null;
  state.photoName = null;
}

function onPhotoUploaded() {
  setBlockNum(document.getElementById('bnum-2'), 'done');
  revealBlock('block-datum');
  setBlockNum(document.getElementById('bnum-3'), 'active');
  if (!state.calendarLoaded) {
    state.calendarLoaded = true;
    initCalendar();
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 3 — CALENDAR
// ═══════════════════════════════════════════════════════════

function initCalendar() {
  var now = new Date();
  state.calYear  = now.getFullYear();
  state.calMonth = now.getMonth() + 1;

  document.getElementById('cal-prev').addEventListener('click', function() {
    var now2 = new Date();
    if (state.calYear === now2.getFullYear() && state.calMonth === now2.getMonth() + 1) return;
    state.calMonth--;
    if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; }
    loadAndRenderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', function() {
    state.calMonth++;
    if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; }
    loadAndRenderCalendar();
  });

  loadAndRenderCalendar();
}

async function loadAndRenderCalendar() {
  var monthStr  = state.calYear + '-' + String(state.calMonth).padStart(2, '0');
  var loadingEl = document.getElementById('cal-loading');
  var gridEl    = document.getElementById('calendar-grid');
  loadingEl.classList.remove('hidden');
  gridEl.style.opacity = '.35';

  try {
    state.availability = await fetch(API + '/availability?month=' + monthStr).then(function(r) { return r.json(); });
  } catch(e) {
    state.availability = {};
  }

  loadingEl.classList.add('hidden');
  gridEl.style.opacity = '1';
  renderCalendar();
}

function renderCalendar() {
  document.getElementById('cal-month-label').textContent = new Date(state.calYear, state.calMonth - 1, 1)
    .toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

  var grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  ['Ma','Di','Wo','Do','Vr','Za','Zo'].forEach(function(d) {
    var h = document.createElement('div');
    h.className = 'cal-weekday-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  var firstDay = new Date(state.calYear, state.calMonth - 1, 1).getDay();
  var offset   = firstDay === 0 ? 6 : firstDay - 1;
  for (var i = 0; i < offset; i++) {
    var e = document.createElement('div');
    e.className = 'cal-day other-month';
    grid.appendChild(e);
  }

  var daysInMonth = new Date(state.calYear, state.calMonth, 0).getDate();
  var today = new Date(); today.setHours(0, 0, 0, 0);

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr   = state.calYear + '-' + String(state.calMonth).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var dayDate   = new Date(dateStr + 'T12:00:00Z');
    var dow       = dayDate.getUTCDay();
    var isWeekend = dow === 0 || dow === 6;
    var isPast    = dayDate < today;

    var cell = document.createElement('div');
    cell.className = 'cal-day';
    if (isWeekend) cell.classList.add('weekend');
    if (isPast)    cell.classList.add('past');

    var numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (!isWeekend && !isPast) {
      var avail   = state.availability[dateStr];
      var slotsEl = document.createElement('div');
      slotsEl.className = 'cal-slots';

      ['am', 'pm'].forEach(function(slot) {
        var isAvail    = avail ? avail[slot] : false;
        var isSelected = state.selectedDate === dateStr && state.selectedSlot === slot;

        var slotEl = document.createElement('div');
        slotEl.className = 'cal-slot ' + (isSelected ? 'selected' : (isAvail ? 'available' : 'full'));
        slotEl.textContent = slot === 'am' ? '09\u201313' : '13\u201317';
        slotEl.title = isAvail
          ? dateStr + ' \u2014 ' + (slot === 'am' ? '09:00\u201313:00' : '13:00\u201317:00')
          : 'Volgeboekt';

        if (isAvail && !isSelected) {
          (function(d2, s2) {
            slotEl.addEventListener('click', function() {
              state.selectedDate = d2;
              state.selectedSlot = s2;
              renderCalendar();
              updateQuote();
              onSlotSelected();
            });
          })(dateStr, slot);
        } else if (isSelected) {
          slotEl.addEventListener('click', function() {
            state.selectedDate = null;
            state.selectedSlot = null;
            renderCalendar();
            updateQuote();
          });
        }

        slotsEl.appendChild(slotEl);
      });
      cell.appendChild(slotsEl);
    }

    grid.appendChild(cell);
  }
}

function onSlotSelected() {
  setBlockNum(document.getElementById('bnum-3'), 'done');
  revealBlock('block-gegevens');
  setBlockNum(document.getElementById('bnum-4'), 'active');
  renderFormRecap();
}

// ═══════════════════════════════════════════════════════════
// STEP 4 — FORM
// ═══════════════════════════════════════════════════════════

function renderFormRecap() {
  var recap = document.getElementById('form-recap');
  if (!recap) return;

  var items   = getSelectedItems();
  var total   = getSubtotal() + state.surchargeEur;
  var slotTxt = '\u2014';
  if (state.selectedDate && state.selectedSlot) {
    var d = new Date(state.selectedDate + 'T12:00:00Z')
      .toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    var t = state.selectedSlot === 'am' ? '09:00 \u2013 13:00' : '13:00 \u2013 17:00';
    slotTxt = d + ' \u00b7 ' + t;
  }

  recap.innerHTML =
    '<div class="recap-label">Samenvatting</div>' +
    items.map(function(i) {
      return '<div class="recap-row"><span>' + escHtml(i.name) + '</span><span>\u20ac ' + fmtPrice(i.price) + '</span></div>';
    }).join('') +
    (state.surchargeEur > 0 ? '<div class="recap-row"><span>Reistoeslag</span><span>\u20ac ' + fmtPrice(state.surchargeEur) + '</span></div>' : '') +
    '<div class="recap-row recap-total"><span>Totaal excl. BTW</span><span>\u20ac ' + fmtPrice(total) + '</span></div>' +
    '<div class="recap-slot">\uD83D\uDCC5 ' + escHtml(slotTxt) + '</div>';
}

function initBookingForm() {
  document.getElementById('booking-form').addEventListener('submit', submitBooking);
}

async function submitBooking(e) {
  e.preventDefault();
  var form    = e.target;
  var btn     = document.getElementById('book-submit-btn');
  var name    = form.name.value.trim();
  var email   = form.email.value.trim();
  var address = form.address.value.trim();

  [form.name, form.email, form.address].forEach(function(f) { f.classList.remove('error'); });
  var valid = true;
  if (!name)                    { form.name.classList.add('error');    valid = false; }
  if (!email || !email.includes('@')) { form.email.classList.add('error'); valid = false; }
  if (!address)                 { form.address.classList.add('error'); valid = false; }
  if (!valid) return;

  if (!state.selectedDate || !state.selectedSlot) {
    alert('Ga terug naar stap 3 en selecteer een datum.');
    return;
  }
  if (!state.photoId) {
    alert('Ga terug naar stap 2 en upload een foto van uw groepenkast.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Bezig met versturen\u2026';

  try {
    var res = await fetch(API + '/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: state.selectedDate,
        slot: state.selectedSlot,
        customer: { name: name, email: email, postcode: state.postcodeRaw || '', address: address },
        services: getSelectedItems().map(function(i) { return { name: i.name, price: i.price }; }),
        total: getSubtotal() + state.surchargeEur,
        distance_km:   state.distanceKm,
        surcharge_eur: state.surchargeEur,
        notes:    form.notes.value.trim(),
        photo_id: state.photoId,
      }),
    });

    var data = await res.json();
    if (res.ok) {
      showSuccess(data.message);
    } else {
      alert(data.error || 'Er is een fout opgetreden. Probeer opnieuw.');
      btn.disabled = false;
      btn.textContent = 'Aanvraag versturen \u2713';
    }
  } catch(err) {
    alert('Verbindingsfout. Controleer uw internetverbinding en probeer opnieuw.');
    btn.disabled = false;
    btn.textContent = 'Aanvraag versturen \u2713';
  }
}

function showSuccess(message) {
  document.getElementById('offerte').style.display = 'none';
  var s = document.getElementById('booking-success');
  s.style.display = '';
  document.getElementById('success-message').textContent = message;
  s.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════════════
// CONTENT LOADER
// ═══════════════════════════════════════════════════════════

async function loadContent() {
  try {
    var content = await fetch(API + '/content').then(function(r) { return r.json(); });
    state.content = content;

    if (content.meta && content.meta.title) document.title = content.meta.title;
    if (content.meta && content.meta.description) {
      var m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', content.meta.description);
    }
    if (content.contact && content.contact.email) {
      document.querySelectorAll('#footer-email').forEach(function(el) {
        el.textContent = content.contact.email;
        el.href = 'mailto:' + content.contact.email;
      });
    }
    if (content.contact && content.contact.kvk) {
      var kvk = document.getElementById('footer-kvk');
      if (kvk) kvk.textContent = 'KVK: ' + content.contact.kvk;
    }
    if (content.contact && content.contact.btw) {
      var btw = document.getElementById('footer-btw');
      if (btw) btw.textContent = 'BTW: ' + content.contact.btw;
    }
    if (content.faq && content.faq.length) renderFAQ(content.faq);
    if (content.seo_content && content.seo_content.blocks && content.seo_content.blocks.length) {
      renderSEOBlocks(content.seo_content.blocks);
    }
  } catch(err) {
    console.error('Content load error:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════

function renderFAQ(faqItems) {
  var list = document.getElementById('faq-list');
  list.innerHTML = faqItems.map(function(item, i) {
    return '<div class="faq-item">' +
      '<div class="faq-q" data-idx="' + i + '" role="button" tabindex="0" aria-expanded="false">' +
      escHtml(item.question) + '<span class="faq-icon">+</span></div>' +
      '<div class="faq-a" id="faq-a-' + i + '">' + escHtml(item.answer) + '</div></div>';
  }).join('');

  list.querySelectorAll('.faq-q').forEach(function(q) {
    var toggle = function() {
      var idx    = q.dataset.idx;
      var answer = document.getElementById('faq-a-' + idx);
      var isOpen = q.classList.contains('open');
      list.querySelectorAll('.faq-q').forEach(function(el) { el.classList.remove('open'); });
      list.querySelectorAll('.faq-a').forEach(function(el) { el.classList.remove('open'); });
      if (!isOpen) { q.classList.add('open'); answer.classList.add('open'); }
    };
    q.addEventListener('click', toggle);
    q.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  var schemaEl = document.getElementById('faq-schema');
  if (schemaEl) schemaEl.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(function(item) {
      return { '@type': 'Question', name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer } };
    }),
  });
}

function renderSEOBlocks(blocks) {
  var container = document.getElementById('seo-blocks');
  if (!container) return;
  container.innerHTML = blocks.map(function(b) {
    return '<div class="seo-block"><h3>' + escHtml(b.heading) + '</h3><p>' + escHtml(b.text) + '</p></div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  var yrEl = document.getElementById('footer-year');
  if (yrEl) yrEl.textContent = new Date().getFullYear();

  loadContent();
  initTiles();
  initPostcode();
  initPhotoUpload();
  initBookingForm();

  document.querySelectorAll('a[href^="#"]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      var target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
});

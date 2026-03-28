/**
 * Groepenkastenservice — Offerte Builder v2
 */

var API = '/api';
var BTW = 1.21;

var PRICES = null;

var state = {
  type: null,

  nieuw: {
    fase: null,
    groepen: 10,
    groependPrice: 0,
    kookgroep: false,
    batterij: 'geen', laadpaal: 'geen', zonnepanelen: 'geen',
    beltrafo: false, overspanning: false, stopcontact: 0,
  },

  aanp: {
    naar3fase: false,
    extraGroepen: 0,
    kookgroep: false,
    batterij: 'geen', laadpaal: 'geen', zonnepanelen: 'geen',
    beltrafo: false, overspanning: false, stopcontact: 0,
  },

  postcodeRaw: '', distanceKm: 0, surchargeEur: 0,
  selectedDate: null, selectedSlot: null,
  calYear: null, calMonth: null,
  availability: {}, calLoaded: false,
  content: {},
};

/* ─── Helpers ────────────────────────────────────────────── */
function fmt(n) {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function fmtP(n) { return '\u20ac\u00a0' + fmt(n); }
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function connPrice(path, val) {
  if (!PRICES || val === 'geen') return 0;
  return val === '1fase' ? PRICES[path].conn_1fase : PRICES[path].conn_3fase;
}

/* ─── Price lines ────────────────────────────────────────── */
function linesNieuw() {
  if (!PRICES) return [];
  var n = state.nieuw;
  var lines = [];
  if (n.fase) {
    lines.push({ name: 'Groepenkast ' + (n.fase === '1fase' ? '1-fase' : '3-fase'), price: n.fase === '1fase' ? PRICES.nieuw.fase_1 : PRICES.nieuw.fase_3 });
    lines.push({ name: n.groepen + ' groepen', price: n.groependPrice });
  }
  if (n.kookgroep)             lines.push({ name: 'Kookgroep', price: PRICES.nieuw.kookgroep });
  if (n.batterij !== 'geen')   lines.push({ name: 'Batterij (' + n.batterij + ')', price: connPrice('nieuw', n.batterij) });
  if (n.laadpaal !== 'geen')   lines.push({ name: 'Laadpaal (' + n.laadpaal + ')', price: connPrice('nieuw', n.laadpaal) });
  if (n.zonnepanelen !== 'geen') lines.push({ name: 'Zonnepanelen (' + n.zonnepanelen + ')', price: connPrice('nieuw', n.zonnepanelen) });
  if (n.beltrafo)              lines.push({ name: 'Beltrafo', price: PRICES.nieuw.beltrafo });
  if (n.overspanning)          lines.push({ name: 'Overspanningsbeveiliging', price: PRICES.nieuw.overspanning });
  if (n.stopcontact > 0)       lines.push({ name: 'Extra stopcontact', price: PRICES.nieuw.stopcontact_per_stuk * n.stopcontact, qty: n.stopcontact });
  return lines;
}

function linesAanp() {
  if (!PRICES) return [];
  var a = state.aanp;
  var lines = [];
  if (a.naar3fase)             lines.push({ name: 'Uitbreiding naar 3-fase', price: PRICES.aanp.naar_3fase });
  if (a.extraGroepen > 0) {
    var p = PRICES.aanp.extra_groep_eerste + Math.max(0, a.extraGroepen - 1) * PRICES.aanp.extra_groep_extra;
    lines.push({ name: 'Extra groepen', price: p, qty: a.extraGroepen });
  }
  if (a.kookgroep)             lines.push({ name: 'Kookgroep', price: PRICES.aanp.kookgroep });
  if (a.batterij !== 'geen')   lines.push({ name: 'Batterij (' + a.batterij + ')', price: connPrice('aanp', a.batterij) });
  if (a.laadpaal !== 'geen')   lines.push({ name: 'Laadpaal (' + a.laadpaal + ')', price: connPrice('aanp', a.laadpaal) });
  if (a.zonnepanelen !== 'geen') lines.push({ name: 'Zonnepanelen (' + a.zonnepanelen + ')', price: connPrice('aanp', a.zonnepanelen) });
  if (a.beltrafo)              lines.push({ name: 'Beltrafo', price: PRICES.aanp.beltrafo });
  if (a.overspanning)          lines.push({ name: 'Overspanningsbeveiliging', price: PRICES.aanp.overspanning });
  if (a.stopcontact > 0)       lines.push({ name: 'Extra stopcontact', price: PRICES.aanp.stopcontact_per_stuk * a.stopcontact, qty: a.stopcontact });
  return lines;
}

function getLines() {
  if (state.type === 'nieuw') return linesNieuw();
  if (state.type === 'aanp')  return linesAanp();
  return [];
}

function getSubtotal() { return getLines().reduce(function(s, l) { return s + l.price; }, 0); }
function getTotal()    { return getSubtotal() + state.surchargeEur; }
function hasSelection() { return state.type !== null && getLines().length > 0; }

/* ─── Live offerte ───────────────────────────────────────── */
function updateOfferte() {
  var lines    = getLines();
  var exclBTW  = getTotal();
  var inclBTW  = Math.round(exclBTW * BTW * 100) / 100;
  var emptyEl  = document.getElementById('ob-quote-empty');
  var linesEl  = document.getElementById('ob-quote-lines');
  var totalsEl = document.getElementById('ob-quote-totals');
  var actionEl = document.getElementById('ob-quote-action');

  if (lines.length === 0 && state.surchargeEur === 0) {
    emptyEl.style.display = '';
    linesEl.innerHTML = '';
    totalsEl.classList.add('hidden');
    actionEl.classList.add('hidden');
    return;
  }

  emptyEl.style.display = 'none';
  totalsEl.classList.remove('hidden');
  actionEl.classList.remove('hidden');

  linesEl.innerHTML = lines.map(function(l) {
    var label = l.qty && l.qty > 1 ? esc(l.name) + ' (\u00d7' + l.qty + ')' : esc(l.name);
    return '<div class="ob-quote-line">' +
      '<span class="ob-ql-name">' + label + '</span>' +
      '<span class="ob-ql-price">' + fmtP(l.price) + '</span></div>';
  }).join('');

  var surchargeRow = document.getElementById('ob-surcharge-row');
  if (state.surchargeEur > 0) {
    surchargeRow.classList.remove('hidden');
    document.getElementById('ob-surcharge-km').textContent = Math.round(state.distanceKm - 20);
    document.getElementById('ob-surcharge-val').textContent = fmtP(state.surchargeEur);
  } else {
    surchargeRow.classList.add('hidden');
  }

  document.getElementById('ob-total-incl-val').textContent = fmtP(inclBTW);
  document.getElementById('ob-total-val').textContent = fmtP(exclBTW);
}

/* ─── Vul prijslabels in UI ──────────────────────────────── */
function vulPrijsLabels() {
  if (!PRICES) return;
  document.querySelectorAll('[data-price-ref]').forEach(function(el) {
    var ref   = el.getAttribute('data-price-ref');
    var parts = ref.split('.');
    var val   = PRICES[parts[0]] && PRICES[parts[0]][parts[1]];
    if (typeof val === 'number') {
      el.textContent = '+ ' + fmtP(val);
    }
  });
  state.nieuw.groependPrice = PRICES.nieuw.groepen_per_stuk * state.nieuw.groepen;
  updateNieuwGroepenHint();
}

/* ─── Init offerte builder ───────────────────────────────── */
function initOB() {

  // Type keuze
  document.querySelectorAll('.ob-type-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.ob-type-btn').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      state.type = btn.dataset.type;
      document.getElementById('picker-nieuw').classList.add('hidden');
      document.getElementById('picker-aanp').classList.add('hidden');
      document.getElementById('picker-' + state.type).classList.remove('hidden');
      updateOfferte();
    });
  });

  // Fase knoppen (nieuw)
  document.querySelectorAll('#fase-row .ob-opt-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#fase-row .ob-opt-btn').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      state.nieuw.fase = btn.dataset.val;
      updateOfferte();
    });
  });

  // Groepen picker nieuwe kast
  document.getElementById('nieuw-groepen-min').addEventListener('click', function() {
    if (state.nieuw.groepen <= 1) return;
    state.nieuw.groepen--;
    state.nieuw.groependPrice = PRICES ? state.nieuw.groepen * PRICES.nieuw.groepen_per_stuk : 0;
    document.getElementById('nieuw-groepen-val').textContent = state.nieuw.groepen;
    updateNieuwGroepenHint();
    updateOfferte();
  });
  document.getElementById('nieuw-groepen-plus').addEventListener('click', function() {
    if (state.nieuw.groepen >= 40) return;
    state.nieuw.groepen++;
    state.nieuw.groependPrice = PRICES ? state.nieuw.groepen * PRICES.nieuw.groepen_per_stuk : 0;
    document.getElementById('nieuw-groepen-val').textContent = state.nieuw.groepen;
    updateNieuwGroepenHint();
    updateOfferte();
  });

  // Groepen picker aanpassing
  document.getElementById('aanp-groepen-min').addEventListener('click', function() {
    if (state.aanp.extraGroepen <= 0) return;
    state.aanp.extraGroepen--;
    document.getElementById('aanp-groepen-val').textContent = state.aanp.extraGroepen;
    updateAanpHint();
    updateOfferte();
  });
  document.getElementById('aanp-groepen-plus').addEventListener('click', function() {
    if (state.aanp.extraGroepen >= 20) return;
    state.aanp.extraGroepen++;
    document.getElementById('aanp-groepen-val').textContent = state.aanp.extraGroepen;
    updateAanpHint();
    updateOfferte();
  });

  // Toggle rijen: kookgroep (eenvoudig aan/uit)
  document.querySelectorAll('.ob-toggle-row[data-id="kookgroep"]').forEach(function(row) {
    var path  = row.dataset.path;
    var input = row.querySelector('.ob-sw-input');
    input.addEventListener('change', function() {
      state[path].kookgroep = input.checked;
      updateOfferte();
    });
  });

  // Toggle rijen: conn (batterij / laadpaal / zonnepanelen)
  document.querySelectorAll('.ob-toggle-row[data-conn]').forEach(function(row) {
    var conn  = row.dataset.conn;
    var path  = row.dataset.path;
    var input = row.querySelector('.ob-sw-input');
    var opts  = document.getElementById(path + '-' + conn + '-opts');

    input.addEventListener('change', function() {
      if (input.checked) {
        opts.classList.add('open');
        // Standaard 1-fase selecteren
        if (state[path][conn] === 'geen') {
          state[path][conn] = '1fase';
          var rows = opts.querySelectorAll('.ob-radio-row');
          rows.forEach(function(r) { r.classList.remove('selected'); });
          if (rows[0]) rows[0].classList.add('selected');
        }
      } else {
        opts.classList.remove('open');
        state[path][conn] = 'geen';
        opts.querySelectorAll('.ob-radio-row').forEach(function(r) { r.classList.remove('selected'); });
      }
      updateOfferte();
    });

    // Radio rijen in opts
    opts.querySelectorAll('.ob-radio-row').forEach(function(radioRow) {
      radioRow.addEventListener('click', function() {
        opts.querySelectorAll('.ob-radio-row').forEach(function(r) { r.classList.remove('selected'); });
        radioRow.classList.add('selected');
        state[path][conn] = radioRow.dataset.val;
        updateOfferte();
      });
    });
  });

  // Checkboxen: naar3fase, beltrafo, overspanning
  document.querySelectorAll('.ob-check-row[data-path][data-id]').forEach(function(row) {
    var path = row.dataset.path;
    var id   = row.dataset.id;
    if (id === 'stopcontact') return;
    row.addEventListener('click', function(e) {
      if (e.target.closest('.ob-qty-ctrl')) return;
      var checked = row.classList.toggle('selected');
      row.setAttribute('aria-checked', checked ? 'true' : 'false');
      if (id === 'naar3fase') state.aanp.naar3fase = checked;
      else state[path][id] = checked;
      updateOfferte();
    });
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });
  });

  // Stopcontact toggle + qty
  document.querySelectorAll('.ob-check-row-qty[data-id="stopcontact"]').forEach(function(row) {
    var path = row.dataset.path;
    row.addEventListener('click', function(e) {
      if (e.target.closest('.ob-qty-ctrl')) return;
      var checked = row.classList.toggle('selected');
      var qtyEl   = document.getElementById(path + '-stopcontact-qty');
      if (checked) {
        state[path].stopcontact = 1;
        if (qtyEl) qtyEl.classList.remove('hidden');
      } else {
        state[path].stopcontact = 0;
        if (qtyEl) qtyEl.classList.add('hidden');
        var valEl = document.getElementById(path + '-stopcontact-val');
        if (valEl) valEl.textContent = '1';
        var prEl = document.getElementById(path + '-stopcontact-price');
        if (prEl && PRICES) prEl.textContent = '+ ' + fmtP(PRICES[path].stopcontact_per_stuk);
      }
      updateOfferte();
    });
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });
  });

  document.querySelectorAll('.ob-qty-btn[data-target]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var dir    = parseInt(btn.dataset.dir, 10);
      var target = btn.dataset.target;
      var path   = target.split('-')[0];
      var cur    = state[path].stopcontact;
      var nw     = Math.max(1, Math.min(20, cur + dir));
      state[path].stopcontact = nw;
      var valEl = document.getElementById(target + '-val');
      var prEl  = document.getElementById(target + '-price');
      if (valEl) valEl.textContent = nw;
      if (prEl && PRICES) prEl.textContent = '+ ' + fmtP(PRICES[path].stopcontact_per_stuk * nw);
      updateOfferte();
    });
  });

  // Verder knop
  document.getElementById('ob-to-booking').addEventListener('click', function() {
    if (!hasSelection()) return;
    var bookingEl = document.getElementById('booking');
    bookingEl.style.display = '';
    bookingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!state.calLoaded) { state.calLoaded = true; initKalender(); }
    document.getElementById('ob-postcode-bar').style.display = '';
  });
}

function updateNieuwGroepenHint() {
  var hint = document.getElementById('nieuw-groepen-hint');
  if (!hint || !PRICES) return;
  var n = state.nieuw.groepen;
  var p = n * PRICES.nieuw.groepen_per_stuk;
  hint.textContent = n + ' \u00d7 \u20ac' + PRICES.nieuw.groepen_per_stuk + ' = \u20ac' + fmt(p);
}

function updateAanpHint() {
  var hint = document.getElementById('aanp-groepen-hint');
  if (!hint || !PRICES) return;
  var n = state.aanp.extraGroepen;
  if (n === 0) { hint.textContent = ''; return; }
  var p = PRICES.aanp.extra_groep_eerste + Math.max(0, n - 1) * PRICES.aanp.extra_groep_extra;
  hint.textContent = fmtP(p) +
    (n === 1 ? ' (1e groep)' : ' (1e \u20ac' + PRICES.aanp.extra_groep_eerste + ' + ' + (n - 1) + '\u00d7\u20ac' + PRICES.aanp.extra_groep_extra + ')');
}

/* ─── Postcode ───────────────────────────────────────────── */
function initPostcode() {
  var btn   = document.getElementById('postcode-btn');
  var input = document.getElementById('postcode-input');
  if (!btn) return;
  btn.addEventListener('click', checkPostcode);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); checkPostcode(); }
  });
}

function checkPostcode() {
  var input  = document.getElementById('postcode-input');
  var result = document.getElementById('postcode-result');
  var raw    = input.value.replace(/\s/g, '').toUpperCase();

  if (!/^\d{4}[A-Z]{2}$/.test(raw)) {
    result.className = 'postcode-result error';
    result.textContent = 'Voer een geldige postcode in (bijv. 3141 AP)';
    return;
  }

  result.className = 'postcode-result';
  result.textContent = 'Controleren\u2026';

  var query = raw.slice(0, 4) + ' ' + raw.slice(4);
  fetch('https://nominatim.openstreetmap.org/search?postalcode=' + encodeURIComponent(query) + '&country=NL&format=json&limit=1',
    { headers: { 'Accept-Language': 'nl' } }
  ).then(function(r) { return r.json(); }).then(function(geo) {
    if (!geo.length) {
      result.className = 'postcode-result error';
      result.textContent = 'Postcode niet gevonden.';
      return;
    }
    return fetch(API + '/distance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: parseFloat(geo[0].lat), lon: parseFloat(geo[0].lon) }),
    }).then(function(r) { return r.json(); }).then(function(d) {
      state.distanceKm   = d.distance_km;
      state.surchargeEur = d.surcharge_eur;
      state.postcodeRaw  = raw;
      if (d.within_free_zone) {
        result.className = 'postcode-result ok';
        result.textContent = '\u2713 Binnen rijbereik (' + d.distance_km + ' km) \u2014 geen reistoeslag';
      } else {
        result.className = 'postcode-result ok-surcharge';
        result.textContent = d.distance_km + ' km \u2014 reistoeslag ' + fmtP(d.surcharge_eur);
      }
      updateOfferte();
    });
  }).catch(function() {
    result.className = 'postcode-result error';
    result.textContent = 'Kon postcode niet controleren. Probeer opnieuw.';
  });
}

/* ─── Kalender ───────────────────────────────────────────── */
function initKalender() {
  var now = new Date();
  state.calYear  = now.getFullYear();
  state.calMonth = now.getMonth() + 1;

  document.getElementById('cal-prev').addEventListener('click', function() {
    var now2 = new Date();
    if (state.calYear === now2.getFullYear() && state.calMonth === now2.getMonth() + 1) return;
    state.calMonth--;
    if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; }
    laadKalender();
  });
  document.getElementById('cal-next').addEventListener('click', function() {
    state.calMonth++;
    if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; }
    laadKalender();
  });
  laadKalender();
}

function laadKalender() {
  var m = state.calYear + '-' + String(state.calMonth).padStart(2, '0');
  document.getElementById('cal-loading').classList.remove('hidden');
  document.getElementById('calendar-grid').style.opacity = '.3';
  fetch(API + '/availability?month=' + m)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      state.availability = d;
      document.getElementById('cal-loading').classList.add('hidden');
      document.getElementById('calendar-grid').style.opacity = '1';
      renderKalender();
    })
    .catch(function() {
      state.availability = {};
      document.getElementById('cal-loading').classList.add('hidden');
      document.getElementById('calendar-grid').style.opacity = '1';
      renderKalender();
    });
}

function renderKalender() {
  document.getElementById('cal-month-label').textContent =
    new Date(state.calYear, state.calMonth - 1, 1)
      .toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

  var grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].forEach(function(d) {
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

  var days  = new Date(state.calYear, state.calMonth, 0).getDate();
  var today = new Date(); today.setHours(0, 0, 0, 0);

  for (var d = 1; d <= days; d++) {
    var ds  = state.calYear + '-' + String(state.calMonth).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var dd  = new Date(ds + 'T12:00:00Z');
    var dow = dd.getUTCDay();

    var cell = document.createElement('div');
    cell.className = 'cal-day';
    if (dow === 0 || dow === 6) cell.classList.add('weekend');
    if (dd < today)             cell.classList.add('past');

    var numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (!(dow === 0 || dow === 6) && !(dd < today)) {
      var avail   = state.availability[ds];
      var slotsEl = document.createElement('div');
      slotsEl.className = 'cal-slots';

      ['am', 'pm'].forEach(function(slot) {
        var isAvail    = avail ? avail[slot] : false;
        var isSelected = state.selectedDate === ds && state.selectedSlot === slot;
        var slotEl     = document.createElement('div');
        slotEl.className = 'cal-slot ' + (isSelected ? 'selected' : (isAvail ? 'available' : 'full'));
        slotEl.textContent = slot === 'am' ? '09\u201313' : '13\u201317';

        if (isAvail && !isSelected) {
          (function(d2, s2) {
            slotEl.addEventListener('click', function() {
              state.selectedDate = d2;
              state.selectedSlot = s2;
              renderKalender();
              toonFormulier();
            });
          })(ds, slot);
        } else if (isSelected) {
          slotEl.addEventListener('click', function() {
            state.selectedDate = null;
            state.selectedSlot = null;
            renderKalender();
            document.getElementById('booking-form-wrap').style.display = 'none';
          });
        }
        slotsEl.appendChild(slotEl);
      });
      cell.appendChild(slotsEl);
    }
    grid.appendChild(cell);
  }
}

function toonFormulier() {
  var wrap  = document.getElementById('booking-form-wrap');
  var label = document.getElementById('selected-slot-label');
  if (!state.selectedDate || !state.selectedSlot) { wrap.style.display = 'none'; return; }

  var d = new Date(state.selectedDate + 'T12:00:00Z')
    .toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  var t = state.selectedSlot === 'am' ? '09:00 \u2013 13:00' : '13:00 \u2013 17:00';
  label.textContent = d + ' \u00b7 ' + t;

  var lines    = getLines();
  var exclBTW  = getTotal();
  var inclBTW  = Math.round(exclBTW * BTW * 100) / 100;
  var summaryEl = document.getElementById('form-summary');
  summaryEl.innerHTML =
    '<div class="form-summary-label">Samenvatting</div>' +
    lines.map(function(l) {
      var name = l.qty && l.qty > 1 ? esc(l.name) + ' (\u00d7' + l.qty + ')' : esc(l.name);
      return '<div class="form-summary-row"><span>' + name + '</span><span>' + fmtP(l.price) + '</span></div>';
    }).join('') +
    (state.surchargeEur > 0
      ? '<div class="form-summary-row"><span>Reistoeslag</span><span>' + fmtP(state.surchargeEur) + '</span></div>'
      : '') +
    '<div class="form-summary-row form-summary-total"><span>Totaal incl. BTW</span><span>' + fmtP(inclBTW) + '</span></div>' +
    '<div class="form-summary-row" style="font-size:.8rem;color:var(--gray-400)"><span>Excl. BTW</span><span>' + fmtP(exclBTW) + '</span></div>';

  wrap.style.display = '';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ─── Formulier ──────────────────────────────────────────── */
function initFormulier() {
  document.getElementById('booking-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var form    = e.target;
    var btn     = document.getElementById('book-submit-btn');
    var name    = form.name.value.trim();
    var email   = form.email.value.trim();
    var address = form.address.value.trim();

    [form.name, form.email, form.address].forEach(function(f) { f.classList.remove('error'); });
    var valid = true;
    if (!name)                         { form.name.classList.add('error');    valid = false; }
    if (!email || !email.includes('@')) { form.email.classList.add('error'); valid = false; }
    if (!address)                      { form.address.classList.add('error'); valid = false; }
    if (!valid) return;

    if (!state.selectedDate || !state.selectedSlot) {
      alert('Selecteer eerst een datum en tijdslot in de agenda.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Versturen\u2026';

    var lines = getLines();
    fetch(API + '/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: state.selectedDate, slot: state.selectedSlot,
        customer: { name: name, email: email, postcode: state.postcodeRaw || '', address: address },
        services: lines.map(function(l) { return { name: l.name, price: l.price }; }),
        total: getTotal(),
        distance_km: state.distanceKm, surcharge_eur: state.surchargeEur,
        notes: form.notes.value.trim(),
      }),
    }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      if (res.ok) {
        document.getElementById('offerte').style.display = 'none';
        document.getElementById('booking').style.display = 'none';
        var s = document.getElementById('booking-success');
        s.style.display = '';
        document.getElementById('success-message').textContent = res.data.message;
        s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        alert(res.data.error || 'Er is een fout opgetreden. Probeer opnieuw.');
        btn.disabled = false;
        btn.textContent = 'Afspraak bevestigen \u2713';
      }
    }).catch(function() {
      alert('Verbindingsfout. Controleer uw internetverbinding en probeer opnieuw.');
      btn.disabled = false;
      btn.textContent = 'Afspraak bevestigen \u2713';
    });
  });
}

/* ─── Prices laden ───────────────────────────────────────── */
function laadPrijzen() {
  return fetch(API + '/prices')
    .then(function(r) { return r.json(); })
    .then(function(p) {
      PRICES = p;
      state.nieuw.groependPrice = p.nieuw.groepen_per_stuk * state.nieuw.groepen;
      vulPrijsLabels();
      updateOfferte();
    })
    .catch(function(e) { console.error('Prijzen laden mislukt:', e); });
}

/* ─── Content (CMS) ──────────────────────────────────────── */
function laadContent() {
  fetch(API + '/content')
    .then(function(r) { return r.json(); })
    .then(function(c) {
      state.content = c;
      if (c.meta && c.meta.title) document.title = c.meta.title;
      if (c.meta && c.meta.description) {
        var m = document.querySelector('meta[name="description"]');
        if (m) m.setAttribute('content', c.meta.description);
      }
      if (c.contact && c.contact.email) {
        var el = document.getElementById('footer-email');
        if (el) { el.textContent = c.contact.email; el.href = 'mailto:' + c.contact.email; }
      }
      if (c.contact && c.contact.kvk) {
        var k = document.getElementById('footer-kvk');
        if (k) k.textContent = 'KVK: ' + c.contact.kvk;
      }
      if (c.contact && c.contact.btw) {
        var b = document.getElementById('footer-btw');
        if (b) b.textContent = 'BTW: ' + c.contact.btw;
      }
      if (c.faq && c.faq.length) renderFAQ(c.faq);
      if (c.seo_content && c.seo_content.blocks) renderSEO(c.seo_content.blocks);
    })
    .catch(function(e) { console.error('Content error:', e); });
}

function renderFAQ(items) {
  var list = document.getElementById('faq-list');
  list.innerHTML = items.map(function(item, i) {
    return '<div class="faq-item">' +
      '<div class="faq-q" data-idx="' + i + '" role="button" tabindex="0">' +
      esc(item.question) + '<span class="faq-icon">+</span></div>' +
      '<div class="faq-a" id="faq-a-' + i + '">' + esc(item.answer) + '</div></div>';
  }).join('');

  list.querySelectorAll('.faq-q').forEach(function(q) {
    var toggle = function() {
      var a    = document.getElementById('faq-a-' + q.dataset.idx);
      var open = q.classList.contains('open');
      list.querySelectorAll('.faq-q').forEach(function(el) { el.classList.remove('open'); });
      list.querySelectorAll('.faq-a').forEach(function(el) { el.classList.remove('open'); });
      if (!open) { q.classList.add('open'); a.classList.add('open'); }
    };
    q.addEventListener('click', toggle);
    q.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  var schema = document.getElementById('faq-schema');
  if (schema) schema.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(function(item) {
      return { '@type': 'Question', name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer } };
    }),
  });
}

function renderSEO(blocks) {
  var c = document.getElementById('seo-blocks');
  if (!c || !blocks) return;
  c.innerHTML = blocks.map(function(b) {
    return '<div class="seo-block"><h3>' + esc(b.heading) + '</h3><p>' + esc(b.text) + '</p></div>';
  }).join('');
}

/* ─── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  var yr = document.getElementById('footer-year');
  if (yr) yr.textContent = new Date().getFullYear();

  laadContent();
  laadPrijzen().then(function() {
    initOB();
    initPostcode();
    initFormulier();
  });

  document.querySelectorAll('a[href^="#"]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      var t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
});

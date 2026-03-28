var API = '/api';

/* ─── State ──────────────────────────────────────────────── */
var state = {
  type: null,   // 'nieuw' | 'aanp'

  nieuw: {
    fase: null,          // '1fase' | '3fase'
    groepen: 10,
    groependPrice: 500,
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
  photoId: null, photoName: null,
  selectedDate: null, selectedSlot: null,
  calYear: null, calMonth: null,
  availability: {}, calLoaded: false,
  content: {},
};

/* ─── Helpers ────────────────────────────────────────────── */
function fmt(n) {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function connPrice(val) {
  return val === '1fase' ? 150 : val === '3fase' ? 250 : 0;
}

function calcNieuwLines() {
  var n = state.nieuw;
  var lines = [];
  if (n.fase) {
    lines.push({ name: 'Groepenkast ' + (n.fase === '1fase' ? '1-fase' : '3-fase'), price: n.fase === '1fase' ? 350 : 450 });
    lines.push({ name: n.groepen + ' groepen', price: n.groependPrice });
  }
  if (n.kookgroep)   lines.push({ name: 'Kookgroep', price: 110 });
  if (n.batterij !== 'geen')     lines.push({ name: 'Batterij aansluiting (' + n.batterij + ')', price: connPrice(n.batterij) });
  if (n.laadpaal !== 'geen')     lines.push({ name: 'Laadpaal aansluiting (' + n.laadpaal + ')', price: connPrice(n.laadpaal) });
  if (n.zonnepanelen !== 'geen') lines.push({ name: 'Zonnepanelen aansluiting (' + n.zonnepanelen + ')', price: connPrice(n.zonnepanelen) });
  if (n.beltrafo)    lines.push({ name: 'Beltrafo', price: 100 });
  if (n.overspanning) lines.push({ name: 'Overspanningsbeveiliging', price: 250 });
  if (n.stopcontact > 0) lines.push({ name: 'Extra stopcontact', price: 65 * n.stopcontact, qty: n.stopcontact });
  return lines;
}

function calcAanpLines() {
  var a = state.aanp;
  var lines = [];
  if (a.naar3fase) lines.push({ name: 'Uitbreiding naar 3-fase', price: 250 });
  if (a.extraGroepen > 0) {
    var p = 100 + Math.max(0, a.extraGroepen - 1) * 65;
    lines.push({ name: 'Extra groepen', price: p, qty: a.extraGroepen });
  }
  if (a.kookgroep)   lines.push({ name: 'Kookgroep', price: 110 });
  if (a.batterij !== 'geen')     lines.push({ name: 'Batterij aansluiting (' + a.batterij + ')', price: connPrice(a.batterij) });
  if (a.laadpaal !== 'geen')     lines.push({ name: 'Laadpaal aansluiting (' + a.laadpaal + ')', price: connPrice(a.laadpaal) });
  if (a.zonnepanelen !== 'geen') lines.push({ name: 'Zonnepanelen aansluiting (' + a.zonnepanelen + ')', price: connPrice(a.zonnepanelen) });
  if (a.beltrafo)    lines.push({ name: 'Beltrafo', price: 100 });
  if (a.overspanning) lines.push({ name: 'Overspanningsbeveiliging', price: 250 });
  if (a.stopcontact > 0) lines.push({ name: 'Extra stopcontact', price: 65 * a.stopcontact, qty: a.stopcontact });
  return lines;
}

function getLines() {
  if (state.type === 'nieuw') return calcNieuwLines();
  if (state.type === 'aanp')  return calcAanpLines();
  return [];
}

function getSubtotal() { return getLines().reduce(function(s,l){ return s+l.price; }, 0); }
function getTotal()    { return getSubtotal() + state.surchargeEur; }

function hasSelection() {
  if (!state.type) return false;
  if (state.type === 'nieuw') return state.nieuw.fase !== null;
  if (state.type === 'aanp') {
    var a = state.aanp;
    return a.naar3fase || a.extraGroepen > 0 || a.kookgroep ||
      a.batterij !== 'geen' || a.laadpaal !== 'geen' || a.zonnepanelen !== 'geen' ||
      a.beltrafo || a.overspanning || a.stopcontact > 0;
  }
  return false;
}

function reveal(id) {
  var el = document.getElementById(id);
  if (el && !el.classList.contains('open')) {
    el.classList.add('open');
    setTimeout(function(){ el.scrollIntoView({ behavior:'smooth', block:'start' }); }, 120);
  }
}

function setNum(id, st) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('active','done');
  if (st) el.classList.add(st);
}

/* ─── Offerte bijwerken ──────────────────────────────────── */
function updateOfferte() {
  var lines      = getLines();
  var total      = getTotal();
  var emptyEl    = document.getElementById('qb-quote-empty');
  var itemsEl    = document.getElementById('qb-quote-items');
  var totalBlock = document.getElementById('qb-total-block');
  var contWrap   = document.getElementById('qb-continue-wrap');

  if (lines.length === 0 && state.surchargeEur === 0) {
    emptyEl.classList.remove('hidden');
    itemsEl.innerHTML = '';
    totalBlock.classList.add('hidden');
    contWrap.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  totalBlock.classList.remove('hidden');
  contWrap.classList.remove('hidden');

  itemsEl.innerHTML = lines.map(function(l) {
    var label = l.qty && l.qty > 1 ? esc(l.name) + ' (&times;' + l.qty + ')' : esc(l.name);
    return '<div class="qb-quote-item">' +
      '<span class="qbi-name">' + label + '</span>' +
      '<span class="qbi-price">&euro;&nbsp;' + fmt(l.price) + '</span></div>';
  }).join('');

  var surchargeRow = document.getElementById('qb-surcharge-row');
  if (state.surchargeEur > 0) {
    surchargeRow.classList.remove('hidden');
    document.getElementById('qb-surcharge-km').textContent = Math.round(state.distanceKm - 20);
    document.getElementById('qb-surcharge-val').textContent = '\u20ac\u00a0' + fmt(state.surchargeEur);
  } else {
    surchargeRow.classList.add('hidden');
  }

  document.getElementById('qb-total-val').textContent = '\u20ac\u00a0' + fmt(total);
}

/* ─── Quote Builder ──────────────────────────────────────── */
function initQB() {

  // Type keuze
  document.querySelectorAll('.type-card').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var type = btn.dataset.type;
      document.querySelectorAll('.type-card').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
      state.type = type;

      document.getElementById('picker-nieuw').classList.add('hidden');
      document.getElementById('picker-aanp').classList.add('hidden');
      document.getElementById('picker-' + type).classList.remove('hidden');

      updateOfferte();
    });
  });

  // Fase knoppen (nieuw)
  document.querySelectorAll('#fase-keuze-nieuw .fase-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#fase-keuze-nieuw .fase-btn').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
      state.nieuw.fase = btn.dataset.fase;
      updateOfferte();
    });
  });

  // Groepen knoppen (nieuw)
  document.querySelectorAll('#groepen-keuze .groep-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#groepen-keuze .groep-btn').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
      var g = btn.dataset.groepen;
      var customWrap = document.getElementById('groep-custom-wrap');
      if (g === 'custom') {
        customWrap.classList.remove('hidden');
        var inp = document.getElementById('groep-custom-input');
        var n = parseInt(inp.value, 10);
        state.nieuw.groepen = isNaN(n) || n < 1 ? null : n;
        state.nieuw.groependPrice = isNaN(n) || n < 1 ? 0 : n * 50;
      } else {
        customWrap.classList.add('hidden');
        state.nieuw.groepen = parseInt(g, 10);
        state.nieuw.groependPrice = parseInt(btn.dataset.price, 10);
      }
      updateOfferte();
    });
  });

  // Custom groepen input
  document.getElementById('groep-custom-input').addEventListener('input', function() {
    var n = parseInt(this.value, 10);
    if (n >= 1) {
      state.nieuw.groepen = n;
      state.nieuw.groependPrice = n * 50;
      updateOfferte();
    }
  });

  // Conn knoppen (batterij / laadpaal / zonnepanelen) — both paths
  document.querySelectorAll('.conn-keuze').forEach(function(group) {
    var conn = group.dataset.conn;
    var path = group.dataset.path;
    group.querySelectorAll('.conn-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        group.querySelectorAll('.conn-btn').forEach(function(b){ b.classList.remove('selected'); });
        btn.classList.add('selected');
        state[path][conn] = btn.dataset.val;
        updateOfferte();
      });
    });
  });

  // Checkboxes (qb-row-check) — kookgroep + naar3fase
  document.querySelectorAll('.qb-row-check[data-path]').forEach(function(row) {
    var path = row.dataset.path;
    var id   = row.dataset.id;
    row.addEventListener('click', function() {
      var checked = row.classList.toggle('selected');
      row.setAttribute('aria-checked', checked ? 'true' : 'false');
      state[path][id] = checked;
      updateOfferte();
    });
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });
  });

  // Extra groepen picker (aanp)
  var aanpGroepenVal = 0;
  document.getElementById('aanp-groepen-min').addEventListener('click', function() {
    if (aanpGroepenVal <= 0) return;
    aanpGroepenVal--;
    state.aanp.extraGroepen = aanpGroepenVal;
    document.getElementById('aanp-groepen-val').textContent = aanpGroepenVal;
    updateAanpGroepenHint();
    updateOfferte();
  });
  document.getElementById('aanp-groepen-plus').addEventListener('click', function() {
    if (aanpGroepenVal >= 20) return;
    aanpGroepenVal++;
    state.aanp.extraGroepen = aanpGroepenVal;
    document.getElementById('aanp-groepen-val').textContent = aanpGroepenVal;
    updateAanpGroepenHint();
    updateOfferte();
  });

  // Extra rows (beltrafo, overspanning, stopcontact) — both paths
  document.querySelectorAll('.extra-row').forEach(function(row) {
    var path = row.dataset.path;
    var id   = row.dataset.id;
    row.addEventListener('click', function(e) {
      if (e.target.closest('.extra-qty-ctrl')) return;
      var checked = row.classList.toggle('selected');
      row.setAttribute('aria-checked', checked ? 'true' : 'false');
      if (id === 'stopcontact') {
        var qtyEl = document.getElementById(path + '-stopcontact-qty');
        if (checked) {
          state[path].stopcontact = 1;
          if (qtyEl) qtyEl.classList.remove('hidden');
        } else {
          state[path].stopcontact = 0;
          if (qtyEl) qtyEl.classList.add('hidden');
          var valEl = document.getElementById(path + '-stopcontact-val');
          if (valEl) valEl.textContent = '1';
          var prEl = document.getElementById(path + '-stopcontact-price');
          if (prEl) prEl.textContent = '+ \u20ac 65';
        }
      } else {
        state[path][id] = checked;
      }
      updateOfferte();
    });
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });
  });

  // Stopcontact qty knoppen — both paths
  document.querySelectorAll('.extra-qty-ctrl .qty-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var dir    = parseInt(btn.dataset.dir, 10);
      var target = btn.dataset.target; // e.g. 'nieuw-stopcontact' or 'aanp-stopcontact'
      var parts  = target.split('-');
      var path   = parts[0];
      var cur    = state[path].stopcontact;
      var nw     = Math.max(1, Math.min(20, cur + dir));
      state[path].stopcontact = nw;
      var valEl = document.getElementById(target + '-val');
      var prEl  = document.getElementById(target + '-price');
      if (valEl) valEl.textContent = nw;
      if (prEl)  prEl.textContent  = '+ \u20ac ' + fmt(65 * nw);
      updateOfferte();
    });
  });

  // Verder knop
  document.getElementById('qb-continue').addEventListener('click', function() {
    if (!hasSelection()) return;
    reveal('block-situatie');
  });
}

function updateAanpGroepenHint() {
  var n = state.aanp.extraGroepen;
  var hint = document.getElementById('aanp-groepen-hint');
  if (!hint) return;
  if (n === 0) { hint.textContent = ''; return; }
  var price = 100 + Math.max(0, n - 1) * 65;
  hint.textContent = '\u20ac ' + fmt(price) + (n === 1 ? ' (1e groep)' : ' (1e \u20ac100 + ' + (n-1) + '\u00d7\u20ac65)');
}

/* ─── Stap 2: Postcode ───────────────────────────────────── */
function initPostcode() {
  var btn   = document.getElementById('postcode-btn');
  var input = document.getElementById('postcode-input');
  btn.addEventListener('click', checkPostcode);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); checkPostcode(); }
  });
}

function checkPostcode() {
  var input  = document.getElementById('postcode-input');
  var result = document.getElementById('postcode-result');
  var raw    = input.value.replace(/\s/g,'').toUpperCase();

  if (!/^\d{4}[A-Z]{2}$/.test(raw)) {
    result.className = 'postcode-result error';
    result.textContent = 'Voer een geldige postcode in (bijv. 3141 AP)';
    return;
  }

  result.className = 'postcode-result';
  result.textContent = 'Controleren\u2026';

  var query = raw.slice(0,4) + ' ' + raw.slice(4);
  fetch('https://nominatim.openstreetmap.org/search?postalcode=' + encodeURIComponent(query) + '&country=NL&format=json&limit=1',
    { headers: { 'Accept-Language': 'nl' } }
  ).then(function(r){ return r.json(); }).then(function(geo) {
    if (!geo.length) {
      result.className = 'postcode-result error';
      result.textContent = 'Postcode niet gevonden.';
      return;
    }
    return fetch(API + '/distance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: parseFloat(geo[0].lat), lon: parseFloat(geo[0].lon) }),
    }).then(function(r){ return r.json(); }).then(function(d) {
      state.distanceKm   = d.distance_km;
      state.surchargeEur = d.surcharge_eur;
      state.postcodeRaw  = raw;
      if (d.within_free_zone) {
        result.className = 'postcode-result ok';
        result.textContent = '\u2713 Binnen rijbereik (' + d.distance_km + ' km) \u2014 geen reistoeslag';
      } else {
        result.className = 'postcode-result ok-surcharge';
        result.textContent = d.distance_km + ' km \u2014 reistoeslag +\u20ac' + fmt(d.surcharge_eur);
      }
      updateOfferte();
    });
  }).catch(function() {
    result.className = 'postcode-result error';
    result.textContent = 'Kon postcode niet controleren. Probeer opnieuw.';
  });
}

/* ─── Stap 2: Foto upload ────────────────────────────────── */
function initFoto() {
  var dropZone  = document.getElementById('photo-drop');
  var fileInput = document.getElementById('photo-input');
  var dropInner = document.getElementById('photo-drop-inner');

  dropInner.addEventListener('click', function(){ fileInput.click(); });
  fileInput.addEventListener('change', function() {
    if (fileInput.files && fileInput.files[0]) verwerkFoto(fileInput.files[0]);
  });
  dropZone.addEventListener('dragover', function(e){ e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', function(){ dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) verwerkFoto(e.dataTransfer.files[0]);
  });
  document.getElementById('photo-remove').addEventListener('click', verwijderFoto);
}

function verwerkFoto(file) {
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

  var fd = new FormData();
  fd.append('photo', file);
  fetch(API + '/upload', { method: 'POST', body: fd })
    .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      uploadingEl.classList.add('hidden');
      if (!res.ok) {
        resultEl.className = 'photo-result error';
        resultEl.textContent = res.data.error || 'Upload mislukt. Probeer opnieuw.';
        return;
      }
      state.photoId   = res.data.photo_id;
      state.photoName = res.data.original_name;
      resultEl.className = 'photo-result ok';
      resultEl.textContent = '\u2713 Foto ge\u00fcpload (' + res.data.size_kb + ' KB)';
      setNum('bnum-3', 'active');
      reveal('block-datum');
      if (!state.calLoaded) { state.calLoaded = true; initKalender(); }
    })
    .catch(function() {
      document.getElementById('photo-uploading').classList.add('hidden');
      resultEl.className = 'photo-result error';
      resultEl.textContent = 'Verbindingsfout bij uploaden. Probeer opnieuw.';
    });
}

function verwijderFoto() {
  var img = document.getElementById('photo-preview-img');
  if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = '';
  document.getElementById('photo-preview-wrap').classList.add('hidden');
  document.getElementById('photo-drop-inner').classList.remove('hidden');
  document.getElementById('photo-result').className = 'photo-result';
  document.getElementById('photo-result').textContent = '';
  document.getElementById('photo-input').value = '';
  state.photoId = null; state.photoName = null;
}

/* ─── Stap 3: Kalender ───────────────────────────────────── */
function initKalender() {
  var now = new Date();
  state.calYear  = now.getFullYear();
  state.calMonth = now.getMonth() + 1;

  document.getElementById('cal-prev').addEventListener('click', function() {
    var now2 = new Date();
    if (state.calYear === now2.getFullYear() && state.calMonth === now2.getMonth()+1) return;
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
  var m = state.calYear + '-' + String(state.calMonth).padStart(2,'0');
  document.getElementById('cal-loading').classList.remove('hidden');
  document.getElementById('calendar-grid').style.opacity = '.3';
  fetch(API + '/availability?month=' + m)
    .then(function(r){ return r.json(); })
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
    new Date(state.calYear, state.calMonth-1, 1)
      .toLocaleDateString('nl-NL', { month:'long', year:'numeric' });

  var grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  ['Ma','Di','Wo','Do','Vr','Za','Zo'].forEach(function(d) {
    var h = document.createElement('div');
    h.className = 'cal-weekday-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  var firstDay = new Date(state.calYear, state.calMonth-1, 1).getDay();
  var offset   = firstDay === 0 ? 6 : firstDay - 1;
  for (var i = 0; i < offset; i++) {
    var empty = document.createElement('div');
    empty.className = 'cal-day other-month';
    grid.appendChild(empty);
  }

  var days  = new Date(state.calYear, state.calMonth, 0).getDate();
  var today = new Date(); today.setHours(0,0,0,0);

  for (var d = 1; d <= days; d++) {
    var ds  = state.calYear + '-' + String(state.calMonth).padStart(2,'0') + '-' + String(d).padStart(2,'0');
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

      ['am','pm'].forEach(function(slot) {
        var isAvail    = avail ? avail[slot] : false;
        var isSelected = state.selectedDate === ds && state.selectedSlot === slot;
        var slotEl     = document.createElement('div');
        slotEl.className = 'cal-slot ' + (isSelected ? 'selected' : (isAvail ? 'available' : 'full'));
        slotEl.textContent = slot === 'am' ? '09\u201313' : '13\u201317';

        if (isAvail && !isSelected) {
          (function(d2,s2) {
            slotEl.addEventListener('click', function() {
              state.selectedDate = d2; state.selectedSlot = s2;
              renderKalender(); updateOfferte();
              setNum('bnum-3','done'); setNum('bnum-4','active');
              reveal('block-gegevens'); vulRecapIn();
            });
          })(ds, slot);
        } else if (isSelected) {
          slotEl.addEventListener('click', function() {
            state.selectedDate = null; state.selectedSlot = null;
            renderKalender(); updateOfferte(); setNum('bnum-3','active');
          });
        }
        slotsEl.appendChild(slotEl);
      });
      cell.appendChild(slotsEl);
    }
    grid.appendChild(cell);
  }
}

/* ─── Stap 4: Formulier ──────────────────────────────────── */
function vulRecapIn() {
  var recap = document.getElementById('form-recap');
  if (!recap) return;
  var lines = getLines();
  var total = getTotal();
  var slot  = '\u2014';
  if (state.selectedDate && state.selectedSlot) {
    var d = new Date(state.selectedDate + 'T12:00:00Z')
      .toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC' });
    var t = state.selectedSlot === 'am' ? '09:00 \u2013 13:00' : '13:00 \u2013 17:00';
    slot = d + ' \u00b7 ' + t;
  }
  recap.innerHTML =
    '<div class="recap-label">Samenvatting</div>' +
    lines.map(function(l) {
      var label = l.qty && l.qty > 1 ? esc(l.name) + ' (\u00d7' + l.qty + ')' : esc(l.name);
      return '<div class="recap-row"><span>' + label + '</span><span>\u20ac ' + fmt(l.price) + '</span></div>';
    }).join('') +
    (state.surchargeEur > 0
      ? '<div class="recap-row"><span>Reistoeslag</span><span>\u20ac ' + fmt(state.surchargeEur) + '</span></div>'
      : '') +
    '<div class="recap-row recap-total"><span>Totaal excl. BTW</span><span>\u20ac ' + fmt(total) + '</span></div>' +
    '<div class="recap-slot">\uD83D\uDCC5 ' + esc(slot) + '</div>';
}

function initFormulier() {
  document.getElementById('booking-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var form    = e.target;
    var btn     = document.getElementById('book-submit-btn');
    var name    = form.name.value.trim();
    var email   = form.email.value.trim();
    var address = form.address.value.trim();

    [form.name, form.email, form.address].forEach(function(f){ f.classList.remove('error'); });
    var valid = true;
    if (!name)                     { form.name.classList.add('error');    valid = false; }
    if (!email || !email.includes('@')) { form.email.classList.add('error'); valid = false; }
    if (!address)                  { form.address.classList.add('error'); valid = false; }
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
    btn.textContent = 'Versturen\u2026';

    var lines = getLines();
    fetch(API + '/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: state.selectedDate, slot: state.selectedSlot,
        customer: { name: name, email: email, postcode: state.postcodeRaw || '', address: address },
        services: lines.map(function(l){ return { name: l.name, price: l.price }; }),
        total: getTotal(),
        distance_km: state.distanceKm, surcharge_eur: state.surchargeEur,
        notes: form.notes.value.trim(),
        photo_id: state.photoId,
      }),
    }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      if (res.ok) {
        toonSuccess(res.data.message);
      } else {
        alert(res.data.error || 'Er is een fout opgetreden. Probeer opnieuw.');
        btn.disabled = false;
        btn.textContent = 'Aanvraag versturen \u2713';
      }
    }).catch(function() {
      alert('Verbindingsfout. Controleer uw internetverbinding en probeer opnieuw.');
      btn.disabled = false;
      btn.textContent = 'Aanvraag versturen \u2713';
    });
  });
}

function toonSuccess(message) {
  document.getElementById('offerte').style.display = 'none';
  var s = document.getElementById('booking-success');
  s.style.display = '';
  document.getElementById('success-message').textContent = message;
  s.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─── Content (CMS) ──────────────────────────────────────── */
function laadContent() {
  fetch(API + '/content')
    .then(function(r){ return r.json(); })
    .then(function(c) {
      state.content = c;
      if (c.meta && c.meta.title) document.title = c.meta.title;
      if (c.meta && c.meta.description) {
        var m = document.querySelector('meta[name="description"]');
        if (m) m.setAttribute('content', c.meta.description);
      }
      if (c.contact && c.contact.email) {
        document.querySelectorAll('#footer-email').forEach(function(el) {
          el.textContent = c.contact.email;
          el.href = 'mailto:' + c.contact.email;
        });
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
      if (c.seo_content && c.seo_content.blocks && c.seo_content.blocks.length) {
        renderSEO(c.seo_content.blocks);
      }
    })
    .catch(function(e){ console.error('Content error:', e); });
}

function renderFAQ(items) {
  var list = document.getElementById('faq-list');
  list.innerHTML = items.map(function(item, i) {
    return '<div class="faq-item">' +
      '<div class="faq-q" data-idx="' + i + '" role="button" tabindex="0">' +
      esc(item.question) + '<span class="faq-icon">+</span></div>' +
      '<div class="faq-a" id="faq-a-' + i + '">' + esc(item.answer) + '</div>' +
      '</div>';
  }).join('');

  list.querySelectorAll('.faq-q').forEach(function(q) {
    var toggle = function() {
      var answer = document.getElementById('faq-a-' + q.dataset.idx);
      var open   = q.classList.contains('open');
      list.querySelectorAll('.faq-q').forEach(function(el){ el.classList.remove('open'); });
      list.querySelectorAll('.faq-a').forEach(function(el){ el.classList.remove('open'); });
      if (!open) { q.classList.add('open'); answer.classList.add('open'); }
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
  if (!c) return;
  c.innerHTML = blocks.map(function(b) {
    return '<div class="seo-block"><h3>' + esc(b.heading) + '</h3><p>' + esc(b.text) + '</p></div>';
  }).join('');
}

/* ─── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  var yr = document.getElementById('footer-year');
  if (yr) yr.textContent = new Date().getFullYear();

  laadContent();
  initQB();
  initPostcode();
  initFoto();
  initFormulier();

  document.querySelectorAll('a[href^="#"]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      var t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior:'smooth', block:'start' }); }
    });
  });
});

/**
 * Groepenkastenservice Maassluis - Backend Server
 *
 * Architecture: Express.js + flat JSON file storage
 * Design principle: AI-agent friendly - simple REST API, human-readable data files
 *
 * Data files:
 *   data/availability.json  - blocked slots (default: all weekdays available)
 *   data/bookings.json      - confirmed bookings array
 *   data/content.json       - SEO content and site configuration
 *
 * Admin auth: X-Admin-Token header or ?token= query param
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Load .env if present
try { require('fs').readFileSync('.env').toString().split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim();
}); } catch {}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme123';

// Base location: 3141AP Maassluis
const BASE_LAT = 51.9183;
const BASE_LON = 4.2467;
const FREE_RADIUS_KM = 20;
const SURCHARGE_PER_KM = 0.40;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// Static files
// ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const DATA = {
  availability: () => path.join(__dirname, 'data', 'availability.json'),
  bookings: () => path.join(__dirname, 'data', 'bookings.json'),
  content: () => path.join(__dirname, 'data', 'content.json'),
};

async function readJSON(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWeekday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  return day >= 1 && day <= 5; // Mon–Fri
}

function isPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T12:00:00Z') < today;
}

// ─────────────────────────────────────────────
// Admin auth middleware
// ─────────────────────────────────────────────
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token === ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'Onbevoegd. Stuur X-Admin-Token header mee.' });
}

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

/**
 * GET /api/availability?month=YYYY-MM
 * Returns all weekdays in the given month with their AM/PM availability.
 * AM = 09:00–13:00, PM = 13:00–17:00
 */
app.get('/api/availability', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Geef een geldige maand op: YYYY-MM' });
    }

    const avail = await readJSON(DATA.availability());
    const bookings = await readJSON(DATA.bookings());

    // Build set of booked slots: "YYYY-MM-DD:am" and "YYYY-MM-DD:pm"
    const bookedSlots = new Set();
    for (const b of bookings) {
      if (b.status !== 'cancelled') {
        bookedSlots.add(`${b.date}:${b.slot}`);
      }
    }

    const [year, mon] = month.split('-').map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const result = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      if (!isWeekday(dateStr) || isPast(dateStr)) continue;

      const blocked = avail.blocked?.[dateStr] || {};
      result[dateStr] = {
        am: !bookedSlots.has(`${dateStr}:am`) && blocked.am !== true,
        pm: !bookedSlots.has(`${dateStr}:pm`) && blocked.pm !== true,
      };
    }

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Serverfout' });
  }
});

/**
 * POST /api/distance
 * Body: { lat, lon }
 * Returns distance in km and surcharge
 */
app.post('/api/distance', (req, res) => {
  const { lat, lon } = req.body;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return res.status(400).json({ error: 'lat en lon zijn verplicht (numbers)' });
  }
  const km = haversineKm(BASE_LAT, BASE_LON, lat, lon);
  const surchargeKm = Math.max(0, km - FREE_RADIUS_KM);
  const surcharge = Math.round(surchargeKm * SURCHARGE_PER_KM * 100) / 100;
  res.json({
    distance_km: Math.round(km * 10) / 10,
    free_radius_km: FREE_RADIUS_KM,
    surcharge_km: Math.round(surchargeKm * 10) / 10,
    surcharge_eur: surcharge,
    within_free_zone: km <= FREE_RADIUS_KM,
  });
});

/**
 * POST /api/bookings
 * Body: { date, slot, customer: { name, email, phone, postcode, address }, services, total, distance_km, surcharge_eur, notes }
 */
app.post('/api/bookings', async (req, res) => {
  try {
    const { date, slot, customer, services, total, distance_km, surcharge_eur, notes } = req.body;

    // Validation
    if (!date || !slot || !customer?.name || !customer?.email || !customer?.phone) {
      return res.status(400).json({ error: 'Verplichte velden ontbreken: date, slot, customer.name, customer.email, customer.phone' });
    }
    if (!['am', 'pm'].includes(slot)) {
      return res.status(400).json({ error: 'slot moet "am" of "pm" zijn' });
    }
    if (!isWeekday(date) || isPast(date)) {
      return res.status(400).json({ error: 'Ongeldige datum (weekdag in de toekomst vereist)' });
    }

    // Check if slot is still available
    const avail = await readJSON(DATA.availability());
    const bookings = await readJSON(DATA.bookings());

    const alreadyBooked = bookings.some(b => b.date === date && b.slot === slot && b.status !== 'cancelled');
    if (alreadyBooked) {
      return res.status(409).json({ error: 'Dit tijdsblok is al geboekt. Kies een ander tijdsblok.' });
    }

    const blocked = avail.blocked?.[date]?.[slot];
    if (blocked) {
      return res.status(409).json({ error: 'Dit tijdsblok is geblokkeerd. Kies een ander tijdsblok.' });
    }

    const booking = {
      id: uuidv4(),
      date,
      slot, // "am" (09:00-13:00) or "pm" (13:00-17:00)
      customer: {
        name: String(customer.name).slice(0, 100),
        email: String(customer.email).slice(0, 100),
        phone: String(customer.phone).slice(0, 30),
        postcode: String(customer.postcode || '').slice(0, 10),
        address: String(customer.address || '').slice(0, 200),
      },
      services: Array.isArray(services) ? services : [],
      total_eur: Number(total) || 0,
      distance_km: Number(distance_km) || 0,
      surcharge_eur: Number(surcharge_eur) || 0,
      notes: String(notes || '').slice(0, 500),
      status: 'confirmed',
      created_at: new Date().toISOString(),
    };

    bookings.push(booking);
    await writeJSON(DATA.bookings(), bookings);

    // Try to send email (non-blocking)
    sendConfirmationEmail(booking).catch(e => console.error('Email error:', e));

    console.log(`[BOOKING] ${booking.id} | ${date} ${slot} | ${customer.name} | €${booking.total_eur}`);

    res.status(201).json({
      success: true,
      booking_id: booking.id,
      message: `Uw afspraak is bevestigd voor ${formatDate(date)}, ${slot === 'am' ? '09:00–13:00' : '13:00–17:00'}.`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Serverfout bij aanmaken boeking' });
  }
});

/**
 * GET /api/content
 * Returns site content for frontend rendering
 */
app.get('/api/content', async (req, res) => {
  try {
    const content = await readJSON(DATA.content());
    res.json(content);
  } catch (e) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

// ─────────────────────────────────────────────
// ADMIN API (protected)
// ─────────────────────────────────────────────

/**
 * GET /api/admin/bookings
 * Returns all bookings, optionally filtered by ?month=YYYY-MM or ?status=confirmed
 */
app.get('/api/admin/bookings', adminAuth, async (req, res) => {
  try {
    let bookings = await readJSON(DATA.bookings());
    if (req.query.month) {
      bookings = bookings.filter(b => b.date.startsWith(req.query.month));
    }
    if (req.query.status) {
      bookings = bookings.filter(b => b.status === req.query.status);
    }
    bookings.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
    res.json(bookings);
  } catch (e) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

/**
 * PATCH /api/admin/bookings/:id
 * Update booking status: { status: "confirmed" | "completed" | "cancelled" }
 */
app.patch('/api/admin/bookings/:id', adminAuth, async (req, res) => {
  try {
    const bookings = await readJSON(DATA.bookings());
    const idx = bookings.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Boeking niet gevonden' });

    const allowed = ['confirmed', 'completed', 'cancelled'];
    if (req.body.status && allowed.includes(req.body.status)) {
      bookings[idx].status = req.body.status;
    }
    if (req.body.notes !== undefined) {
      bookings[idx].admin_notes = String(req.body.notes).slice(0, 500);
    }
    bookings[idx].updated_at = new Date().toISOString();
    await writeJSON(DATA.bookings(), bookings);
    res.json(bookings[idx]);
  } catch (e) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

/**
 * GET /api/admin/availability?month=YYYY-MM
 * Returns availability including blocked slots (admin view)
 */
app.get('/api/admin/availability', adminAuth, async (req, res) => {
  try {
    const avail = await readJSON(DATA.availability());
    const bookings = await readJSON(DATA.bookings());

    const { month } = req.query;
    if (!month) return res.json(avail);

    const [year, mon] = month.split('-').map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const result = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (!isWeekday(dateStr)) continue;

      const dayBookings = bookings.filter(b => b.date === dateStr && b.status !== 'cancelled');
      const blocked = avail.blocked?.[dateStr] || {};

      result[dateStr] = {
        am: {
          available: !dayBookings.some(b => b.slot === 'am') && blocked.am !== true,
          booking: dayBookings.find(b => b.slot === 'am') || null,
          blocked: blocked.am === true,
        },
        pm: {
          available: !dayBookings.some(b => b.slot === 'pm') && blocked.pm !== true,
          booking: dayBookings.find(b => b.slot === 'pm') || null,
          blocked: blocked.pm === true,
        },
      };
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

/**
 * PUT /api/admin/availability
 * Body: { date: "YYYY-MM-DD", am: true|false, pm: true|false }
 * true = blocked, false = available
 */
app.put('/api/admin/availability', adminAuth, async (req, res) => {
  try {
    const { date, am, pm } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Geef een geldige datum op: YYYY-MM-DD' });
    }

    const avail = await readJSON(DATA.availability());
    if (!avail.blocked) avail.blocked = {};

    if (!avail.blocked[date]) avail.blocked[date] = {};
    if (typeof am === 'boolean') avail.blocked[date].am = am;
    if (typeof pm === 'boolean') avail.blocked[date].pm = pm;

    // Clean up empty entries
    if (avail.blocked[date].am === false && avail.blocked[date].pm === false) {
      delete avail.blocked[date];
    }

    await writeJSON(DATA.availability(), avail);
    res.json({ success: true, date, blocked: avail.blocked[date] || {} });
  } catch (e) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

/**
 * PUT /api/admin/content
 * Update site content (SEO texts, FAQ, etc.)
 */
app.put('/api/admin/content', adminAuth, async (req, res) => {
  try {
    const current = await readJSON(DATA.content());
    // Deep merge
    const updated = deepMerge(current, req.body);
    await writeJSON(DATA.content(), updated);
    res.json({ success: true, content: updated });
  } catch (e) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

/**
 * GET /api/admin/export?month=YYYY-MM
 * Export bookings as CSV
 */
app.get('/api/admin/export', adminAuth, async (req, res) => {
  try {
    let bookings = await readJSON(DATA.bookings());
    if (req.query.month) {
      bookings = bookings.filter(b => b.date.startsWith(req.query.month));
    }

    const headers = ['ID', 'Datum', 'Tijdslot', 'Status', 'Naam', 'Email', 'Telefoon', 'Postcode', 'Adres', 'Totaal (€)', 'Afstand (km)', 'Toeslag (€)', 'Notities', 'Aangemaakt'];
    const rows = bookings.map(b => [
      b.id, b.date,
      b.slot === 'am' ? '09:00-13:00' : '13:00-17:00',
      b.status,
      b.customer?.name, b.customer?.email, b.customer?.phone,
      b.customer?.postcode, b.customer?.address,
      b.total_eur, b.distance_km, b.surcharge_eur,
      (b.notes || '').replace(/,/g, ';'),
      b.created_at,
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="boekingen-${req.query.month || 'alle'}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch (e) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

async function sendConfirmationEmail(booking) {
  if (!process.env.SMTP_HOST) return;
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const slotLabel = booking.slot === 'am' ? '09:00–13:00' : '13:00–17:00';
  const servicesText = booking.services.map(s => `- ${s.name}: €${s.price}`).join('\n');

  // Email to customer
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@groepenkastenservice.nl',
    to: booking.customer.email,
    subject: `Bevestiging afspraak ${formatDate(booking.date)}`,
    text: `Beste ${booking.customer.name},\n\nUw afspraak is bevestigd!\n\nDatum: ${formatDate(booking.date)}\nTijdslot: ${slotLabel}\nAdres: ${booking.customer.address}\n\nGeselecteerde werkzaamheden:\n${servicesText}\n\nTotaal: €${booking.total_eur}${booking.surcharge_eur > 0 ? ` (incl. €${booking.surcharge_eur} reistoeslag)` : ''}\n\nVragen? Bel of mail gerust.\n\nMet vriendelijke groet,\nGroepenkastenservice Maassluis\n${process.env.COMPANY_PHONE || ''}`,
  });

  // Notification to owner
  if (process.env.EMAIL_TO) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@groepenkastenservice.nl',
      to: process.env.EMAIL_TO,
      subject: `Nieuwe boeking: ${booking.customer.name} - ${booking.date} ${slotLabel}`,
      text: `Nieuwe boeking!\n\nID: ${booking.id}\nDatum: ${booking.date} | ${slotLabel}\nKlant: ${booking.customer.name}\nTelefoon: ${booking.customer.phone}\nEmail: ${booking.customer.email}\nAdres: ${booking.customer.address} (${booking.customer.postcode})\nAfstand: ${booking.distance_km} km\n\nWerkzaamheden:\n${servicesText}\n\nTotaal: €${booking.total_eur}\nNotities: ${booking.notes || '-'}`,
    });
  }
}

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Server actief op http://localhost:${PORT}`);
  console.log(`✓ Admin panel: http://localhost:${PORT}/admin`);
  console.log(`✓ Admin token: ${ADMIN_TOKEN === 'changeme123' ? '⚠ STANDAARD TOKEN - verander ADMIN_TOKEN in .env!' : '(ingesteld)'}`);
});

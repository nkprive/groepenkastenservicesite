# API Documentatie — Groepenkastenservice Maassluis

Base URL: `http://localhost:3000`

## Authenticatie (Admin endpoints)
Admin endpoints vereisen een `X-Admin-Token` header:
```
X-Admin-Token: jouw-admin-token
```
Of als query parameter: `?token=jouw-admin-token`

---

## Publieke Endpoints

### GET /api/availability?month=YYYY-MM
Haal beschikbare tijdsblokken op voor een maand.

**Response:**
```json
{
  "2025-01-15": { "am": true, "pm": false },
  "2025-01-16": { "am": true, "pm": true }
}
```
`true` = beschikbaar, `false` = volgeboekt of geblokkeerd.
Weekends en verleden datums worden niet teruggegeven.

---

### POST /api/distance
Bereken de afstand van een coördinaat tot Maassluis (3141AP).

**Request:**
```json
{ "lat": 52.0, "lon": 4.35 }
```

**Response:**
```json
{
  "distance_km": 12.4,
  "free_radius_km": 20,
  "surcharge_km": 0,
  "surcharge_eur": 0,
  "within_free_zone": true
}
```

---

### POST /api/bookings
Maak een nieuwe boeking aan.

**Request:**
```json
{
  "date": "2025-01-20",
  "slot": "am",
  "customer": {
    "name": "Jan de Vries",
    "email": "jan@email.nl",
    "phone": "06-12345678",
    "postcode": "3142 BD",
    "address": "Kerkstraat 1, Maassluis"
  },
  "services": [
    { "name": "Groepenkast 1-fase · 8 groepen", "price": 600 }
  ],
  "total": 680,
  "distance_km": 5.2,
  "surcharge_eur": 0,
  "notes": "Meterkast in kelder"
}
```

**Response (201):**
```json
{
  "success": true,
  "booking_id": "uuid-...",
  "message": "Uw afspraak is bevestigd voor maandag 20 januari 2025, 09:00–13:00."
}
```

**Errors:** 400 (validatie), 409 (slot al bezet)

---

### GET /api/content
Haal CMS-inhoud op (teksten, FAQ, contactgegevens).

---

## Admin Endpoints (vereisen X-Admin-Token)

### GET /api/admin/bookings
Alle boekingen. Optionele filters:
- `?month=YYYY-MM`
- `?status=confirmed|completed|cancelled`

### PATCH /api/admin/bookings/:id
Wijzig boekingstatus.
```json
{ "status": "completed" }
```

### GET /api/admin/availability?month=YYYY-MM
Admin-weergave van beschikbaarheid inclusief boeking-details per slot.

**Response per dag:**
```json
{
  "2025-01-15": {
    "am": { "available": true, "booking": null, "blocked": false },
    "pm": { "available": false, "booking": { "id": "...", "customer": {...} }, "blocked": false }
  }
}
```

### PUT /api/admin/availability
Blokkeer of geef een tijdslot vrij.
```json
{ "date": "2025-01-15", "am": true, "pm": false }
```
`true` = geblokkeerd, `false` = beschikbaar

### PUT /api/admin/content
Werk site-inhoud bij (deep merge). Stuur alleen de velden die je wilt wijzigen.
```json
{
  "contact": { "phone": "06-99999999" },
  "meta": { "title": "Nieuwe paginatitel" }
}
```

### GET /api/admin/export?month=YYYY-MM
Download alle boekingen als CSV (Excel-compatibel).

---

## Data Structuren

### Boeking (data/bookings.json)
```json
{
  "id": "uuid",
  "date": "YYYY-MM-DD",
  "slot": "am|pm",
  "status": "confirmed|completed|cancelled",
  "customer": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "postcode": "string",
    "address": "string"
  },
  "services": [{ "name": "string", "price": 600 }],
  "total_eur": 600,
  "distance_km": 5.2,
  "surcharge_eur": 0,
  "notes": "string",
  "created_at": "ISO-8601"
}
```

### Beschikbaarheid (data/availability.json)
```json
{
  "blocked": {
    "2025-01-15": { "am": true },
    "2025-01-16": { "am": true, "pm": true }
  }
}
```
Standaard: alle weekdagen zijn beschikbaar tenzij hier geblokkeerd of geboekt.

---

## AI Agent Notities
- Data staat in `/data/*.json` — leesbaar en direct bewerkbaar
- Gebruik `X-Admin-Token` header voor alle admin-operaties
- Alle datums in `YYYY-MM-DD` formaat
- Tijdslotten: `am` = 09:00-13:00, `pm` = 13:00-17:00
- Beschikbaarheid: weekenden en verleden datums zijn automatisch uitgesloten

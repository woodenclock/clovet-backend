const express   = require('express');
const cors      = require('cors');
const bodyJson  = require('body-parser').json;
const Database  = require('better-sqlite3');

/* ---------- DB connection FIRST ---------- */
const db = new Database('./clovet.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pins (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    img      TEXT UNIQUE,       -- unique prevents exact dupes
    text     TEXT,
    savedAt  INTEGER
  )
`);

/* ---------- prepare statements AFTER db ---------- */
const insertPin  = db.prepare(
  'INSERT OR IGNORE INTO pins (img, text, savedAt) VALUES (?, ?, ?)'
);
const selectPins = db.prepare(
  'SELECT * FROM pins ORDER BY savedAt DESC'
);
const deletePin  = db.prepare(
  'DELETE FROM pins WHERE id = ?'
);

/* ---------- server ---------- */
const app = express();
app.use(cors());
app.use(bodyJson());

app.post('/api/save-pin', (req, res) => {
  const { img, text } = req.body || {};
  if (!img) return res.status(400).json({ error: 'img required' });

  const clean = (text || '')
    .replace(/\bSave\b|\bVisit site\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  insertPin.run(img, clean, Date.now());
  res.sendStatus(200);
});

app.get('/api/pins', (_, res) => {
  res.json(selectPins.all());
});

app.delete('/api/pins/:id', (req, res) => {
  const info = deletePin.run(Number(req.params.id));
  return info.changes ? res.sendStatus(204) : res.sendStatus(404);
});

app.listen(3001, () =>
  console.log('🚀 Clovet backend + SQLite on http://localhost:3001')
);

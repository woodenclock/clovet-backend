const express = require('express');
const cors     = require('cors');
const bodyJson = require('body-parser').json;
const Database = require('better-sqlite3');

// ---------- DB setup ----------
const db = new Database('./clovet.db');
db.pragma('journal_mode = WAL');           // safer for concurrent writes
db.exec(`
  CREATE TABLE IF NOT EXISTS pins (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    img      TEXT,
    text     TEXT,
    savedAt  INTEGER
  )
`);
const insertPin = db.prepare(
  'INSERT INTO pins (img, text, savedAt) VALUES (?, ?, ?)'
);
const selectPins = db.prepare(
  'SELECT * FROM pins ORDER BY savedAt DESC'
);
// --------------------------------

const app = express();
app.use(cors());
app.use(bodyJson());

// save-pin endpoint (called by the extension)
app.post('/api/save-pin', (req, res) => {
  const { img, text } = req.body || {};
  if (!img) return res.status(400).json({ error: 'img required' });

  insertPin.run(img, text, Date.now());
  console.log('📌  Saved:', img.slice(0, 60), '…');
  res.sendStatus(200);
});

// fetch all pins (mobile app can call this)
app.get('/api/pins', (_, res) => {
  const rows = selectPins.all();
  res.json(rows);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Clovet backend + SQLite ready → http://localhost:${PORT}`);
});

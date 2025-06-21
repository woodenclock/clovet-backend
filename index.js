// covet-backend/index.js

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

app.post('/api/save-pin', (req, res) => {
  const { img, text } = req.body;
  console.log('📌 Saved pin:', { img, text });

  // TODO: save to database or forward to OpenAI
  res.status(200).json({ message: 'Pin saved successfully' });
});

app.listen(PORT, () => {
  console.log(`🚀 Covet backend running on http://localhost:${PORT}`);
});

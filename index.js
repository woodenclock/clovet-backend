const express   = require('express');
const cors      = require('cors');
const bodyJson  = require('body-parser').json;
const Database  = require('better-sqlite3');
const fetch     = require('node-fetch');

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

// New endpoint to delete all pins
app.delete('/api/pins', (_, res) => {
  const info = db.prepare('DELETE FROM pins').run();
  return res.status(200).json({ deleted: info.changes });
});

// New endpoint to curate clothing items using ChatGPT API
app.post('/api/curate', async (req, res) => {
  try {
    const { pins } = req.body;
    
    if (!pins || !Array.isArray(pins) || pins.length === 0) {
      return res.status(400).json({ error: 'No pins provided for curation' });
    }
    
    // If there are fewer than 3 items, just return them all
    if (pins.length <= 3) {
      const curatedItems = pins.map(pin => ({
        ...pin,
        reason: "Selected because you have a small collection."
      }));
      return res.json(curatedItems);
    }
    
    // Call ChatGPT API
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      console.warn('No OpenAI API key found. Using fallback curation method.');
      // Fallback if no API key: select 3 random items
      const randomItems = [...pins]
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(pin => ({
          ...pin,
          reason: "Selected randomly (ChatGPT API key not configured)"
        }));
      
      return res.json(randomItems);
    }
    
    console.log('OpenAI API key found, length:', OPENAI_API_KEY.length);
    console.log('API key starts with:', OPENAI_API_KEY.substring(0, 5) + '...');
    
    try {
      console.log('Calling OpenAI API with GPT-4o (vision capabilities)...');
      
      // Prepare messages with images
      const messages = [
        {
          role: "system",
          content: "You are a fashion expert who can analyze clothing images. Select 3-5 items from the provided images that would work well together as an outfit or collection. Provide a reason for each selection, considering style, color coordination, and occasion appropriateness."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Here are the clothing items in my collection. Please select 3-5 items that would work well together and explain why you chose each one."
            }
          ]
        }
      ];
      
      // Add each clothing item as a separate image in the user message
      pins.forEach((pin, index) => {
        if (pin.img) {
          messages[1].content.push({
            type: "image_url",
            image_url: {
              url: pin.img,
              detail: "low"
            }
          });
          
          // Add text description if available
          if (pin.text) {
            messages[1].content.push({
              type: "text",
              text: `Item ${index + 1}: ${pin.text}`
            });
          }
        }
      });
      
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: messages,
          temperature: 0.7,
          max_tokens: 800
        })
      });
      
      const aiData = await openaiResponse.json();
      console.log('OpenAI response status:', aiData.error ? 'Error' : 'Success');
      
      if (aiData.error) {
        console.error('OpenAI API error:', aiData.error);
        throw new Error(`OpenAI API error: ${aiData.error.message || 'Unknown error'}`);
      }
      
      if (!aiData.choices || !aiData.choices[0] || !aiData.choices[0].message) {
        console.error('Invalid response structure:', JSON.stringify(aiData));
        throw new Error('Invalid response from OpenAI API');
      }
      
      const aiResponse = aiData.choices[0].message.content;
      console.log('AI response:', aiResponse);
      
      // Parse AI response to extract selected items and reasons
      const selectedItems = [];
      const itemRegex = /Item (\d+).*?(?:because|reason|as|:)\s*(.*?)(?=Item \d+|$)/gis;
      
      let match;
      while ((match = itemRegex.exec(aiResponse)) !== null) {
        const itemIndex = parseInt(match[1]) - 1;
        const reason = match[2].trim();
        
        if (pins[itemIndex]) {
          selectedItems.push({
            ...pins[itemIndex],
            reason: reason
          });
        }
      }
      
      // If no items matched by regex, try to extract based on descriptions
      if (selectedItems.length === 0) {
        // Look for descriptions that might match our items
        pins.forEach((pin) => {
          if (pin.text) {
            // Create a regex to find mentions of this item's description
            const descriptionWords = pin.text.split(' ').filter(word => word.length > 3);
            
            for (const word of descriptionWords) {
              const wordRegex = new RegExp(`(${word}).*?(because|reason|as|:)\\s*([^\\n]+)`, 'i');
              const descMatch = aiResponse.match(wordRegex);
              
              if (descMatch) {
                selectedItems.push({
                  ...pin,
                  reason: descMatch[3].trim()
                });
                break; // Found a match for this item, move to next
              }
            }
          }
        });
      }
      
      // If still no items found, fall back to random selection
      if (selectedItems.length === 0) {
        const randomItems = [...pins]
          .sort(() => 0.5 - Math.random())
          .slice(0, 3)
          .map(pin => ({
            ...pin,
            reason: "Selected based on your collection (AI response parsing failed)"
          }));
        
        return res.json(randomItems);
      }
      
      return res.json(selectedItems);
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      // Fallback to random selection if OpenAI API fails
      const randomItems = [...pins]
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(pin => ({
          ...pin,
          reason: "Selected randomly (OpenAI API error)"
        }));
      
      return res.json(randomItems);
    }
  } catch (error) {
    console.error('Error in curate endpoint:', error);
    // Even in case of general error, try to return something useful
    try {
      const { pins } = req.body;
      if (pins && Array.isArray(pins) && pins.length > 0) {
        const randomItems = [...pins]
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.min(3, pins.length))
          .map(pin => ({
            ...pin,
            reason: "Selected randomly (server error recovery)"
          }));
        
        return res.json(randomItems);
      }
    } catch (fallbackError) {
      console.error('Even fallback failed:', fallbackError);
    }
    
    res.status(500).json({ error: 'Failed to curate items', details: error.message });
  }
});

app.listen(3001, () =>
  console.log('🚀 Clovet backend + SQLite on http://localhost:3001')
);

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ── Frinkiac proxy helper ──────────────────────────────────
async function frinkiacFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Frinkiac ${res.status}`);
  return res.json();
}

// ── Interpret scenario with Claude → search queries ────────
app.get('/api/interpret', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No key configured — pass query through as-is
    return res.json({ queries: [q] });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `You are a Simpsons expert helping search Frinkiac, a subtitle database for every Simpsons episode.

User scenario: "${q}"

Generate 4 short search queries (2–5 words each) that will find the best matching Simpsons scenes in the subtitle database.

Think about:
- What exact words or dialogue would appear in the actual subtitles of the matching scene?
- Do you recognise a specific famous scene? If so, use the character's real dialogue from that scene.
- Character names + specific phrases work better than descriptive terms.
- Subtitles are written in plain spoken English.

Return ONLY a JSON array of strings, nothing else.
Example: ["homer forbidden donut", "mmm donuts", "is there anything", "17 donuts"]`
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON array in Claude response');

    const queries = JSON.parse(match[0]);
    if (!Array.isArray(queries) || queries.length === 0) throw new Error('Empty queries');

    res.json({ queries: queries.slice(0, 5) });
  } catch (err) {
    console.error('Interpret error:', err.message);
    res.json({ queries: [q] }); // graceful fallback to raw query
  }
});

// ── Image download proxy (avoids CORS on client-side fetch) ─
app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://frinkiac.com/')) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Frinkiac ${response.status}`);
    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="simpsons-meme.jpg"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ── Frinkiac search proxy ──────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    const data = await frinkiacFetch(
      `https://frinkiac.com/api/search?q=${encodeURIComponent(q)}`
    );
    res.json(Array.isArray(data) ? data.slice(0, 20) : []);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Frinkiac unavailable' });
  }
});

// ── Frinkiac caption proxy ─────────────────────────────────
app.get('/api/caption', async (req, res) => {
  const { e, t } = req.query;
  if (!e || !t) return res.status(400).json({ error: 'Episode and timestamp required' });

  try {
    const data = await frinkiacFetch(
      `https://frinkiac.com/api/caption?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`
    );
    res.json(data);
  } catch (err) {
    console.error('Caption error:', err.message);
    res.status(500).json({ error: 'Frinkiac unavailable' });
  }
});

// Local dev: start listener. Vercel imports this file as a module instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Homer's Meme Machine → http://localhost:${PORT}`);
  });
}

module.exports = app;

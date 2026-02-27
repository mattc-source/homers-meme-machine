const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Frinkiac proxy helper ──────────────────────────────────
async function frinkiacFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Frinkiac ${res.status}`);
  return res.json();
}

// ── Interpret scenario with Groq → search queries ──────────
app.get('/api/interpret', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // No key configured — pass query through as-is
    return res.json({ queries: [q] });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `You are a Simpsons expert helping search Frinkiac, a subtitle database for every Simpsons episode.

User scenario: "${q}"

Generate 6 short search queries (2–5 words each) that will find the best matching Simpsons scenes in the subtitle database. Spread the queries to cover different moments, characters, and angles related to the scenario — not just the most obvious one.

Think about:
- What exact words or dialogue would appear in the actual subtitles of the matching scene?
- Do you recognise a specific famous scene or iconic meme moment? If so, use the character's real dialogue verbatim.
- Try different characters who might react to this scenario.
- Character names + specific phrases work better than descriptive terms.
- Subtitles are written in plain spoken English.

Return ONLY a JSON array of strings, nothing else.
Example: ["homer forbidden donut", "mmm donuts", "is there anything", "17 donuts", "donut glazed", "bart doughnut"]`
        }]
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON array in Groq response');

    const queries = JSON.parse(match[0]);
    if (!Array.isArray(queries) || queries.length === 0) throw new Error('Empty queries');

    res.json({ queries: queries.slice(0, 5) });
  } catch (err) {
    console.error('Interpret error:', err.message);
    res.json({ queries: [q] }); // graceful fallback to raw query
  }
});

// ── Groq punchline picker ──────────────────────────────────
app.post('/api/bestquote', async (req, res) => {
  const { scenario, captions } = req.body;
  if (!scenario || !Array.isArray(captions)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.json({ quotes: captions });

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `You are a Simpsons expert. The user's scenario is: "${scenario}"

Here are subtitle excerpts from ${captions.length} Simpsons scenes. For each scene, extract the single funniest or most memorable quote that best fits the scenario. Choose the punchline, not setup dialogue. If the excerpt already contains a great punchline, use it verbatim. Keep each quote under 100 characters.

${captions.map((c, i) => `Scene ${i + 1}: "${c}"`).join('\n')}

Return ONLY a JSON array of ${captions.length} strings, one per scene. If a scene has no usable quote return an empty string for that entry.`
        }]
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON array in response');

    const quotes = JSON.parse(match[0]);
    res.json({ quotes });
  } catch (err) {
    console.error('Bestquote error:', err.message);
    res.json({ quotes: captions }); // fallback to original captions
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
    res.json(Array.isArray(data) ? data.slice(0, 30) : []);
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

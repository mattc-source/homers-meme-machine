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
          content: `You are a Simpsons meme expert helping search Frinkiac, a subtitle database for every Simpsons episode.

User scenario: "${q}"

Think creatively and laterally:
1. What EMOTIONS does this evoke? (frustration, embarrassment, boredom, excitement, etc.)
2. What RELATED SITUATIONS or concepts connect to this? e.g. "stuck in traffic" → driving, waiting, impatience, road rage, long journeys
3. What ICONIC SIMPSONS MOMENTS or famous meme lines capture this feeling — even indirectly?
4. What would a Simpsons fan quote in reaction to this scenario?

Generate 6 search queries (2–5 words each) for Frinkiac's subtitle database. Prioritise:
- Famous, quotable one-liners and reactions over literal scene descriptions
- Different characters and emotional angles (Homer's frustration, Bart's sarcasm, Lisa's exasperation)
- Actual dialogue that would appear in subtitles — plain spoken English, no stage directions

Return ONLY a JSON array of strings, nothing else.
Example for "stuck in traffic": ["are we there yet", "homer this is taking forever", "I'm not angry I'm just disappointed", "worst day of my life", "why does everything happen to me", "boring long drive"]`
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
          content: `You are a Simpsons meme expert. The user's scenario is: "${scenario}"

Here are subtitle excerpts from ${captions.length} Simpsons scenes. For each scene pick the single best quote that:
- Works as a standalone meme — funny or relatable without needing context
- Is a punchy one-liner or short snappy exchange, not setup-heavy dialogue
- Captures the FEELING of the scenario even if not literally about it
- Would make someone laugh or nod and say "that's so true"

Prefer the shortest, punchiest option. Avoid quotes that are just setup with no payoff.

${captions.map((c, i) => `Scene ${i + 1}: "${c}"`).join('\n')}

Return ONLY a JSON array of ${captions.length} strings. Max 90 characters per quote. Return an empty string for any scene with no meme-able line.`
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

const form        = document.getElementById('searchForm');
const input       = document.getElementById('searchInput');
const loadingEl   = document.getElementById('loading');
const loadingMsg  = document.getElementById('loadingMsg');
const resultsEl   = document.getElementById('results');
const gridEl      = document.getElementById('grid');
const noResultsEl = document.getElementById('noResults');
const errorEl     = document.getElementById('error');
const countEl     = document.getElementById('resultsCount');
const toast       = document.getElementById('toast');
const chips       = document.querySelectorAll('.chip');

// ─── UI helpers ───────────────────────────────────────────
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setMsg(msg) { loadingMsg.textContent = msg; }

function resetUI() {
  hide(loadingEl);
  hide(resultsEl);
  hide(noResultsEl);
  hide(errorEl);
  gridEl.innerHTML = '';
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 250);
  }, 1800);
}

// ─── Text helpers ─────────────────────────────────────────

/**
 * Word-wrap to maxChars per line for Frinkiac's meme renderer.
 * Tighter than before (26 chars) to prevent horizontal clipping.
 */
function wrapText(text, maxChars = 26) {
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim().toUpperCase();
}

// ─── Frinkiac URL helpers ─────────────────────────────────
function memeUrl(episode, timestamp, text) {
  return `https://frinkiac.com/meme/${episode}/${timestamp}.jpg?lines=${encodeURIComponent(wrapText(text))}`;
}

function imageUrl(episode, timestamp) {
  return `https://frinkiac.com/img/${episode}/${timestamp}/medium.jpg`;
}

// ─── Full quote from all subtitle lines ───────────────────
/**
 * Join ALL subtitle lines in chronological order — this gives
 * the complete joke (setup + punchline) rather than just one line.
 * Caps at ~130 chars so the meme text doesn't overflow the image.
 */
function pickSubtitle(captionData) {
  const { Subtitles } = captionData;
  if (!Subtitles || Subtitles.length === 0) return '';

  const sorted = [...Subtitles].sort((a, b) => a.StartTimestamp - b.StartTimestamp);
  const full   = cleanText(sorted.map(s => s.Content.trim()).join(' '));

  if (full.length <= 130) return full;

  // Truncate at word boundary
  const cut = full.slice(0, 127);
  return cut.slice(0, cut.lastIndexOf(' ')) + '...';
}

// ─── Semantic search: interpret → multi-query → aggregate ─

async function interpretScenario(scenario) {
  const res = await fetch(`/api/interpret?q=${encodeURIComponent(scenario)}`);
  if (!res.ok) return [scenario];
  const { queries } = await res.json();
  return Array.isArray(queries) && queries.length ? queries : [scenario];
}

async function runQuery(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  return res.json();
}

/**
 * Run all queries in parallel, score each frame by how many queries
 * returned it (+ rank bonus). Aggregates by frame, not episode, so
 * multiple moments from the same episode can appear. Filters out
 * frames within 30s of a better-ranked frame from the same episode.
 */
function aggregateResults(allResults, max) {
  const scores   = new Map(); // "episode|timestamp" → score
  const frameMap = new Map(); // "episode|timestamp" → frame object

  for (const results of allResults) {
    if (!Array.isArray(results)) continue;
    const seenThisQuery = new Set();

    results.forEach((frame, rank) => {
      const key = `${frame.Episode}|${frame.Timestamp}`;
      if (seenThisQuery.has(key)) return;
      seenThisQuery.add(key);

      const rankBonus = 1 - rank / results.length;
      scores.set(key, (scores.get(key) || 0) + 1 + rankBonus);
      if (!frameMap.has(key)) frameMap.set(key, frame);
    });
  }

  // Sort all frames by score
  const sorted = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => frameMap.get(key));

  // Keep frames that are at least 30s apart from any better-ranked frame in the same episode
  const MIN_GAP_MS = 30000;
  const keptTs = new Map(); // episode → [kept timestamps]
  const kept = [];

  for (const frame of sorted) {
    const ts = keptTs.get(frame.Episode) || [];
    const tooClose = ts.some(t => Math.abs(frame.Timestamp - t) < MIN_GAP_MS);
    if (!tooClose) {
      kept.push(frame);
      ts.push(frame.Timestamp);
      keptTs.set(frame.Episode, ts);
    }
    if (kept.length >= max) break;
  }

  return kept;
}

// ─── Lightbox ─────────────────────────────────────────────
const lightbox   = document.getElementById('lightbox');
const lbImg      = lightbox.querySelector('.lightbox-img');
const lbEpisode  = lightbox.querySelector('.lb-episode');
const lbTitle    = lightbox.querySelector('.lb-title');
const lbCopy     = lightbox.querySelector('.lb-copy');
const lbClose    = lightbox.querySelector('.lightbox-close');

function openLightbox({ url, episode, title }) {
  lbImg.src              = url;
  lbEpisode.textContent  = episode;
  lbTitle.textContent    = title;
  lbCopy.onclick = async () => {
    try {
      const res  = await fetch(`/api/download?url=${encodeURIComponent(url)}`);
      const blob = await res.blob();
      const file = new File([blob], 'simpsons-meme.jpg', { type: 'image/jpeg' });

      // Mobile: use native share sheet (includes "Save to Photos" on iOS)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // Desktop: trigger automatic download to Downloads folder
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'simpsons-meme.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 100);
      }
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Download failed');
    }
  };
  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  document.body.style.overflow = '';
}

// Close on backdrop click, close button, or Escape
lightbox.addEventListener('click', e => {
  if (!e.target.closest('.lightbox-inner')) closeLightbox();
});
lbClose.addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});

// ─── Build a single meme card ─────────────────────────────
function buildCard(frame, captionData, subtitle) {
  if (!subtitle) subtitle = pickSubtitle(captionData);
  if (!subtitle) return null;

  // Skip if the quote wraps to more than 4 lines — text would overflow the image
  if (wrapText(subtitle).split('\n').length > 4) return null;

  const episodeInfo = captionData.Episode || {};
  const url         = memeUrl(frame.Episode, frame.Timestamp, subtitle);
  const fallback    = imageUrl(frame.Episode, frame.Timestamp);

  const card = document.createElement('div');
  card.className = 'meme-card';
  card.innerHTML = `<img src="${url}" alt="Simpsons meme" loading="lazy" class="loading-img">`;

  const img = card.querySelector('img');
  img.addEventListener('load',  () => img.classList.remove('loading-img'));
  img.addEventListener('error', () => { img.src = fallback; });

  card.addEventListener('click', () => openLightbox({
    url,
    episode: frame.Episode,
    title:   episodeInfo.Title || '',
  }));

  return card;
}

// ─── Main search flow ─────────────────────────────────────
async function doSearch(query) {
  resetUI();
  show(loadingEl);

  try {
    // 1. Ask Groq to translate scenario → targeted Frinkiac queries
    setMsg('Consulting Professor Frink…');
    const queries = await interpretScenario(query);

    // 2. Run all queries against Frinkiac in parallel
    setMsg('Searching Springfield…');
    const allResults = await Promise.all(queries.map(runQuery));

    // 3. Score and merge — best matches bubble to the top
    const frames = aggregateResults(allResults, 12);

    if (frames.length === 0) {
      hide(loadingEl);
      show(noResultsEl);
      return;
    }

    // 4. Fetch all captions in parallel
    setMsg('Finding the quotes…');
    const captionResults = await Promise.allSettled(
      frames.map(f =>
        fetch(`/api/caption?e=${encodeURIComponent(f.Episode)}&t=${encodeURIComponent(f.Timestamp)}`)
          .then(r => r.json())
      )
    );

    // 5. Ask Groq to pick the best punchline from each caption
    setMsg('Picking the punchlines…');
    const rawSubtitles = captionResults.map(r =>
      r.status === 'fulfilled' ? pickSubtitle(r.value) : ''
    );

    let finalSubtitles = rawSubtitles;
    try {
      const qRes = await fetch('/api/bestquote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: query, captions: rawSubtitles })
      });
      const { quotes } = await qRes.json();
      if (Array.isArray(quotes) && quotes.length === rawSubtitles.length) {
        finalSubtitles = quotes.map((q, i) => q || rawSubtitles[i]);
      }
    } catch (e) { /* fall back to rawSubtitles */ }

    hide(loadingEl);

    // 6. Build cards
    let built = 0;
    captionResults.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const card = buildCard(frames[i], result.value, finalSubtitles[i]);
      if (card) {
        card.style.animationDelay = `${built * 0.09}s`;
        gridEl.appendChild(card);
        built++;
      }
    });

    if (built === 0) {
      show(noResultsEl);
    } else {
      countEl.textContent = `${built} moment${built !== 1 ? 's' : ''} found`;
      show(resultsEl);
    }

  } catch (err) {
    console.error(err);
    hide(loadingEl);
    show(errorEl);
  }
}

// ─── Event listeners ──────────────────────────────────────
form.addEventListener('submit', e => {
  e.preventDefault();
  const q = input.value.trim();
  if (q) doSearch(q);
});

chips.forEach(chip => {
  chip.addEventListener('click', () => {
    const q = chip.dataset.q;
    input.value = q;
    doSearch(q);
  });
});

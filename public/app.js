'use strict';

const TZ = 'Europe/Berlin';
const DAYS_SHOWN = 7;
const STORAGE_KEY = 'kinoprogramm-leipzig:v1';
const VERSION_LABEL = { OmU: 'Original mit Untertiteln', OmeU: 'Original mit englischen Untertiteln', OV: 'Originalfassung' };
const STATUS_LABEL = {
  ok: 'aktuell',
  stale: 'Quelle nicht erreichbar – Daten vom letzten erfolgreichen Abruf',
  error: 'Quelle nicht erreichbar',
};

const $ = (sel) => document.querySelector(sel);

const state = {
  data: null,
  day: null,
  view: 'kino',
  query: '',
  hidden: new Set(),
};

// ---------- Hilfsfunktionen ----------

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

function berlinNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const weekday = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' });
const shortDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

function dayLabel(iso, today) {
  if (iso === today) return 'Heute';
  if (iso === addDays(today, 1)) return 'Morgen';
  return weekday(iso);
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.view === 'kino' || saved.view === 'film') state.view = saved.view;
    if (Array.isArray(saved.hidden)) state.hidden = new Set(saved.hidden);
  } catch {
    /* Einstellungen sind optional */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ view: state.view, hidden: [...state.hidden] }));
  } catch {
    /* z. B. privater Modus */
  }
}

// ---------- Daten aufbereiten ----------

function visibleShows() {
  const { data, day, query, hidden } = state;
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  return data.shows.filter((s) => {
    if (s.date !== day || hidden.has(s.cinema)) return false;
    if (!tokens.length) return true;
    const haystack = fold(`${data.films[s.film]?.title ?? ''} ${s.version ?? ''} ${(s.extras || []).join(' ')}`);
    return tokens.every((t) => haystack.includes(t));
  });
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

const byTitle = (a, b) => state.data.films[a].title.localeCompare(state.data.films[b].title, 'de', { sensitivity: 'base' });

// ---------- Darstellung ----------

// Vorsätze wie „Literatur trifft Film": oder Premiere: gehören nicht zum Filmtitel
const EVENT_PREFIX =
  /\b(premiere|special|spezial|screening|reihe|preview|sneak|kurzfilm|ladies night|trifft film|klassiker|cinespecial|halloween|filmgespräch)\b/i;
const QUOTE = /["„“”‚‘’«»]/;
const QUOTES = new RegExp(QUOTE.source, 'g');

/** Suchbegriff für den Trailer: nur der eigentliche Filmtitel, ohne Anführungszeichen. */
function trailerQuery(title) {
  let t = String(title);
  const m = /^(.+?):\s+(.+)$/.exec(t);
  if (m && (QUOTE.test(m[1]) || EVENT_PREFIX.test(m[1]))) t = m[2];
  t = t
    .replace(/\s+\+\s+.*$/, '') // "+ Filmgespräch mit …"
    .replace(/\s*\([^)]*\)/g, '') // Zusätze in Klammern
    .replace(QUOTES, '') // Anführungszeichen erzwingen bei YouTube exakte Treffer
    .replace(/\s{2,}/g, ' ')
    .trim();
  return `${t || title} trailer deutsch`;
}

function trailerLink(title) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(trailerQuery(title))}`;
  return `<a class="trailer" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="Trailer auf YouTube suchen">Trailer</a>`;
}

function timeChip(show, now) {
  const past = show.date === now.date && show.time < now.time;
  const badges = [show.version, ...(show.extras || [])]
    .filter(Boolean)
    .map((b) => `<span class="badge" title="${escapeHtml(VERSION_LABEL[b] || b)}">${escapeHtml(b)}</span>`)
    .join('');
  const tip = [show.screen, VERSION_LABEL[show.version]].filter(Boolean).join(' · ');
  const cls = `time${past ? ' past' : ''}`;
  const inner = `${show.time}${badges}`;
  if (show.url) {
    return `<a class="${cls}" href="${escapeHtml(show.url)}" target="_blank" rel="noopener" title="${escapeHtml(tip || 'Tickets & Infos')}">${inner}</a>`;
  }
  return `<span class="${cls}"${tip ? ` title="${escapeHtml(tip)}"` : ''}>${inner}</span>`;
}

function renderByCinema(shows, now) {
  const { data } = state;
  const byCinema = groupBy(shows, (s) => s.cinema);
  return data.cinemas
    .filter((c) => byCinema.has(c.id))
    .map((c) => {
      const byFilm = groupBy(byCinema.get(c.id), (s) => s.film);
      const rows = [...byFilm.keys()]
        .sort(byTitle)
        .map(
          (film) => `<li class="row">
            <p class="row-title"><button type="button" data-film="${escapeHtml(film)}" title="Wo läuft der Film noch?">${escapeHtml(data.films[film].title)}</button> ${trailerLink(data.films[film].title)}</p>
            <div class="times">${byFilm.get(film).map((s) => timeChip(s, now)).join('')}</div>
          </li>`,
        )
        .join('');
      return `<section class="card">
        <div class="card-head">
          <h2><a href="${escapeHtml(c.website)}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a></h2>
          <span class="sub">${escapeHtml(c.address || '')}</span>
        </div>
        <ul class="rows">${rows}</ul>
      </section>`;
    })
    .join('');
}

function renderByFilm(shows, now) {
  const { data } = state;
  const cinemaIndex = new Map(data.cinemas.map((c, i) => [c.id, i]));
  const cinemaName = new Map(data.cinemas.map((c) => [c.id, c.name]));
  const byFilm = groupBy(shows, (s) => s.film);
  return [...byFilm.keys()]
    .sort(byTitle)
    .map((film) => {
      const byCinema = groupBy(byFilm.get(film), (s) => s.cinema);
      const rows = [...byCinema.keys()]
        .sort((a, b) => cinemaIndex.get(a) - cinemaIndex.get(b))
        .map(
          (cinema) => `<li class="row">
            <p class="row-title">${escapeHtml(cinemaName.get(cinema))}</p>
            <div class="times">${byCinema.get(cinema).map((s) => timeChip(s, now)).join('')}</div>
          </li>`,
        )
        .join('');
      const count = byCinema.size;
      return `<section class="card">
        <div class="card-head">
          <h2>${escapeHtml(data.films[film].title)}</h2>
          <span class="sub">${count === 1 ? '1 Kino' : `${count} Kinos`}</span>
          ${trailerLink(data.films[film].title)}
        </div>
        <ul class="rows">${rows}</ul>
      </section>`;
    })
    .join('');
}

function renderDays(today) {
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i));
  $('#days').innerHTML = days
    .map((d) => {
      const label = dayLabel(d, today);
      return `<button type="button" class="day" data-day="${d}" aria-pressed="${d === state.day}">${label}<small>${shortDate(d)}</small></button>`;
    })
    .join('');
}

function renderFilterPanel() {
  const { data, day, hidden } = state;
  const counts = {};
  for (const s of data.shows) if (s.date === day) counts[s.cinema] = (counts[s.cinema] || 0) + 1;
  $('#filter-list').innerHTML = data.cinemas
    .map(
      (c) => `<label>
        <input type="checkbox" data-cinema="${escapeHtml(c.id)}" ${hidden.has(c.id) ? '' : 'checked'} />
        <span>${escapeHtml(c.name)}</span>
        <span class="count">${counts[c.id] || 0}</span>
      </label>`,
    )
    .join('');
  const total = data.cinemas.length;
  const shown = data.cinemas.filter((c) => !hidden.has(c.id)).length;
  const toggle = $('#filter-toggle');
  toggle.textContent = shown === total ? 'Alle Kinos' : `${shown} von ${total} Kinos`;
  toggle.classList.toggle('active', shown !== total);
}

function renderProgram() {
  if (!state.data) return;
  const now = berlinNow();
  const shows = visibleShows();
  const main = $('#program');
  if (!shows.length) {
    const filtered = state.query || state.hidden.size;
    main.innerHTML = `<div class="empty">
      <p>${filtered ? 'Keine passenden Vorstellungen an diesem Tag.' : 'Für diesen Tag sind noch keine Vorstellungen bekannt.'}</p>
      ${filtered ? '<button type="button" data-reset>Filter zurücksetzen</button>' : ''}
    </div>`;
    return;
  }
  main.innerHTML = state.view === 'film' ? renderByFilm(shows, now) : renderByCinema(shows, now);
}

function renderViewToggle() {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
}

function renderMeta() {
  const { data } = state;
  const generated = new Date(data.generatedAt);
  const text = generated.toLocaleString('de-DE', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const ageHours = (Date.now() - generated.getTime()) / 36e5;
  const meta = $('#meta');
  meta.textContent = `Stand: ${text} Uhr · ${data.cinemas.length} Kinos`;
  if (ageHours > 36) {
    meta.textContent += ' · Achtung: Die Daten sind älter als einen Tag.';
    meta.classList.add('stale');
  }

  $('#sources').innerHTML = data.cinemas
    .map((c) => {
      const label = STATUS_LABEL[c.status] || c.status;
      return `<li><span class="status ${escapeHtml(c.status)}" title="${escapeHtml(label)}"></span>${escapeHtml(c.name)} – ${escapeHtml(c.source)}${
        c.status === 'ok' ? '' : ` (${escapeHtml(label)})`
      }</li>`;
    })
    .join('');
}

function render() {
  if (!state.data) return;
  renderDays(state.today);
  renderViewToggle();
  renderFilterPanel();
  renderProgram();
}

// ---------- Ereignisse ----------

function bindEvents() {
  $('#days').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-day]');
    if (!btn) return;
    state.day = btn.dataset.day;
    render();
  });

  document.querySelectorAll('[data-view]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      saveSettings();
      render();
    }),
  );

  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value;
      renderProgram();
    }, 120);
  });

  $('#filter-toggle').addEventListener('click', () => {
    const panel = $('#filter-panel');
    panel.hidden = !panel.hidden;
    $('#filter-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  });

  $('#filter-list').addEventListener('change', (e) => {
    const id = e.target.dataset.cinema;
    if (!id) return;
    if (e.target.checked) state.hidden.delete(id);
    else state.hidden.add(id);
    saveSettings();
    renderFilterPanel();
    renderProgram();
  });

  document.querySelector('.filter-actions').addEventListener('click', (e) => {
    const mode = e.target.dataset.select;
    if (!mode) return;
    state.hidden = mode === 'all' ? new Set() : new Set(state.data.cinemas.map((c) => c.id));
    saveSettings();
    renderFilterPanel();
    renderProgram();
  });

  $('#program').addEventListener('click', (e) => {
    const filmBtn = e.target.closest('[data-film]');
    if (filmBtn) {
      // "Wo läuft der Film noch?" – zur Filmansicht mit diesem Titel wechseln
      state.view = 'film';
      state.query = state.data.films[filmBtn.dataset.film].title;
      $('#search').value = state.query;
      saveSettings();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (e.target.closest('[data-reset]')) {
      state.query = '';
      state.hidden = new Set();
      $('#search').value = '';
      saveSettings();
      render();
    }
  });
}

// ---------- Start ----------

async function init() {
  loadSettings();
  state.today = berlinNow().date;
  state.day = state.today;
  bindEvents();
  try {
    const res = await fetch('data/program.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    $('#meta').textContent = 'Das Programm konnte nicht geladen werden. Bitte später erneut versuchen.';
    console.error(err);
    return;
  }
  // Ausgeblendete Kinos, die es nicht mehr gibt, vergessen
  const ids = new Set(state.data.cinemas.map((c) => c.id));
  state.hidden = new Set([...state.hidden].filter((id) => ids.has(id)));
  renderMeta();
  render();
}

init();

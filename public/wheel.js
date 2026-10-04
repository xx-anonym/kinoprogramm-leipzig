'use strict';

// Glücksrad – öffnet sich mit Strg+Ü. Einträge selbst beschriften, drehen, Gewinner per Zufall.
(() => {
  const STORAGE_KEY = 'kinoprogramm-leipzig:wheel';
  const MAX_ENTRIES = 40;
  const COLORS = ['#c2272d', '#1f6feb', '#2f9e44', '#e8590c', '#7048e8', '#0c8599', '#d6336c', '#5c940d', '#364fc7', '#a61e4d'];
  const R = 100; // Radius im SVG-Koordinatensystem (viewBox -100 -100 200 200)

  let dialog = null;
  let rotation = 0;
  let spinning = false;
  let entries = [];

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const shorten = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

  function load() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function save(text) {
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      /* optional */
    }
  }

  function parseEntries(text) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX_ENTRIES);
  }

  /** Zufallszahl in [0, 1) aus der Krypto-API (fällt auf Math.random zurück). */
  function random() {
    if (window.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] / 2 ** 32;
    }
    return Math.random();
  }

  // Winkel im Uhrzeigersinn ab 12 Uhr
  const point = (deg, r = R) => {
    const rad = (deg * Math.PI) / 180;
    return [r * Math.sin(rad), -r * Math.cos(rad)];
  };

  function segmentColor(i, n) {
    // Erstes und letztes Segment sollen sich farblich unterscheiden
    if (n > 1 && i === n - 1 && i % COLORS.length === 0) return COLORS[1];
    return COLORS[i % COLORS.length];
  }

  function renderWheel() {
    const svg = dialog.querySelector('.wheel-svg');
    const n = entries.length;
    if (n === 0) {
      svg.innerHTML = `<circle r="${R - 1}" class="wheel-empty"></circle>
        <text class="wheel-hint" text-anchor="middle" dominant-baseline="middle">Einträge hinzufügen</text>`;
      return;
    }
    const seg = 360 / n;
    const fontSize = n <= 6 ? 9 : n <= 12 ? 7.5 : n <= 20 ? 6 : 4.5;
    const maxChars = n <= 6 ? 18 : n <= 12 ? 20 : 24;
    const parts = entries.map((label, i) => {
      const a0 = i * seg;
      const a1 = a0 + seg;
      const color = segmentColor(i, n);
      const shape =
        n === 1
          ? `<circle r="${R}" fill="${color}"></circle>`
          : (() => {
              const [x0, y0] = point(a0);
              const [x1, y1] = point(a1);
              return `<path d="M0 0 L${x0.toFixed(3)} ${y0.toFixed(3)} A${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}Z" fill="${color}"></path>`;
            })();
      const mid = a0 + seg / 2;
      // Auf der linken Radhälfte um 180° drehen, damit nichts auf dem Kopf steht
      const flip = mid > 180;
      const transform = flip ? `rotate(${(mid + 90).toFixed(3)}) translate(${-(R - 8)} 0)` : `rotate(${(mid - 90).toFixed(3)}) translate(${R - 8} 0)`;
      const text = `<text transform="${transform}" text-anchor="${flip ? 'start' : 'end'}" dominant-baseline="middle" font-size="${fontSize}">${escapeHtml(shorten(label, maxChars))}</text>`;
      return `<g class="wheel-segment" data-index="${i}">${shape}${text}</g>`;
    });
    svg.innerHTML = `${parts.join('')}<circle r="9" class="wheel-hub"></circle>`;
  }

  function updateControls() {
    const spinBtn = dialog.querySelector('[data-wheel-spin]');
    spinBtn.disabled = spinning || entries.length < 2;
    dialog.querySelector('.wheel-count').textContent =
      entries.length >= MAX_ENTRIES ? `${MAX_ENTRIES} Einträge (Maximum)` : `${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'}`;
  }

  function setResult(html) {
    dialog.querySelector('.wheel-result').innerHTML = html;
  }

  function spin() {
    if (spinning || entries.length < 2) return;
    spinning = true;
    updateControls();
    setResult('&nbsp;');
    dialog.querySelectorAll('.wheel-segment').forEach((g) => g.classList.remove('dim'));

    const n = entries.length;
    const seg = 360 / n;
    const winner = Math.floor(random() * n);
    // Zielwinkel: Segmentmitte unter den Zeiger (12 Uhr), mit etwas Streuung innerhalb des Segments
    const jitter = (random() - 0.5) * seg * 0.7;
    const target = -(winner * seg + seg / 2 + jitter);
    const current = ((rotation % 360) + 360) % 360;
    const delta = (((target - current) % 360) + 360) % 360;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rotation += (reduced ? 1 : 6) * 360 + delta;

    const rotor = dialog.querySelector('.wheel-rotor');
    rotor.style.transitionDuration = reduced ? '0.6s' : '4.5s';
    rotor.style.transform = `rotate(${rotation}deg)`;

    const done = () => {
      rotor.removeEventListener('transitionend', done);
      clearTimeout(fallback);
      spinning = false;
      updateControls();
      dialog.querySelectorAll('.wheel-segment').forEach((g) => g.classList.toggle('dim', Number(g.dataset.index) !== winner));
      setResult(`🎉 <span>Gewinner:</span> <strong>${escapeHtml(entries[winner])}</strong>`);
    };
    rotor.addEventListener('transitionend', done);
    const fallback = setTimeout(done, reduced ? 1000 : 5000);
  }

  function setEntriesText(text) {
    const textarea = dialog.querySelector('textarea');
    textarea.value = text;
    onInput();
  }

  function onInput() {
    const text = dialog.querySelector('textarea').value;
    save(text);
    entries = parseEntries(text);
    setResult('&nbsp;');
    renderWheel();
    updateControls();
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'wheel-dialog';
    dialog.setAttribute('aria-label', 'Glücksrad');
    dialog.innerHTML = `
      <div class="wheel-head">
        <h2>Glücksrad</h2>
        <button type="button" class="wheel-close" data-wheel-close aria-label="Schließen">×</button>
      </div>
      <div class="wheel-body">
        <div class="wheel-stage">
          <div class="wheel-pointer" aria-hidden="true"></div>
          <div class="wheel-rotor" data-wheel-spin-area title="Drehen">
            <svg class="wheel-svg" viewBox="-100 -100 200 200" role="img" aria-label="Glücksrad"></svg>
          </div>
          <p class="wheel-result" aria-live="polite">&nbsp;</p>
          <button type="button" class="wheel-spin" data-wheel-spin>Drehen</button>
        </div>
        <div class="wheel-editor">
          <label for="wheel-entries">Einträge – einer pro Zeile</label>
          <textarea id="wheel-entries" rows="10" spellcheck="false" placeholder="z. B.&#10;Pizza&#10;Kino&#10;Spaziergang"></textarea>
          <div class="wheel-editor-actions">
            <span class="wheel-count"></span>
            <button type="button" data-wheel-films>Filme einfügen</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    let inputTimer;
    dialog.querySelector('textarea').addEventListener('input', () => {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(onInput, 150);
    });
    dialog.querySelector('[data-wheel-spin]').addEventListener('click', spin);
    dialog.querySelector('[data-wheel-spin-area]').addEventListener('click', spin);
    dialog.querySelector('[data-wheel-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-wheel-films]').addEventListener('click', () => {
      const films = window.kinoprogramm?.dayFilms?.();
      if (films?.titles.length) setEntriesText(films.titles.join('\n'));
    });
    // Klick auf den abgedunkelten Hintergrund schließt
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });

    dialog.querySelector('textarea').value = load();
    onInput();
  }

  /** Knopf nennt den gerade ausgewählten Tag – das Rad verdeckt die Tagesauswahl. */
  function updateFilmsButton() {
    const btn = dialog.querySelector('[data-wheel-films]');
    const films = window.kinoprogramm?.dayFilms?.();
    if (!films) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const filter = films.shownCinemas < films.totalCinemas ? ` (${films.shownCinemas} von ${films.totalCinemas} Kinos)` : '';
    btn.textContent = `Filme von ${films.label} einfügen${filter}`;
    btn.disabled = films.titles.length === 0;
    btn.title = films.titles.length ? `${films.titles.length} Filme` : 'An diesem Tag sind keine Vorstellungen bekannt';
  }

  function toggle() {
    if (!dialog) build();
    if (dialog.open) {
      dialog.close();
      return;
    }
    updateFilmsButton();
    dialog.showModal();
    (entries.length >= 2 ? dialog.querySelector('[data-wheel-spin]') : dialog.querySelector('textarea')).focus();
  }

  /** Strg+Ü – auf dem Mac auch cmd+Ü bzw. control+Ü. "BracketLeft" ist die physische Ü-Taste. */
  function isShortcut(e) {
    if (e.altKey) return false;
    const ue = e.key === 'ü' || e.key === 'Ü';
    if (e.ctrlKey && !e.metaKey) return ue || e.code === 'BracketLeft';
    // cmd+[ ist auf US-Tastaturen "Zurück" – das bleibt dem Browser
    if (e.metaKey && !e.ctrlKey) return ue || (e.code === 'BracketLeft' && e.key !== '[');
    return false;
  }

  document.addEventListener('keydown', (e) => {
    if (isShortcut(e)) {
      e.preventDefault();
      toggle();
    }
  });
})();

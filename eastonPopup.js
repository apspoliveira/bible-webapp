// A single floating popup, docked to the right edge of the screen, showing
// reference-lookup entries (Easton's Bible Dictionary, the Brown-Driver-Briggs
// lexicon, ...) for whichever verse/line is currently being completed (in
// either tab). Dismissing it hides it only for the current verse — it comes
// back fresh as soon as that verse/line changes.
window.EastonPopup = (function () {
  'use strict';

  var els = {};
  var dismissedKey = null;
  var activeTabId = null;
  var DISABLED_KEY = 'eastonPopupDisabled';

  function $(id) { return document.getElementById(id); }

  function isDisabled() {
    try { return localStorage.getItem(DISABLED_KEY) === '1'; } catch (e) { return false; }
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Docked study panel: a resizable column on wide screens, a draggable
  // bottom sheet on narrow ones. It's a non-modal complementary region (not a
  // <dialog>/Offcanvas) on purpose: the user keeps typing in the editor while
  // it is open, so it must not trap focus or block the page.
  var MOBILE = window.matchMedia('(max-width: 991.98px)');
  var SIZE_KEY = { w: 'studyPanelWidth', h: 'studyPanelHeight' };

  function setOpen(open) {
    els.root.classList.toggle('d-none', !open);
    document.body.classList.toggle('panel-open', open);
    if (els.toggleBtn) els.toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function applySize(kind, px) {
    var max = kind === 'w' ? window.innerWidth * 0.7 : window.innerHeight * 0.8;
    var min = kind === 'w' ? 280 : 120;
    px = Math.round(Math.max(min, Math.min(max, px)));
    document.documentElement.style.setProperty(kind === 'w' ? '--panel-w' : '--sheet-h', px + 'px');
    return px;
  }

  function saveSize(kind, px) {
    try { localStorage.setItem(SIZE_KEY[kind], String(px)); } catch (e) { /* ignore */ }
  }

  function initSizing() {
    ['w', 'h'].forEach(function (kind) {
      var saved = null;
      try { saved = Number(localStorage.getItem(SIZE_KEY[kind])); } catch (e) { /* ignore */ }
      if (saved) applySize(kind, saved);
    });

    var handle = $('panelResizer');
    if (!handle) return;
    var dragging = false;

    function currentSize() {
      return MOBILE.matches ? els.root.getBoundingClientRect().height : els.root.getBoundingClientRect().width;
    }

    handle.addEventListener('pointerdown', function (e) {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('panel-resizing');
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (MOBILE.matches) applySize('h', window.innerHeight - e.clientY);
      else applySize('w', window.innerWidth - e.clientX);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('panel-resizing');
      var kind = MOBILE.matches ? 'h' : 'w';
      saveSize(kind, Math.round(currentSize()));
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    // Keyboard: arrows grow/shrink (toward the editor = bigger panel).
    handle.addEventListener('keydown', function (e) {
      var grow = MOBILE.matches ? 'ArrowUp' : 'ArrowLeft';
      var shrink = MOBILE.matches ? 'ArrowDown' : 'ArrowRight';
      if (e.key !== grow && e.key !== shrink) return;
      e.preventDefault();
      var kind = MOBILE.matches ? 'h' : 'w';
      saveSize(kind, applySize(kind, currentSize() + (e.key === grow ? 24 : -24)));
    });
  }

  function init() {
    els.root = $('eastonPopup');
    els.body = $('eastonPopupBody');
    els.closeBtn = $('eastonPopupClose');
    els.disableCheck = $('eastonPopupDisabled');
    els.toggleBtn = $('panelToggle');
    if (!els.root) return;

    initSizing();

    // Header button: show/hide the panel for the current verse (also brings
    // it back after it was closed with the X).
    if (els.toggleBtn) {
      els.toggleBtn.addEventListener('click', function () {
        if (!els.root.classList.contains('d-none')) {
          dismissedKey = els.root.dataset.key || 'x';
          setOpen(false);
        } else if (els.body.innerHTML) {
          dismissedKey = null;
          setOpen(true);
        }
      });
    }

    els.closeBtn.addEventListener('click', function () {
      dismissedKey = els.root.dataset.key || 'x';
      hide();
    });

    if (els.disableCheck) {
      els.disableCheck.checked = isDisabled();
      els.disableCheck.addEventListener('change', function () {
        try { localStorage.setItem(DISABLED_KEY, els.disableCheck.checked ? '1' : '0'); } catch (e) { /* ignore */ }
        if (els.disableCheck.checked) {
          hide();
        } else if (els.body.innerHTML) {
          // Content for the current verse is still rendered from before it
          // was hidden -- show it again immediately instead of waiting for
          // the next verse change to call show() with fresh data.
          setOpen(true);
        }
      });
    }

    // Delegated: BDB/Thayer entries are English by default and translate to
    // Portuguese on demand, the first time the user actually opens one
    // (translate() itself no-ops instantly on a cache hit). Concordance
    // entries lazily build their (possibly huge) occurrence list the same
    // way, the first time they're opened.
    els.body.addEventListener('toggle', function (e) {
      var details = e.target;
      if (!details.classList || !details.classList.contains('easton-entry')) return;
      if (!details.open) return;
      if (details.dataset.lazyIdx) fillLazy(details);
      if (details.dataset.strong && details.dataset.translated !== '1') startTranslation(details);
      if (details.dataset.concStrong) loadConcordanceOccurrences(details);
    }, true);

    // Delegated: clicking a tab switches which section's panel is visible,
    // without re-rendering (the other panels' entries/translations stay as
    // they were, just hidden).
    els.body.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.easton-tab');
      if (!btn) return;
      var id = btn.dataset.tabId;
      if (!id || id === activeTabId) return;
      activeTabId = id;
      activate(sectionsById[id]);
      els.body.querySelectorAll('.easton-tab').forEach(function (t) {
        t.classList.toggle('active', t.dataset.tabId === id);
      });
      els.body.querySelectorAll('.easton-tab-panel').forEach(function (p) {
        p.classList.toggle('d-none', p.dataset.panelId !== id);
      });
    });
  }

  function startTranslation(details) {
    if (!window.BdbTranslate) return;
    details.dataset.translated = '1';
    var textEl = details.querySelector('.easton-text');
    var strong = details.dataset.strong;
    var english = textEl.dataset.en;

    var cached = window.BdbTranslate.getCached(strong);
    if (!cached) {
      var note = document.createElement('div');
      note.className = 'easton-translating';
      note.textContent = 'A traduzir…';
      textEl.insertBefore(note, textEl.firstChild);
    }

    window.BdbTranslate.translate(strong, english, function (translated, err) {
      var pending = details.querySelector('.easton-translating');
      if (pending) pending.remove();
      if (translated) {
        if (details.dataset.linkRefs === '1' && window.BibleRefs) textEl.innerHTML = window.BibleRefs.linkify(translated);
        else textEl.textContent = translated;
      } else {
        var warn = document.createElement('div');
        warn.className = 'easton-translate-error';
        warn.textContent = 'Não foi possível traduzir agora (mostrando em inglês).';
        textEl.insertBefore(warn, textEl.firstChild);
        details.dataset.translated = '0'; // allow retry next time it's opened
      }
    });
  }

  // Formats and inserts the (possibly thousands of lines) occurrence list
  // for a concordance entry, once, the first time it's opened -- keeps the
  // initial popup render cheap regardless of how common the word is.
  function loadConcordanceOccurrences(details) {
    var box = details.querySelector('.concordance-occurrences');
    if (!box || box.dataset.loaded === '1' || !window.StrongConcordance) return;
    box.dataset.loaded = '1';
    box.textContent = 'A carregar ocorrências…';
    var parts = details.dataset.concExclude.split(',');
    var text = window.StrongConcordance.renderOccurrences(
      details.dataset.concStrong, Number(parts[0]), Number(parts[1]), Number(parts[2])
    );
    box.innerHTML = text;
  }

  // Each entry renders as a native <details> — the term is always visible as
  // the clickable summary, and the (possibly long, especially for BDB) body
  // text only takes up space once expanded. `openByDefault` controls whether
  // entries in this section start expanded (short, high-value Easton entries)
  // or collapsed (long, dense BDB entries you look up on demand). When
  // `translatable`, the English text is shown first and swapped for a
  // Portuguese machine translation the first time the entry is opened. When
  // `concordanceMode`, the meaning renders immediately but the (possibly
  // thousands of lines) occurrence list is left for loadConcordanceOccurrences
  // to fill in lazily, on first open.
  // Very long entries (ISBE articles run to hundreds of thousands of characters)
  // are not formatted or linked until opened; their text waits here. They are
  // not machine-translated either (too long for the translation service).
  var lazyTexts = [];

  // Sections whose data is not loaded yet (dataloader.js) render as "pending"
  // tabs; opening one loads its data, after which StudyPanel re-renders.
  var sectionsById = {};
  var loadingIds = {};

  function activate(section) {
    if (!section || !section.pending || loadingIds[section.id]) return;
    loadingIds[section.id] = true;
    var panel = els.body.querySelector('.easton-tab-panel[data-panel-id="' + section.id + '"]');
    if (panel) panel.innerHTML = '<div class="easton-pending">A carregar (≈' + Math.max(1, Math.round(section.pendingMb)) + ' MB)…</div>';
    Promise.resolve(section.onActivate && section.onActivate()).then(function (ok) {
      delete loadingIds[section.id];
      if (!ok && panel) panel.innerHTML = '<div class="easton-translate-error">Não foi possível carregar este recurso.</div>';
    });
  }

  function fillLazy(details) {
    var box = details.querySelector('.easton-text');
    if (!box || box.dataset.lazy !== '1') return;
    box.dataset.lazy = '0';
    var text = lazyTexts[Number(details.dataset.lazyIdx)] || '';
    box.innerHTML = details.dataset.linkRefs === '1' && window.BibleRefs ? window.BibleRefs.linkify(text) : escapeHtml(text);
  }

  function renderEntries(entries, openByDefault, translatable, concordanceMode) {
    return entries.map(function (entry) {
      if (entry.lazy && !concordanceMode) {
        lazyTexts.push(entry.text);
        return '<details class="easton-entry"' + (openByDefault ? ' open' : '') + ' data-lazy-idx="' + (lazyTexts.length - 1) + '"' +
          (entry.linkRefs ? ' data-link-refs="1"' : '') + '>' +
          '<summary class="easton-term">' + escapeHtml(entry.name) +
          ' <span class="easton-size">' + Math.round(entry.text.length / 1000) + ' mil car.</span></summary>' +
          '<div class="easton-text" data-lazy="1">A carregar…</div></details>';
      }

      if (concordanceMode) {
        var meaningHtml = entry.meaning ? '<div class="concordance-meaning">' + escapeHtml(entry.meaning) + '</div>' : '';
        var excludeAttr = entry.excludeBookIdx + ',' + entry.excludeChapter + ',' + entry.excludeVerse;
        return '<details class="easton-entry"' + (openByDefault ? ' open' : '') +
          ' data-conc-strong="' + escapeHtml(entry.strong) + '" data-conc-exclude="' + escapeHtml(excludeAttr) + '">' +
          '<summary class="easton-term">' + escapeHtml(entry.name) + '</summary>' +
          '<div class="easton-text">' + meaningHtml +
          '<div class="concordance-occurrences" data-loaded="0"></div>' +
          '</div></details>';
      }

      // BDB/Thayer entries carry their own `strong` identity (used for the
      // translation cache/DOM key) separately from `name` (the verse's own
      // word, shown as the summary) — Easton entries have only `name`.
      var strongKey = entry.strong || entry.name;
      var cachedPt = translatable && window.BdbTranslate ? window.BdbTranslate.getCached(strongKey) : null;
      var shown = cachedPt || entry.text;
      var attrs = translatable
        ? ' data-strong="' + escapeHtml(strongKey) + '"' + (cachedPt ? ' data-translated="1"' : '') + (entry.linkRefs ? ' data-link-refs="1"' : '')
        : '';
      var textDataAttr = translatable ? ' data-en="' + escapeHtml(entry.text) + '"' : '';

      // `entry.html` (already-escaped markup with linked references) wins
      // over plain `text`; `entry.ref` adds a link to the summary's passage.
      var refLink = entry.ref && window.BibleRefs
        ? ' <span class="easton-ref">' + window.BibleRefs.link(entry.ref[0], entry.ref[1], entry.ref[2], entry.ref[3], '<i class="bi bi-box-arrow-up-right" aria-label="Abrir versículo"></i>', true) + '</span>'
        : '';
      var bodyHtml = cachedPt ? (entry.linkRefs && window.BibleRefs ? window.BibleRefs.linkify(cachedPt) : escapeHtml(cachedPt)) : (entry.html || escapeHtml(shown));
      return '<details class="easton-entry"' + (openByDefault ? ' open' : '') + attrs + '>' +
        '<summary class="easton-term">' + escapeHtml(entry.name) + refLink + '</summary>' +
        '<div class="easton-text"' + textDataAttr + '>' + bodyHtml + '</div>' +
        '</details>';
    }).join('');
  }

  // `sections` is an array of {id, title, shortTitle, entries: [{name, text}],
  // openByDefault, translatable}; sections with no entries are skipped. `id`
  // identifies the section across verses (e.g. 'easton', 'bdb', 'tsk') so the
  // user's chosen tab stays selected as they move between verses. `key`
  // identifies the verse/line this call is for (e.g. a reference string) —
  // passing the same key repeatedly (as the user keeps typing the same verse)
  // keeps a manual dismissal in effect; a new key clears it.
  function show(sections, key) {
    if (!els.root) return;
    if (isDisabled()) { hide(); return; }
    lazyTexts = [];
    var nonEmpty = (sections || []).filter(function (s) { return s.pending || (s.entries && s.entries.length); });
    sectionsById = {};
    nonEmpty.forEach(function (s) { sectionsById[s.id] = s; });
    if (!nonEmpty.length) {
      hide();
      return;
    }

    els.root.dataset.key = key || '';
    if (dismissedKey !== null && dismissedKey === (key || '')) {
      return; // user closed it for this exact verse — stay hidden until it changes
    }

    // Keep whichever tab the user had selected, as long as it still has
    // content for this verse; otherwise fall back to the first tab.
    if (!activeTabId || !nonEmpty.some(function (s) { return s.id === activeTabId; })) {
      activeTabId = nonEmpty[0].id;
    }

    var tabsHtml = nonEmpty.map(function (s) {
      var cls = 'easton-tab' + (s.id === activeTabId ? ' active' : '');
      return '<button type="button" class="' + cls + '" data-tab-id="' + escapeHtml(s.id) + '" title="' + escapeHtml(s.title) + '">' +
        (s.icon ? '<i class="bi bi-' + escapeHtml(s.icon) + '" aria-hidden="true"></i> ' : '') + escapeHtml(s.shortTitle || s.title) + ' <span class="easton-count">' +
        (s.pending ? '<i class="bi bi-cloud-arrow-down" aria-label="por carregar"></i>' : s.entries.length) + '</span></button>';
    }).join('');

    var panelsHtml = nonEmpty.map(function (s) {
      var hiddenCls = s.id === activeTabId ? '' : ' d-none';
      return '<div class="easton-tab-panel' + hiddenCls + '" data-panel-id="' + escapeHtml(s.id) + '">' +
        (s.pending
          ? '<div class="easton-pending">Clique neste separador para carregar (≈' + Math.max(1, Math.round(s.pendingMb)) + ' MB).</div>'
          : renderEntries(s.entries, s.openByDefault, s.translatable, s.concordanceMode)) + '</div>';
    }).join('');

    els.body.innerHTML = '<div class="easton-tabs">' + tabsHtml + '</div>' +
      '<div class="easton-tab-panels">' + panelsHtml + '</div>';
    setOpen(true);
    activate(sectionsById[activeTabId]);

    // Entries that render already-open (openByDefault) and are translatable
    // should start translating immediately rather than waiting for a toggle
    // event that will never fire (they're already open).
    els.body.querySelectorAll('details.easton-entry[open][data-strong]').forEach(function (details) {
      if (details.dataset.translated !== '1') startTranslation(details);
    });
  }

  function hide() {
    if (els.root) setOpen(false);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { show: show, hide: hide };
})();

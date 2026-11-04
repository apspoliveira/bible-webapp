(function () {
  'use strict';

  var AC = window.BibleAutocomplete;
  // Matos Soares loads on demand (dataloader.js), so read the globals at call time.
  var DATASET_GLOBALS = { pt: 'BIBLE_PT', ms: 'BIBLE_PT_MS', en: 'BIBLE_KJV' };
  var PT_LANGS = { pt: true, ms: true };
  var STORAGE_KEY = 'biblePracticeState';

  var state = {
    lang: 'pt',
    bookIdx: 0,
    chapterIdx: 0,
    verseIdx: 0,
    lookahead: 5,
    lenient: true,
    wordCount: 1,
    targetWords: [],
    startTime: null,
    timerHandle: null,
    completed: false
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    els.langSelect = $('langSelect');
    els.bookSelect = $('bookSelect');
    els.chapterSelect = $('chapterSelect');
    els.verseSelect = $('verseSelect');
    els.randomBtn = $('randomBtn');
    els.referenceLabel = $('referenceLabel');
    els.verseDisplay = $('verseDisplay');
    els.progressBar = $('progressBar');
    els.typingArea = $('typingArea');
    els.statusMsg = $('statusMsg');
    els.lookaheadRange = $('lookaheadRange');
    els.lookaheadValue = $('lookaheadValue');
    els.lenientCheck = $('lenientCheck');
    els.wordCountInput = $('wordCountInput');
    els.revealBtn = $('revealBtn');
    els.resetBtn = $('resetBtn');
    els.prevBtn = $('prevBtn');
    els.nextBtn = $('nextBtn');
    els.timerLabel = $('timerLabel');
    els.themeToggle = $('themeToggle');
  }

  function dataset() { return window[DATASET_GLOBALS[state.lang]] || []; }
  function currentBook() { return dataset()[state.bookIdx]; }
  function currentChapter() {
    var book = currentBook();
    return book ? book.chapters[state.chapterIdx] : null;
  }
  function currentVerseText() {
    var chapter = currentChapter();
    return chapter ? chapter[state.verseIdx] : '';
  }

  function chapterHasVerses(chapter) {
    return Array.isArray(chapter) && chapter.length > 0;
  }

  function findFirstNonEmptyChapter(book) {
    for (var i = 0; i < book.chapters.length; i++) {
      if (chapterHasVerses(book.chapters[i])) return i;
    }
    return 0;
  }

  // ---------- Populate selects ----------

  function populateBookSelect() {
    var books = dataset();
    els.bookSelect.innerHTML = books.map(function (b, i) {
      return '<option value="' + i + '">' + b.name + '</option>';
    }).join('');
  }

  function populateChapterSelect() {
    var book = currentBook();
    var opts = [];
    for (var i = 0; i < book.chapters.length; i++) {
      if (chapterHasVerses(book.chapters[i])) {
        opts.push('<option value="' + i + '">' + (i + 1) + '</option>');
      }
    }
    els.chapterSelect.innerHTML = opts.join('');
  }

  function populateVerseSelect() {
    var chapter = currentChapter();
    var opts = [];
    for (var i = 0; i < chapter.length; i++) {
      opts.push('<option value="' + i + '">' + (i + 1) + '</option>');
    }
    els.verseSelect.innerHTML = opts.join('');
  }

  // ---------- Load / render verse ----------

  function loadVerse(resetText) {
    var book = currentBook();
    if (!book) return;

    els.bookSelect.value = String(state.bookIdx);
    els.chapterSelect.value = String(state.chapterIdx);
    els.verseSelect.value = String(state.verseIdx);

    var reference = book.name + ' ' + (state.chapterIdx + 1) + ':' + (state.verseIdx + 1);
    els.referenceLabel.textContent = reference;

    state.targetWords = AC.splitWords(currentVerseText());
    state.completed = false;
    els.verseDisplay.classList.remove('reveal-all');
    els.statusMsg.textContent = '';
    els.statusMsg.className = 'small text-muted';
    renderEastonPanel();

    if (resetText !== false) {
      AC.removeGhost(els.typingArea);
      els.typingArea.textContent = '';
    }

    stopTimer();
    state.startTime = null;
    els.timerLabel.textContent = '00:00';

    updateAutocomplete();
    els.typingArea.focus();
    saveState();
  }

  function renderEastonPanel() {
    // Dictionaries are matched against the Portuguese text in Portuguese
    // practice and against the KJV text in English practice.
    window.StudyPanel.show({
      bookIdx: state.bookIdx,
      chapter: state.chapterIdx + 1,
      verse: state.verseIdx + 1,
      words: state.targetWords,
      isPt: !!PT_LANGS[state.lang]
    }, 'single:' + state.bookIdx + ':' + state.chapterIdx + ':' + state.verseIdx);
  }

  function render(typedText) {
    var typedWords = AC.splitWords(typedText);
    var lenient = state.lenient;
    var lookahead = state.lookahead;
    var correctCount = 0;

    var highlightSpans = window.BibleHighlight ? window.BibleHighlight.computeSpans(state.targetWords) : [];

    var html = state.targetWords.map(function (target, i) {
      var cls, text;
      if (i < typedWords.length) {
        var match = lenient
          ? AC.normalizeWordForCompare(typedWords[i]) === AC.normalizeWordForCompare(target)
          : typedWords[i] === target;
        if (match) correctCount++;
        cls = match ? 'word-correct' : 'word-wrong';
        text = target;
      } else if (i < typedWords.length + lookahead) {
        cls = 'word-hint';
        text = target;
      } else {
        cls = 'word-hidden';
        text = target;
      }

      var styleAttr = '';
      if (cls !== 'word-hidden' && highlightSpans[i]) {
        cls += ' word-keyword';
        styleAttr = ' style="color:' + highlightSpans[i].color + ';background-color:' + highlightSpans[i].backgroundColor + ';"';
      }

      return '<span class="word ' + cls + '"' + styleAttr + '>' + escapeHtml(text) + '</span>';
    }).join(' ');

    els.verseDisplay.innerHTML = html;

    var total = state.targetWords.length;
    var percent = total ? Math.round((correctCount / total) * 100) : 0;
    els.progressBar.style.width = percent + '%';
    els.progressBar.className = 'progress-bar' + (percent === 100 ? ' bg-success' : '');

    if (total && correctCount === total && typedWords.length >= total && !state.completed) {
      state.completed = true;
      stopTimer();
      els.statusMsg.textContent = 'Versiculo completo! Toque em "Proximo verso" para continuar.';
      els.statusMsg.className = 'small text-success';
    } else if (typedWords.length > total) {
      els.statusMsg.textContent = 'Texto mais longo que o versículo — verifique se não repetiu palavras.';
      els.statusMsg.className = 'small text-warning';
    } else if (!state.completed) {
      els.statusMsg.textContent = correctCount + ' / ' + total + ' palavras corretas (Tab autocompleta a palavra)';
      els.statusMsg.className = 'small text-muted';
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------- Autocomplete wiring ----------

  function updateAutocomplete() {
    AC.removeGhost(els.typingArea);
    var offset = AC.getCaretOffset(els.typingArea);
    var fullText = AC.stripCaretAnchors(els.typingArea.textContent);
    AC.rebuildHighlightedContent(els.typingArea, fullText, offset);

    var context = { words: state.targetWords, anchorOffset: 0 };
    var result = AC.computeSuggestion(fullText, offset, context, state.lenient, state.wordCount);

    if (result && result.suggestion) {
      AC.insertGhost(els.typingArea, offset, result.suggestion);
    }

    render(fullText);
  }

  // ---------- Timer ----------

  function stopTimer() {
    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
  }

  function ensureTimerRunning() {
    if (state.timerHandle || state.completed) return;
    state.startTime = state.startTime || Date.now();
    state.timerHandle = setInterval(updateTimerLabel, 1000);
  }

  function updateTimerLabel() {
    if (!state.startTime) return;
    var elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    var mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    var ss = String(elapsed % 60).padStart(2, '0');
    els.timerLabel.textContent = mm + ':' + ss;
  }

  // ---------- Navigation ----------

  function stepVerse(direction) {
    var book = currentBook();
    var chapter = currentChapter();

    var newVerse = state.verseIdx + direction;
    if (newVerse >= 0 && newVerse < chapter.length) {
      state.verseIdx = newVerse;
      loadVerse();
      return;
    }

    var chapterIdx = state.chapterIdx;
    do {
      chapterIdx += direction;
      if (chapterIdx < 0) {
        state.bookIdx = (state.bookIdx - 1 + dataset().length) % dataset().length;
        book = currentBook();
        chapterIdx = book.chapters.length - 1;
      } else if (chapterIdx >= book.chapters.length) {
        state.bookIdx = (state.bookIdx + 1) % dataset().length;
        book = currentBook();
        chapterIdx = 0;
      }
    } while (!chapterHasVerses(book.chapters[chapterIdx]));

    state.chapterIdx = chapterIdx;
    state.verseIdx = direction > 0 ? 0 : book.chapters[chapterIdx].length - 1;
    loadVerse();
  }

  function pickRandomIndices() {
    var books = dataset();
    var bookIdx = Math.floor(Math.random() * books.length);
    var book = books[bookIdx];
    var nonEmptyChapters = [];
    for (var i = 0; i < book.chapters.length; i++) {
      if (chapterHasVerses(book.chapters[i])) nonEmptyChapters.push(i);
    }
    var chapterIdx = nonEmptyChapters[Math.floor(Math.random() * nonEmptyChapters.length)];
    var verseIdx = Math.floor(Math.random() * book.chapters[chapterIdx].length);
    return { bookIdx: bookIdx, chapterIdx: chapterIdx, verseIdx: verseIdx };
  }

  function pickRandom() {
    var picked = pickRandomIndices();
    state.bookIdx = picked.bookIdx;
    state.chapterIdx = picked.chapterIdx;
    state.verseIdx = picked.verseIdx;
    populateChapterSelect();
    populateVerseSelect();
    loadVerse();
  }

  // Jump to a reference (1-based chapter/verse) from the study panel's links.
  // Switches to a Portuguese translation if needed, and to the single-verse tab.
  function goTo(bookIdx, chapter, verse) {
    if (!PT_LANGS[state.lang]) {
      state.lang = 'pt';
      els.langSelect.value = 'pt';
      populateBookSelect();
    }
    var book = dataset()[bookIdx];
    if (!book || !chapterHasVerses(book.chapters[chapter - 1])) return;
    state.bookIdx = bookIdx;
    state.chapterIdx = chapter - 1;
    state.verseIdx = Math.min(Math.max(verse - 1, 0), book.chapters[chapter - 1].length - 1);
    populateChapterSelect();
    populateVerseSelect();
    var tabBtn = $('tab-single-btn');
    if (tabBtn && window.bootstrap) window.bootstrap.Tab.getOrCreateInstance(tabBtn).show();
    loadVerse();
  }
  window.BibleNav = { goTo: goTo };

  // ---------- Persistence ----------

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lang: state.lang,
        bookIdx: state.bookIdx,
        chapterIdx: state.chapterIdx,
        verseIdx: state.verseIdx,
        lookahead: state.lookahead,
        lenient: state.lenient,
        wordCount: state.wordCount
      }));
    } catch (e) { /* ignore (private mode, storage disabled, etc.) */ }
  }

  function loadSavedState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  // ---------- Theme ----------

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    try { localStorage.setItem('biblePracticeTheme', theme); } catch (e) { /* ignore */ }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('biblePracticeTheme'); } catch (e) { /* ignore */ }
    var theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
  }

  // ---------- Wiring ----------

  function onLangChange() {
    var wanted = els.langSelect.value;
    if (wanted === 'ms' && !window.BIBLE_PT_MS) {
      // Matos Soares is not part of the initial load: fetch it, then switch.
      els.langSelect.disabled = true;
      window.DataLoader.load('bible_ms').then(function (ok) {
        els.langSelect.disabled = false;
        if (!ok) { els.langSelect.value = state.lang; return; }
        applyLang(wanted);
      });
      return;
    }
    applyLang(wanted);
  }

  function applyLang(lang) {
    state.lang = lang;
    if (!dataset().length) return;
    state.bookIdx = Math.min(state.bookIdx, dataset().length - 1);
    populateBookSelect();
    var book = currentBook();
    state.chapterIdx = Math.min(state.chapterIdx, book.chapters.length - 1);
    if (!chapterHasVerses(book.chapters[state.chapterIdx])) {
      state.chapterIdx = findFirstNonEmptyChapter(book);
    }
    populateChapterSelect();
    var chapter = currentChapter();
    state.verseIdx = Math.min(state.verseIdx, chapter.length - 1);
    populateVerseSelect();
    loadVerse();
  }

  function onBookChange() {
    state.bookIdx = Number(els.bookSelect.value);
    state.chapterIdx = findFirstNonEmptyChapter(currentBook());
    populateChapterSelect();
    state.verseIdx = 0;
    populateVerseSelect();
    loadVerse();
  }

  function onChapterChange() {
    state.chapterIdx = Number(els.chapterSelect.value);
    state.verseIdx = 0;
    populateVerseSelect();
    loadVerse();
  }

  function onVerseChange() {
    state.verseIdx = Number(els.verseSelect.value);
    loadVerse();
  }

  function bindEvents() {
    els.langSelect.addEventListener('change', onLangChange);
    els.bookSelect.addEventListener('change', onBookChange);
    els.chapterSelect.addEventListener('change', onChapterChange);
    els.verseSelect.addEventListener('change', onVerseChange);
    els.randomBtn.addEventListener('click', pickRandom);

    els.typingArea.addEventListener('input', function () {
      ensureTimerRunning();
      updateAutocomplete();
      saveState();
    });

    els.typingArea.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (AC.acceptGhost(els.typingArea)) {
          ensureTimerRunning();
          updateAutocomplete();
          saveState();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        AC.removeGhost(els.typingArea);
        AC.insertPlainText('\n');
        updateAutocomplete();
      }
    });

    ['keyup', 'click'].forEach(function (evt) {
      els.typingArea.addEventListener(evt, function (e) {
        if (evt === 'keyup' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) === -1) return;
        updateAutocomplete();
      });
    });

    els.lookaheadRange.addEventListener('input', function () {
      state.lookahead = Number(els.lookaheadRange.value);
      els.lookaheadValue.textContent = String(state.lookahead);
      updateAutocomplete();
      saveState();
    });

    els.lenientCheck.addEventListener('change', function () {
      state.lenient = els.lenientCheck.checked;
      updateAutocomplete();
      saveState();
    });

    els.wordCountInput.addEventListener('change', function () {
      var value = Math.max(1, Math.min(10, Number(els.wordCountInput.value) || 1));
      els.wordCountInput.value = String(value);
      state.wordCount = value;
      updateAutocomplete();
      saveState();
    });

    els.revealBtn.addEventListener('click', function () {
      els.verseDisplay.classList.toggle('reveal-all');
    });

    els.resetBtn.addEventListener('click', function () {
      AC.removeGhost(els.typingArea);
      els.typingArea.textContent = '';
      loadVerse(false);
    });

    els.prevBtn.addEventListener('click', function () { stepVerse(-1); });
    els.nextBtn.addEventListener('click', function () { stepVerse(1); });

    els.themeToggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-bs-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  function init() {
    cacheEls();
    initTheme();

    var saved = loadSavedState();
    if (saved) {
      state.lang = saved.lang || 'pt';
      state.bookIdx = saved.bookIdx || 0;
      state.chapterIdx = saved.chapterIdx || 0;
      state.verseIdx = saved.verseIdx || 0;
      state.lookahead = (typeof saved.lookahead === 'number') ? saved.lookahead : 5;
      state.lenient = (typeof saved.lenient === 'boolean') ? saved.lenient : true;
      state.wordCount = (typeof saved.wordCount === 'number') ? saved.wordCount : 1;
    }

    if (!window[DATASET_GLOBALS[state.lang]]) state.lang = 'pt'; // e.g. Matos Soares failed to load
    els.langSelect.value = state.lang;
    els.lookaheadRange.value = String(state.lookahead);
    els.lookaheadValue.textContent = String(state.lookahead);
    els.lenientCheck.checked = state.lenient;
    els.wordCountInput.value = String(state.wordCount);

    populateBookSelect();

    var book = dataset()[state.bookIdx];
    if (!book || !chapterHasVerses(book.chapters[state.chapterIdx])) {
      state.bookIdx = Math.min(state.bookIdx, dataset().length - 1);
      book = currentBook();
      state.chapterIdx = findFirstNonEmptyChapter(book);
      state.verseIdx = 0;
    }
    populateChapterSelect();
    var chapter = currentChapter();
    state.verseIdx = Math.min(state.verseIdx, Math.max(chapter.length - 1, 0));
    populateVerseSelect();

    bindEvents();
    loadVerse();
  }

  document.addEventListener('DOMContentLoaded', function () {
    // A saved Matos Soares session must have its Bible before the first render.
    var saved = loadSavedState();
    if (saved && saved.lang === 'ms' && !window.BIBLE_PT_MS) window.DataLoader.load('bible_ms').then(init);
    else init();
  });
})();

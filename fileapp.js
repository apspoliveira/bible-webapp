(function () {
  'use strict';

  var AC = window.BibleAutocomplete;
  var BIBLE_PT = window.BIBLE_PT || [];

  var SKIP_DIRS = new Set(['snippets_by_verse', '.git', '.vscode', 'node_modules', 'webapp']);
  var SAVE_DEBOUNCE_MS = 600;
  var DEFAULT_TITLE = document.title;

  var state = {
    rootHandle: null,
    files: [],           // {path, handle}
    currentFile: null,    // {path, handle}
    lenient: true,
    wordCount: 1,
    saveTimer: null,
    lastSavedText: null,
    savePending: false,
    saveQueued: false
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    els.openFolderBtn = $('openFolderBtn');
    els.folderStatus = $('folderStatus');
    els.fsaUnsupported = $('fsaUnsupported');
    els.fileBrowser = $('fileBrowser');
    els.toggleFileBrowserBtn = $('toggleFileBrowserBtn');
    els.fileFilter = $('fileFilter');
    els.fileList = $('fileList');
    els.currentFilePath = $('currentFilePath');
    els.detectedReference = $('detectedReference');
    els.keywordPreview = $('keywordPreview');
    els.saveStatus = $('saveStatus');
    els.fileEditor = $('fileEditor');
    els.fileLenientCheck = $('fileLenientCheck');
    els.fileWordCountInput = $('fileWordCountInput');
    els.insertRandomRefBtn = $('insertRandomRefBtn');
    els.downloadFileBtn = $('downloadFileBtn');
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Falha ao carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ---------- Directory walk ----------

  // Errors from individual entries (permission quirks, cloud-placeholder files, etc.)
  // are collected but don't abort the whole walk — one bad file shouldn't hide every other one.
  async function collectMarkdownFiles(dirHandle, relPath, out, walkErrors) {
    var iterator;
    try {
      iterator = dirHandle.entries();
    } catch (e) {
      walkErrors.push(relPath + ' -> ' + (e && e.message || e));
      return;
    }
    while (true) {
      var step;
      try {
        step = await iterator.next();
      } catch (e) {
        walkErrors.push(relPath + ' -> ' + (e && e.message || e));
        break;
      }
      if (step.done) break;
      var name = step.value[0];
      var handle = step.value[1];
      try {
        if (handle.kind === 'directory') {
          if (SKIP_DIRS.has(name)) continue;
          await collectMarkdownFiles(handle, relPath + name + '/', out, walkErrors);
        } else if (/\.md$/i.test(name)) {
          out.push(window.FileStorage.wrapFsaEntry(relPath + name, handle));
        }
      } catch (e) {
        walkErrors.push(relPath + name + ' -> ' + (e && e.message || e));
      }
    }
  }

  async function openFolder() {
    try {
      // `id` makes Chrome/Edge remember the last folder picked under this key and
      // reopen the dialog there next time, instead of always defaulting to Documents
      // (the very first pick still starts wherever the OS/browser defaults to).
      state.rootHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'biblia-root' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.error('showDirectoryPicker failed', e);
      els.folderStatus.textContent = 'Erro ao abrir pasta (' + (e && e.name) + '): ' + (e && e.message);
      return;
    }

    try {
      var permission = await state.rootHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        permission = await state.rootHandle.requestPermission({ mode: 'readwrite' });
      }
      if (permission !== 'granted') {
        els.folderStatus.textContent = 'Permissão de leitura/escrita não concedida para esta pasta (estado: ' + permission + ').';
        return;
      }
    } catch (e) {
      console.error('permission check failed', e);
      // Some browsers don't implement queryPermission for directories; continue and let the
      // actual read/write calls surface any real problem instead of blocking here.
    }

    els.folderStatus.textContent = 'A indexar ficheiros .md...';
    state.files = [];
    var walkErrors = [];
    try {
      await collectMarkdownFiles(state.rootHandle, '', state.files, walkErrors);
    } catch (e) {
      console.error('collectMarkdownFiles failed', e);
      els.folderStatus.textContent = 'Erro ao indexar (' + (e && e.name) + '): ' + (e && e.message);
      return;
    }
    state.files.sort(function (a, b) { return a.path.localeCompare(b.path); });

    var statusText = state.files.length + ' ficheiro(s) .md em "' + state.rootHandle.name + '"';
    if (walkErrors.length) {
      statusText += ' (' + walkErrors.length + ' erro(s) ao percorrer — ver consola)';
      console.warn('Erros ao indexar ficheiros:', walkErrors);
    }
    els.folderStatus.textContent = statusText;

    if (!state.files.length) {
      els.fileList.innerHTML = '<div class="text-muted small p-2">' +
        'Nenhum ficheiro .md encontrado nesta pasta (ou nas suas subpastas).' +
        (location.protocol === 'file:'
          ? ' Está a abrir a página com duplo clique (file://) — experimente em vez disso correr um servidor local (ver nota abaixo) e volte a tentar.'
          : '') +
        '</div>';
      setFileBrowserCollapsed(false);
      return;
    }

    setFileBrowserCollapsed(false);
    renderFileList('');
  }

  function renderFileList(filterText) {
    var target = AC.normalizeLoose(filterText || '');
    var filtered = target
      ? state.files.filter(function (f) { return AC.normalizeLoose(f.path).indexOf(target) !== -1; })
      : state.files;

    if (!filtered.length) {
      els.fileList.innerHTML = '<div class="text-muted small p-2">Nenhum ficheiro corresponde ao filtro.</div>';
      return;
    }

    els.fileList.innerHTML = filtered.slice(0, 300).map(function (f, i) {
      var active = state.currentFile && state.currentFile.path === f.path ? ' active' : '';
      return '<button type="button" class="list-group-item list-group-item-action' + active + '" data-idx="' + i + '">' +
        escapeHtml(f.path) + '</button>';
    }).join('');

    var buttons = els.fileList.querySelectorAll('button[data-idx]');
    buttons.forEach(function (btn, i) {
      btn.addEventListener('click', function () { openFile(filtered[i]); });
    });
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Collapsing the file list once a file is open gives the editor itself most of
  // the vertical space (the editor card flex-grows into whatever the browser card
  // leaves free) — browsing a long file list and editing don't need to compete
  // for room at the same time.
  function setFileBrowserCollapsed(collapsed) {
    els.fileBrowser.classList.toggle('d-none', collapsed);
    els.toggleFileBrowserBtn.classList.toggle('d-none', !state.files.length);
    els.toggleFileBrowserBtn.textContent = collapsed ? 'Mostrar lista de ficheiros' : 'Esconder lista de ficheiros';
  }

  // ---------- File open / save ----------

  async function openFile(entry) {
    // entry.read() already normalises CRLF/LF -- the rest of this editor
    // assumes a single '\n' per line throughout.
    var text = await entry.read();

    state.currentFile = entry;
    state.lastSavedText = text;
    els.currentFilePath.textContent = entry.path;
    els.insertRandomRefBtn.disabled = false;
    els.downloadFileBtn.disabled = false;
    setSaveStatus('');
    document.title = entry.path.split('/').pop();

    AC.removeGhost(els.fileEditor);
    els.fileEditor.textContent = text;
    AC.setCaretOffset(els.fileEditor, AC.endOfContentOffset(text));

    renderFileList(els.fileFilter.value);
    setFileBrowserCollapsed(true);
    updateFileAutocomplete();
    els.fileEditor.focus();
  }

  function placeCaretAtEnd(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function setSaveStatus(text, isError) {
    els.saveStatus.textContent = text;
    els.saveStatus.className = 'text-muted small' + (isError ? ' text-danger' : '');
  }

  function scheduleSave() {
    if (!state.currentFile) return;
    setSaveStatus('A escrever...');
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }

  async function saveNow() {
    if (!state.currentFile) return;
    // The ghost suggestion span is part of the DOM but must never reach disk —
    // strip it before reading textContent (removing it doesn't move the real caret).
    AC.removeGhost(els.fileEditor);
    var text = AC.stripCaretAnchors(els.fileEditor.textContent);
    // Restore the ghost immediately (the write to disk below can take a while on
    // slow drives/cloud-synced folders — the hint must not stay hidden for that long).
    updateFileAutocomplete();

    if (text === state.lastSavedText) {
      setSaveStatus('Guardado');
      return;
    }

    // createWritable()/write()/close() can take a while (cloud-synced folders
    // especially), and each call targets whatever `text` was current at that
    // moment. If a second save started (from a keystroke during that wait) and
    // its write finished BEFORE this older one, this call would go on to
    // overwrite the file with its now-stale snapshot — a lost-update race that
    // looks like a "revert" (or worse, an OLD in-flight write from another
    // still-open tab clobbering this tab's newer content). Queue instead of
    // overlapping: only one write is ever in flight, and the moment it
    // finishes, if a newer edit is waiting, that save runs immediately with a
    // freshly-read `text`, never with data captured before the wait.
    if (state.savePending) {
      state.saveQueued = true;
      return;
    }
    state.savePending = true;
    setSaveStatus('A guardar…');
    try {
      await state.currentFile.write(text);
      state.lastSavedText = text;
      setSaveStatus('Guardado ' + new Date().toLocaleTimeString());
    } catch (e) {
      setSaveStatus('Erro ao guardar: ' + e.message, true);
    } finally {
      state.savePending = false;
      if (state.saveQueued) {
        state.saveQueued = false;
        saveNow();
      }
    }
  }

  // ---------- Autocomplete wiring ----------

  function computeLineOffsets(fullText) {
    var lines = fullText.split('\n');
    var offsets = [];
    var acc = 0;
    for (var i = 0; i < lines.length; i++) {
      offsets.push(acc);
      acc += lines[i].length + 1;
    }
    return { lines: lines, offsets: offsets };
  }

  function lineIndexForOffset(offsets, caretOffset) {
    var idx = 0;
    for (var i = 0; i < offsets.length; i++) {
      if (offsets[i] <= caretOffset) idx = i; else break;
    }
    return idx;
  }

  function updateFileAutocomplete() {
    AC.removeGhost(els.fileEditor);
    var offset = AC.getCaretOffset(els.fileEditor);
    var fullText = AC.stripCaretAnchors(els.fileEditor.textContent);
    AC.rebuildHighlightedWindow(els.fileEditor, fullText, offset, 100);
    var lineInfo = computeLineOffsets(fullText);
    var lineIndex = lineIndexForOffset(lineInfo.offsets, offset);

    var refCtx = AC.findReferenceContext(lineInfo.lines, lineIndex);
    if (!refCtx) {
      els.detectedReference.textContent = 'Sem referência bíblica reconhecida na linha atual.';
      els.keywordPreview.innerHTML = '';
      if (window.StudyPanel) window.StudyPanel.hide();
      return;
    }

    var verseInfo = AC.getVerseWords(BIBLE_PT, refCtx.book, refCtx.chapter, refCtx.verse);
    if (!verseInfo) {
      els.detectedReference.textContent = 'Referência "' + refCtx.book + ' ' + refCtx.chapter + ':' + refCtx.verse + '" não encontrada no texto bíblico.';
      els.keywordPreview.innerHTML = '';
      if (window.StudyPanel) window.StudyPanel.hide();
      return;
    }

    var anchorOffset = lineInfo.offsets[lineIndex] + refCtx.matchEnd;
    var context = { words: verseInfo.words, anchorOffset: anchorOffset };
    var result = AC.computeSuggestion(fullText, offset, context, state.lenient, state.wordCount);

    if (result) {
      els.detectedReference.textContent = verseInfo.bookName + ' ' + refCtx.chapter + ':' + refCtx.verse +
        ' — ' + result.committedCount + ' / ' + result.total + ' palavras' +
        (result.complete ? ' (completo!)' : '');
      if (result.suggestion) {
        AC.insertGhost(els.fileEditor, offset, result.suggestion);
      }
      renderKeywordPreview(verseInfo.words, result.committedCount);
      renderEastonPanel(verseInfo, refCtx.chapter, refCtx.verse);
    }
  }

  function renderEastonPanel(verseInfo, chapter, verse) {
    // File mode always uses the Portuguese text. StudyPanel remembers the last
    // verse it rendered, so calling this on every keystroke is cheap.
    window.StudyPanel.show({
      bookIdx: verseInfo.bookIdx,
      chapter: chapter,
      verse: verse,
      words: verseInfo.words,
      isPt: true
    }, 'file:' + verseInfo.bookIdx + ':' + chapter + ':' + verse);
  }

  function renderKeywordPreview(words, typedCount) {
    var spans = window.BibleHighlight ? window.BibleHighlight.computeSpans(words) : [];
    els.keywordPreview.innerHTML = words.map(function (word, i) {
      var cls = i < typedCount ? 'word-correct' : 'word-hint';
      var styleAttr = '';
      if (spans[i]) {
        cls += ' word-keyword';
        styleAttr = ' style="color:' + spans[i].color + ';background-color:' + spans[i].backgroundColor + ';"';
      }
      return '<span class="word ' + cls + '"' + styleAttr + '>' + escapeHtml(word) + '</span>';
    }).join(' ');
  }

  // ---------- Insert random reference ----------

  function pickRandomVerseRef() {
    var bookIdx = Math.floor(Math.random() * BIBLE_PT.length);
    var book = BIBLE_PT[bookIdx];
    var nonEmptyChapters = [];
    for (var i = 0; i < book.chapters.length; i++) {
      if (book.chapters[i] && book.chapters[i].length) nonEmptyChapters.push(i);
    }
    var chapterIdx = nonEmptyChapters[Math.floor(Math.random() * nonEmptyChapters.length)];
    var verseIdx = Math.floor(Math.random() * book.chapters[chapterIdx].length);
    return book.name + ' ' + (chapterIdx + 1) + ':' + (verseIdx + 1) + ' ';
  }

  function insertRandomReference() {
    if (!state.currentFile) return;
    els.fileEditor.focus();
    placeCaretAtEnd(els.fileEditor);
    AC.removeGhost(els.fileEditor);
    var text = AC.stripCaretAnchors(els.fileEditor.textContent);
    var needsNewline = text.length > 0 && !text.endsWith('\n');
    AC.insertPlainText((needsNewline ? '\n' : '') + pickRandomVerseRef());
    updateFileAutocomplete();
    scheduleSave();
  }

  // ---------- Download (IndexedDB backend has no direct write-back to the
  // PC's Biblia folder, so this is how edits made on Android get back out) ----------

  function downloadCurrentFile() {
    if (!state.currentFile) return;
    AC.removeGhost(els.fileEditor);
    var text = AC.stripCaretAnchors(els.fileEditor.textContent);
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = state.currentFile.path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- IndexedDB mode (Android / any browser without the File System
  // Access API) -- auto-loads a local copy seeded from data/md_files.js
  // instead of requiring a folder picker there's no equivalent of. ----------

  function setupIndexedDbMode() {
    els.openFolderBtn.classList.add('d-none');
    els.fsaUnsupported.classList.remove('d-none');
    els.fsaUnsupported.className = 'alert alert-info small';
    els.fsaUnsupported.textContent = 'Este browser não permite abrir pastas do PC diretamente (normal no telemóvel) — ' +
      'a usar uma cópia local dos ficheiros, guardada no próprio browser. As alterações ficam guardadas aqui; ' +
      'use o botão "Descarregar ficheiro" para as exportar.';
    els.folderStatus.textContent = 'A carregar cópia local...';

    var seedPromise = window.MD_FILES_SEED ? Promise.resolve() : loadScript('data/md_files.js');
    seedPromise
      .then(function () { return window.FileStorage.ensureSeeded(); })
      .then(function () { return window.FileStorage.listIndexedDbEntries(); })
      .then(function (entries) {
        state.files = entries;
        els.folderStatus.textContent = state.files.length + ' ficheiro(s) .md (cópia local no browser)';
        setFileBrowserCollapsed(false);
        renderFileList('');
      })
      .catch(function (e) {
        console.error('IndexedDB init failed', e);
        els.folderStatus.textContent = 'Erro ao carregar a cópia local: ' + (e && e.message);
      });
  }

  // ---------- Wiring ----------

  function bindEvents() {
    els.openFolderBtn.addEventListener('click', openFolder);
    els.downloadFileBtn.addEventListener('click', downloadCurrentFile);

    els.toggleFileBrowserBtn.addEventListener('click', function () {
      setFileBrowserCollapsed(!els.fileBrowser.classList.contains('d-none'));
    });

    els.fileFilter.addEventListener('input', function () {
      renderFileList(els.fileFilter.value);
    });

    els.fileEditor.addEventListener('input', function () {
      updateFileAutocomplete();
      scheduleSave();
    });

    els.fileEditor.addEventListener('paste', function (e) {
      if (!e.clipboardData) return; // let the browser fall back to its default handling
      var text = e.clipboardData.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      AC.removeGhost(els.fileEditor);
      // Pasted blocks (cross-reference lists copied from other tools, etc.) often
      // carry blank-line spacing between entries; this editor's one-line-per-verse
      // convention has no use for it. Collapse runs of blank lines down to a single
      // newline rather than dropping them outright, so a paste landing mid-line
      // never fuses unrelated content together for lack of any separator at all.
      var cleaned = text.replace(/\n{2,}/g, '\n');
      AC.insertPlainText(cleaned);
      updateFileAutocomplete();
      scheduleSave();
    });

    els.fileEditor.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (AC.acceptGhost(els.fileEditor)) {
          updateFileAutocomplete();
          scheduleSave();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        AC.removeGhost(els.fileEditor);
        AC.insertPlainText('\n');
        updateFileAutocomplete();
        scheduleSave();
      }
    });

    ['keyup', 'click'].forEach(function (evt) {
      els.fileEditor.addEventListener(evt, function (e) {
        if (evt === 'keyup' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) === -1) return;
        updateFileAutocomplete();
      });
    });

    els.fileLenientCheck.addEventListener('change', function () {
      state.lenient = els.fileLenientCheck.checked;
      updateFileAutocomplete();
    });

    els.fileWordCountInput.addEventListener('change', function () {
      var value = Math.max(1, Math.min(10, Number(els.fileWordCountInput.value) || 1));
      els.fileWordCountInput.value = String(value);
      state.wordCount = value;
      updateFileAutocomplete();
    });

    els.insertRandomRefBtn.addEventListener('click', insertRandomReference);

    var singleTabBtn = $('tab-single-btn');
    if (singleTabBtn) {
      singleTabBtn.addEventListener('shown.bs.tab', function () {
        document.title = DEFAULT_TITLE;
      });
    }

    window.addEventListener('beforeunload', function () {
      if (state.saveTimer) saveNow();
    });
  }

  function init() {
    cacheEls();
    bindEvents();

    if (!window.FileStorage.hasFSA) {
      setupIndexedDbMode();
      return;
    }

    if (location.protocol === 'file:') {
      $('fileProtocolWarning').classList.remove('d-none');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

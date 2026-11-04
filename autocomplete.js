// Shared word-level autocomplete engine for contenteditable elements, plus
// Bible-reference parsing (ported from Code/activate_chapter_snippets.py).
window.BibleAutocomplete = (function () {
  'use strict';

  // ---------- text helpers ----------

  function stripAccents(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalizeLoose(text) {
    return stripAccents(String(text).toLowerCase()).trim().replace(/\s+/g, ' ');
  }

  function normalizeWordForCompare(word) {
    return stripAccents(String(word).toLowerCase()).replace(/[.,;:!?"'()«»—–\[\]]/g, '');
  }

  function splitWords(text) {
    return (text || '').split(/\s+/).filter(Boolean);
  }

  // ---------- reference parsing (subset of activate_chapter_snippets.py) ----------

  // ((?:\d\s*)?[book letters incl. spaces])\s+(chapter):(verse)\b — last match on the line wins.
  var FULL_REFERENCE_RE = /((?:\d\s*)?[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s]+?)\s+(\d+):(\d+)\b/g;
  var CHAPTER_VERSE_ONLY_RE = /^(\d+):(\d+)\b/;
  var VERSE_ONLY_RE = /^(\d+)(?:\s+\S.*)?$/;

  // Returns {book, chapter, verse, matchEnd} for the LAST reference found on the line, or null.
  // matchEnd is a raw character offset within `line` (operates on the untouched
  // line so autocomplete anchoring lines up with real caret positions).
  function parseReference(line) {
    var match = null;
    var m;
    FULL_REFERENCE_RE.lastIndex = 0;
    while ((m = FULL_REFERENCE_RE.exec(line))) {
      match = m;
    }
    if (!match) return null;
    return {
      book: match[1].replace(/\s+/g, ' ').trim(),
      chapter: match[2],
      verse: match[3],
      matchEnd: match.index + match[0].length
    };
  }

  function parseChapterVerseOnly(line) {
    var m = CHAPTER_VERSE_ONLY_RE.exec(line);
    if (!m) return null;
    return { chapter: m[1], verse: m[2], matchEnd: m[0].length };
  }

  function parseVerseOnly(line) {
    var m = VERSE_ONLY_RE.exec(line);
    if (!m) return null;
    return { verse: m[1], matchEnd: m[1].length };
  }

  // ---------- Bible dataset lookup ----------

  function resolveBookIndex(bookText, dataset) {
    var target = normalizeLoose(bookText);
    if (!target) return -1;
    for (var i = 0; i < dataset.length; i++) {
      if (normalizeLoose(dataset[i].name) === target) return i;
    }
    for (var j = 0; j < dataset.length; j++) {
      var n = normalizeLoose(dataset[j].name);
      if (target.indexOf(n) !== -1 || n.indexOf(target) !== -1) return j;
    }
    return -1;
  }

  function getVerseWords(dataset, bookText, chapter, verse) {
    var bookIdx = resolveBookIndex(bookText, dataset);
    if (bookIdx < 0) return null;
    var book = dataset[bookIdx];
    var chapterArr = book.chapters[Number(chapter) - 1];
    if (!chapterArr) return null;
    var verseText = chapterArr[Number(verse) - 1];
    if (verseText === undefined || verseText === '') return null;
    return { bookIdx: bookIdx, bookName: book.name, words: splitWords(verseText), text: verseText };
  }

  // Find the reference context that applies at `lineIndex` (0-based) within `lines`,
  // searching backward through previous lines when the current line has no full
  // reference of its own (mirrors infer_reference_from_context in the Python tool).
  function findReferenceContext(lines, lineIndex) {
    var currentLine = lines[lineIndex] || '';

    var direct = parseReference(currentLine);
    if (direct) return { book: direct.book, chapter: direct.chapter, verse: direct.verse, matchEnd: direct.matchEnd, sameLine: true };

    var chapterVerse = parseChapterVerseOnly(currentLine);
    if (chapterVerse) {
      for (var i = lineIndex - 1; i >= 0; i--) {
        var parsedPrev = parseReference(lines[i]);
        if (parsedPrev) {
          return { book: parsedPrev.book, chapter: chapterVerse.chapter, verse: chapterVerse.verse, matchEnd: chapterVerse.matchEnd, sameLine: true };
        }
      }
      return null;
    }

    var verseOnly = parseVerseOnly(currentLine);
    if (verseOnly) {
      for (var k = lineIndex - 1; k >= 0; k--) {
        var parsedPrev2 = parseReference(lines[k]);
        if (parsedPrev2) {
          return { book: parsedPrev2.book, chapter: parsedPrev2.chapter, verse: verseOnly.verse, matchEnd: verseOnly.matchEnd, sameLine: true };
        }
      }
      return null;
    }

    return null;
  }

  // ---------- contenteditable caret/ghost helpers ----------

  function getCaretOffset(root) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    var range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return 0;
    var preRange = range.cloneRange();
    preRange.selectNodeContents(root);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
  }

  function getRangeAtOffset(root, offset) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    var remaining = offset;
    var last = null;
    while ((node = walker.nextNode())) {
      last = node;
      var len = node.nodeValue.length;
      if (remaining <= len) {
        var range = document.createRange();
        range.setStart(node, Math.max(0, remaining));
        range.collapse(true);
        return range;
      }
      remaining -= len;
    }
    var endRange = document.createRange();
    if (last) {
      endRange.setStart(last, last.nodeValue.length);
    } else {
      endRange.selectNodeContents(root);
    }
    endRange.collapse(true);
    return endRange;
  }

  var CARET_ANCHOR_CHAR = '​'; // zero-width space

  function stripCaretAnchors(text) {
    return text.split(CARET_ANCHOR_CHAR).join('');
  }

  // A leftover anchor from an earlier setCaretOffset() call sits in the DOM but
  // is invisible to every offset computed from stripCaretAnchors(text) — left
  // in place, it desyncs later getRangeAtOffset() walks (which see it) from
  // the string offsets callers pass in (which don't), corrupting
  // rebuildHighlightedWindow's window boundaries after enough edits pile up
  // in a long-lived document. Only one anchor is ever needed at a time.
  function removeStaleCaretAnchors(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node, toRemove = [];
    while ((node = walker.nextNode())) {
      if (node.nodeValue === CARET_ANCHOR_CHAR) toRemove.push(node);
    }
    for (var i = 0; i < toRemove.length; i++) toRemove[i].remove();
  }

  function setCaretOffset(root, offset) {
    var range = getRangeAtOffset(root, offset);

    // If the caret would land exactly at the end of a text node whose last
    // character is a newline, Chromium mis-anchors it: the *next* character
    // typed lands before that newline instead of after it (verified — this is a
    // real Chromium quirk, not a caret-affinity nuance, and an empty text node
    // placed there does NOT fix it, only a non-empty one does). Give it a
    // zero-width-space text node to sit inside instead, which types correctly;
    // callers must strip CARET_ANCHOR_CHAR via stripCaretAnchors() before using
    // the editor's text for anything real (offsets computed before this call are
    // unaffected, since the anchor only ever sits *after* the caret).
    var container = range.startContainer;
    if (container.nodeType === 3 && range.startOffset === container.nodeValue.length &&
        container.nodeValue.charAt(container.nodeValue.length - 1) === '\n') {
      removeStaleCaretAnchors(root);
      var anchor = document.createTextNode(CARET_ANCHOR_CHAR);
      container.parentNode.insertBefore(anchor, container.nextSibling);
      range = document.createRange();
      range.setStart(anchor, 0);
      range.collapse(true);
    }

    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Offset right after the last non-blank line's content, i.e. skipping any
  // trailing newline(s) — where typing should resume on a freshly opened file
  // so continuation lands on the same line as the last reference, matching
  // the "Livro cap:vers texto..." single-line convention used across the .md files.
  function endOfContentOffset(text) {
    var end = text.length;
    while (end > 0 && text.charAt(end - 1) === '\n') end--;
    return end;
  }

  // Rebuilds `root`'s content as keyword-highlighted HTML (if BibleHighlight is
  // loaded) and restores the caret to `caretOffset`. Call with the ghost already
  // removed and `text` equal to root.textContent at that point.
  function rebuildHighlightedContent(root, text, caretOffset) {
    if (!window.BibleHighlight) return;
    text = stripCaretAnchors(text);
    root.innerHTML = window.BibleHighlight.buildHighlightedHtml(text);
    setCaretOffset(root, caretOffset);
  }

  // Same idea, but for large documents: only the `radiusLines` lines before and
  // after the caret's line get re-tokenized/re-highlighted and have their DOM
  // replaced. Everything outside that window is left completely untouched, so
  // the per-keystroke cost stays bounded by the window size instead of growing
  // with the whole file. Call with the ghost already removed and `text` equal
  // to root.textContent at that point.
  function rebuildHighlightedWindow(root, text, caretOffset, radiusLines) {
    if (!window.BibleHighlight) return;
    if (!radiusLines || radiusLines < 1) radiusLines = 100;
    text = stripCaretAnchors(text);

    var lines = text.split('\n');
    var lineOffsets = [];
    var acc = 0;
    for (var i = 0; i < lines.length; i++) {
      lineOffsets.push(acc);
      acc += lines[i].length + 1;
    }

    var caretLine = 0;
    for (var j = 0; j < lineOffsets.length; j++) {
      if (lineOffsets[j] <= caretOffset) caretLine = j; else break;
    }

    var startLine = Math.max(0, caretLine - radiusLines);
    var endLine = Math.min(lines.length - 1, caretLine + radiusLines);
    var startOffset = lineOffsets[startLine];
    var endOffset = endLine === lines.length - 1 ? text.length : lineOffsets[endLine] + lines[endLine].length;

    if (startOffset === 0 && endOffset === text.length) {
      // Window covers the whole document anyway (small file) — simple path is equivalent and cheaper.
      root.innerHTML = window.BibleHighlight.buildHighlightedHtml(text);
      setCaretOffset(root, caretOffset);
      return;
    }

    var windowHtml = window.BibleHighlight.buildHighlightedHtml(text.slice(startOffset, endOffset));

    var startPoint = getRangeAtOffset(root, startOffset);
    var endPoint = getRangeAtOffset(root, endOffset);
    var range = document.createRange();
    range.setStart(startPoint.startContainer, startPoint.startOffset);
    range.setEnd(endPoint.startContainer, endPoint.startOffset);
    range.deleteContents();

    var tpl = document.createElement('template');
    tpl.innerHTML = windowHtml;
    range.insertNode(tpl.content);

    setCaretOffset(root, caretOffset);
  }

  function removeGhost(root) {
    var ghosts = root.querySelectorAll('.ac-ghost');
    for (var i = 0; i < ghosts.length; i++) ghosts[i].remove();
  }

  function insertGhost(root, offset, suggestion) {
    var range = getRangeAtOffset(root, offset);
    var span = document.createElement('span');
    span.className = 'ac-ghost';
    span.setAttribute('contenteditable', 'false');
    span.textContent = suggestion;
    range.insertNode(span);

    var sel = window.getSelection();
    var caretRange = document.createRange();
    caretRange.setStartBefore(span);
    caretRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caretRange);
    return span;
  }

  function acceptGhost(root) {
    var ghost = root.querySelector('.ac-ghost');
    if (!ghost) return false;
    var text = ghost.textContent;
    ghost.remove();
    var ok = document.execCommand('insertText', false, text + ' ');
    if (!ok) {
      // Fallback for browsers without execCommand support.
      var sel = window.getSelection();
      if (sel.rangeCount) {
        var range = sel.getRangeAt(0);
        var node = document.createTextNode(text + ' ');
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    return true;
  }

  function insertNodeAtSelection(text) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var node = document.createTextNode(text);
    range.insertNode(node);

    var newRange = document.createRange();
    if (text.charAt(text.length - 1) === '\n') {
      // Chromium misplaces a caret sitting right after a trailing "\n" (the next
      // character typed lands *before* it) — anchor in a zero-width-space node
      // instead. Callers must run stripCaretAnchors() before using this text for
      // anything real. Clear any earlier anchor first (see removeStaleCaretAnchors).
      var editableRoot = node.parentElement && node.parentElement.closest('[contenteditable="true"]');
      if (editableRoot) removeStaleCaretAnchors(editableRoot);
      var anchor = document.createTextNode(CARET_ANCHOR_CHAR);
      node.parentNode.insertBefore(anchor, node.nextSibling);
      newRange.setStart(anchor, 0);
    } else {
      newRange.setStartAfter(node);
    }
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  function insertPlainText(text) {
    // execCommand('insertText', ..., '\n') is a no-op in Chrome for a bare newline
    // inside a plain contenteditable — it reports success but inserts nothing.
    // 'insertLineBreak' is the command actually meant for this and, unlike a
    // manually-created text node, leaves the caret correctly anchored so the next
    // character typed lands *after* the newline instead of before it.
    if (text === '\n') {
      var ok = document.execCommand('insertLineBreak');
      if (!ok) insertNodeAtSelection(text);
      return;
    }
    if (text.indexOf('\n') !== -1) {
      insertNodeAtSelection(text);
      return;
    }
    var okText = document.execCommand('insertText', false, text);
    if (!okText) {
      insertNodeAtSelection(text);
    }
  }

  // Given full plain text, caret offset and a {words, anchorOffset} context,
  // compute {committedCount, partial, suggestion}. `wordCount` controls how many
  // whole words a single Tab-accept completes at once (default 1): the current
  // partial word is always completed first, then (wordCount - 1) further whole
  // words are appended to the suggestion.
  function computeSuggestion(fullText, caretOffset, context, lenient, wordCount) {
    if (lenient === undefined) lenient = true;
    if (!wordCount || wordCount < 1) wordCount = 1;
    if (!context || !context.words || !context.words.length) return null;

    var segment = fullText.slice(context.anchorOffset, caretOffset);
    var trailingSpace = /\s$/.test(segment);
    var trimmedLeading = segment.replace(/^\s+/, '');
    var tokens = trimmedLeading.length ? splitWords(trimmedLeading) : [];

    var partial = '';
    var committedCount = tokens.length;
    if (!trailingSpace && tokens.length > 0) {
      partial = tokens[tokens.length - 1];
      committedCount = tokens.length - 1;
    }

    var nextWord = context.words[committedCount];
    var suggestion = '';
    if (nextWord) {
      var firstPart = null;
      var leadIn = '';
      if (!partial) {
        firstPart = nextWord;
      } else {
        var normPartial = lenient ? normalizeWordForCompare(partial) : partial;
        var normNext = lenient ? normalizeWordForCompare(nextWord) : nextWord;
        if (normPartial.length > 0 && normNext.indexOf(normPartial) === 0 && normPartial.length < normNext.length) {
          // Normal case: partial is a valid prefix of the target word — complete the rest of it.
          firstPart = nextWord.slice(partial.length);
        } else if (normPartial === normNext && partial.length < nextWord.length) {
          // Same word under lenient comparison, but the raw target still has trailing
          // punctuation the normalization stripped away (e.g. "terra" typed vs target
          // "terra.") — finish that first instead of jumping to the next word.
          firstPart = nextWord.slice(partial.length);
        } else if (normPartial === normNext) {
          // The word (punctuation included) was typed out in full but no space yet —
          // nothing left to complete for *this* word, so preview the next one instead
          // (with its separating space) rather than showing nothing at all.
          leadIn = ' ';
          committedCount += 1;
          firstPart = context.words[committedCount] || null;
        } else {
          // Typo / mismatch — still show the correct word as a hint instead of hiding it,
          // so the gray suggestion never just disappears while the user keeps typing.
          firstPart = nextWord;
        }
      }
      if (firstPart !== null) {
        var parts = [firstPart];
        for (var extra = 1; extra < wordCount; extra++) {
          var extraWord = context.words[committedCount + extra];
          if (!extraWord) break;
          parts.push(extraWord);
        }
        suggestion = leadIn + parts.join(' ');
      }
    }

    return {
      committedCount: committedCount,
      partial: partial,
      nextWord: nextWord || '',
      suggestion: suggestion,
      total: context.words.length,
      complete: committedCount >= context.words.length
    };
  }

  return {
    normalizeLoose: normalizeLoose,
    normalizeWordForCompare: normalizeWordForCompare,
    splitWords: splitWords,
    parseReference: parseReference,
    parseChapterVerseOnly: parseChapterVerseOnly,
    parseVerseOnly: parseVerseOnly,
    resolveBookIndex: resolveBookIndex,
    getVerseWords: getVerseWords,
    findReferenceContext: findReferenceContext,
    getCaretOffset: getCaretOffset,
    getRangeAtOffset: getRangeAtOffset,
    setCaretOffset: setCaretOffset,
    endOfContentOffset: endOfContentOffset,
    stripCaretAnchors: stripCaretAnchors,
    rebuildHighlightedContent: rebuildHighlightedContent,
    rebuildHighlightedWindow: rebuildHighlightedWindow,
    removeGhost: removeGhost,
    insertGhost: insertGhost,
    acceptGhost: acceptGhost,
    insertPlainText: insertPlainText,
    computeSuggestion: computeSuggestion
  };
})();

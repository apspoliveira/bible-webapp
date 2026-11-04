// Word/phrase colour highlighting, mirroring the "todohighlight.keywords" list
// from the user's VS Code settings.json (Bible/theology vocabulary -> colors).
window.BibleHighlight = (function () {
  'use strict';

  var MAX_PHRASE_WORDS = 4;
  var RAW = window.HIGHLIGHT_WORDS || [];
  var map = {};

  function stripAccents(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalizeLoose(text) {
    return stripAccents(String(text).toLowerCase()).trim().replace(/\s+/g, ' ');
  }

  // Strip leading/trailing punctuation but keep internal characters (accents, hyphens) intact.
  function stripPunct(word) {
    return String(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }

  RAW.forEach(function (entry) {
    var key = normalizeLoose(entry.text);
    if (key) map[key] = { color: entry.color, backgroundColor: entry.backgroundColor };
  });

  // Returns {len, style} for the longest keyword/phrase match starting at words[i], or null.
  function matchAt(words, i) {
    var maxLen = Math.min(MAX_PHRASE_WORDS, words.length - i);
    for (var len = maxLen; len >= 1; len--) {
      var parts = [];
      for (var j = 0; j < len; j++) parts.push(stripPunct(words[i + j]));
      var key = normalizeLoose(parts.join(' '));
      if (key && map[key]) return { len: len, style: map[key] };
    }
    return null;
  }

  // Computes a style (or null) for every index in `words` in one pass.
  function computeSpans(words) {
    var styles = new Array(words.length).fill(null);
    var i = 0;
    while (i < words.length) {
      var m = matchAt(words, i);
      if (m) {
        for (var k = 0; k < m.len; k++) styles[i + k] = m.style;
        i += m.len;
      } else {
        i += 1;
      }
    }
    return styles;
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Rebuilds `fullText` as HTML with keyword/phrase matches wrapped in colored
  // spans (merging multi-word phrases — and the whitespace between their words —
  // into a single continuous span, like VS Code's decoration). Whitespace/newlines
  // outside a match are preserved exactly (needed since this replaces the live
  // contenteditable content on every keystroke).
  function buildHighlightedHtml(fullText) {
    if (!fullText) return '';
    var tokens = fullText.match(/\S+|\s+/g) || [];
    var wordTokenIdx = [];
    var words = [];
    for (var t = 0; t < tokens.length; t++) {
      if (!/^\s+$/.test(tokens[t])) {
        wordTokenIdx.push(t);
        words.push(tokens[t]);
      }
    }
    var spans = computeSpans(words);

    var out = [];
    var w = 0;
    var tIdx = 0;
    while (tIdx < tokens.length) {
      if (w < wordTokenIdx.length && wordTokenIdx[w] === tIdx) {
        var style = spans[w];
        if (style) {
          var runLen = 1;
          while (w + runLen < spans.length && spans[w + runLen] === style) runLen++;
          var startTok = wordTokenIdx[w];
          var endTok = wordTokenIdx[w + runLen - 1];
          var merged = tokens.slice(startTok, endTok + 1).join('');
          out.push('<span class="word-keyword" style="color:' + style.color + ';background-color:' + style.backgroundColor + ';">' +
            escapeHtml(merged) + '</span>');
          tIdx = endTok + 1;
          w += runLen;
        } else {
          out.push(escapeHtml(tokens[tIdx]));
          tIdx++;
          w++;
        }
      } else {
        out.push(escapeHtml(tokens[tIdx]));
        tIdx++;
      }
    }
    return out.join('');
  }

  return {
    matchAt: matchAt,
    computeSpans: computeSpans,
    buildHighlightedHtml: buildHighlightedHtml,
    hasAny: Object.keys(map).length > 0
  };
})();

// Easton's Bible Dictionary (1897, public domain) lookup, plus a general
// Portuguese dictionary lookup built with the same engine. Three instances:
// window.EastonLookupPt matches directly against Portuguese verse text
// (using a community Portuguese translation of Easton's); window.EastonLookup
// matches against English (KJV) text — used only when practicing in English,
// since the file-editing mode and Portuguese verse practice now look
// definitions up directly in Portuguese, no cross-language lookup needed;
// window.PtDictLookup matches ordinary Portuguese words (not just biblical
// terms) against the Dicionário Aberto dataset.
(function () {
  'use strict';

  var MAX_PHRASE_WORDS = 5;

  // Deliberately accent-SENSITIVE: this looks words up against the Bible's own
  // canonical (always correctly accented) verse text, never against whatever a
  // user actually typed, so stripping accents would only risk false collisions
  // (e.g. Portuguese "no" vs the place name "Nô") without ever helping a match.
  function normalizeLoose(text) {
    return String(text).toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function stripPunct(word) {
    return String(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }

  function buildLookup(dict) {
    dict = dict || {};

    // Returns {len, entry} for the longest dictionary match starting at words[i], or null.
    function matchAt(words, i) {
      var maxLen = Math.min(MAX_PHRASE_WORDS, words.length - i);
      for (var len = maxLen; len >= 1; len--) {
        var parts = [];
        for (var j = 0; j < len; j++) parts.push(stripPunct(words[i + j]));
        var key = normalizeLoose(parts.join(' '));
        if (key && dict[key]) return { len: len, entry: dict[key] };
      }
      return null;
    }

    // Returns a de-duplicated, in-order list of {name, text} entries matched
    // anywhere in `words`.
    function computeDefinitions(words) {
      var results = [];
      var seen = {};
      var i = 0;
      while (i < words.length) {
        var m = matchAt(words, i);
        if (m) {
          var dedupeKey = m.entry.name;
          if (!seen[dedupeKey]) {
            seen[dedupeKey] = true;
            results.push(m.entry);
          }
          i += m.len;
        } else {
          i += 1;
        }
      }
      return results;
    }

    return {
      matchAt: matchAt,
      computeDefinitions: computeDefinitions,
      hasAny: Object.keys(dict).length > 0
    };
  }

  window.buildDictLookup = buildLookup;

  // Lookups over a dictionary global that may load later (dataloader.js): the
  // real lookup is built the first time the data is there (and again if the
  // global is ever replaced).
  function lazyLookup(globalName) {
    var built = null, source = null;
    function get() {
      var data = window[globalName];
      if (!data) return null;
      if (source !== data) { source = data; built = buildLookup(data); }
      return built;
    }
    return {
      get hasAny() { var l = get(); return !!l && l.hasAny; },
      matchAt: function (words, i) { var l = get(); return l ? l.matchAt(words, i) : null; },
      computeDefinitions: function (words) { var l = get(); return l ? l.computeDefinitions(words) : []; }
    };
  }

  window.EastonLookup = lazyLookup('EASTON_DICTIONARY');
  window.EastonLookupPt = lazyLookup('EASTON_DICTIONARY_PT');
  // Smith's Bible Dictionary (English only): matched against the verse's KJV
  // words whatever the practice language.
  window.SmithLookup = lazyLookup('SMITH_DICTIONARY');
  // General Portuguese-language dictionary (Dicionário Aberto), same lookup
  // engine as Easton's -- covers ordinary words, not just biblical terms.
  window.PtDictLookup = lazyLookup('PT_DICTIONARY');

  // Smith entries for one verse (0-based bookIdx, 1-based chapter/verse), in
  // the shape the study panel expects. `strong` doubles as the translation
  // cache key (entries are English; they translate to Portuguese on demand,
  // like BDB/Thayer) and `linkRefs` re-links scripture references afterwards.
  window.SmithLookup.forVerse = function (bookIdx, chapter, verse) {
    var kjv = window.BIBLE_KJV && window.BIBLE_KJV[bookIdx];
    var chapterArr = kjv && kjv.chapters[chapter - 1];
    var text = chapterArr && chapterArr[verse - 1];
    if (!text || !window.SmithLookup.hasAny) return [];
    var words = String(text).split(/\s+/);
    return window.SmithLookup.computeDefinitions(words).map(function (e) {
      return {
        name: e.name,
        text: e.text,
        strong: 'smith:' + e.name,
        linkRefs: true,
        lazy: e.text.length > 8000,
        html: e.text.length > 8000 ? undefined : (window.BibleRefs ? window.BibleRefs.linkify(e.text) : undefined)
      };
    });
  };
})();

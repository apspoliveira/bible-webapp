// Extra English dictionaries for the study panel, all matched against the
// verse's KJV words: Condensed Biblical Cyclopedia, ISBE, Webster's 1828 and
// Webster's 1913 (see build_dicts.py). Each is loaded on demand the first time
// its study-panel tab is opened (dataloader.js).
window.ExtraDicts = (function () {
  'use strict';

  var GLOBALS = {
    cbc: 'CBC_DICTIONARY',
    isbe: 'ISBE_DICTIONARY',
    webster1828: 'WEBSTER1828_DICTIONARY',
    webster1913: 'WEBSTER1913_DICTIONARY'
  };
  var lookups = {}, sources = {};
  var LAZY_OVER = 8000; // characters; longer entries are formatted only when opened

  function lookupFor(id) {
    var data = window[GLOBALS[id]];
    if (!data || !window.buildDictLookup) return null;
    if (sources[id] !== data) { sources[id] = data; lookups[id] = window.buildDictLookup(data); }
    return lookups[id];
  }

  // Entries for one verse (0-based bookIdx, 1-based chapter/verse). `strong`
  // is the translation-cache key; `linkRefs` re-links references afterwards.
  function forVerse(id, bookIdx, chapter, verse) {
    var lookup = lookupFor(id);
    var kjv = window.BIBLE_KJV && window.BIBLE_KJV[bookIdx];
    var chapterArr = kjv && kjv.chapters[chapter - 1];
    var text = chapterArr && chapterArr[verse - 1];
    if (!lookup || !text) return [];
    return lookup.computeDefinitions(String(text).split(/\s+/)).map(function (e) {
      return {
        name: e.name,
        text: e.text,
        strong: id + ':' + e.name,
        linkRefs: true,
        lazy: e.text.length > LAZY_OVER,
        html: e.text.length > LAZY_OVER ? undefined : (window.BibleRefs ? window.BibleRefs.linkify(e.text) : undefined)
      };
    });
  }

  return { forVerse: forVerse };
})();

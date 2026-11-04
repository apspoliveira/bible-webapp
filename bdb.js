// Brown-Driver-Briggs Hebrew Lexicon (public domain), keyed by Strong's number
// and connected to a verse via a separately-sourced Strong's-tagged KJV text
// (window.BDB_VERSE_STRONGS) — Old Testament only, since BDB covers Hebrew,
// not Greek. English-only: there is no Portuguese translation available.
window.BdbLookup = (function () {
  'use strict';

  // The data files load on demand (see dataloader.js), so everything below
  // reads the window globals at call time instead of capturing them here.
  function LEX() { return window.BDB_LEXICON || {}; }

  // BDB doesn't give every derived word its own entry — related forms are
  // often filed together under one combined key (eg "H3588_H5921_H3651"
  // covers H3588, H5921 and H3651). A plain LEXICON[strong] lookup misses
  // those, so this index maps each individual Strong's number to whichever
  // combined key contains it, built lazily since most pages only need a few.
  var compoundIndex = null, compoundSrc = null;
  function buildCompoundIndex() {
    var idx = {}, LEXICON = LEX();
    for (var key in LEXICON) {
      if (key.indexOf('_') === -1) continue;
      var parts = key.match(/H\d+/g);
      if (!parts) continue;
      for (var i = 0; i < parts.length; i++) {
        if (!(parts[i] in idx)) idx[parts[i]] = key;
      }
    }
    return idx;
  }

  function lookupText(strong) {
    var LEXICON = LEX();
    var text = LEXICON[strong];
    if (text) return text;
    if (!compoundIndex || compoundSrc !== LEXICON) { compoundIndex = buildCompoundIndex(); compoundSrc = LEXICON; }
    var compoundKey = compoundIndex[strong];
    return compoundKey ? LEXICON[compoundKey] : undefined;
  }

  // `bookIdx` is 0-based, matching BIBLE_PT/BIBLE_KJV order (0 = Genesis).
  // Returns [] when the book is outside the Old Testament or has no data.
  function getEntries(bookIdx, chapter, verse) {
    var VERSE_STRONGS = window.BDB_VERSE_STRONGS || [];
    var VERSE_WORDS = window.BDB_VERSE_WORDS || [];
    if (bookIdx < 0 || bookIdx >= VERSE_STRONGS.length) return [];
    var book = VERSE_STRONGS[bookIdx];
    var chapterArr = book && book[Number(chapter) - 1];
    var tags = chapterArr && chapterArr[Number(verse) - 1];
    if (!tags || !tags.length) return [];
    var wordsChapterArr = VERSE_WORDS[bookIdx] && VERSE_WORDS[bookIdx][Number(chapter) - 1];
    var words = wordsChapterArr && wordsChapterArr[Number(verse) - 1];

    var results = [];
    var seen = {};
    for (var i = 0; i < tags.length; i++) {
      var strong = tags[i];
      if (seen[strong]) continue;
      seen[strong] = true;
      var text = lookupText(strong);
      if (text) results.push({ name: (words && words[i]) || strong, strong: strong, text: text });
    }
    return results;
  }

  return {
    getEntries: getEntries,
    get hasAny() { return Object.keys(LEX()).length > 0 && (window.BDB_VERSE_STRONGS || []).length > 0; }
  };
})();

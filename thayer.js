// Thayer's Greek-English Lexicon of the New Testament (1889, public domain),
// keyed by Strong's number and connected to a verse via a separately-sourced
// Strong's-tagged Greek NT (window.THAYER_VERSE_STRONGS) — New Testament
// only, since Thayer's covers Greek, not Hebrew.
window.ThayerLookup = (function () {
  'use strict';

  // Data loads on demand (see dataloader.js): read the globals at call time.

  // `bookIdx` is 0-based, matching BIBLE_PT/BIBLE_KJV order (39 = Matthew).
  // Returns [] when the book is outside the New Testament or has no data.
  function getEntries(bookIdx, chapter, verse) {
    var LEXICON = window.THAYER_LEXICON || {};
    var VERSE_STRONGS = window.THAYER_VERSE_STRONGS || [];
    var VERSE_WORDS = window.THAYER_VERSE_WORDS || [];
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
      var text = LEXICON[strong];
      if (text) results.push({ name: (words && words[i]) || strong, strong: strong, text: text });
    }
    return results;
  }

  return {
    getEntries: getEntries,
    get hasAny() { return Object.keys(window.THAYER_LEXICON || {}).length > 0 && (window.THAYER_VERSE_STRONGS || []).length > 0; }
  };
})();

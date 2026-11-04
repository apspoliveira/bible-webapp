// Treasury of Scripture Knowledge cross references, keyed by (bookIdx,
// chapter, verse) -- see data/tsk_refs.js for the raw [targetBook,
// targetChapter, targetVerseStart, targetVerseEnd] tuples. Resolves each
// target against window.BIBLE_PT so the popup can show the actual quoted
// verse text, not just the bare reference. Portuguese only: the source data
// carries no translation, and quoting straight from BIBLE_PT needs none.
window.TskLookup = (function () {
  'use strict';

  function bookName(bookIdx) {
    var book = window.BIBLE_PT && window.BIBLE_PT[bookIdx];
    return book ? book.name : ('Livro ' + (bookIdx + 1));
  }

  function verseText(bookIdx, chapter, verse) {
    var book = window.BIBLE_PT && window.BIBLE_PT[bookIdx];
    var chapterArr = book && book.chapters[chapter - 1];
    return (chapterArr && chapterArr[verse - 1]) || '';
  }

  function formatRef(bi, ch, vs, ve) {
    var name = bookName(bi);
    return ve > vs ? (name + ' ' + ch + ':' + vs + '-' + ve) : (name + ' ' + ch + ':' + vs);
  }

  // Ranges are quoted verse-by-verse (with a leading verse number for
  // context) rather than run together, since TSK ranges can span several
  // verses of very different content.
  function formatText(bi, ch, vs, ve) {
    var parts = [];
    for (var v = vs; v <= ve; v++) {
      var text = verseText(bi, ch, v);
      if (text) parts.push(ve > vs ? (v + '. ' + text) : text);
    }
    return parts.join(' ');
  }

  // `bookIdx` is 0-based (0 = Genesis, matching BIBLE_PT/BIBLE_KJV order);
  // `chapter`/`verse` are 1-based, matching the convention used elsewhere
  // in this app (see BdbLookup.getEntries / ThayerLookup.getEntries).
  function getEntries(bookIdx, chapter, verse) {
    var REFS = window.TSK_REFS || []; // loaded on demand (dataloader.js)
    var book = REFS[bookIdx];
    var chapterArr = book && book[Number(chapter) - 1];
    var refs = chapterArr && chapterArr[Number(verse) - 1];
    if (!refs || !refs.length) return [];

    var results = [];
    for (var i = 0; i < refs.length; i++) {
      var r = refs[i];
      var bi = r[0], ch = r[1], vs = r[2], ve = r[3];
      var text = formatText(bi, ch, vs, ve);
      if (!text) continue; // target verse missing from this translation's data
      results.push({ name: formatRef(bi, ch, vs, ve), text: text, ref: [bi, ch, vs, ve] });
    }
    return results;
  }

  return {
    getEntries: getEntries,
    get hasAny() { return (window.TSK_REFS || []).length > 0; }
  };
})();

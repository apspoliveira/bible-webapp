// Strong's Concordance: for a Strong's-tagged word in the current verse,
// lists every other place that same original-language word (by Strong's
// number) occurs in the Bible -- meaning (from BDB/Thayer) plus the full
// Portuguese verse text for every occurrence, however many there are. Built
// lazily from the Strong's tags already shipped for BDB (Hebrew/OT) and
// Thayer (Greek/NT) -- no extra data file needed.
//
// Note on the per-occurrence gloss: BDB_VERSE_WORDS/THAYER_VERSE_WORDS give a
// literal word-for-word gloss aligned to the original-language word order,
// which frequently does NOT appear verbatim inside the ACF verse text (e.g.
// Gen 1:1's H7225 glosses as "início" while the ACF wording is "princípio").
// So rather than attempting (unreliable) in-place highlighting inside the
// ACF sentence, each occurrence line shows that occurrence's own gloss
// alongside the complete verse, e.g. "Gênesis 10:10 — [princípio] E o
// princípio do seu reino foi Babel...".
//
// Performance: getEntries() only counts occurrences (cheap, O(1) per word
// after the index is built) so opening the popup never formats verse text
// for words the user doesn't ask for. The actual (possibly thousands of
// lines) occurrence list is built by renderOccurrences(), called lazily the
// first time an entry is expanded (see eastonPopup.js) and cached on the
// DOM node afterwards, exactly like BDB/Thayer's on-demand translation.
window.StrongConcordance = (function () {
  'use strict';

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var index = null, indexSig = null; // strong -> [{bookIdx, chapter, verse, wordIdx}, ...], built on first use

  function scan(versesArr, wordsArr, idx) {
    for (var b = 0; b < versesArr.length; b++) {
      var book = versesArr[b];
      if (!book) continue;
      for (var c = 0; c < book.length; c++) {
        var chapterArr = book[c];
        if (!chapterArr) continue;
        for (var v = 0; v < chapterArr.length; v++) {
          var tags = chapterArr[v];
          if (!tags || !tags.length) continue;
          var seen = {};
          for (var i = 0; i < tags.length; i++) {
            var strong = tags[i];
            if (seen[strong]) continue; // one hit per verse, even if the word repeats
            seen[strong] = true;
            if (!idx[strong]) idx[strong] = [];
            idx[strong].push({ bookIdx: b, chapter: c + 1, verse: v + 1, wordIdx: i });
          }
        }
      }
    }
  }

  // The Strong's tags load on demand; rebuild if the loaded data changed.
  function ensureIndex() {
    var sig = (window.BDB_VERSE_STRONGS ? 1 : 0) + ':' + (window.THAYER_VERSE_STRONGS ? 1 : 0);
    if (!index || sig !== indexSig) { index = buildIndex(); indexSig = sig; }
  }

  function buildIndex() {
    var idx = {};
    scan(window.BDB_VERSE_STRONGS || [], window.BDB_VERSE_WORDS || [], idx);
    scan(window.THAYER_VERSE_STRONGS || [], window.THAYER_VERSE_WORDS || [], idx);
    return idx;
  }

  function verseText(bookIdx, chapter, verse) {
    var book = window.BIBLE_PT && window.BIBLE_PT[bookIdx];
    var chapterArr = book && book.chapters[chapter - 1];
    return (chapterArr && chapterArr[verse - 1]) || '';
  }

  function bookName(bookIdx) {
    var book = window.BIBLE_PT && window.BIBLE_PT[bookIdx];
    return book ? book.name : ('Livro ' + (bookIdx + 1));
  }

  function glossAt(strong, bookIdx, chapter, verse, wordIdx) {
    var wordsRoot = strong.charAt(0) === 'H' ? window.BDB_VERSE_WORDS : window.THAYER_VERSE_WORDS;
    var book = wordsRoot && wordsRoot[bookIdx];
    var chapterArr = book && book[chapter - 1];
    var words = chapterArr && chapterArr[verse - 1];
    return (words && words[wordIdx]) || '';
  }

  // `wordEntries` is the already-computed {name, strong, text} list for the
  // current verse (BDB entries for OT, Thayer entries for NT -- see
  // app.js/fileapp.js); `text` is that word's lexicon meaning, reused here so
  // the meaning is visible immediately, no extra lookup needed. Returns
  // lightweight entries -- the (possibly huge) occurrence list itself is
  // rendered lazily via renderOccurrences() when the entry is opened.
  function getEntries(wordEntries, bookIdx, chapter, verse) {
    if (!wordEntries || !wordEntries.length) return [];
    ensureIndex();

    bookIdx = Number(bookIdx);
    chapter = Number(chapter);
    verse = Number(verse);

    var results = [];
    var seenStrong = {};
    for (var i = 0; i < wordEntries.length; i++) {
      var we = wordEntries[i];
      if (!we.strong || seenStrong[we.strong]) continue;
      seenStrong[we.strong] = true;

      var occurrences = index[we.strong] || [];
      var count = 0;
      for (var j = 0; j < occurrences.length; j++) {
        var o = occurrences[j];
        if (!(o.bookIdx === bookIdx && o.chapter === chapter && o.verse === verse)) count++;
      }
      if (!count) continue;

      results.push({
        name: we.name + ' (' + we.strong + ') — ' + count + (count === 1 ? ' ocorrência' : ' ocorrências'),
        meaning: we.text || '',
        strong: we.strong,
        excludeBookIdx: bookIdx,
        excludeChapter: chapter,
        excludeVerse: verse
      });
    }
    return results;
  }

  // Builds the full occurrence list for `strong` (every book/chapter/verse
  // where it's tagged, excluding the one verse the user is currently on) --
  // no cap, however many there are. Each line (HTML, reference linked): "Livro C:V — [gloss] texto
  // completo do versículo".
  function renderOccurrences(strong, excludeBookIdx, excludeChapter, excludeVerse) {
    ensureIndex();
    var occurrences = index[strong] || [];
    var lines = [];
    for (var i = 0; i < occurrences.length; i++) {
      var o = occurrences[i];
      if (o.bookIdx === excludeBookIdx && o.chapter === excludeChapter && o.verse === excludeVerse) continue;
      var gloss = glossAt(strong, o.bookIdx, o.chapter, o.verse, o.wordIdx);
      var glossPart = gloss ? ('[' + gloss + '] ') : '';
      lines.push(bookName(o.bookIdx) + ' ' + o.chapter + ':' + o.verse + ' — ' + glossPart + verseText(o.bookIdx, o.chapter, o.verse));
    }
    return lines.join('\n');
  }

  return {
    getEntries: getEntries,
    renderOccurrences: renderOccurrences,
    get hasAny() { return !!((window.BDB_VERSE_STRONGS && window.BDB_VERSE_STRONGS.length) || (window.THAYER_VERSE_STRONGS && window.THAYER_VERSE_STRONGS.length)); }
  };
})();

// Topical indexes keyed by verse: Thompson Chain Topics (TcrLookup), Torrey's
// New Topical Textbook (TorreyLookup) and Nave's Topical Bible (NaveLookup) --
// see build_topics.py and data/{tcr,torrey,nave}_refs.js. For the current
// verse, each lists every topic whose reference list includes it; an entry
// shows the whole topic with its scripture references linked (BibleRefs).
// English-only: the sources carry no translation. The data loads on demand
// (dataloader.js), so it is read from the window globals at call time.
(function () {
  'use strict';

  function build(prefix, marked) {
    // `bookIdx` is 0-based; `chapter`/`verse` are 1-based (same as TskLookup).
    function getEntries(bookIdx, chapter, verse) {
      var topics = window[prefix + '_TOPICS'] || [];
      var verses = window[prefix + '_VERSES'] || {};
      var ids = verses[Number(bookIdx) + '.' + Number(chapter) + '.' + Number(verse)];
      if (!ids || !ids.length) return [];
      var results = [];
      for (var i = 0; i < ids.length; i++) {
        var t = topics[ids[i]];
        if (!t) continue;
        var refs = window.BibleRefs;
        results.push({
          name: t[0],
          text: t[1],
          html: refs ? (marked ? refs.renderMarked(t[1]) : refs.linkify(t[1])) : undefined
        });
      }
      return results;
    }

    return {
      getEntries: getEntries,
      get hasAny() { return (window[prefix + '_TOPICS'] || []).length > 0; }
    };
  }

  window.TcrLookup = build('TCR', false);
  window.TorreyLookup = build('TORREY', false);
  window.NaveLookup = build('NAVE', true);
})();

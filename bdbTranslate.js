// On-demand English -> Portuguese translation for Brown-Driver-Briggs and
// Thayer's lexicon entries (keyed by Strong's number, so Hebrew "H..." and
// Greek "G..." keys never collide), using MyMemory's free anonymous
// translation API (no key, ~500 chars/request, modest daily quota). Each
// entry is translated at most once per browser — the result is cached in
// localStorage (both lexicons are public-domain text, so no restriction on
// storing a translated copy of them locally).
window.BdbTranslate = (function () {
  'use strict';

  var CACHE_PREFIX = 'bdbPt:';
  var MAX_CHUNK = 450; // stay under MyMemory's 500-char anonymous limit
  var CHUNK_DELAY_MS = 350; // spread sequential requests out a little

  function getCached(strong) {
    try {
      return localStorage.getItem(CACHE_PREFIX + strong);
    } catch (e) {
      return null;
    }
  }

  function setCached(strong, text) {
    try {
      localStorage.setItem(CACHE_PREFIX + strong, text);
    } catch (e) { /* storage full/unavailable — just skip caching */ }
  }

  // Split into <=MAX_CHUNK pieces on whitespace boundaries (never mid-word).
  function chunkText(text) {
    var chunks = [];
    var start = 0;
    while (start < text.length) {
      var end = Math.min(start + MAX_CHUNK, text.length);
      if (end < text.length) {
        var lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start) end = lastSpace;
      }
      chunks.push(text.slice(start, end).trim());
      start = end;
    }
    return chunks.filter(Boolean);
  }

  function translateChunk(chunk) {
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) +
      '&langpair=en|pt';
    return fetch(url).then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function (data) {
      var text = data && data.responseData && data.responseData.translatedText;
      if (!text || /QUERY LENGTH LIMIT|MYMEMORY WARNING/i.test(text)) {
        throw new Error(text || 'empty translation response');
      }
      return text;
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function translateChunksSequentially(chunks) {
    var results = [];
    var i = 0;
    function next() {
      if (i >= chunks.length) return Promise.resolve(results.join(' '));
      return translateChunk(chunks[i]).then(function (translated) {
        results.push(translated);
        i++;
        return i < chunks.length ? delay(CHUNK_DELAY_MS).then(next) : next();
      });
    }
    return next();
  }

  // Calls onDone(translatedText, error). Uses the cache when available.
  function translate(strong, englishText, onDone) {
    var cached = getCached(strong);
    if (cached) {
      onDone(cached, null);
      return;
    }
    var chunks = chunkText(englishText);
    translateChunksSequentially(chunks).then(function (fullText) {
      setCached(strong, fullText);
      onDone(fullText, null);
    }).catch(function (err) {
      onDone(null, err);
    });
  }

  return { translate: translate, getCached: getCached };
})();

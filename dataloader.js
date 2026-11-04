// On-demand loader for the big data files. Every tab of the app used to
// parse ~100 MB of dictionaries/lexicons up front (230+ MB of JS heap each),
// so a few open tabs made the browser discard background tabs (they "reload").
// Now only the Bibles and the default Portuguese Easton load with the page;
// each study-panel resource loads the first time its tab is opened.
//
// Data files define window globals; a group is "loaded" when all its globals
// exist. The lookup modules read those globals at call time, so loading a
// group is enough -- nothing else has to be rebuilt by hand. Every successful
// load fires a `dataloaded` event (detail: group id) on document.
window.DataLoader = (function () {
  'use strict';

  var GROUPS = {
    easton_en: { files: ['data/easton.js'], globals: ['EASTON_DICTIONARY'], mb: 3 },
    ptdict: { files: ['data/pt_dictionary.js'], globals: ['PT_DICTIONARY'], mb: 15 },
    smith: { files: ['data/smith.js'], globals: ['SMITH_DICTIONARY'], mb: 3 },
    cbc: { files: ['data/cbc.js'], globals: ['CBC_DICTIONARY'], mb: 0.5 },
    isbe: { files: ['data/isbe.js'], globals: ['ISBE_DICTIONARY'], mb: 26 },
    webster1828: { files: ['data/webster1828.js'], globals: ['WEBSTER1828_DICTIONARY'], mb: 4 },
    webster1913: { files: ['data/webster1913.js'], globals: ['WEBSTER1913_DICTIONARY'], mb: 5 },
    hebrew: { files: ['data/bdb_lexicon.js', 'data/bdb_refs.js'], globals: ['BDB_LEXICON', 'BDB_VERSE_STRONGS'], mb: 13 },
    greek: { files: ['data/thayer_lexicon.js', 'data/thayer_refs.js'], globals: ['THAYER_LEXICON', 'THAYER_VERSE_STRONGS'], mb: 8 },
    tsk: { files: ['data/tsk_refs.js'], globals: ['TSK_REFS'], mb: 4 },
    tcr: { files: ['data/tcr_refs.js'], globals: ['TCR_TOPICS'], mb: 1 },
    nave: { files: ['data/nave_refs.js'], globals: ['NAVE_TOPICS'], mb: 4 },
    torrey: { files: ['data/torrey_refs.js'], globals: ['TORREY_TOPICS'], mb: 1.5 },
    egw: { files: ['data/egw_index.js'], globals: ['EGW_INDEX'], mb: 1 },
    da_pages: { files: ['data/da_pages.js'], globals: ['DA_PAGES'], mb: 0.05 },
    bible_ms: { files: ['data/bible_pt_ms.js'], globals: ['BIBLE_PT_MS'], mb: 4 }
  };

  var inflight = {}; // group id -> Promise<boolean>
  var scripts = {};  // src -> Promise<boolean>

  function isLoaded(id) {
    var g = GROUPS[id];
    return !!g && g.globals.every(function (name) { return !!window[name]; });
  }

  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = function () { resolve(true); };
        s.onerror = function () { delete scripts[src]; resolve(false); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  // Loads one group; resolves true when its globals are available.
  function load(id) {
    var g = GROUPS[id];
    if (!g) return Promise.resolve(false);
    if (isLoaded(id)) return Promise.resolve(true);
    if (!inflight[id]) {
      inflight[id] = Promise.all(g.files.map(loadScript)).then(function (results) {
        delete inflight[id];
        var ok = results.every(Boolean) && isLoaded(id);
        if (ok) document.dispatchEvent(new CustomEvent('dataloaded', { detail: id }));
        return ok;
      });
    }
    return inflight[id];
  }

  function loadMany(ids) {
    return Promise.all(ids.map(load)).then(function (r) { return r.every(Boolean); });
  }

  function sizeMb(ids) {
    return [].concat(ids).reduce(function (sum, id) { return sum + (GROUPS[id] ? GROUPS[id].mb : 0); }, 0);
  }

  return { isLoaded: isLoaded, load: load, loadMany: loadMany, sizeMb: sizeMb };
})();

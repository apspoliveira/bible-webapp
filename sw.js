// Offline/installable cache for the Bible memorization app. Bump CACHE_NAME
// whenever any listed file's content changes (including the data/*.js
// bundles after re-running their build scripts) so clients pick up the new
// version instead of serving stale cached assets forever.
var CACHE_NAME = 'biblia-app-v15';

var ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'style.css',
  'app.js',
  'autocomplete.js',
  'bdb.js',
  'bdbTranslate.js',
  'concordance.js',
  'dataloader.js',
  'dicts.js',
  'easton.js',
  'eastonPopup.js',
  'studypanel.js',
  'editorSettings.js',
  'fileStorage.js',
  'fileapp.js',
  'highlight.js',
  'thayer.js',
  'refs.js',
  'topics.js',
  'tsk.js',
  'data/bdb_lexicon.js',
  'data/bdb_refs.js',
  'data/bible_kjv.js',
  'data/bible_pt.js',
  'data/bible_pt_ms.js',
  'data/easton.js',
  'data/easton_pt.js',
  'data/smith.js',
  'data/cbc.js',
  'data/highlight_words.js',
  'data/md_files.js',
  'data/pt_dictionary.js',
  'data/thayer_lexicon.js',
  'data/thayer_refs.js',
  'data/tcr_refs.js',
  'data/torrey_refs.js',
  'data/nave_refs.js',
  'data/tsk_refs.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  // Page navigations: try the network first (so an online reload always
  // gets the latest index.html), fall back to cache when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () { return caches.match('index.html'); })
    );
    return;
  }

  // App code (small same-origin js/css): network first so edits show up on
  // the next reload, falling back to the cache when offline.
  var url = new URL(event.request.url);
  if (url.origin === self.location.origin && /\.(js|css)$/.test(url.pathname) && url.pathname.indexOf('/data/') === -1) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' }).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () { return caches.match(event.request); })
    );
    return;
  }

  // Everything else (data, icons): these are static,
  // content-addressed-by-rebuild assets -- serve from cache instantly when
  // present, and only hit the network on a cache miss.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      });
    })
  );
});

// Unifies two file-storage backends behind one {path, read(), write(text)}
// entry shape, so fileapp.js never has to branch on which one is active:
//
//  - FSA backend (desktop Chrome/Edge): reads/writes the live Biblia folder
//    directly via the File System Access API. fileapp.js still does its own
//    directory walk (it already has SKIP_DIRS etc.) and just wraps each
//    resulting handle with FileStorage.wrapFsaEntry().
//
//  - IndexedDB backend (Android Chrome, and any other browser without FSA):
//    there is no way for a mobile browser to read a Windows folder, so the
//    content ships with the app instead (data/md_files.js, built by
//    build_md_bundle.py) and is copied into IndexedDB the first time the app
//    runs. Edits persist in that browser's IndexedDB from then on -- getting
//    them back onto the PC is a manual "download the file" step (see the
//    download button fileapp.js wires up next to the editor).
window.FileStorage = (function () {
  'use strict';

  var DB_NAME = 'biblia-files';
  var DB_VERSION = 1;
  var STORE = 'files';
  var hasFSA = typeof window.showDirectoryPicker === 'function';

  var dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE, { keyPath: 'path' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbTx(mode) {
    return openDb().then(function (db) { return db.transaction(STORE, mode).objectStore(STORE); });
  }

  function idbGetAll() {
    return idbTx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.getAll();
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGet(path) {
    return idbTx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.get(path);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPut(record) {
    return idbTx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.put(record);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbCount() {
    return idbTx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.count();
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // Copies window.MD_FILES_SEED into IndexedDB, but only the very first time
  // (an empty store) -- never overwrites edits made since.
  function ensureSeeded() {
    return idbCount().then(function (count) {
      if (count > 0) return false;
      var seed = window.MD_FILES_SEED || {};
      var paths = Object.keys(seed);
      return idbTx('readwrite').then(function (store) {
        return new Promise(function (resolve, reject) {
          paths.forEach(function (path) {
            store.put({ path: path, text: seed[path], updatedAt: 0 });
          });
          store.transaction.oncomplete = function () { resolve(true); };
          store.transaction.onerror = function () { reject(store.transaction.error); };
        });
      });
    });
  }

  function idbEntry(path) {
    return {
      path: path,
      backend: 'indexeddb',
      read: function () {
        return idbGet(path).then(function (rec) { return rec ? rec.text : ''; });
      },
      write: function (text) {
        return idbPut({ path: path, text: text, updatedAt: Date.now() });
      }
    };
  }

  function listIndexedDbEntries() {
    return idbGetAll().then(function (records) {
      records.sort(function (a, b) { return a.path.localeCompare(b.path); });
      return records.map(function (rec) { return idbEntry(rec.path); });
    });
  }

  function wrapFsaEntry(path, handle) {
    return {
      path: path,
      backend: 'fsa',
      read: function () {
        return handle.getFile().then(function (f) { return f.text(); }).then(function (t) {
          return t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        });
      },
      write: function (text) {
        return handle.createWritable().then(function (w) {
          return w.write(text).then(function () { return w.close(); });
        });
      }
    };
  }

  return {
    hasFSA: hasFSA,
    wrapFsaEntry: wrapFsaEntry,
    ensureSeeded: ensureSeeded,
    listIndexedDbEntries: listIndexedDbEntries
  };
})();

(function () {
  'use strict';

  var books = window.BIBLE_PT || [];
  var els = {
    book: document.getElementById('bookSelect'),
    chapter: document.getElementById('chapterSelect'),
    verse: document.getElementById('verseSelect'),
    form: document.getElementById('exploreForm'),
    button: document.getElementById('exploreButton'),
    status: document.getElementById('statusMessage'),
    results: document.getElementById('resultsSection'),
    summary: document.getElementById('resultsSummary'),
    list: document.getElementById('referenceList'),
    includeDa: document.getElementById('includeDaCheck'),
    daResults: document.getElementById('daResultsSection'),
    daSummary: document.getElementById('daResultsSummary'),
    daList: document.getElementById('daReferenceList'),
    copy: document.getElementById('copyButton'),
    download: document.getElementById('downloadButton')
  };
  var currentReferences = [];
  var currentDaReferences = [];

  function populateBooks() {
    els.book.innerHTML = books.map(function (book, index) {
      return '<option value="' + index + '">' + escapeHtml(book.name) + '</option>';
    }).join('');
    var romans = books.findIndex(function (book) { return book.name.toLowerCase() === 'romanos'; });
    els.book.value = String(romans >= 0 ? romans : 0);
    populateChapters();
  }

  function populateChapters() {
    var book = books[Number(els.book.value)];
    els.chapter.innerHTML = book.chapters.map(function (chapter, index) {
      return '<option value="' + index + '">' + (index + 1) + '</option>';
    }).join('');
    els.chapter.value = String(book.name.toLowerCase() === 'romanos' && book.chapters.length > 1 ? 1 : 0);
    populateVerses();
  }

  function populateVerses() {
    var chapter = books[Number(els.book.value)].chapters[Number(els.chapter.value)];
    els.verse.innerHTML = chapter.map(function (_, index) {
      return '<option value="' + index + '">' + (index + 1) + '</option>';
    }).join('');
    var book = books[Number(els.book.value)];
    if (book.name.toLowerCase() === 'romanos' && Number(els.chapter.value) === 1 && chapter.length >= 7) {
      els.verse.value = '6';
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function nodeKey(bookIdx, chapter, verse) {
    return bookIdx + ':' + chapter + ':' + verse;
  }

  function formatReference(bookIdx, chapter, verseStart, verseEnd) {
    var book = books[bookIdx];
    if (!book) return '';
    return book.name + ' ' + chapter + ':' + verseStart +
      (verseEnd > verseStart ? '-' + verseEnd : '');
  }

  function getReferenceText(bookIdx, chapter, verseStart, verseEnd) {
    var chapterVerses = books[bookIdx].chapters[chapter - 1];
    var lines = [];
    for (var verse = verseStart; verse <= verseEnd; verse++) {
      var text = chapterVerses[verse - 1];
      if (text) lines.push(verseEnd > verseStart ? verse + '. ' + text : text);
    }
    return lines.join('\n');
  }

  function explore(start, options) {
    var refs = window.TSK_REFS;
    if (!Array.isArray(refs) || !refs.length) {
      throw new Error('Os dados de referências cruzadas não estão disponíveis.');
    }

    var queue = [{
      bookIdx: start.bookIdx,
      chapter: start.chapter,
      verse: start.verse,
      depth: 0
    }];
    var cursor = 0;
    var bestDepth = {};
    var processedDepth = {};
    var resultByReference = {};
    var results = [];
    var exploredVerses = 0;
    var truncated = false;
    bestDepth[nodeKey(start.bookIdx, start.chapter, start.verse)] = 0;

    while (options.strategy === 'depth' ? queue.length > 0 : cursor < queue.length) {
      var source = options.strategy === 'depth' ? queue.pop() : queue[cursor++];
      var sourceKey = nodeKey(source.bookIdx, source.chapter, source.verse);
      if (source.depth >= options.depth ||
          (processedDepth[sourceKey] !== undefined && processedDepth[sourceKey] <= source.depth)) continue;
      processedDepth[sourceKey] = source.depth;
      exploredVerses++;

      var bookRefs = refs[source.bookIdx];
      var chapterRefs = bookRefs && bookRefs[source.chapter - 1];
      var verseRefs = chapterRefs && chapterRefs[source.verse - 1];
      if (!verseRefs) continue;

      for (var i = 0; i < Math.min(verseRefs.length, options.perVerseLimit); i++) {
        var target = verseRefs[i];
        var targetBook = books[target[0]];
        var targetChapter = targetBook && targetBook.chapters[target[1] - 1];
        if (!targetChapter || target[2] < 1 || target[3] > targetChapter.length) continue;

        var reference = formatReference(target[0], target[1], target[2], target[3]);
        var nextDepth = source.depth + 1;
        var item = resultByReference[reference];
        if (!item) {
          item = {
            reference: reference,
            text: getReferenceText(target[0], target[1], target[2], target[3]),
            bookIdx: target[0],
            chapter: target[1],
            verseStart: target[2],
            verseEnd: target[3],
            depth: nextDepth,
            from: formatReference(source.bookIdx, source.chapter, source.verse, source.verse)
          };
          resultByReference[reference] = item;
          results.push(item);
          if (results.length >= options.totalLimit) {
            truncated = true;
            break;
          }
        } else if (nextDepth < item.depth) {
          item.depth = nextDepth;
          item.from = formatReference(source.bookIdx, source.chapter, source.verse, source.verse);
        }

        if (nextDepth < options.depth) {
          for (var verse = target[2]; verse <= target[3]; verse++) {
            var targetKey = nodeKey(target[0], target[1], verse);
            if (nextDepth < (bestDepth[targetKey] === undefined ? Infinity : bestDepth[targetKey])) {
              bestDepth[targetKey] = nextDepth;
              var nextNode = { bookIdx: target[0], chapter: target[1], verse: verse, depth: nextDepth };
              queue.push(nextNode);
            }
          }
        }
      }
      if (truncated) break;
    }

    return { references: results, exploredVerses: exploredVerses, truncated: truncated };
  }

  function getDaPagesFromLocator(text) {
    var pages = [];
    var pagePattern = /(\d+)(?:\.\d+)?(?:\s*-\s*(\d+)(?:\.\d+)?)?/g;
    var match;
    while ((match = pagePattern.exec(text))) {
      var firstText = match[1];
      var first = Number(firstText);
      var last = match[2] ? Number(match[2]) : first;
      if (match[2] && last < first && match[2].length < firstText.length) {
        var scale = Math.pow(10, match[2].length);
        last += Math.floor(first / scale) * scale;
        if (last <= first) last += scale;
      }
      if (last - first > 1000) continue;
      for (var page = first; page <= last; page++) pages.push(page);
    }
    return pages;
  }

  function collectDaReferences(start, references) {
    var index = window.EGW_INDEX || {};
    var pageData = window.DA_PAGES || {};
    var found = {};
    var candidates = [{
      bookIdx: start.bookIdx,
      chapter: start.chapter,
      verseStart: start.verse,
      verseEnd: start.verse,
      depth: 0
    }].concat(references);
    var inspectedChapters = {};
    var inspectedVerses = {};

    function addReferenceGroups(referenceText, bibleReference, depth) {
      referenceText.split(' / ').forEach(function (group) {
        var match = /^DA\s+(.+)$/.exec(group.trim());
        if (!match) return;
        getDaPagesFromLocator(match[1]).forEach(function (page) {
          var data = pageData[String(page)];
          if (!data || !data.pdfPage) return;
          if (!found[page]) {
            found[page] = {
              page: page,
              pdfPage: data.pdfPage,
              references: [],
              depth: depth
            };
          }
          var item = found[page];
          if (depth < item.depth) item.depth = depth;
          if (item.references.indexOf(bibleReference) < 0) item.references.push(bibleReference);
        });
      });
    }

    candidates.forEach(function (candidate) {
      var chapterKey = candidate.bookIdx + '.' + candidate.chapter;
      var chapterEntry = index[chapterKey];
      if (!chapterEntry) return;
      var chapterReference = books[candidate.bookIdx].name + ' ' + candidate.chapter;
      if (chapterEntry.c && !inspectedChapters[chapterKey]) {
        inspectedChapters[chapterKey] = true;
        addReferenceGroups(chapterEntry.c, chapterReference + ' (capítulo)', candidate.depth);
      }
      for (var verse = candidate.verseStart; verse <= candidate.verseEnd; verse++) {
        var verseKey = chapterKey + '.' + verse;
        if (inspectedVerses[verseKey]) continue;
        inspectedVerses[verseKey] = true;
        (chapterEntry.v || []).forEach(function (entry) {
          if (verse >= entry[0] && verse <= entry[1]) {
            addReferenceGroups(entry[2], formatReference(candidate.bookIdx, candidate.chapter, verse, verse), candidate.depth);
          }
        });
      }
    });

    return Object.keys(found).map(function (page) { return found[page]; })
      .sort(function (a, b) { return a.page - b.page; });
  }

  function showStatus(message, kind) {
    els.status.textContent = message;
    els.status.className = 'alert alert-' + kind;
  }

  function renderDaReferences(start, result) {
    currentDaReferences = collectDaReferences(start, result.references);
    els.daList.innerHTML = '';
    els.daResults.classList.remove('d-none');
    els.daSummary.textContent = currentDaReferences.length
      ? currentDaReferences.length + ' páginas únicas de The Desire of Ages ligadas às passagens bíblicas exploradas.'
      : 'O índice não contém referências a The Desire of Ages para estas passagens.';

    currentDaReferences.forEach(function (item) {
      var li = document.createElement('li');
      var details = document.createElement('details');
      details.className = 'da-quote';
      var heading = document.createElement('summary');
      var title = document.createElement('strong');
      title.className = 'reference-name';
      title.textContent = 'The Desire of Ages, p. ' + item.page;
      var level = document.createElement('span');
      level.className = 'reference-level';
      level.textContent = item.depth ? ' · ligação bíblica nível ' + item.depth : ' · versículo inicial';
      var mappedPage = document.createElement('span');
      mappedPage.className = 'reference-level';
      mappedPage.textContent = ' · PDF p. ' + item.pdfPage + ' (aproximado)';
      var count = document.createElement('span');
      count.className = 'reference-level';
      count.textContent = ' · ' + item.references.length + ' passagens bíblicas';
      heading.appendChild(title);
      heading.appendChild(level);
      heading.appendChild(mappedPage);
      heading.appendChild(count);
      details.appendChild(heading);
      details.addEventListener('toggle', function () {
        if (!details.open || details.dataset.loaded) return;
        var excerpt = document.createElement('p');
        excerpt.className = 'reference-text mb-1';
        excerpt.textContent = 'A extrair o texto da página local…';
        var related = document.createElement('p');
        related.className = 'small text-secondary mb-0';
        related.textContent = 'Passagens no índice: ' + item.references.join('; ');
        details.appendChild(excerpt);
        details.appendChild(related);
        details.dataset.loaded = 'loading';
        fetch('da-page?page=' + encodeURIComponent(item.pdfPage)).then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        }).then(function (data) {
          if (!data.text) throw new Error('A página não contém texto extraível.');
          excerpt.textContent = data.text;
          details.dataset.loaded = 'true';
        }).catch(function (error) {
          excerpt.textContent = 'Não foi possível extrair esta página do PDF local (' + error.message + '). Confirme que en_DA.pdf está na pasta Downloads e reinicie o servidor.';
          details.dataset.loaded = 'error';
        });
      });
      li.appendChild(details);
      els.daList.appendChild(li);
    });

    if (!currentDaReferences.length) {
      var empty = document.createElement('li');
      empty.textContent = 'Não foram encontradas referências a The Desire of Ages nas passagens desta exploração.';
      els.daList.appendChild(empty);
    }
  }

  function render(result, source, start, includeDa) {
    currentReferences = result.references;
    els.list.innerHTML = '';
    currentDaReferences = [];
    els.daResults.classList.add('d-none');
    currentReferences.forEach(function (item) {
      var li = document.createElement('li');
      var heading = document.createElement('div');
      var reference = document.createElement('strong');
      reference.className = 'reference-name';
      reference.textContent = item.reference;
      var level = document.createElement('span');
      level.className = 'reference-level';
      level.textContent = 'nível ' + item.depth;
      var text = document.createElement('p');
      text.className = 'reference-text mb-0';
      text.textContent = item.text || 'Texto indisponível nesta tradução.';
      heading.appendChild(reference);
      heading.appendChild(level);
      li.appendChild(heading);
      li.appendChild(text);
      li.title = 'Ligação encontrada a partir de ' + item.from;
      els.list.appendChild(li);
    });
    if (includeDa) renderDaReferences(start, result);
    els.results.classList.remove('d-none');
    els.summary.textContent = source + ' · ' + currentReferences.length +
      ' referências únicas · ' + result.exploredVerses + ' versículos explorados';
    if (!currentReferences.length) {
      var li = document.createElement('li');
      li.textContent = 'Não foram encontradas referências com estes parâmetros.';
      els.list.appendChild(li);
    }
    if (result.truncated) {
      showStatus('A exploração parou ao atingir o limite de referências definido. Aumente o limite para continuar a pesquisa.', 'warning');
    } else {
      showStatus('Exploração concluída.', 'success');
    }
  }

  function referenceLines() {
    var lines = currentReferences.map(function (item) {
      return item.reference + (item.text ? '\n' + item.text : '');
    });
    if (currentDaReferences.length) {
      lines.push('ESPÍRITO DE PROFECIA — THE DESIRE OF AGES');
      currentDaReferences.forEach(function (item) {
        lines.push(
          'The Desire of Ages, p. ' + item.page + ' (página PDF aproximada: ' + item.pdfPage + ')' +
          '\nPassagens no índice: ' + item.references.join('; ')
        );
      });
    }
    return lines.join('\n\n');
  }

  function onSubmit(event) {
    event.preventDefault();
    var depth = Number(document.getElementById('depthInput').value);
    var totalLimit = Number(document.getElementById('totalLimitInput').value);
    var perVerseLimit = Number(document.getElementById('perVerseLimitInput').value);
    if (!els.form.reportValidity()) return;

    els.button.disabled = true;
    els.button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> A carregar referências…';
    showStatus('A carregar as referências cruzadas…', 'info');
    var includeDa = els.includeDa.checked;
    var groups = includeDa ? ['tsk', 'egw', 'da_pages'] : ['tsk'];
    window.DataLoader.loadMany(groups).then(function (loaded) {
      els.button.disabled = false;
      els.button.innerHTML = '<i class="bi bi-diagram-3" aria-hidden="true"></i> Explorar referências';
      if (!loaded) {
        showStatus(includeDa
          ? 'Faltam dados locais: instale um índice EGW autorizado em data/egw_index.js e gere o mapa com python build_da_pages.py. O PDF en_DA.pdf deve estar em Downloads.'
          : 'Não foi possível carregar os dados TSK. Verifique a ligação ao servidor e tente novamente.', 'danger');
        return;
      }
      var start = {
        bookIdx: Number(els.book.value),
        chapter: Number(els.chapter.value) + 1,
        verse: Number(els.verse.value) + 1
      };
      var source = formatReference(start.bookIdx, start.chapter, start.verse, start.verse);
      try {
        var result = explore(start, {
          depth: depth,
          totalLimit: totalLimit,
          perVerseLimit: perVerseLimit,
          strategy: document.getElementById('strategySelect').value
        });
        render(result, source, start, includeDa);
      } catch (error) {
        showStatus(error.message || 'Ocorreu um erro ao explorar as referências.', 'danger');
      }
    }).catch(function (error) {
      els.button.disabled = false;
      els.button.innerHTML = '<i class="bi bi-diagram-3" aria-hidden="true"></i> Explorar referências';
      showStatus(error.message || 'Não foi possível carregar os dados necessários.', 'danger');
    });
  }

  els.book.addEventListener('change', populateChapters);
  els.chapter.addEventListener('change', populateVerses);
  els.form.addEventListener('submit', onSubmit);
  els.copy.addEventListener('click', function () {
    var text = referenceLines();
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      showStatus('A cópia automática não está disponível neste navegador. Descarregue o ficheiro .txt.', 'warning');
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      showStatus('Lista de referências copiada.', 'success');
    }, function () {
      showStatus('Não foi possível copiar a lista. Descarregue o ficheiro .txt.', 'danger');
    });
  });
  els.download.addEventListener('click', function () {
    var blob = new Blob([referenceLines()], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'referencias-cruzadas.txt';
    link.click();
    URL.revokeObjectURL(url);
  });

  populateBooks();
})();

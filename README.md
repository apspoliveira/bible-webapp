# Explorador e ferramentas bíblicas

Aplicação web estática para prática de memorização, consulta de recursos de
estudo e exploração de referências cruzadas.

## Executar localmente

1. Instale Python 3 e PyMuPDF (`python -m pip install pymupdf`).
2. Execute `start_server.bat`.
3. Abra <http://localhost:8791/>. O explorador de referências está em
   <http://localhost:8791/crossrefs.html>.

O servidor só aceita ligações do próprio computador. A extração de excertos de
*The Desire of Ages* usa o PDF `en_DA.pdf` em `Downloads` e só é feita quando
se abre um excerto.

## Dados locais e atribuição

- `data/egw_index.js` e `data/md_files.js` são dados locais e estão excluídos
  do Git. O índice EGW não deve ser redistribuído sem autorização; as notas
  indexadas em `md_files.js` podem ser pessoais.
- Para usar a integração local com *The Desire of Ages*, coloque uma cópia
  autorizada de `egw_index.js` em `data/`, mantenha o PDF em `Downloads` com o
  nome `en_DA.pdf` e gere o mapa de páginas com
  `python build_da_pages.py`. O mapa contém números de página, não o texto do
  livro.
- Os ficheiros de dados mantêm os avisos de origem e licença disponíveis nos
  próprios ficheiros e scripts de geração. Verifique os termos de cada fonte
  antes de redistribuir os dados ou publicar uma cópia pública da aplicação.

O repositório não declara uma licença única para os dados de terceiros.

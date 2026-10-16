# Библиотеки, встроенные в сайт

Чтобы сайт работал без интернета и не зависел от CDN, основные библиотеки лежат здесь. Все распространяются по лицензии MIT (DOMPurify — Apache-2.0 / MPL-2.0).

| Файл | Библиотека | Версия |
|---|---|---|
| marked.umd.js | marked | 18.0.10 |
| purify.min.js | DOMPurify | 3.x |
| pptxgen.bundle.js | PptxGenJS | 4.0.1 |
| jszip.min.js | JSZip | 3.10.1 |
| docx.umd.js | docx | 9.7.1 |
| turndown.js, turndown-plugin-gfm.js | Turndown | 7.x |

Остальное (чтение PDF и .docx, PDF-выгрузка, QR) загружается с CDN при первом использовании и дальше хранится в браузере.

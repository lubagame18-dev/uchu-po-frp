/* подставляет реквизиты из data/legal.js в страницы документов */
(function(){var L=window.UCHU_LEGAL||{};document.querySelectorAll("[data-l]").forEach(function(el){var k=el.getAttribute("data-l");if(L[k])el.textContent=L[k];});document.querySelectorAll("a[data-mail]").forEach(function(a){if(L.email){a.href="mailto:"+L.email;a.textContent=L.email;}});})();

/* подставляет реквизиты из data/legal.js и добавляет шапку сайта на страницы документов */
(function(){var L=window.UCHU_LEGAL||{};
document.querySelectorAll("[data-l]").forEach(function(el){var k=el.getAttribute("data-l");if(L[k])el.textContent=L[k];});
document.querySelectorAll("a[data-mail]").forEach(function(a){if(L.email){a.textContent=L.email;a.href="mailto:"+L.email;}});
document.querySelectorAll("[data-addr]").forEach(function(el){if(L.address)el.hidden=false;});
var b=document.createElement("div");b.className="brand";b.innerHTML='<div class="in"><div><a class="logo" href="../">Учу по <b>ФРП</b></a><small>конструктор уроков по ФРП</small></div></div>';
document.body.insertBefore(b,document.body.firstChild);
var f=document.createElement("div");f.className="foot";f.textContent="© 2026 «Учу по ФРП»"+(L.site?" · "+L.site.replace(/^https?:\/\//,"").replace(/\/$/,""):"");document.body.appendChild(f);
})();

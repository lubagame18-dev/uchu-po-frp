/* Cloudflare: статические файлы отдаются напрямую; сюда попадают только адреса без готового файла.
   «/» и «/папка/» → index.html этой папки (html_handling = "none" сам этого не делает). */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/")) {
      const r = await env.ASSETS.fetch(new Request(new URL(url.pathname + "index.html", url), request));
      if (r.status !== 404) return r;
    }
    return env.ASSETS.fetch(request);
  }
};

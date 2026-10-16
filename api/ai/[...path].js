/* Vercel: прокси для GigaChat и YandexGPT по адресу https://<сайт>.vercel.app/api/ai
   Сайт находит его сам. Ключи — в Settings → Environment Variables: GIGACHAT_KEY (и/или YANDEX_KEY + YANDEX_FOLDER). */
const { handler } = require("../../proxy/proxy.js");
module.exports = (req, res) => handler(req, res);
module.exports.config = { api: { bodyParser: false } };

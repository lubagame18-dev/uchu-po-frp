'use strict';
// All other proxy requests (AI, images, payment provider) retain their destinations.
function config() {
  if (process.env.ACCOUNTS_BACKEND === 'pocketbase') {
    const origin = (process.env.POCKETBASE_URL || '').replace(/\/+$/, '');
    const key = process.env.POCKETBASE_SERVICE_TOKEN || '';
    if (!origin || key.length < 32) throw new Error('PocketBase accounts environment is incomplete');
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('PocketBase requires HTTPS');
    return {url: origin + '/api/uchu', key};
  }
  return {url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''), key: process.env.SUPABASE_SERVICE_KEY || ''};
}
function wrapRequest(request) {
  return function(url, options = {}) {
    if (process.env.ACCOUNTS_BACKEND !== 'pocketbase') return request(url, options);
    const old = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const target = (process.env.POCKETBASE_URL || '').replace(/\/+$/, '');
    if (!(old && url.startsWith(old + '/')) && !(target && url.startsWith(target + '/api/uchu/'))) return request(url, options);
    const cfg = config();
    const suffix = url.startsWith(cfg.url + '/') ? url.slice(cfg.url.length) : url.slice(old.length);
    if (!/^\/(auth|rest)\/v1\//.test(suffix)) throw new Error('Unsupported account API path');
    const headers = {...options.headers};
    const oldKey = process.env.SUPABASE_SERVICE_KEY || '';
    if (headers.Authorization === 'Bearer ' + oldKey) delete headers.Authorization;
    // Service apikey is only sent for original service-role requests. User requests still use bearer auth.
    headers.apikey = headers.apikey === oldKey || headers.apikey === cfg.key ? cfg.key : '';
    let body = options.body;
    if (typeof body === 'string') { const data = JSON.parse(body); if (Array.isArray(data)) body = JSON.stringify({rows:data}); }
    return request(cfg.url + suffix, {...options, headers, body});
  };
}
module.exports = {config, wrapRequest, pocketbase: () => process.env.ACCOUNTS_BACKEND === 'pocketbase'};

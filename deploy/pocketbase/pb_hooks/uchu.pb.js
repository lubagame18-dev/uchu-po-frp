// Route callbacks run in isolated JS contexts. Load shared code inside each callback.
routerAdd('GET', '/api/uchu/auth/v1/health', (e) => e.json(200, {ok: true, provider: 'pocketbase'}));
routerAdd('POST', '/api/uchu/auth/v1/admin/users', (e) => require(__hooks + '/uchu.js').adminUser(e));
routerAdd('POST', '/api/uchu/auth/v1/{action}', (e) => require(__hooks + '/uchu.js').auth(e));
routerAdd('GET', '/api/uchu/auth/v1/user', (e) => require(__hooks + '/uchu.js').auth(e));
routerAdd('PUT', '/api/uchu/auth/v1/user', (e) => require(__hooks + '/uchu.js').auth(e));
routerAdd('POST', '/api/uchu/rest/v1/rpc/{name}', (e) => require(__hooks + '/uchu.js').rpc(e));
for (const method of ['GET','POST','PATCH','DELETE']) {
  routerAdd(method, '/api/uchu/rest/v1/{table}', (e) => require(__hooks + '/uchu.js').rest(e));
}

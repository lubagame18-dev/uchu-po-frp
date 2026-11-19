// Route callbacks run in isolated JS contexts. Load shared code inside each callback.
routerAdd('GET', '/api/uchu/auth/v1/health', (e) => e.json(200, {ok: true, provider: 'pocketbase', billing_revision:2}));
routerAdd('GET', '/api/uchu/admin/v1/users', (e) => require(__hooks + '/uchu.js').adminUsers(e));
routerAdd('POST', '/api/uchu/admin/v1/adjust', (e) => require(__hooks + '/uchu.js').adminAdjust(e));
routerAdd('POST', '/api/uchu/admin/v1/delete-user', (e) => require(__hooks + '/uchu.js').adminDeleteUser(e));
routerAdd('POST', '/api/uchu/auth/v1/admin/users', (e) => require(__hooks + '/uchu.js').adminUser(e));
routerAdd('POST', '/api/uchu/auth/v1/otp', (e) => require(__hooks + '/identities.js').otp(e));
routerAdd('POST', '/api/uchu/auth/v1/verify', (e) => require(__hooks + '/identities.js').verify(e));
routerAdd('POST', '/api/uchu/auth/v1/yandex_start', (e) => require(__hooks + '/identities.js').oauthStart(e,'yandex'));
routerAdd('POST', '/api/uchu/auth/v1/yandex_finish', (e) => require(__hooks + '/identities.js').oauthFinish(e,'yandex'));
routerAdd('POST', '/api/uchu/auth/v1/google_start', (e) => require(__hooks + '/identities.js').oauthStart(e,'google'));
routerAdd('POST', '/api/uchu/auth/v1/google_finish', (e) => require(__hooks + '/identities.js').oauthFinish(e,'google'));
routerAdd('POST', '/api/uchu/auth/v1/{action}', (e) => require(__hooks + '/uchu.js').auth(e));
routerAdd('GET', '/api/uchu/auth/v1/user', (e) => require(__hooks + '/uchu.js').auth(e));
routerAdd('PUT', '/api/uchu/auth/v1/user', (e) => require(__hooks + '/uchu.js').auth(e));
routerAdd('POST', '/api/uchu/rest/v1/rpc/{name}', (e) => require(__hooks + '/uchu.js').rpc(e));
for (const method of ['GET','POST','PATCH','DELETE']) {
  routerAdd(method, '/api/uchu/rest/v1/{table}', (e) => require(__hooks + '/uchu.js').rest(e));
}
cronAdd('uchu_login_state_cleanup', '17 * * * *', () => {
  // No phone numbers, codes, provider tokens or session credentials in logs.
  for (const r of $app.findRecordsByFilter('uchu_login_state','expires < {:now}','',1000,0,{now:Date.now()})) $app.delete(r);
});

routerAdd('GET','/api/uchu/privacy/v1/{action}',e=>require(__hooks+'/privacy.js').handle(e));
routerAdd('POST','/api/uchu/privacy/v1/{action}',e=>require(__hooks+'/privacy.js').handle(e));

cronAdd('uchu_privacy_retention','37 2 * * *',()=>require(__hooks+'/privacy.js').cleanup($app));
cronAdd('uchu_usage_retention','47 2 * * *',()=>{
  for(const r of $app.findRecordsByFilter('uchu_usage_reservations','settled = true && expires < {:now}','',10000,0,{now:Date.now()}))$app.delete(r);
});

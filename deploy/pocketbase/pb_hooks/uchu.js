'use strict';
const TABLES = {
  lessons: 'id', profiles: 'id', user_info: 'id', payments: 'order_id', quizzes: 'id',
  quiz_questions: 'quiz_id', quiz_results: 'id', shared_materials: 'id', site_admins: 'email',
  bot_links: 'chat_id', base_materials: 'id', site_rules: 'id', promo_codes: 'code',
  ai_keys: 'slot', img_keys: 'slot', free_usage: 'key', usage_reservations:'key'
};
const PUBLIC = ['base_materials','site_rules'];
const ADMIN = ['promo_codes','base_materials','site_rules'];
const CLIENT_FIELDS = {
  lessons: ['id','user_id','data','updated_at'], user_info: ['id','name','school','city','avatar','updated_at'],
  quizzes: ['id','user_id','template','title','created_at'], quiz_questions: ['quiz_id','data','created_at'],
  quiz_results: ['quiz_id','student','klass','score','total','details'],
  shared_materials: ['id','user_id','email','name','title','kind','type','subject','grade','topic','text','chars']
};
function fail(status, message) { throw Object.assign(new Error(message), {status: status}); }
function context(e) {
  const secret = $os.getenv('UCHU_SERVICE_TOKEN');
  const supplied = e.request.header.get('apikey');
  const service = !!secret && secret.length >= 32 && $security.equal($security.sha256(secret), $security.sha256(supplied));
  const user = e.auth && e.auth.collection().name === 'uchu_users' && e.auth.getBool('verified') ? e.auth : null;
  return {service: service, uid: user ? user.id : '', user: user};
}
function payload(r) { return JSON.parse(r.getString('payload'));  }
function keyOf(table, row) {
  if (table === 'free_usage') return String(row.key) + '\n' + String(row.month);
  return String(row[TABLES[table]] || '');
}
function lookup(app, table, key) {
  const r = app.findRecordsByFilter('uchu_' + table, 'key = {:key}', '', 1, 0, {key: key});
  return r.length ? r[0] : null;
}
function rows(app, table, owner) {
  const list = app.findRecordsByFilter('uchu_' + table, owner == null ? '' : 'owner = {:owner}', '', 10001, 0, {owner: owner || ''});
  if (list.length > 10000) fail(503, 'Dataset exceeds reviewed query limit; pagination migration required');
  return list;
}
function admin(app, c) {
  return c.service || !!(c.user && c.user.getBool('verified') && lookup(app, 'site_admins', c.user.getString('email').toLowerCase()));
}
function ownerOf(app, table, row) {
  if (['profiles','user_info'].indexOf(table) >= 0) return row.id || '';
  if (['quiz_questions','quiz_results'].indexOf(table) >= 0) {
    const quiz = lookup(app, 'quizzes', String(row.quiz_id));
    return quiz ? payload(quiz).user_id : '';
  }
  return row.user_id || '';
}
function canRead(app, table, row, c) {
  if (c.service || PUBLIC.indexOf(table) >= 0) return true;
  if (table === 'site_admins') return !!c.user && row.email === c.user.getString('email');
  if (table === 'shared_materials' || table === 'promo_codes') return admin(app, c);
  return !!c.uid && ['lessons','profiles','user_info','quizzes','quiz_questions','quiz_results'].indexOf(table) >= 0 && ownerOf(app, table, row) === c.uid;
}
function validateWrite(app, table, row, old, c, method) {
  if (c.service) return;
  if (ADMIN.indexOf(table) >= 0 && admin(app, c)) return;
  if (!CLIENT_FIELDS[table]) fail(403, 'Server-only collection');
  for (const key of Object.keys(row)) {
    if (CLIENT_FIELDS[table].indexOf(key) < 0 && ['created_at','id'].indexOf(key) < 0) fail(400, 'Unsupported field');
  }
  if (table === 'quiz_results' && method === 'POST') {
    if (old) fail(403, 'Result is immutable');
    if (!lookup(app, 'quizzes', String(row.quiz_id))) fail(400, 'Unknown quiz');
    if (typeof row.student !== 'string' || !/^[a-zA-Z0-9_-]{6,32}$/.test(row.student) || !/^(?:[1-9]|1[01])[A-Za-zА-Яа-я]?$|^$/.test(String(row.klass || '')) || JSON.stringify(row.details || {}).length > 20000) fail(400, 'Invalid result');
    if (!Number.isInteger(row.score) || !Number.isInteger(row.total) || row.total < 1 || row.score < 0 || row.score > row.total) fail(400, 'Invalid score');
    return;
  }
  if (!c.uid) fail(401, 'Authentication required');
  if (table === 'quiz_results' && method !== 'DELETE') fail(403, 'Result is immutable');
  if (table === 'user_info') require(__hooks+'/privacy.js').validateProfile(app,c.uid,row);
  if (table === 'shared_materials') {
    if (method !== 'POST' || old) { if (!admin(app, c)) fail(403, 'Admin required'); return; }
    if (row.user_id !== c.uid) fail(403, 'Invalid owner');
  } else if (ownerOf(app, table, row) !== c.uid || (old && ownerOf(app, table, old) !== c.uid)) fail(403, 'Invalid owner');
}
function write(app, table, row, c, method) {
  const key = keyOf(table, row);
  if (!key || key.length > 512) fail(400, 'Missing/invalid record key');
  let r = lookup(app, table, key);
  const old = r ? payload(r) : null;
  if(table==='profiles'&&c.service&&row.plan==='free'){
    // Legacy proxies POST an empty profile before applying a promo/payment. Keep existing credits.
    if(old&&method==='POST')return old;
    row=Object.assign({},row,{plan:'none',ai_left:0,ai_limit:0,tokens_limit:0,tokens_used:0});
  }
  // Never merge a record from a different tenant, including collision on a guessed ID.
  if (old && !canRead(app, table, old, c)) fail(403, 'Record belongs to another user');
  const next = Object.assign({}, old || {}, row);
  validateWrite(app, table, next, old, c, method);
  if (!r) { r = new Record(app.findCollectionByNameOrId('uchu_' + table)); next.created_at = next.created_at || new Date().toISOString();if(table==='lessons'&&!Object.values(next.data?.docs||{}).some(x=>typeof x==='string'&&x.trim()))r.set('creation_eligible',true); }
  r.set('key', key); r.set('owner', table==='base_materials' ? (r.getString('owner')||c.uid||'') : ownerOf(app, table, next)); r.set('payload', next); app.save(r);
  if(table==='usage_reservations'){if(!r.getInt('expires'))r.set('expires',Date.now()+30*86400000);r.set('settled',next.state==='settled');app.save(r);}
  return next;
}
function query(e) {
  const q = e.request.url.query(); const result = {};
  for (const key of Object.keys(e.requestInfo().query || {})) result[key] = q.get(key);
  return result;
}
function matches(row, q) {
  for (const field of Object.keys(q)) {
    if (['select','order','limit','offset','on_conflict'].indexOf(field) >= 0) continue;
    if (!/^[a-z_][a-z0-9_]*$/.test(field)) fail(400, 'Unsupported filter field');
    const value = q[field];
    if (value.startsWith('eq.')) { if (String(row[field]) !== value.slice(3)) return false; }
    else if (value.startsWith('neq.')) { if (String(row[field]) === value.slice(4)) return false; }
    else if (value.startsWith('in.(') && value.endsWith(')')) {
      const choices = value.slice(4,-1).split(',').map(x => x.replace(/^"|"$/g,''));
      if (choices.indexOf(String(row[field])) < 0) return false;
    } else fail(400, 'Unsupported filter operator');
  }
  return true;
}
function send(e, fn) {
  try { return fn(); } catch (err) {
    // Do not expose SQL, payloads, credentials or stack traces.
    return e.json(err.status || 500, {message: err.status ? err.message : 'Account storage operation failed'});
  }
}
exports.rest = function(e) { return send(e, () => {
  const table = e.request.pathValue('table'), method = e.request.method, c = context(e), q = query(e);
  if (!Object.prototype.hasOwnProperty.call(TABLES, table)) fail(404, 'Unsupported collection');
  if (method === 'POST') {
    let result; const body = e.requestInfo().body;
    // PB requestInfo.body accepts objects; batch inserts use explicit rows envelope.
    const batch = body.rows ? body.rows : [body];
    if (!Array.isArray(batch) || batch.length > 100) fail(400, 'Invalid batch');
    e.app.runInTransaction(tx => { result = batch.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail(400, 'Invalid row');
      const copy = Object.assign({}, row);
      if (!copy[TABLES[table]]) {
        if (table === 'user_info') copy.id = c.uid;
        else if (table === 'quiz_results') copy.id = $security.randomString(32).toLowerCase();
        else fail(400, 'Record key required');
      }
      if (!copy.user_id && ['lessons','quizzes','shared_materials'].indexOf(table) >= 0) copy.user_id = c.uid;
      return write(tx, table, copy, c, 'POST');
    }); });
    return e.json(201, result);
  }
  if (!c.uid && !c.service && PUBLIC.indexOf(table) < 0) fail(401, 'Authentication required');
  const own = c.uid && !c.service && ['lessons','profiles','user_info','quizzes','quiz_questions','quiz_results'].indexOf(table) >= 0 ? c.uid : null;
  let result;
  // A single transaction covers selection + mutation, including conditional updates.
  const perform = app => {
    let found = rows(app, table, own).filter(r => canRead(app, table, payload(r), c) && matches(payload(r), q));
    if (q.order) {
      const order = q.order.split('.');
      if (!/^[a-z_][a-z0-9_]*$/.test(order[0]) || (order.length > 1 && ['asc','desc'].indexOf(order[1]) < 0)) fail(400, 'Unsupported order');
      found.sort((a,b) => String(payload(a)[order[0]] || '').localeCompare(String(payload(b)[order[0]] || '')) * (order[1] === 'desc' ? -1 : 1));
    }
    const offset = Number(q.offset || 0), limit = Number(q.limit || 10000);
    if (!Number.isInteger(offset) || !Number.isInteger(limit) || offset < 0 || limit < 0 || limit > 10000) fail(400, 'Invalid pagination');
    found = found.slice(offset, offset + limit);
    if (method === 'PATCH' || method === 'DELETE') {
      if (!Object.keys(q).some(k => ['select','order','limit','offset'].indexOf(k) < 0)) fail(400, 'Filtered mutation required');
      result = found.map(r => {
        const old = payload(r);
        if (method === 'DELETE') {
          validateWrite(app, table, old, old, c, method);
          // Cascade quiz children within the same transaction.
          if (table === 'quizzes') for (const child of ['quiz_questions','quiz_results']) for (const rr of rows(app, child, old.user_id)) if (payload(rr).quiz_id === old.id) app.delete(rr);
          app.delete(r); return old;
        }
        const patch = e.requestInfo().body;
        if (Object.prototype.hasOwnProperty.call(patch, TABLES[table]) || Object.prototype.hasOwnProperty.call(patch, 'user_id')) fail(403, 'Changing identity/owner is forbidden');
        return write(app, table, Object.assign({}, old, patch), c, 'PATCH');
      });
    } else result = found.map(payload);
  };
  if (method === 'GET') perform(e.app); else e.app.runInTransaction(perform);
  if (q.select && q.select !== '*') {
    const fields = q.select.split(','); if (fields.some(k => !/^[a-z_][a-z0-9_]*$/.test(k))) fail(400, 'Unsupported projection');
    result = result.map(row => { const out = {}; fields.forEach(k => { if (row[k] !== undefined) out[k] = row[k]; }); return out; });
  }
  if(table==='base_materials')result=result.map(row=>{const copy=Object.assign({},row);for(const field of ['added_by','email','user_id','author_name'])delete copy[field];return copy;});
  return e.json(200, result);
}); };
function publicUser(r) {
  return {id: r.id, legacy_id: r.getString('legacy_id'), email: r.getString('email'), phone:r.getString('phone'), email_confirmed_at: r.getString('email') && r.getBool('verified') ? 'verified' : null,
    user_metadata: {}, confirmed_at: r.getBool('verified') ? 'verified' : null};
}
function session(r) { const token = r.newAuthToken(); return {access_token: token, refresh_token: token, expires_in: 1209600, user: publicUser(r)}; }
// Only imported by the server's identity routes, never exposed as a client RPC.
exports.identityTools = {send:send,fail:fail,context:context,session:session,write:write};
exports.auth = function(e) { return send(e, () => {
  const action = e.request.pathValue('action') || 'user', body = e.requestInfo().body, c = context(e);
  if (action === 'signup') {
    if ($os.getenv('UCHU_ALLOW_SIGNUP') !== 'true') fail(503, 'Registration is not enabled until email delivery is tested');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email || ''))) fail(400, 'Invalid email address');
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 256) fail(400, 'Password must have at least 8 characters');
    const legal=require(__hooks+'/privacy.js').acceptance(body);
    const record = new Record(e.app.findCollectionByNameOrId('uchu_users'));
    record.set('email', String(body.email || '').toLowerCase()); record.set('password', body.password); record.set('passwordConfirm', body.password);
    e.app.runInTransaction(tx => {
      tx.save(record);
      require(__hooks+'/privacy.js').recordAcceptance(tx,record.id,legal,'email');
      write(tx, 'profiles', {id: record.id, email: record.getString('email'), plan:'none',ai_left:0,ai_limit:0,tokens_limit:0,tokens_used:0}, {service: true}, 'POST');
    });
    $mails.sendRecordVerification(e.app, record);
    return e.json(200, {user: publicUser(record)});
  }
  if (action === 'token') {
    const grant = e.request.url.query().get('grant_type'); let r;
    if (grant === 'password') {
      try { r = e.app.findAuthRecordByEmail('uchu_users', String(body.email || '').toLowerCase()); } catch (_) { fail(400, 'Invalid login credentials'); }
      if (!r.validatePassword(String(body.password || ''))) fail(400, 'Invalid login credentials');
    } else if (grant === 'refresh_token') {
      try { r = e.app.findAuthRecordByToken(body.refresh_token, 'auth'); } catch (_) { fail(401, 'Invalid session'); }
      if (r.collection().name !== 'uchu_users') fail(401, 'Invalid session');
    } else fail(501, 'Login method not configured for PocketBase');
    if (!r.getBool('verified')) fail(403, 'Email not confirmed');
    return e.json(200, session(r));
  }
  if (action === 'user') {
    if (!c.user) fail(401, 'Authentication required');
    if (e.request.method === 'PUT') {
      // Native reset endpoint requires the signed reset token. Do not allow password changes without old password.
      fail(501, 'Use the verified PocketBase password reset flow');
    }
    return e.json(200, publicUser(c.user));
  }
  if (action === 'recover' || action === 'resend') {
    let r; try { r = e.app.findAuthRecordByEmail('uchu_users', String(body.email || '').toLowerCase()); } catch (_) { return e.json(200, {}); }
    if (action === 'recover') $mails.sendRecordPasswordReset(e.app, r); else if (!r.getBool('verified')) $mails.sendRecordVerification(e.app, r);
    return e.json(200, {});
  }
  fail(501, 'This login method is not configured for PocketBase');
}); };
exports.rpc = function(e) { return send(e, () => {
  const name = e.request.pathValue('name'), body = e.requestInfo().body, c = context(e);
  if (name === 'quiz_exists' || name === 'quiz_public') {
    const q = lookup(e.app, 'quizzes', String(body.p_id || ''));
    if (name === 'quiz_exists') return e.json(200, !!q);
    const r = q && lookup(e.app, 'quiz_questions', String(body.p_id));
    return e.json(200, r ? payload(r).data : null);
  }
  if (name === 'promo_free_ok') {
    const p = c.uid && lookup(e.app, 'profiles', c.uid), row = p && payload(p);
    const promo = row && row.promo_free_code && lookup(e.app, 'promo_codes', row.promo_free_code);
    return e.json(200, !!promo && payload(promo).active === true && payload(promo).free === true);
  }
  if(name==='consume_lesson'){
    if(!c.uid)fail(401,'Sign in before counting a lesson');
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(String(body.lesson_id||'')))fail(400,'Invalid lesson ID');
    let result;e.app.runInTransaction(app=>{
      const lesson=lookup(app,'lessons',body.lesson_id),profile=lookup(app,'profiles',c.uid);
      if(!lesson||lesson.getString('owner')!==c.uid)fail(403,'Lesson does not belong to this account');
      if(!profile)fail(404,'Profile not found');
      const p=payload(profile);
      if(!lesson.getBool('quota_counted')){
        if(!Object.values(payload(lesson).data?.docs||{}).some(x=>typeof x==='string'&&x.trim()))fail(400,'Lesson has no completed materials');
        if(!Number.isInteger(p.ai_left)||p.ai_left<0)fail(503,'Lesson balance is not available');
        if(p.ai_left===0)fail(402,'No lessons remaining');
        if(p.plan==='single'&&!Number.isFinite(p.ai_limit))p.ai_limit=p.ai_left;
        p.ai_left--;write(app,'profiles',p,{service:true},'PATCH');lesson.set('quota_counted',true);app.save(lesson);
      }
      if(!lesson.getBool('creation_closed')){lesson.set('creation_closed',true);app.save(lesson);}
      result={ai_left:p.ai_left,ai_limit:p.ai_limit,tokens_limit:p.tokens_limit,tokens_used:p.tokens_used};
    });return e.json(200,result);
  }
  if (!c.service) fail(403, 'Server credential required');
  if (name === 'migration_inventory') {
    const counts = {};
    for (const table of Object.keys(TABLES)) counts[table] = e.app.countRecords('uchu_' + table);
    return e.json(200, {users:e.app.countRecords('uchu_users'),tables:counts});
  }
  let result;
  e.app.runInTransaction(tx => {
    if (name === 'spend_ai') {
      const r = lookup(tx, 'profiles', String(body.p_id)); if (!r) fail(404, 'Profile not found');
      const p = payload(r), n = Number(body.p_tokens);
      if (!Number.isFinite(n) || n < 0) fail(400, 'Invalid spend');
      if (body.p_tok) {
        if ((p.tokens_used || 0) + n > (p.tokens_limit || 0)) { result = false; return; }
        p.tokens_used = (p.tokens_used || 0) + n;
      } else { if ((p.ai_left || 0) < 1) { result = false; return; } p.ai_left -= 1; }
      write(tx, 'profiles', p, c, 'PATCH'); result = true;
    } else if (name === 'free_use_bump') {
      const keys = body.keys, lims = body.lims;
      for(const key of (Array.isArray(keys)?keys:[]))if(String(key).startsWith('u:')){const profile=lookup(tx,'profiles',String(key).slice(2));if(profile&&payload(profile).trial_blocked){result={over:key,left:0};return;}}
      if (!Array.isArray(keys) || !Array.isArray(lims) || keys.length !== lims.length || keys.length > 10 || new Set(keys).size !== keys.length) fail(400, 'Invalid limits');
      const data = keys.map((k,i) => { const r = lookup(tx, 'free_usage', String(k)+'\n'+String(body.mon)); return {r: r, row: r ? payload(r) : {key: k, month: body.mon, n: 0}, limit: Number(lims[i])}; });
      if (data.some(x => !Number.isFinite(x.limit) || x.limit < 0)) fail(400, 'Invalid limit');
      const bad = data.find(x => x.row.n >= x.limit);
      result = {over: bad ? bad.row.key : null, left: data.length ? Math.max(0,data[0].limit-data[0].row.n-(body.dry ? 0 : 1)) : 0};
      if (!bad && !body.dry) for (const x of data) { x.row.n += 1; write(tx, 'free_usage', x.row, c, 'PATCH'); }
    } else if(name==='reserve_ai'){
      if(!/^[a-f0-9]{32}$/.test(String(body.p_request||''))||!Number.isInteger(body.p_tokens)||body.p_tokens<=0)fail(400,'Invalid usage reservation');
      const held=lookup(tx,'usage_reservations',body.p_request);if(held){if(payload(held).user_id!==body.p_id)fail(409,'Reservation owner mismatch');result=true;return;}
      const r=lookup(tx,'profiles',String(body.p_id));if(!r)fail(404,'Profile not found');const p=payload(r);
      const creation=body.p_phase==='creation';let lesson;
      if(creation){
        lesson=lookup(tx,'lessons',String(body.p_lesson));
        if(!lesson||lesson.getString('owner')!==body.p_id||!lesson.getBool('creation_eligible')||lesson.getBool('creation_closed'))fail(403,'Creation is not available for this lesson');
        if(lesson.getInt('creation_used')+body.p_tokens>120000||(p.creation_used||0)+body.p_tokens>(p.creation_limit||0)){result=false;return;}
        if(!lesson.getBool('quota_counted')){if(!(p.ai_left>0)){result=false;return;}p.ai_left--;write(tx,'profiles',p,c,'PATCH');lesson.set('quota_counted',true);}
        p.creation_used=(p.creation_used||0)+body.p_tokens;write(tx,'profiles',p,c,'PATCH');lesson.set('creation_used',lesson.getInt('creation_used')+body.p_tokens);tx.save(lesson);
      }else{
        if((p.tokens_used||0)+body.p_tokens>(p.tokens_limit||0)){result=false;return;}
        p.tokens_used=(p.tokens_used||0)+body.p_tokens;write(tx,'profiles',p,c,'PATCH');
      }
      write(tx,'usage_reservations',{key:body.p_request,user_id:body.p_id,reserved:body.p_tokens,state:'reserved',bucket:creation?'creation':'refine',lesson_id:creation?body.p_lesson:''},c,'POST');result=true;
    } else if(name==='settle_ai'){
      const r=lookup(tx,'usage_reservations',String(body.p_request)),pRow=lookup(tx,'profiles',String(body.p_id));if(!r||!pRow)fail(409,'Reservation not found');const held=payload(r);
      if(held.user_id!==body.p_id||!Number.isInteger(body.p_tokens)||body.p_tokens<0||body.p_tokens>held.reserved)fail(409,'Invalid reservation settlement');
      if(held.state==='settled'){result=false;return;}
      const p=payload(pRow);
      if(held.bucket==='creation'){
        const lesson=lookup(tx,'lessons',held.lesson_id);if(!lesson)fail(409,'Lesson not found');
        p.creation_used=Math.max(0,(p.creation_used||0)-(held.reserved-body.p_tokens));write(tx,'profiles',p,c,'PATCH');lesson.set('creation_used',Math.max(0,lesson.getInt('creation_used')-(held.reserved-body.p_tokens)));
        if(lesson.getInt('creation_used')===0&&!lesson.getBool('creation_closed')&&lesson.getBool('quota_counted')){p.ai_left=(p.ai_left||0)+1;lesson.set('quota_counted',false);write(tx,'profiles',p,c,'PATCH');}
        tx.save(lesson);
      }else{p.tokens_used=Math.max(0,(p.tokens_used||0)-(held.reserved-body.p_tokens));write(tx,'profiles',p,c,'PATCH');}
      held.state='settled';held.used=body.p_tokens;write(tx,'usage_reservations',held,c,'PATCH');result=true;
    } else if (name === 'apply_payment') {
      result = applyPayment(tx, body, c);
    } else fail(501, 'Unsupported RPC');
  });
  return e.json(200, result);
}); };
function applyPayment(app, body, c) {
  const r = lookup(app, 'payments', String(body.order_id || ''));
  if (!r) fail(409, 'Unknown order; reconcile before applying payment');
  const order = payload(r);
  if ((body.user_id && body.user_id !== order.user_id) || (body.kind && body.kind !== order.kind)) fail(409, 'Payment metadata mismatch');
  if (order.status === 'paid') return {applied: false};
  if (!Number.isFinite(body.amount) || Math.abs(body.amount - order.amount) > 0.01) fail(409, 'Payment amount mismatch');
  const profile = lookup(app, 'profiles', order.user_id); if (!profile) fail(409, 'Missing profile');
  const p = payload(profile), parts = String(order.kind).split('_'), type = parts[0], item = parts[1];
  const plans = {single:{ai:1,tokens:90000,days:365},ai:{ai:50,tokens:1000000,days:30},aiYear:{ai:50,tokens:1000000,days:365}}, packs={ai10:10,ai30:30,ai50:50};
  const plan = plans[item], promo = !!p.promo || p.plan === 'promo';
  if (type === 'single'||(type==='plan'&&item==='single')) {
    const n = type==='single'?Math.max(1, Math.min(50, Number(item) || 1)):1;
    p.ai_limit=Math.max(0,p.ai_limit??p.ai_left??0)+n;
    p.plan = 'single'; p.ai_left = (p.ai_left || 0) + n;
    p.tokens_limit = (p.tokens_limit || 0) + n * 90000;
    order.credit_budget_version=2;order.tokens_allocated=n*90000;p.creation_limit=(p.creation_limit||0)+n*90000;order.creation_budget_version=1;
    p.paid_until = new Date(Date.now() + 365*86400000).toISOString();
  } else if (type === 'plan' && plan) {
    const same = p.plan === item, until = Math.max(Date.now(), Date.parse(p.paid_until || '') || 0);
    p.ai_limit=plan.ai;p.creation_limit=(p.creation_limit||0)+plan.ai*30000;
    p.ai_left = (promo ? 0 : plan.ai) + (same ? Math.max(0,p.ai_left || 0) : 0);
    p.tokens_limit = (promo ? 0 : plan.tokens) + (same ? Math.max(0,(p.tokens_limit || 0)-(p.tokens_used || 0)) : 0);
    p.tokens_used = 0; p.paid_until = new Date((same ? until : Date.now())+plan.days*86400000).toISOString(); p.plan = item;
  } else if (type === 'up' && plan) {
    p.ai_limit=plan.ai;
    const old = plans[p.plan] || {ai:0,tokens:0};p.creation_limit=(p.creation_limit||0)+Math.max(0,plan.ai-old.ai)*30000;p.plan=item;
    p.ai_left = Math.max(0,(p.ai_left || 0)+(promo ? 0 : plan.ai-old.ai));
    p.tokens_limit = (p.tokens_limit || 0)+(promo ? 0 : Math.max(0,plan.tokens-old.tokens));
  } else if ((type === 'pack' && packs[item]) || (type === 'custom' && /^\d+$/.test(item) && Number(item)>=1 && Number(item)<=200)) {
    const n = promo ? 0 : (type === 'pack' ? packs[item] : Number(item));
    if(['none','free'].includes(p.plan))p.plan='single';
    if(p.plan==='single')p.ai_limit=(p.ai_limit??p.ai_left??0)+n;
    p.creation_limit=(p.creation_limit||0)+n*30000;p.ai_left=(p.ai_left || 0)+n; p.tokens_limit=(p.tokens_limit || 0)+n*20000;
  } else fail(409, 'Invalid stored product');
  write(app, 'profiles', p, c, 'PATCH'); order.status='paid'; write(app, 'payments', order, c, 'PATCH');
  return {applied: true};
}

/* Владельцу: список аккаунтов и ручные компенсации.
   Доступ только для подтверждённой почты из site_admins; service-ключ в браузер не попадает. */
function adminContext(e) {
  const c = context(e);
  if (!admin(e.app, c)) fail(403, 'Owner access required');
  return c;
}
function profileView(p, id, email) {
  return {
    id, email, plan: p.plan || 'none',
    ai_left: Number.isFinite(p.ai_left) ? p.ai_left : 0,
    ai_limit: Number.isFinite(p.ai_limit) ? p.ai_limit : 0,
    tokens_used: Number.isFinite(p.tokens_used) ? p.tokens_used : 0,
    tokens_limit: Number.isFinite(p.tokens_limit) ? p.tokens_limit : 0,
    paid_until: p.paid_until || '',
    creation_limit: p.creation_limit || 0,
    creation_used: p.creation_used || 0
  };
}
exports.adminUsers = function(e) { return send(e, () => {
  adminContext(e);
  const profiles = {};
  for (const r of e.app.findRecordsByFilter('uchu_profiles', '', '', 10000, 0)) profiles[r.getString('key')] = payload(r);
  const users = e.app.findRecordsByFilter('uchu_users', '', '-created', 10000, 0).map(u => {
    const id = u.id, email = u.getString('email');
    let lessons = 0;
    try { lessons = e.app.countRecords('uchu_lessons', 'owner = {:owner}', { owner: id }); } catch (_) { }
    return { ...profileView(profiles[id] || {}, id, email), verified: u.getBool('verified'), created: u.getString('created') || '', lessons };
  });
  return e.json(200, { users });
}); };
exports.adminAdjust = function(e) { return send(e, () => {
  adminContext(e);
  const body = e.requestInfo().body || {};
  const id = String(body.id || '').trim();
  if (!id) fail(400, 'Укажите пользователя');
  const lessons = Math.min(500, Math.max(0, Math.trunc(Number(body.lessons) || 0)));
  const tokens = Math.min(50000000, Math.max(0, Math.trunc(Number(body.tokens) || 0)));
  const plan = body.plan == null ? '' : String(body.plan);
  const plans = ['none', 'single', 'free', 'promo', 'ai', 'aiYear'];
  if (plan && plans.indexOf(plan) < 0) fail(400, 'Неизвестный тариф');
  if (!lessons && !tokens && !plan) fail(400, 'Нечего начислять');
  const r = lookup(e.app, 'profiles', id);
  if (!r) fail(404, 'Профиль не найден');
  const p = payload(r);
  if (lessons) {
    p.ai_left = Math.max(0, (p.ai_left || 0) + lessons);
    p.ai_limit = Math.max(0, p.ai_limit || 0, p.ai_left);
  }
  if (tokens) p.tokens_limit = Math.max(0, (p.tokens_limit || 0) + tokens);
  if (plan) p.plan = plan;
  write(e.app, 'profiles', p, { service: true }, 'PATCH');
  return e.json(200, { ok: true, profile: profileView(p, id) });
}); };
exports.adminDeleteUser = function(e) { return send(e, () => {
  const c = adminContext(e);
  const body = e.requestInfo().body || {};
  const id = String(body.id || '').trim();
  if (!id) fail(400, 'Укажите пользователя');
  let u; try { u = e.app.findRecordById('uchu_users', id); } catch (_) { fail(404, 'Пользователь не найден'); }
  const email = u.getString('email').toLowerCase();
  if (body.email != null && String(body.email).trim().toLowerCase() !== email) fail(400, 'Подтверждение почты не совпало');
  if (c.user && c.user.id === id) fail(403, 'Нельзя удалить собственный аккаунт');
  if (lookup(e.app, 'site_admins', email)) fail(403, 'Нельзя удалить аккаунт владельца');
  e.app.runInTransaction(tx => {
    // Удаляем пользовательские данные; платёжные документы сохраняем для бухгалтерии.
    for (const table of ['lessons', 'quizzes', 'profiles', 'user_info', 'shared_materials']) {
      let rows = [];
      try { rows = tx.findRecordsByFilter('uchu_' + table, 'owner = {:owner}', '', 10000, 0, { owner: id }); } catch (_) { }
      for (const r of rows) try { tx.delete(r); } catch (_) { }
    }
    tx.delete(u);
  });
  return e.json(200, { ok: true, email });
}); };
exports.adminUser = function(e) { return send(e, () => {  const c = context(e), body = e.requestInfo().body;
  if (!c.service) fail(403, 'Server credential required');
  const email=String(body.email||'').trim().toLowerCase(),phone=String(body.phone||'');
  if ((!email&&!phone) || (email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (phone&&(!/^\+79[0-9]{9}$/.test(phone)||phone.startsWith('+7940')))) fail(400,'Invalid imported identity');
  if (phone && (body.phone_confirm!==true || (email&&body.email_confirm!==true))) fail(400,'Mixed or unverified identity requires migration review');
  // Only provisioning: no implicit linking of an existing email to a supplied external identity.
  let exists; try { if(email)exists=e.app.findAuthRecordByEmail('uchu_users',email); } catch (_) {}
  if(phone&&e.app.findRecordsByFilter('uchu_users','phone = {:phone}','',1,0,{phone:phone}).length) fail(409,'Phone already exists; identity linking requires review');
  if (exists) fail(409, 'User already exists; identity linking requires review');
  const r=new Record(e.app.findCollectionByNameOrId('uchu_users'));
  r.set('email',email);r.set('phone',phone);r.set('password',body.password);r.set('passwordConfirm',body.password);
  r.set('verified',body.email_confirm === true || !!phone);r.set('legacy_id',body.legacy_id || '');
  e.app.runInTransaction(tx => {tx.save(r);write(tx,'profiles',{id:r.id,email:r.getString('email'),plan:'none',ai_left:0,ai_limit:0,tokens_limit:0,tokens_used:0},{service:true},'POST');});
  return e.json(201,publicUser(r));
}); };

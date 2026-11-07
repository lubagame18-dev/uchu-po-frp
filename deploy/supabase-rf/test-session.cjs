// Execute the real account module. No network or production credentials.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../js/account.js'), 'utf8');
function load(session, accounts, cloud = {url:'https://old.example', anonKey:'fake'}) {
  const data = new Map([['uchu:account', JSON.stringify(session)], ['uchu:lessons', 'retained']]);
  const context = {window:{UCHU_SITE:{accounts,cloud}}, localStorage:{getItem:k=>data.get(k)||null, setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    document:{createElement:()=>({setAttribute(){}}),addEventListener(){},getElementById(){return null;}},
    setInterval(){},setTimeout(){},clearTimeout(){},URLSearchParams, console,
    esc:x=>x};
  vm.createContext(context);vm.runInContext(source,context);
  return {session:vm.runInContext('Account.session',context),data};
}
const accounts={url:'https://new.example',anonKey:'fake'};
assert.equal(load({access:'old'},accounts).session,null);
assert.equal(load({access:'old',endpoint:'https://old.example'},accounts).session,null);
assert.equal(load({access:'new',endpoint:'https://new.example'},accounts).session.access,'new');
assert.equal(load({access:'legacy'},{}).session.access,'legacy');
assert.equal(load({local:true},accounts).session.local,true);
assert.equal(load({access:'old'},accounts).data.get('uchu:lessons'),'retained');
console.log('PASS: old tokens invalidated on cutover; matching/legacy/local sessions and local lessons retained');

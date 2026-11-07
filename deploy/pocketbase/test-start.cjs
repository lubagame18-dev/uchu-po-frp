const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(process.argv[2] || require('node:path').join(__dirname,'START.html'),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cache={};
function boot(){
 const node=(p={})=>Object.assign({textContent:'',value:0,disabled:false,checked:false,handlers:{},addEventListener(k,f){this.handlers[k]=f}},p);
 const steps=Array.from({length:(html.match(/data-step="/g)||[]).length},(_,i)=>node({dataset:{step:String(i)}}));
 const radios=Array.from({length:12},(_,i)=>['yes','no'].map(value=>node({name:'q'+i,value}))).flat();
 const ids=Object.fromEntries(['score','progress','finish','feedback','storage','reset'].map(k=>[k,node()]));
 const document={querySelector(s){return ids[s.slice(1)]},querySelectorAll(s){return s==='[data-step]'?steps:s==='input[type=radio]'?radios:[]}};
 const context={document,localStorage:{getItem:k=>cache[k]||null,setItem:(k,v)=>cache[k]=v},confirm:()=>true};
 vm.runInNewContext(script,context);return {steps,radios,ids};
}
let a=boot();assert(a.ids.finish.disabled);a.steps[0].checked=true;a.steps[0].handlers.change();
for(let i=0;i<11;i++){const r=a.radios.find(r=>r.name==='q'+i&&r.value==='yes');r.handlers.change()}
assert(a.ids.finish.disabled);a=boot();assert(a.steps[0].checked);assert(a.ids.finish.disabled);assert.equal(a.radios.filter(r=>r.checked).length,11);
a.radios.find(r=>r.name==='q11'&&r.value==='yes').handlers.change();assert(!a.ids.finish.disabled);
a.ids.finish.handlers.click();assert(a.ids.feedback.textContent.includes('12'));a=boot();assert(!a.ids.finish.disabled);assert(a.ids.feedback.textContent.includes('12'));
a.radios.find(r=>r.name==='q1'&&r.value==='no').handlers.change();assert(a.ids.finish.disabled);assert.equal(a.ids.feedback.textContent,'');
console.log('PASS: progress persists after reload; 11/12 stays locked; 12/12 unlocks; No relocks. DOM fixture, no browser rendering claim.');

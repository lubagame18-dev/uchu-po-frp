migrate(app=>{
  const lessons=app.findCollectionByNameOrId('uchu_lessons');lessons.fields.add(new BoolField({name:'quota_counted'}));app.save(lessons);
  // Historical lessons keep their existing balance; never charge them again during sync.
  for(const r of app.findAllRecords('uchu_lessons')){r.set('quota_counted',true);app.save(r);}
  for(const r of app.findAllRecords('uchu_profiles')){
    const p=JSON.parse(r.getString('payload'));
    if(p.plan==='free'){
      const paid=app.findRecordsByFilter('uchu_payments','owner = {:owner}','',1000,0,{owner:r.getString('owner')}).some(x=>JSON.parse(x.getString('payload')).status==='paid');
      if(paid||p.ai_left>2||p.tokens_limit>80000){p.plan='single';}
      else{p.plan='none';p.ai_left=0;p.tokens_limit=0;p.tokens_used=0;}
    }
    p.ai_limit=['ai','aiYear'].includes(p.plan)?50:p.plan==='none'?0:typeof p.ai_left==='number'?p.ai_left:null;
    delete p.trial_blocked;r.set('payload',p);app.save(r);
  }
  for(const r of app.findAllRecords('uchu_trial_claims'))app.delete(r);
},()=>{throw new Error('Balance tracking and paid credits require a reviewed forward migration');});

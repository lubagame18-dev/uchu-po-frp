migrate(app=>{
  app.save(new Collection({name:'uchu_usage_reservations',type:'base',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
    fields:[{name:'key',type:'text',required:true,max:128},{name:'owner',type:'text',max:64},{name:'payload',type:'json',required:true,maxSize:4096},{name:'expires',type:'number',onlyInt:true},{name:'settled',type:'bool'}],
    indexes:['CREATE UNIQUE INDEX idx_uchu_usage_reservation_key ON uchu_usage_reservations (key)']}));
  // Session validation is not a password attempt. Keep the ten-attempt login rule intact.
  const settings=app.settings();settings.rateLimits.rules=settings.rateLimits.rules.filter(x=>x.label!=='/api/uchu/auth/v1/user');
  settings.rateLimits.rules.unshift({label:'/api/uchu/auth/v1/user',maxRequests:300,duration:60});app.save(settings);
  const lessons=app.findCollectionByNameOrId('uchu_lessons');
  lessons.fields.add(new BoolField({name:'creation_eligible'}));lessons.fields.add(new BoolField({name:'creation_closed'}));lessons.fields.add(new NumberField({name:'creation_used',min:0,onlyInt:true}));app.save(lessons);
  for(const r of app.findAllRecords('uchu_lessons'))if(!r.getBool('quota_counted')){r.set('creation_eligible',true);app.save(r);}
  // Grandfather previous refinement balances; add their separately funded creation budget once.
  for(const r of app.findAllRecords('uchu_payments')){
    const o=JSON.parse(r.getString('payload'));if(o.status!=='paid'||o.creation_budget_version===1)continue;
    const n=o.kind==='plan_single'?1:/^single_([1-9]|[1-4][0-9]|50)$/.test(o.kind||'')?Number(o.kind.split('_')[1]):0;if(!n)continue;
    const row=app.findRecordsByFilter('uchu_profiles','owner = {:owner}','',1,0,{owner:o.user_id})[0];if(!row)continue;
    const p=JSON.parse(row.getString('payload'));p.creation_limit=(p.creation_limit||0)+n*120000;p.creation_used=p.creation_used||0;row.set('payload',p);app.save(row);
    o.creation_budget_version=1;r.set('payload',o);app.save(r);
  }
},()=>{throw new Error('Do not roll paid credits back; use a reviewed forward migration');});

migrate((app) => {
  for (const name of ['privacy_events','trial_claims','deletions']) {
    app.save(new Collection({name:'uchu_'+name,type:'base',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
      fields:[{name:'key',type:'text',required:true,max:200},{name:'owner',type:'text',max:64},
        {name:'recorded_at',type:'date'},{name:'kind',type:'text',max:32},{name:'payload',type:'json',required:true,maxSize:16384}],
      indexes:['CREATE UNIQUE INDEX idx_uchu_'+name+'_key ON uchu_'+name+' (key)',
        'CREATE INDEX idx_uchu_'+name+'_owner ON uchu_'+name+' (owner)']}));
  }
  // Existing accounts have already been offered a trial; deletion must not reset it.
  const p=require(__hooks+'/privacy.js');
  for (const user of app.findAllRecords('uchu_users')) p.claimTrial(app,user);
  // Keep attribution private; the shared library must not publish an account email.
  for(const row of app.findAllRecords('uchu_base_materials')){const payload=JSON.parse(row.getString('payload'));if(payload.added_by){const users=app.findRecordsByFilter('uchu_users','email = {:email}','',1,0,{email:String(payload.added_by).toLowerCase()});if(users.length)row.set('owner',users[0].id);delete payload.added_by;row.set('payload',payload);app.save(row);}}
  for(const row of app.findAllRecords('uchu_free_usage'))if(String(JSON.parse(row.getString('payload')).key||'').startsWith('f:'))app.delete(row);
  const settings=app.settings();settings.logs.maxDays=14;app.save(settings);
},()=>{throw new Error('Privacy records must not be silently removed; use a verified forward migration');});

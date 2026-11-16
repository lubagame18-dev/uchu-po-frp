// Provision a missing profile once. Re-authentication never resets balances or paid plans.
onRecordAfterCreateSuccess((e) => {
  e.next();
  e.app.runInTransaction((app) => {
    const found=app.findRecordsByFilter('uchu_profiles','key = {:key}','',1,0,{key:e.record.id});
    if(found.length)return;
    require(__hooks+'/uchu.js').identityTools.write(app,'profiles',{
      id:e.record.id,email:e.record.getString('email'),plan:'free',ai_left:2,
      tokens_limit:80000,tokens_used:0
    },{service:true},'POST');
  });
}, 'uchu_users');

migrate((app) => {
  app.save(new Collection({name:'uchu_mail_budget',type:'base',listRule:null,viewRule:null,
    createRule:null,updateRule:null,deleteRule:null,
    fields:[{name:'day',type:'text',required:true,pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'},
      {name:'attempts',type:'number',required:true,min:0,onlyInt:true}],
    indexes:['CREATE UNIQUE INDEX idx_uchu_mail_budget_day ON uchu_mail_budget (day)']}));
}, () => {throw new Error('Refusing to reset mail counters; restore requires provider usage review');});

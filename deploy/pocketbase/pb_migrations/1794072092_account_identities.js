/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId('uchu_users');
  // Phone-only accounts have no fabricated email address. Email signup validates it separately.
  users.fields.getByName('email').required = false;
  users.fields.add(new TextField({name:'phone',max:16,pattern:'^$|^\\+79[0-9]{9}$'}));
  users.fields.add(new TextField({name:'yandex_id',max:128}));
  users.indexes.push("CREATE UNIQUE INDEX idx_uchu_users_phone ON uchu_users (phone) WHERE phone != ''");
  users.indexes.push("CREATE UNIQUE INDEX idx_uchu_users_yandex ON uchu_users (yandex_id) WHERE yandex_id != ''");
  app.save(users);
  app.save(new Collection({name:'uchu_login_state',type:'base',listRule:null,viewRule:null,
    createRule:null,updateRule:null,deleteRule:null,
    fields:[{name:'key',type:'text',required:true,max:200},{name:'expires',type:'number',required:true},
      {name:'data',type:'json',required:true,maxSize:8192}],
    indexes:['CREATE UNIQUE INDEX idx_uchu_login_state_key ON uchu_login_state (key)',
      'CREATE INDEX idx_uchu_login_state_expiry ON uchu_login_state (expires)']}));
}, (app) => {
  throw new Error('Refusing to delete login identities; restore a verified snapshot');
})

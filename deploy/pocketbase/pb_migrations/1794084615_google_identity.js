migrate((app) => {
  const users=app.findCollectionByNameOrId('uchu_users');
  users.fields.add(new TextField({name:'google_id',max:128}));
  users.indexes.push("CREATE UNIQUE INDEX idx_uchu_users_google ON uchu_users (google_id) WHERE google_id != ''");
  app.save(users);
}, () => { throw new Error('Refusing to delete Google identities; restore a verified snapshot'); });

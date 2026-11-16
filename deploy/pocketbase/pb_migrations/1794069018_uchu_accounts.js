// Native APIs for data collections are locked. Only the audited compatibility routes expose rows.
migrate((app) => {
  const users = new Collection({type: 'auth', name: 'uchu_users', createRule: null, listRule: null,
    viewRule: 'id = @request.auth.id', updateRule: null, deleteRule: null,
    authRule: 'verified = true',
    passwordAuth: {enabled: true, identityFields: ['email']},
    authToken: {duration: 1209600}, fields: [{name: 'legacy_id', type: 'text', max: 64}]});
  users.verificationTemplate.body = '<p>Подтвердите почту: <a href="{APP_URL}/accounts-confirm.html?type=verification&token={TOKEN}">Подтвердить</a></p>';
  users.resetPasswordTemplate.body = '<p>Восстановление пароля: <a href="{APP_URL}/accounts-confirm.html?type=recovery&token={TOKEN}">Задать пароль</a></p>';
  app.save(users);
  const names = ['lessons','profiles','user_info','payments','quizzes','quiz_questions','quiz_results',
    'shared_materials','site_admins','bot_links','base_materials','site_rules','promo_codes','ai_keys','img_keys','free_usage'];
  for (const name of names) {
    app.save(new Collection({name: 'uchu_' + name, type: 'base', listRule: null, viewRule: null,
      createRule: null, updateRule: null, deleteRule: null,
      fields: [{name: 'key', type: 'text', required: true, max: 512},
        {name: 'owner', type: 'text', max: 64}, {name: 'payload', type: 'json', required: true, maxSize: 4194304}],
      indexes: ['CREATE UNIQUE INDEX idx_uchu_' + name + '_key ON uchu_' + name + ' (key)',
        'CREATE INDEX idx_uchu_' + name + '_owner ON uchu_' + name + ' (owner)']}));
  }
  const settings = app.settings();
  settings.meta.appName = "Учу по ФРП";
  settings.meta.appURL = "https://uchu-po-frp.ru";
  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    {label: '/api/collections/uchu_users/', maxRequests: 10, duration: 60},
    {label: '/api/uchu/auth/', maxRequests: 10, duration: 60},
    {label: '/api/uchu/', maxRequests: 180, duration: 60}
  ];
  app.save(settings);
}, (app) => {
  // Destructive down migration is deliberately disabled; restore a verified backup instead.
  throw new Error('Refusing to delete account data; restore the previous snapshot');
});

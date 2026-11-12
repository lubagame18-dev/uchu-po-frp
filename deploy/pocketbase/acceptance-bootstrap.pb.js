// Installed only in the isolated acceptance hooks directory.
onBootstrap((e)=>{
  e.next();
  if($os.getenv('UCHU_ACCEPTANCE')!=='true')throw new Error('Acceptance instance flag required');
  const settings=e.app.settings();settings.meta.appURL='https://accounts.uchu-po-frp.ru';
  settings.logs.maxDays=0;e.app.save(settings);
  const c=e.app.findCollectionByNameOrId('uchu_users');
  c.verificationTemplate.subject='Учу по ФРП — подтверждение тестовой почты';
  c.verificationTemplate.body='<p>Подтвердите почту для закрытой проверки кабинета:</p><p><a href="{APP_URL}/check/verify#{TOKEN}">Подтвердить почту</a></p><p>Если вы не запускали проверку, не переходите по ссылке.</p>';
  c.resetPasswordTemplate.subject='Учу по ФРП — восстановление тестового пароля';
  c.resetPasswordTemplate.body='<p><a href="{APP_URL}/check/reset#{TOKEN}">Задать новый тестовый пароль</a></p><p>Если вы не запрашивали восстановление, проигнорируйте письмо.</p>';
  e.app.save(c);
});

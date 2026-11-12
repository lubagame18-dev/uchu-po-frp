// Installed only in the isolated acceptance hooks directory.
onBootstrap((e)=>{
  e.next();
  if($os.getenv('UCHU_ACCEPTANCE')!=='true')throw new Error('Acceptance instance flag required');
  const settings=e.app.settings();settings.meta.appURL='https://accounts.uchu-po-frp.ru';
  settings.logs.maxDays=0;e.app.save(settings);
  const c=e.app.findCollectionByNameOrId('uchu_users');
  c.verificationTemplate.subject='Учу по ФРП — подтверждение тестовой почты';
  c.verificationTemplate.body='<p>Подтвердите почту для закрытой проверки кабинета:</p><p><a href="{APP_URL}/check/verify?token={TOKEN}" style="display:inline-block;padding:14px 20px;background:#225c50;color:#ffffff;text-decoration:underline">Подтвердить почту</a></p><p>Если кнопка не нажимается, скопируйте этот адрес целиком в строку браузера:</p><p><a href="{APP_URL}/check/verify?token={TOKEN}">{APP_URL}/check/verify?token={TOKEN}</a></p><p>Если вы не запускали проверку, не переходите по ссылке.</p>';
  c.resetPasswordTemplate.subject='Учу по ФРП — восстановление тестового пароля';
  c.resetPasswordTemplate.body='<p><a href="{APP_URL}/check/reset?token={TOKEN}">Задать новый тестовый пароль</a></p><p>Если ссылка не нажимается, скопируйте адрес целиком в строку браузера:</p><p><a href="{APP_URL}/check/reset?token={TOKEN}">{APP_URL}/check/reset?token={TOKEN}</a></p><p>Если вы не запрашивали восстановление, проигнорируйте письмо.</p>';
  e.app.save(c);
});

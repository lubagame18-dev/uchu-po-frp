// Credentials come only from the private server environment. No public setup API.
onBootstrap((e) => {
  e.next();
  const user=$os.getenv('UCHU_POSTBOX_API_KEY_ID'),password=$os.getenv('UCHU_POSTBOX_API_KEY_SECRET');
  const settings=e.app.settings();
  if (user && password) {
    settings.meta.senderName='Учу по ФРП';
    settings.meta.senderAddress='accounts@uchu-po-frp.ru';
    settings.smtp.enabled=true;
    settings.smtp.host='postbox.cloud.yandex.net';
    settings.smtp.port=465;
    settings.smtp.tls=true;
    settings.smtp.authMethod='PLAIN';
    settings.smtp.username=user;
    settings.smtp.password=password;
    e.app.save(settings);
  } else if (settings.smtp.host==='postbox.cloud.yandex.net' && settings.smtp.enabled) {
    settings.smtp.enabled=false;
    e.app.save(settings);
  }
});

onMailerSend((e) => {
  const configured=$os.getenv('UCHU_MAIL_MAX32D');
  if (e.app.settings().smtp.host!=='postbox.cloud.yandex.net' && !configured) return e.next();
  const limit=Number(configured || 1500);
  if (!Number.isInteger(limit) || limit<1 || limit>1500) throw new ApiError(503,'Invalid mail budget');
  // Only single-recipient account messages. Count reservations even on SMTP failure.
  if ((e.message.to || []).length!==1 || (e.message.cc || []).length || (e.message.bcc || []).length) {
    throw new ApiError(429,'Account mail must have exactly one recipient');
  }
  const today=new Date().toISOString().slice(0,10);
  const cutoff=new Date(Date.now()-32*86400000).toISOString().slice(0,10);
  e.app.runInTransaction((tx) => {
    const rows=tx.findRecordsByFilter('uchu_mail_budget','day >= {:cutoff}','',0,0,{cutoff:cutoff});
    let used=0,current=null;
    for (const row of rows) {
      used+=row.getInt('attempts');
      if (row.getString('day')===today) current=row;
    }
    if (used>=limit) throw new ApiError(429,'Account mail budget reached; contact support');
    if (!current) {
      current=new Record(tx.findCollectionByNameOrId('uchu_mail_budget'));
      current.set('day',today);
    }
    current.set('attempts',current.getInt('attempts')+1);
    tx.save(current);
  });
  e.next();
});

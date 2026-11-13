#!/usr/bin/env python3
"""One explicitly requested owner email, only after successful backend and matching public release."""
import hashlib,json,os,smtplib,ssl,sqlite3
from datetime import datetime,timedelta,timezone
from email.message import EmailMessage
from email.utils import formatdate,make_msgid
from pathlib import Path
from urllib.request import Request,urlopen
ROOT=Path('/root/uchu-privacy-upgrade');RECIPIENT='gladyshevalu14@mail.ru'
def main():
 if os.geteuid()!=0:raise ValueError('Run on the VPS as root')
 os.umask(0o077);receipt=json.loads((ROOT/'receipt.json').read_text());manifest=json.loads((ROOT/'release.json').read_text())
 if not json.loads((ROOT/'function-receipt.json').read_text()).get('function_updated'):raise ValueError('Accepted quota Function release is required')
 if not receipt.get('installed') or not receipt.get('encrypted_backup_and_restore_check'):raise ValueError('Accepted server release is required')
 for name in ['index.html','js/account.js','js/privacy.js','legal/privacy.html','legal/consent.html','data/legal.js','sw.js']:
  with urlopen(Request('https://uchu-po-frp.ru/'+name+'?privacy-release='+receipt['ref'],headers={'Cache-Control':'no-cache'}),timeout=30) as r:
   if hashlib.sha256(r.read()).hexdigest()!=manifest['public_files'][name]:raise ValueError('Public release does not match accepted source')
 with urlopen('https://accounts.uchu-po-frp.ru/api/uchu/privacy/v1/status',timeout=20) as r:
  if json.load(r).get('version')!='2026-11-13':raise ValueError('Privacy health failed')
 values=dict(x.split('=',1) for x in Path('/etc/pocketbase/pocketbase.env').read_text().splitlines() if x and not x.startswith('#'))
 reserve=ROOT/'owner-email.reserved';fd=os.open(reserve,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.close(fd)
 today=datetime.now(timezone.utc).date();cutoff=(today-timedelta(days=32)).isoformat();limit=int(values.get('UCHU_MAIL_MAX32D','1500'))
 with sqlite3.connect('/var/lib/pocketbase/data.db',timeout=20) as c:
  c.execute('begin immediate');used=c.execute('select coalesce(sum(attempts),0) from uchu_mail_budget where day>=?',(cutoff,)).fetchone()[0]
  if used>=limit:raise ValueError('Mail budget exhausted')
  row=c.execute('select id from uchu_mail_budget where day=?',(today.isoformat(),)).fetchone()
  if row:c.execute('update uchu_mail_budget set attempts=attempts+1 where id=?',(row[0],))
  else:c.execute('insert into uchu_mail_budget(id,day,attempts) values(substr(lower(hex(randomblob(8))),1,15),?,1)',(today.isoformat(),))
 message=EmailMessage();message['From']='Учу по ФРП <accounts@uchu-po-frp.ru>';message['To']=RECIPIENT;message['Subject']='Учу по ФРП: доработки опубликованы, можно готовить уведомление РКН';message['Date']=formatdate(localtime=False);message['Message-ID']=make_msgid(domain='uchu-po-frp.ru')
 message.set_content('''Здравствуйте, Любовь!

Технические доработки опубликованы на https://uchu-po-frp.ru/ .
Войти → кабинет → «Настройки и данные»:
— копия всех данных JSON и ZIP материалов с исходниками и Word;
— отдельное добровольное согласие на имя, школу, город и фото;
— удаление кабинета по коду из письма, с очисткой его рабочих данных;
— повторная регистрация той же учтённой почты/входа не выдаёт пробный доступ заново. Защитные HMAC-отметки ограничены сроком до трёх лет.

Политика и отдельное согласие обновлены, версии документов фиксируются сервером. Убраны Canvas/WebGL-отпечаток, внешняя загрузка основных шрифтов и служебная почта автора из публичной библиотеки. Резервные копии и проверка восстановления сохранены. Удаления учитываются при восстановлении.

Проверки входа, выгрузки, удаления, изоляции и лимитов выполнены локально на настоящем PocketBase с тестовыми почтой/провайдерами. Сервер обновлён после проверки на копии рабочей БД; публичные файлы сверены по SHA256. Реальный вход вашим Google/Яндекс и реальная оплата после переноса ещё требуют проверки владельцем; это письмо не утверждает обратное. Денежные списания не создавались.

Можно приступать к заполнению ПРОЕКТА уведомления Роскомнадзора. Перед отправкой нужно подтвердить фактическую дату начала обработки, сведения из договоров и точные адреса ЦОД, решения о трансграничных потоках и работе с данными учеников. Само уведомление подписывает и подаёт оператор; Codex ничего не подавал. Одно лишь обновление сайта не подтверждает полное юридическое соответствие.

Пульт с инструкциями и подготовленной картой для РКН:
https://uchu-rf-setup-guide.keenlarch65.chatgpt.site/rkn.html
(приватная страница для вашего аккаунта ChatGPT).
Официальная форма: https://pd.rkn.gov.ru/operators-registry/notification/form/
Политика: https://uchu-po-frp.ru/legal/privacy.html
Выгрузка и удаление: https://uchu-po-frp.ru/legal/data-rights.html

Пароли, коды удаления и ключи в ответном письме не отправляйте.
''')
 with smtplib.SMTP_SSL('postbox.cloud.yandex.net',465,timeout=25,context=ssl.create_default_context()) as client:
  client.login(values['UCHU_POSTBOX_API_KEY_ID'],values['UCHU_POSTBOX_API_KEY_SECRET']);refused=client.send_message(message)
  if refused:raise ValueError('Recipient refused')
 result={'smtp_accepted':True,'recipient':RECIPIENT,'sender':'accounts@uchu-po-frp.ru','ref':receipt['ref'],'sent_at_utc':datetime.now(timezone.utc).isoformat()};(ROOT/'owner-email-sent.json').write_text(json.dumps(result));print(json.dumps(result))
if __name__=='__main__':
 try:main()
 except Exception as e:print('Owner notification stopped: '+type(e).__name__+'. Reservation prevents uncertain duplicate sends.');raise SystemExit(1)

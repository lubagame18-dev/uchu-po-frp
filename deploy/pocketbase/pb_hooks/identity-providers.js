'use strict';
// All destinations are fixed HTTPS vendor endpoints. No client-supplied URLs or secrets in query strings.
const env = key => $os.getenv(key);
const form = data => Object.keys(data).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(data[k]))).join('&');
function post(url,data) {
  const r=$http.send({url:url,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form(data),timeout:15});
  if (r.statusCode!==200 || !r.json || typeof r.json!=='object') throw new Error('Identity provider request failed');
  return r.json;
}
exports.smsConfigured = () => env('SMS_PROVIDER')==='smsc' ? !!(env('SMS_LOGIN')&&env('SMS_PASSWORD')) : env('SMS_PROVIDER')==='smsru'&&!!env('SMS_API_ID');
exports.sendSms = function(phone,code) {
  const digits=phone.replace(/\D/g,''),text='Код входа в «Учу по ФРП»: '+code;
  if (env('SMS_PROVIDER')==='smsc') {
    const data={login:env('SMS_LOGIN'),psw:env('SMS_PASSWORD'),phones:digits,mes:text,charset:'utf-8',fmt:'3'};
    if (env('SMS_SENDER')) data.sender=env('SMS_SENDER');
    const j=post('https://smsc.ru/sys/send.php',data);
    if (j.error || !j.id || Number(j.cnt)<1) throw new Error('SMS delivery not accepted');
  } else {
    const data={api_id:env('SMS_API_ID'),to:digits,msg:text,json:'1'};
    if (env('SMS_SENDER')) data.from=env('SMS_SENDER');
    const j=post('https://sms.ru/sms/send',data);
    if (j.status!=='OK' || !j.sms || !j.sms[digits] || j.sms[digits].status!=='OK') throw new Error('SMS delivery not accepted');
  }
};
exports.yandexConfigured = () => !!(env('YANDEX_CLIENT_ID')&&env('YANDEX_CLIENT_SECRET'));
exports.yandexAuthorize = (state,challenge,callback) => 'https://oauth.yandex.ru/authorize?'+form({response_type:'code',client_id:env('YANDEX_CLIENT_ID'),redirect_uri:callback,state:state,code_challenge:challenge,code_challenge_method:'S256',scope:'login:email login:info'});
exports.yandexIdentity = function(code,verifier,callback) {
  const token=post('https://oauth.yandex.ru/token',{grant_type:'authorization_code',code:code,code_verifier:verifier,
    client_id:env('YANDEX_CLIENT_ID'),client_secret:env('YANDEX_CLIENT_SECRET'),redirect_uri:callback});
  if (typeof token.access_token!=='string' || !token.access_token) throw new Error('No provider access token');
  const r=$http.send({url:'https://login.yandex.ru/info?format=json',method:'GET',headers:{Authorization:'OAuth '+token.access_token},timeout:15});
  if (r.statusCode!==200 || !r.json || !/^[a-zA-Z0-9_-]{1,128}$/.test(String(r.json.id||''))) throw new Error('Invalid provider identity');
  return {id:String(r.json.id),email:String(r.json.default_email||'').trim().toLowerCase()};
};

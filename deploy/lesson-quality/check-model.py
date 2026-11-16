#!/usr/bin/env python3
"""Opt-in real-model checks. Existing key stays in a mode-600 file, never in results."""
import argparse,concurrent.futures,json,os,re,stat,threading
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError

def main():
 p=argparse.ArgumentParser();p.add_argument('--prompts',type=Path,required=True);p.add_argument('--key-file',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--subjects',default='');p.add_argument('--photos',action='store_true');p.add_argument('--review-input',type=Path);p.add_argument('--max-units',type=int,default=280000);a=p.parse_args()
 if a.key_file.stat().st_mode&0o077:raise ValueError('Private key file permissions required')
 review=bool(a.review_input);key=a.key_file.read_text().strip();assert len(key)>20;os.umask(0o077);a.output.mkdir(parents=True,exist_ok=True)
 lock=threading.Lock();meter={'used':0,'held':0};items=[]
 for f in a.output.glob('*.json'):
  if f.name=='summary.json':continue
  r=json.loads(f.read_text());meter['used']+=r.get('cost_units',0)
 for c in json.loads(a.prompts.read_text()):
  if a.subjects and c['subject'] not in a.subjects.split(','):continue
  for variant in (['plain','photo'] if a.photos else ['plain']):
   if (a.output/(c['subject']+'-'+variant+'.json')).exists():continue
   items.append((c,variant))
 source=Path('js/ai.js').read_text();copyright=json.loads(re.search(r'const COPY_GUARD = ("(?:[^"\\]|\\.)*");',source).group(1))
 def check(item):
  c,variant=item;prompt=c['withPhoto'] if variant=='photo' else c['lesson'];
  if review:
   original=json.loads((a.review_input/(c['subject']+'-'+variant+'.json')).read_text());prompt=c['reviewTemplate'].replace('REVIEW_DOCUMENT_PLACEHOLDER',original['text'][:26000])
  prompt+=c.get('runtimeRules','')+copyright
  bound=(len(prompt.encode())+512+3)//4+8192
  with lock:
   if meter['used']+meter['held']+bound>a.max_units:return {'case':c['subject']+'-'+variant,'error':'budget_bound'}
   meter['held']+=bound
  result={'case':c['subject']+'-'+variant,'subject':c['subject'],'variant':variant,'model':'deepseek-flash','topic':c['params']['topic']};used=bound
  try:
   req=Request('https://api.deepseek.com/chat/completions',headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},data=json.dumps({'model':'deepseek-flash','thinking':{'type':'disabled'},'messages':[{'role':'user','content':prompt}],'max_tokens':8192,'temperature':0.25,'stream':False}).encode())
   with urlopen(req,timeout=180) as r:body=json.load(r)
   choice=body['choices'][0];text=choice['message'].get('content') or '';u=body.get('usage') or {};used=round(u['prompt_tokens']*.25+u['completion_tokens']) if all(k in u for k in ['prompt_tokens','completion_tokens']) else bound
   result.update(text=text,usage=u,cost_units=used,finish_reason=choice.get('finish_reason'),characters=len(text),has_unknown_textbook_reference=variant=='plain' and bool(re.search('учебник[а-яё]*|параграф[а-яё]*',text,re.I)),uses_visible_exercise=variant=='photo' and bool(re.search(r'(?:упр(?:ажнени[ея])?\.?|задани[ея]|№)\s*№?\s*127',text,re.I)),has_answer_guidance=bool(re.search('ответ|решени|ключ|критери|верн',text,re.I)))
   result['technical_pass']=len(text)>=2500 and choice.get('finish_reason')=='stop' and not result['has_unknown_textbook_reference'] and result['has_answer_guidance'] and (variant!='photo' or result['uses_visible_exercise'])
   if review:
    parsed=json.loads(re.search(r'\{[\s\S]*\}',text).group(0));result['review_fixes']=parsed.get('fixes');result['technical_pass']=isinstance(parsed.get('fixes'),list) and choice.get('finish_reason')=='stop'
  except HTTPError as e:result.update(error='HTTP '+str(e.code),cost_units=used,technical_pass=False)
  except Exception as e:result.update(error=type(e).__name__,cost_units=used,technical_pass=False)
  finally:
   with lock:meter['held']-=bound;meter['used']+=used
  (a.output/(result['case']+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2))
  print(json.dumps({k:result.get(k) for k in ['case','technical_pass','characters','finish_reason','error']},ensure_ascii=False),flush=True);return result
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(check,items))
 results=[json.loads(f.read_text()) for f in a.output.glob('*.json') if f.name!='summary.json'];summary={'cases':len(results),'technical_passed':sum(r.get('technical_pass') is True for r in results),'cost_units':meter['used'],'no_new_user_payments':True,'scope':'Real model samples; technical/source checks are not an exhaustive factual guarantee.'};(a.output/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
if __name__=='__main__':main()

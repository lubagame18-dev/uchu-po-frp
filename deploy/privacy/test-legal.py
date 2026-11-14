import hashlib,json,re,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
class Legal(unittest.TestCase):
 def test_document_snapshots_versions_and_operator_fields(self):
  hashes=json.loads((ROOT/'deploy/pocketbase/pb_hooks/privacy-documents.js').read_text().removeprefix('module.exports=').strip().removesuffix(';'))
  for name,expected in hashes.items():
   current=(ROOT/'legal'/name).read_text().replace('<head>','<head><base href="/legal/">',1);current=re.sub(r'<script[\s\S]*?</script>','',current)
   archived=(ROOT/'legal/archive/2026-11-13'/name).read_bytes();self.assertEqual(current.encode(),archived);self.assertEqual(hashlib.sha256(archived).hexdigest(),expected)
  meta=(ROOT/'data/legal.js').read_text();self.assertIn('gladyshevalu14@mail.ru',meta);self.assertIn('Крылова',meta);self.assertNotIn('address: ""',meta)
  policy=(ROOT/'legal/privacy.html').read_text();self.assertIn('PocketBase',policy);self.assertIn('HMAC',policy);self.assertIn('необязатель',policy);self.assertNotIn('пароль (в зашифрованном виде)',policy)
 def test_no_initial_profile_consent_or_google_font_request(self):
  account=(ROOT/'js/account.js').read_text();self.assertIn('id="acProfileConsent"',account);self.assertNotRegex(account,r'id="acProfileConsent"[^>]*checked')
  self.assertIn('id="acAgree"',account);self.assertNotIn('даю согласие на обработку персональных данных по',account)
  self.assertNotIn('fonts.googleapis.com',(ROOT/'index.html').read_text());self.assertNotIn('fingerprint()', (ROOT/'js/access.js').read_text())
 def test_literary_quiz_questions_unchanged(self):
  text=(ROOT/'taras-bulba/index.html').read_text();questions=re.search(r'const TQ = \[[\s\S]*?\n\];',text).group()
  wanted=json.loads((ROOT/'deploy/privacy/lesson-ui-check.json').read_text())['taras-bulba-test-sha256'];self.assertEqual(hashlib.sha256(questions.encode()).hexdigest(),wanted)
if __name__=='__main__':unittest.main(verbosity=2)

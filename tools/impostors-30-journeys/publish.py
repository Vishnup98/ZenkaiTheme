import os,json,pathlib,urllib.request,urllib.parse,base64,time,hashlib,sys
root=pathlib.Path.cwd();out=root/'output/impostors-30-journeys';store=os.environ['SHOPIFY_STORE_DOMAIN'].removeprefix('https://').rstrip('/');assert store=='n1t6es-qx.myshopify.com'
def req(route,body=None,method=None,auth=True):
 data=None if body is None else json.dumps(body).encode();headers={'Content-Type':'application/json'}
 if auth: headers['X-Shopify-Access-Token']=token
 r=urllib.request.Request('https://'+store+route,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(r,timeout=60) as f:return json.load(f)
 except urllib.error.HTTPError as e:
  if body is not None: print('Shopify response:',e.code,e.read().decode()[:1800],flush=True)
  raise
token=req('/admin/oauth/access_token',{'grant_type':'client_credentials','client_id':os.environ['SHOPIFY_CLIENT_ID'],'client_secret':os.environ['SHOPIFY_CLIENT_SECRET']},auth=False)['access_token']
themes=req('/admin/api/2026-07/themes.json')['themes'];main=next(t for t in themes if t['role']=='main');print('MAIN',main['id'],main['name'],flush=True)
files=(out/'publication-files.txt').read_text().splitlines();backup=out/'theme-backup';backup.mkdir(exist_ok=True);changes=[]
for file in files:
 route='/admin/api/2026-07/themes/'+str(main['id'])+'/assets.json';query='?'+urllib.parse.urlencode({'asset[key]':file})
 try: old=req(route+query)['asset']
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
  old=None
 b=(root/file).read_bytes(); binary=pathlib.Path(file).suffix in ['.webp','.woff2','.png','.jpg'];same=old and old.get('checksum')==hashlib.md5(b).hexdigest()
 if same:continue
 (backup/(file.replace('/','__')+'.json')).write_text(json.dumps(old))
 changes.append(file)
 if '--publish' in sys.argv:
  asset={'key':file,('attachment' if binary else 'value'):(base64.b64encode(b).decode() if binary else b.decode())}
  req(route,{'asset':asset},method='PUT');print('Published',file,flush=True)
 time.sleep(.15)
(out/'theme-publish.json').write_text(json.dumps({'theme':main,'mode':'publish' if '--publish' in sys.argv else 'inspect','files':files,'changed':changes,'at':time.time()},indent=2));print('Changed files',len(changes),flush=True)

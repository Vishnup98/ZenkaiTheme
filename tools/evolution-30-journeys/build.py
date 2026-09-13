import json,re,pathlib
R=pathlib.Path.cwd(); out=R/'output/evolution-30-journeys'; out.mkdir(exist_ok=True)
rows=json.loads((R/'tools/evolution-30-journeys/copy.json').read_text())
base=(R/'sections/evolution-rainbow-paws.liquid').read_text(); markup,schema=base.split('{% schema %}'); schema=json.loads(schema.split('{% endschema %}')[0]); schema['name']='Evolution ad journey'; schema['presets']=[{'name':'Evolution ad journey'}]
def field(key,default):
 schema['settings'].append({'type':'textarea','id':key,'label':key.replace('_',' ').capitalize(),'default':default})
repls={
 'data-journey="rainbow-paws"':'data-journey="{{ section.settings.journey_id | escape }}"',
 'value="evo-rainbow-paws"':'value="{{ section.settings.journey_id | escape }}"',
 'Bring all 8 home':'{{ section.settings.cta_label | escape }}',
 'Which one are<br><span>you today?</span>':'{{ section.settings.moods_title | escape }}',
 'Bright, cozy, sleepy, dramatic—meet all eight moods. Your set comes with every single one.':'{{ section.settings.moods_body | escape }}',
 'A whole rainbow<br>of little personalities.':'{{ section.settings.personality_title | escape }}',
 'Bright, cozy, dramatic, sleepy—there’s a mood in the crew for all of it. Keep all eight together, or let each one claim a favorite corner.':'{{ section.settings.personality_body | escape }}',
 'Fair warning: they settle in fast.':'{{ section.settings.hand_note | escape }}',
 'Different day. Different favorite.':'{{ section.settings.personality_eyebrow | escape }}',
}
for a,b in repls.items():
 assert a in markup,a
 markup=markup.replace(a,b)
for k,d in [('journey_id','evo-rainbow-paws'),('cta_label','Bring all 8 home'),('moods_title','Meet the whole crew.'),('moods_body','All eight pictured designs are included.'),('personality_title','A place for every companion.'),('personality_body','Keep the full crew together or arrange them around your favorite room.'),('hand_note','Eight companions. Your own arrangement.'),('personality_eyebrow','Picture them at home'),('section_order','moods,personality,closeup,scale')]:field(k,d)
for name in ['moods','personality','closeup','scale']:
 pat=r'  <section class="fg-'+name+r'\b[\s\S]*?\n  </section>'
 m=re.search(pat,markup); assert m,name
 markup=markup[:m.start()]+'{% capture journey_'+name+' %}\n'+m.group(0)+'\n{% endcapture %}'+markup[m.end():]
# Captures produce no output, then output all four before the community block.
anchor='  <section class="fg-community"'
order="{% assign journey_order = section.settings.section_order | split: ',' %}{% for part in journey_order %}{% case part %}"+''.join("{% when '"+n+"' %}{{ journey_"+n+" }}" for n in ['moods','personality','closeup','scale'])+"{% endcase %}{% endfor %}\n"
markup=markup.replace(anchor,order+anchor)
(R/'sections/evolution-ad-journey.liquid').write_text(markup+'{% schema %}\n'+json.dumps(schema,ensure_ascii=False,indent=2)+'\n{% endschema %}\n')
manifest=json.loads((R/'output/evolution-static-100-2026-09-12/approved-selected-30-90-images/manifest.json').read_text()); results=[]
base_settings=json.loads((R/'templates/product.evo-rainbow-paws.json').read_text())['sections']['main']['settings']
for row in rows:
 id,pre,accent,suffix,body,journey,order,mt,mb,pt,pb,ft,fb,cta=row
 slug='evo-journey-'+id.lower(); s=dict(base_settings)
 s.update(dict(hero_prefix=pre,hero_accent=accent,hero_suffix=suffix,hero_body=body,moods_title=mt,moods_body=mb,personality_title=pt,personality_body=pb,final_title=ft,final_body=fb,cta_label=cta,journey_id=slug,section_order=order,hand_note='Eight companions. Every pictured design included.',personality_eyebrow=pt))
 # Specific detail copy advances the ad's promise using the original product proof.
 s['detail_title']= {'I04':'From the hood to the tiny paws.','ST12':'See what the close-ups show.','V10':'Look at what makes up the set.','G02':'The details they will recognize.','L05':'Soft company, down to the paws.','E10':'The shapes are soft. The details stand out.'}.get(id,'Eight designs, down to the details.')
 s['detail_body']='Look closely at the embroidered faces, colorful hoods and little brown paws. '+{'I04':'Compare the markings and ear shapes against the full lineup below.','ST12':'The hand-held photos below give you another view of the size.','V10':'Each design is its own plush, so the complete set contains eight separate companions.','G02':'From the pink ribbons to the charcoal hood, every design gives them something familiar to spot.','L05':'Each companion has its own silhouette, ready for a place beside your current read.','E10':'The hoods and ears give each companion a different silhouette in the group.'}.get(id,'Every companion brings its own silhouette to the collection you have been picturing.')
 p=R/'templates'/('product.'+slug+'.json');p.write_text(json.dumps({'layout':'evolution-rainbow-paws','sections':{'main':{'type':'evolution-ad-journey','settings':s}},'order':['main']},ensure_ascii=False,indent=2)+'\n')
 images=[x for x in manifest['images'] if x['id']==id];assert len(images)==3
 results.append({'id':id,'name':images[0]['name'],'slug':slug,'journey':journey,'order':order.split(','),'template':str(p.relative_to(R)),'images':images,'settings':s,'url':'https://zenkaiclothing.com/products/evolution-companions-complete-8-plush-collector-set?view='+slug})
(out/'journeys.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print('Built',len(results),'templates and shared Rainbow Paws journey section')

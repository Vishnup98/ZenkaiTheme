import pathlib,json,re
R=pathlib.Path.cwd(); out=R/'output/impostors-30-journeys'
rows=[x.split('\t') for x in (R/'tools/impostors-30-journeys/copy.tsv').read_text().splitlines()];assert len(rows)==30 and all(len(x)==8 for x in rows)
base=json.loads((R/'templates/product.mimikyu-collection.json').read_text()); raw=(R/'sections/mimikyu-collection.liquid').read_text(); markup,schema=raw.split('{% schema %}'); schema=json.loads(schema.split('{% endschema %}')[0]);schema['name']='Impostors ad journey';schema['presets']=[{'name':'Impostors ad journey'}]
def setting(k,d):
 schema['settings'].append({'type':'textarea','id':k,'label':k.replace('_',' ').capitalize(),'default':d})
repls={
'data-journey="mimikyu-collection"':'data-journey="{{ section.settings.journey_id | escape }}"',
'value="mimikyu-collection"':'value="{{ section.settings.journey_id | escape }}"',
'<strong>Nine soft little troublemakers.</strong> One of every design. All yours. <strong>Once one moves in, the whole little gang belongs there.</strong>':'{{ section.settings.hero_body | escape }}',
'Your shelf, but cuter':'{{ section.settings.story_eyebrow | escape }}',
'Small gang.<br>Big personality.':'{{ section.settings.story_title | escape }}',
'Claim a shelf. Brighten your desk. Let the whole gang make itself at home.':'{{ section.settings.story_body | escape }}',
'Your shelf<br>called dibs.':'{{ section.settings.final_title | escape }}',
'Every color. Every little disguise.<br>The whole gang is coming home with you.':'{{ section.settings.final_body | escape }}',
'The whole little gang':'{{ section.settings.gallery_eyebrow | escape }}',
'Meet your nine':'{{ section.settings.gallery_title | escape }}',
}
for a,b in repls.items():
 assert a in markup,a; markup=markup.replace(a,b)
for k,d in [('journey_id','imp-journey'),('hero_body','Nine separate plushes. One complete collection.'),('story_eyebrow','Picture them at home'),('story_title','A place for the whole gang.'),('story_body','Arrange every design in your own space.'),('final_title','Bring the whole gang home.'),('final_body','All nine pictured designs are included.'),('gallery_eyebrow','Every design is included'),('gallery_title','Meet your nine'),('section_order','gallery,story,details')]:setting(k,d)
# Capture the three existing component groups so their narrative sequence is configurable.
anchors=[('gallery','  <section class="ec-included ec-shell"','  <section class="ec-story">'),('story','  <section class="ec-story">','  <div class="mc-details-grid ec-shell">'),('details','  <div class="mc-details-grid ec-shell">',"  {%- assign customer_photos")]
for name,start,end in anchors:
 a=markup.index(start);b=markup.index(end,a);block=markup[a:b];markup=markup[:a]+'{% capture journey_'+name+' %}\n'+block+'{% endcapture %}\n'+markup[b:]
anchor="  {%- assign customer_photos"
order="{% assign journey_order = section.settings.section_order | split: ',' %}{% for part in journey_order %}{% case part %}{% when 'gallery' %}{{ journey_gallery }}{% when 'story' %}{{ journey_story }}{% when 'details' %}{{ journey_details }}{% endcase %}{% endfor %}\n"
markup=markup.replace(anchor,order+anchor)
(R/'sections/impostors-ad-journey.liquid').write_text(markup+'{% schema %}\n'+json.dumps(schema,indent=2)+'\n{% endschema %}\n')
sources={x['id']:x for x in json.loads((out/'source-inventory.json').read_text())};result=[]
for id,title,accent,body,story_title,story_body,final_title,final_body in rows:
 t=json.loads(json.dumps(base));s=t['sections']['main']['settings']; slug='imp-journey-'+id.lower();seq='story,gallery,details' if id[0] in 'GLHC' else 'gallery,details,story';
 if id in ['E08','N01','I02']:seq='details,gallery,story'
 s.update(hero_title=title.strip(),hero_title_accent=accent.strip(),hero_body=body,story_title=story_title,story_body=story_body,story_eyebrow='Make the scene yours' if id[0] in 'HSL' else 'Picture them at home',final_title=final_title,final_body=final_body,journey_id=slug,section_order=seq,gallery_eyebrow='One of every pictured design',gallery_title={'I02':'Look at every silhouette','E09':'Your complete index','S04':'Find your favorites','G02':'Find the one they love','N01':'Meet every little face','V10':'Everything in the set'}.get(id,'Meet your nine'))
 t['sections']['main']['type']='impostors-ad-journey';(R/'templates'/f'product.{slug}.json').write_text(json.dumps(t,indent=2,ensure_ascii=False)+'\n')
 result.append({'id':id,'slug':slug,'status':'ready_for_review' if id in sources else 'awaiting_30th_concept_confirmation','source':sources.get(id),'order':seq.split(','),'settings':s,'template':f'templates/product.{slug}.json','url':'https://zenkaiclothing.com/products/little-impostors-complete-9-plush-collector-set?view='+slug})
(out/'journeys.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n');print('Built 30 templates; 29 confirmed source concepts, C05 provisional.')

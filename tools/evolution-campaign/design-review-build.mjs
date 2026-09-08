import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=process.cwd();
const {Liquid}=require(path.join(root,'tmp/evolution-campaign-tooling/node_modules/liquidjs'));
const sharp=require('/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const out=path.join(root,'output/plush-design-review');
await fs.mkdir(path.join(out,'pages'),{recursive:true});
const engine=new Liquid({root:path.join(root,'snippets'),extname:'.liquid',strictFilters:true});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
engine.registerFilter('placeholder_svg_tag',()=>'<svg></svg>');
engine.registerFilter('asset_url',file=>'/assets/'+file);
engine.registerFilter('stylesheet_tag',url=>'<link rel="stylesheet" href="'+escape(url)+'">');
engine.registerFilter('money',value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)/100));
engine.registerFilter('money_without_trailing_zeros',value=>'$'+Number(value)/100);
engine.registerFilter('image_url',photo=>photo?.url||photo?.src||'');
engine.registerFilter('payment_button',()=>'<div class="shopify-payment-button"><button type="button" disabled style="width:100%;height:44px;border:0;border-radius:8px;background:#592ff4;color:white;font:600 16px Arial">Shop Pay preview</button></div>');
const templates=(await fs.readdir(path.join(root,'templates'))).filter(f=>/^product\.(evo-|mimikyu-collection|evolution-companions)/.test(f));
const reports=[];
for(const filename of templates){
  const template=JSON.parse((await fs.readFile(path.join(root,'templates',filename),'utf8')).replace(/^\/\*[\s\S]*?\*\//,''));
  const type=template.sections.main.type;
  const raw=await fs.readFile(path.join(root,'sections',type+'.liquid'),'utf8');
  const schema=JSON.parse(raw.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
  const defaults=Object.fromEntries(schema.settings.filter(s=>s.id&&s.default!==undefined).map(s=>[s.id,s.default]));
  const suffix=filename.replace(/^product\.|\.json$/g,'');
  const section={id:suffix,settings:{...defaults,...template.sections.main.settings},blocks:(template.sections.main.block_order||[]).map(id=>({id,...template.sections.main.blocks[id],shopify_attributes:''}))};
  const isNine=type==='mimikyu-collection';
  const isOriginal=type==='evolution-companions';
  if(isNine){
    const dir=path.join(root,'catalog-products/mimikyu-evolution-9-plush-set');
    let images=[];
    for(const ledger of ['final-image-upload-state.json','supplemental-image-upload-state.json','customer-content-upload-state.json']) images.push(...Object.values(JSON.parse(await fs.readFile(path.join(dir,ledger),'utf8')).images));
    const imageObject=async value=>{
      const record=images.find(i=>i.status==='ready'&&i.url&&value==='shopify://shop_images/'+decodeURIComponent(new URL(i.url).pathname.split('/').pop()));
      if(!record)throw Error('Missing local image '+value);
      const local=record.optimizedPath||record.originalPath;
      const metadata=await sharp(local).metadata();
      return {url:'/'+path.relative(root,local),width:metadata.width,height:metadata.height};
    };
    for(const [key,value] of Object.entries(section.settings))if(typeof value==='string'&&value.startsWith('shopify://'))section.settings[key]=await imageObject(value);
    for(const block of section.blocks)if(block.settings.image)block.settings.image=await imageObject(block.settings.image);
  }
  const product={id:isNine?9438355751017:0,handle:isNine?'little-impostors-complete-9-plush-collector-set':'evolution-companions-complete-8-plush-collector-set',title:isNine?'Little Impostors — Complete 9-Plush Collector Set':'Evolution Companions — Complete 8-Plush Collector Set',selected_or_first_available_variant:{id:isNine?'48008090976361':'47968551764073',price:isNine?13500:16000,available:true}};
  if(isOriginal){
    product.id=9428268515433;
    product.selected_or_first_available_variant={...product.selected_or_first_available_variant,inventory_policy:'continue',compare_at_price:20000,title:'Complete 8-Plush Set'};
    product.variants=[product.selected_or_first_available_variant];
    const manifest=JSON.parse(await fs.readFile(path.join(root,'catalog-products/evolution-companions-8-plush-set/product.manifest.json'),'utf8'));
    product.media=await Promise.all(manifest.images.map(async entry=>{const file=path.join(root,'catalog-products/evolution-companions-8-plush-set',entry.source);const metadata=await sharp(file).metadata();return {media_type:'image',alt:entry.alt,preview_image:{src:'/'+path.relative(root,file),width:metadata.width,height:metadata.height}};}));
  }
  const context={section,product,template:{suffix},request:{page_type:'product',locale:{iso_code:'en'},design_mode:false},shop:{name:'Zenkai Clothing',email:'admin@zenkaiclothing.com',privacy_policy:{url:'https://zenkaiclothing.com/policies/privacy-policy'}},cart:{item_count:0},routes:{root_url:'/',cart_url:'/cart'},canonical_url:'https://zenkaiclothing.com/products/'+product.handle,content_for_header:'',form:{}};
  let source=raw.replace(/{% schema %}[\s\S]*?{% endschema %}/,'').replace(/{%- form 'product',[\s\S]*?-%}/,'<form action="/cart/add" method="post" id="{{ form_id }}" class="ec-product-form">').replace(/{%- endform -%}/,'</form>').replace('data-ec-page','data-preview="true" data-ec-page');
  if(isOriginal)source=source.replace('class="ec-product-form"','class="product-single__form evo-plush-form"').replace('id="{{ form_id }}"','id="EvolutionCompanionsForm"');
  const body=await engine.parseAndRender(source,context);
  const layout=isOriginal?'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}figure{margin:0}</style></head><body><main>{{ content_for_layout }}</main></body></html>':(await fs.readFile(path.join(root,'layout',template.layout+'.liquid'),'utf8')).replace(/{% render 'evolution-campaign-app-exclusions' %}/g,'');
  const html=await engine.parseAndRender(layout,{...context,content_for_layout:body});
  await fs.writeFile(path.join(out,'pages',suffix+'.html'),html);
  reports.push({suffix,family:type,file:'pages/'+suffix+'.html',url:context.canonical_url+(isNine||isOriginal?'':'?view='+suffix),variant:product.selected_or_first_available_variant.id});
}
await fs.writeFile(path.join(out,'routes.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify({pages:reports.length,output:out}));

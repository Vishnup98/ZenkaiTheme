import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {api,ACCOUNT,ROOT,save} from '../gym-badge-scaling/api.mjs';
import {placementRules} from '../gym-badge-intent/launch.mjs';
const require=createRequire(import.meta.url);
const sharp=require('/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'catalog-products/evolution-companions-8-plush-set/campaign-2026-09-04.json')));
const OUT=path.join(ROOT,'output/evolution-companions-campaign-2026-09-04/meta-launch-2026-09-05');
const STATE=path.join(OUT,'state.json');
const NAME='ZK | Sales | Evolution Companions Full Set | US | CPA55 | 2026-09-05';
const SET='US Broad 18+ | All Genders | Purchase | $55 Cost Goal';
const PIXEL='1675497706426640',PAGE='576872978850454',IG='17841474211782405';
const TAGS='campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}&site_source_name={{site_source_name}}';
const CF='id,account_id,name,status,effective_status,objective,buying_type,daily_budget,bid_strategy,issues_info';
const SF='id,name,campaign_id,status,effective_status,bid_amount,optimization_goal,billing_event,destination_type,promoted_object,targeting,attribution_spec,start_time,end_time,issues_info';
const AF='id,name,campaign_id,adset_id,status,effective_status,issues_info,ad_review_feedback,creative{id,name,url_tags,object_story_spec,asset_feed_spec}';
const names=/\b(?:eevee|espeon|jolteon|flareon|glaceon|sylveon|vaporeon|leafeon|umbreon|pok[eé]mon)\b/i;
const expect=(c,m)=>{if(!c)throw Error(m)};
const meta=api();
const mode=process.argv[2]||'preflight';
expect(['preflight','create','activate','verify'].includes(mode),'Use preflight|create|activate|verify');
fs.mkdirSync(OUT,{recursive:true});
let state=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE)):null;
const ads=config.concepts.map(c=>({...c,name:'EC | '+c.name+' | Complete 8 | Static'}));
function destination(ad){const u=new URL('https://zenkaiclothing.com/products/'+config.handle);for(const[k,v]of Object.entries({variant:config.variantId,view:'evo-'+ad.slug,utm_source:'meta',utm_medium:'paid_social',utm_campaign:'evolution_full_set_20260905',utm_content:ad.slug}))u.searchParams.set(k,v);return u.href;}
function files(ad){return Object.fromEntries(['1x1','4x5','9x16'].map(r=>[r,path.join(ROOT,'output/evolution-companions-campaign-2026-09-04/ads',r,ad.id+'.jpg')]));}
async function preflight(){
 const [account,campaigns,source,product]=await Promise.all([meta.get(ACCOUNT,{fields:'id,name,account_status,currency,timezone_name'}),meta.all(ACCOUNT+'/campaigns',{fields:CF,limit:100}),meta.get('52587732431322',{fields:SF}),fetch('https://zenkaiclothing.com/products/'+config.handle+'.js').then(r=>r.json())]);
 expect(account.account_status===1&&account.currency==='USD','Account must be active USD');
 expect(source.promoted_object?.pixel_id===PIXEL&&source.promoted_object.custom_event_type==='PURCHASE','Pixel mismatch');
 expect(source.attribution_spec?.length>0,'Purchase attribution is missing');
 const v=product.variants.find(v=>String(v.id)===config.variantId);expect(v?.available&&v.price===16000,'Variant must be available at $160');
 const matches=campaigns.filter(c=>c.name===NAME);expect(matches.length<=1&&(!matches.length||matches[0].id===state?.campaignId),'Duplicate or untracked campaign');
 const assets=[];for(const ad of ads){expect(!names.test(ad.primaryText+' '+ad.linkHeadline+' '+ad.description),'Character name in ad copy');for(const[ratio,file]of Object.entries(files(ad))){const bytes=fs.readFileSync(file),m=await sharp(bytes).metadata();expect(m.width===1080&&m.height===({'1x1':1080,'4x5':1350,'9x16':1920}[ratio]),'Wrong image dimensions '+file);assets.push({slug:ad.slug,ratio,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}
 const pages=await Promise.all(ads.map(async ad=>{const r=await fetch(destination(ad));const html=await r.text();expect(r.ok&&html.includes('data-ec-page')&&html.includes('ec-portrait-thumbs'),'Page/gallery missing '+ad.slug);expect(html.includes('name="return_to" value="/checkout"')&&html.includes(config.variantId),'Checkout missing '+ad.slug);const customer=html.slice(html.indexOf('data-ec-page'));const spoken=customer.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/(?:src|srcset|href|data-ec-zoom)="[^"]*"/g,'');expect(!names.test(spoken),'Live page still contains character names: '+ad.slug);return{slug:ad.slug,url:destination(ad),status:r.status};}));
 const result={at:new Date().toISOString(),account,assets,pages,attribution:source.attribution_spec,offer:{price:160,variant:config.variantId},proposed:{name:NAME,budget:200,costGoal:55,ads:ads.map(a=>({name:a.name,primary:a.primaryText,headline:a.linkHeadline,url:destination(a)}))}};save(path.join(OUT,'preflight.json'),result);return result;
}
async function mutate(label,endpoint,params,record){
 expect(!state.pending,'Unresolved prior write: inspect state before retrying');
 expect([ACCOUNT+'/campaigns',ACCOUNT+'/adsets',ACCOUNT+'/ads',ACCOUNT+'/adcreatives',ACCOUNT+'/adimages',state.campaignId].includes(endpoint),'Out-of-scope write');
 state.pending={label,endpoint,params:params.bytes?{name:params.name}:params,at:new Date().toISOString()};save(STATE,state);
 const r=await meta.post(endpoint,params);record(r);state.journal.push({...state.pending,result:r});state.pending=null;save(STATE,state);return r;
}
function creative(ad){const uploads=state.uploads[ad.slug];return{name:ad.name,object_story_spec:{page_id:PAGE,instagram_user_id:IG},url_tags:TAGS,asset_feed_spec:{ad_formats:['SINGLE_IMAGE'],images:[{hash:uploads['4x5'].hash,adlabels:[{name:'feed_4x5'}]},{hash:uploads['9x16'].hash,adlabels:[{name:'story_9x16'}]},{hash:uploads['1x1'].hash,adlabels:[{name:'square_1x1'}]}],bodies:[{text:ad.primaryText}],titles:[{text:ad.linkHeadline}],descriptions:[{text:'All 8 · $160 · Free U.S. shipping'}],link_urls:[{website_url:destination(ad)}],call_to_action_types:['SHOP_NOW'],asset_customization_rules:placementRules()}};}
async function verify(active){
 expect(state?.campaignId,'No campaign state');
 const c=await meta.get(state.campaignId,{fields:CF+',adsets.limit(10){'+SF+'},ads.limit(20){'+AF+'}'});
 const sets=c.adsets?.data||[],rows=c.ads?.data||[];delete c.adsets;delete c.ads;
 const errors=[],check=(ok,msg)=>{if(!ok)errors.push(msg)};
 check('act_'+c.account_id===ACCOUNT&&c.name===NAME,'Campaign identity');check(c.status===(active?'ACTIVE':'PAUSED'),'Campaign status');check(c.objective==='OUTCOME_SALES'&&Number(c.daily_budget)===20000&&c.bid_strategy==='COST_CAP','Campaign budget/objective/bid');check(!c.issues_info?.length,'Campaign issues');check(sets.length===1,'Ad set count');const a=sets[0];
 check(a?.id===state.adsetId&&a.status==='ACTIVE'&&Number(a.bid_amount)===5500,'Ad set status/cost goal');check(a?.promoted_object?.pixel_id===PIXEL&&a.promoted_object.custom_event_type==='PURCHASE'&&a.optimization_goal==='OFFSITE_CONVERSIONS'&&a.destination_type==='WEBSITE','Purchase configuration');check(JSON.stringify(a?.targeting?.geo_locations?.countries)==='["US"]'&&!a?.targeting?.genders?.length,'Audience');check(a?.targeting?.age_min===18&&a?.targeting?.age_max===65,'Age');check(JSON.stringify(a?.targeting?.publisher_platforms)==='["facebook","instagram"]','Platforms');check(!a?.end_time&&(!a?.start_time||Date.parse(a.start_time)<=Date.now()+5000),'Schedule');check(!a?.issues_info?.length,'Ad set issues');check(rows.length===ads.length,'Ad count');
 for(const ad of ads){const row=rows.find(r=>r.id===state.ads[ad.slug]?.id),s=row?.creative?.asset_feed_spec;check(row?.status==='ACTIVE'&&row?.adset_id===state.adsetId,'Ad status/parent '+ad.slug);check(!row?.issues_info?.length,'Ad issues '+ad.slug);if(active)check(!['DISAPPROVED','WITH_ISSUES','ERROR','PAUSED','CAMPAIGN_PAUSED','ADSET_PAUSED'].includes(row?.effective_status),'Delivery '+ad.slug);check(row?.creative?.object_story_spec?.page_id===PAGE&&row?.creative?.object_story_spec?.instagram_user_id===IG,'Identity '+ad.slug);check(row?.creative?.url_tags===TAGS,'Tracking '+ad.slug);check(s?.images?.length===3&&s?.asset_customization_rules?.length===5,'Placement assets '+ad.slug);for(const r of ['1x1','4x5','9x16'])check(s?.images?.some(i=>i.hash===state.uploads[ad.slug][r].hash),'Image hash '+ad.slug+' '+r);check(s?.link_urls?.[0]?.website_url===destination(ad),'Destination '+ad.slug);check(s?.bodies?.[0]?.text===ad.primaryText&&s?.titles?.[0]?.text===ad.linkHeadline,'Copy '+ad.slug);check(s?.call_to_action_types?.[0]==='SHOP_NOW','CTA '+ad.slug);}
 check(a?.billing_event==='IMPRESSIONS','Billing event');
 check(JSON.stringify(a?.attribution_spec)===JSON.stringify(state.attribution),'Attribution settings');
 for(const ad of ads){const r=rows.find(r=>r.id===state.ads[ad.slug]?.id);check(r?.creative?.id===state.creatives[ad.slug]?.id,'Creative ID '+ad.slug);check(r?.creative?.asset_feed_spec?.descriptions?.[0]?.text==='All 8 · $160 · Free U.S. shipping','Description '+ad.slug);}
 const report={at:new Date().toISOString(),verified:!errors.length,errors,campaign:c,adsets:sets,ads:rows};save(path.join(OUT,'verify-'+(active?'active':'paused')+'.json'),report);console.log(JSON.stringify({verified:report.verified,errors,campaign:c,adsets:sets,ads:rows.map(r=>({id:r.id,name:r.name,status:r.status,effective_status:r.effective_status,issues:r.issues_info||[],review:r.ad_review_feedback}))},null,2));expect(!errors.length,'Verification failed');return report;
}
let locked=false;
try{
 if(['create','activate'].includes(mode)){fs.mkdirSync(path.join(OUT,'launch.lock'));locked=true;}
 if(mode==='verify'){const active=(await meta.get(state.campaignId,{fields:'status'})).status==='ACTIVE';await verify(active);if(!active){state.verifiedPausedAt=new Date().toISOString();save(STATE,state);}}
 else {
 expect(!state?.pending,'Unresolved prior write: inspect state');const ready=await preflight();
 if(state)expect(JSON.stringify(state.assets)===JSON.stringify(ready.assets),'Assets changed since launch preparation');
 if(mode==='preflight')console.log(JSON.stringify(ready,null,2));
 if(mode==='create'){
  state??={campaignId:null,adsetId:null,uploads:{},creatives:{},ads:{},journal:[],pending:null,assets:ready.assets,attribution:ready.attribution};save(STATE,state);expect(JSON.stringify(state.assets)===JSON.stringify(ready.assets),'Assets changed');
  if(state.campaignId)expect((await meta.get(state.campaignId,{fields:'status'})).status==='PAUSED','Cannot build under active campaign');
  if(!state.campaignId)await mutate('create campaign',ACCOUNT+'/campaigns',{name:NAME,objective:'OUTCOME_SALES',buying_type:'AUCTION',special_ad_categories:[],daily_budget:20000,bid_strategy:'COST_CAP',status:'PAUSED'},r=>{expect(r.id,'Campaign ID missing');state.campaignId=r.id;});
  if(!state.adsetId)await mutate('create ad set',ACCOUNT+'/adsets',{name:SET,campaign_id:state.campaignId,billing_event:'IMPRESSIONS',optimization_goal:'OFFSITE_CONVERSIONS',bid_amount:5500,destination_type:'WEBSITE',promoted_object:{pixel_id:PIXEL,custom_event_type:'PURCHASE'},attribution_spec:ready.attribution,targeting:{geo_locations:{countries:['US']},age_min:18,age_max:65,publisher_platforms:['facebook','instagram'],targeting_automation:{advantage_audience:1}},is_dynamic_creative:false,status:'ACTIVE'},r=>{expect(r.id,'Ad set ID missing');state.adsetId=r.id;});
  for(const ad of ads){state.uploads[ad.slug]??={};for(const[ratio,file]of Object.entries(files(ad)))if(!state.uploads[ad.slug][ratio])await mutate('upload '+ad.slug+' '+ratio,ACCOUNT+'/adimages',{name:path.basename(file),bytes:fs.readFileSync(file).toString('base64')},r=>{const i=Object.values(r.images||{})[0];expect(i?.hash,'Image hash missing');state.uploads[ad.slug][ratio]={hash:i.hash,file};});if(!state.creatives[ad.slug])await mutate('creative '+ad.slug,ACCOUNT+'/adcreatives',creative(ad),r=>{expect(r.id,'Creative ID missing');state.creatives[ad.slug]={id:r.id};});if(!state.ads[ad.slug])await mutate('ad '+ad.slug,ACCOUNT+'/ads',{name:ad.name,adset_id:state.adsetId,creative:{creative_id:state.creatives[ad.slug].id},tracking_specs:[{'action.type':['offsite_conversion'],fb_pixel:[PIXEL]}],status:'ACTIVE'},r=>{expect(r.id,'Ad ID missing');state.ads[ad.slug]={id:r.id};});console.log('Prepared',ad.slug);}
  await verify(false);state.verifiedPausedAt=new Date().toISOString();save(STATE,state);
 }
 if(mode==='activate'){expect(state?.verifiedPausedAt,'Build and verify first');const c=await meta.get(state.campaignId,{fields:'status'});if(c.status!=='ACTIVE'){await verify(false);await mutate('activate campaign',state.campaignId,{status:'ACTIVE'},r=>{expect(r.success,'Activation missing');state.activatedAt=new Date().toISOString();});}await verify(true);}
 }
} catch(e){console.error(e.message);process.exitCode=1;}finally{if(locked)fs.rmdirSync(path.join(OUT,'launch.lock'));}

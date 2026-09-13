import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {api,ACCOUNT,save} from '../gym-badge-scaling/api.mjs';
import {placementRules} from '../gym-badge-intent/launch.mjs';
const DIR=path.resolve('output/impostors-30-journeys'),FILE=DIR+'/meta-state.json';
const plan=JSON.parse(fs.readFileSync(DIR+'/launch-preflight.json'));const ads=plan.ads.filter(a=>a.id!=='C05');
const CID='52592165597522',SID='52592165604522',PIXEL='1675497706426640';
const meta=api(),mode=process.argv[2]||'verify';
const expect=(x,m)=>{if(!x)throw Error(m)};
let state=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE)):{uploads:{},creatives:{},ads:{},journal:[],pending:null};
expect(!state.pending,'Unresolved mutation: '+JSON.stringify(state.pending));
async function mutate(endpoint,params,key,record){state.pending={endpoint,params:params.bytes?{name:params.name}:params,key,at:new Date().toISOString()};save(FILE,state);const r=await meta.post(endpoint,params);record(r);state.journal.push({...state.pending,result:r});state.pending=null;save(FILE,state);return r;}
const fields='id,name,status,effective_status,adset_id,campaign_id,issues_info,creative{id,object_story_spec,asset_feed_spec}';
async function verify(active=false){const result=[];for(const a of ads){if(!state.ads[a.id]){result.push({concept:a.id,missing:true});continue}const r=await meta.get(state.ads[a.id],{fields});const spec=r.creative?.asset_feed_spec;const errors=[];
 if(r.adset_id!==SID||r.campaign_id!==CID)errors.push('parent');
 if(r.status!==(active?'ACTIVE':'PAUSED'))errors.push('status');
 if(spec?.link_urls?.[0]?.website_url!==a.destination)errors.push('destination');
 if(spec?.bodies?.[0]?.text!==a.primaryText||spec?.titles?.[0]?.text!==a.headline)errors.push('copy');
 if(r.creative?.id!==state.creatives[a.id])errors.push('creative');
 if(r.issues_info?.length||['WITH_ISSUES','DISAPPROVED','ERROR'].includes(r.effective_status))errors.push('delivery issue');
 for(const im of a.images)if(!spec?.images?.some(x=>x.hash===state.uploads[a.id][im.ratio]))errors.push('image '+im.ratio);
 result.push({concept:a.id,...r,errors});}
 const campaign=await meta.get(CID,{fields:'id,daily_budget,bid_strategy,status'});const adset=await meta.get(SID,{fields:'id,bid_amount'});
 const passed=result.every(x=>!x.missing&&!x.errors.length)&&(!active||Number(campaign.daily_budget)===150000)&&Number(adset.bid_amount)===5500;
 save(DIR+'/meta-verify-'+(active?'active':'paused')+'.json',{at:new Date().toISOString(),passed,campaign,adset,ads:result});console.log(JSON.stringify({passed,budget:Number(campaign.daily_budget)/100,ads:result.map(x=>({concept:x.concept,id:x.id,status:x.effective_status,errors:x.errors,missing:x.missing}))}));return passed;}
if(mode==='stage'){
 const live=JSON.parse(fs.readFileSync(DIR+'/live-preflight.json'));expect(live.passed&&live.results.length===29,'Live pages must pass');
 const [c,s,existing]=await Promise.all([meta.get(CID,{fields:'id,account_id,status,bid_strategy'}),meta.get(SID,{fields:'id,campaign_id,bid_amount,promoted_object'}),meta.all(CID+'/ads',{fields:'id,name,status',limit:100})]);
 expect('act_'+c.account_id===ACCOUNT&&c.status==='ACTIVE'&&c.bid_strategy==='COST_CAP','campaign');expect(s.campaign_id===CID&&Number(s.bid_amount)===5500&&s.promoted_object.pixel_id===PIXEL,'adset');
 for(const a of ads){const match=existing.find(x=>x.name===a.name+' | Journey Sep13');expect(!match||match.id===state.ads[a.id],'Untracked duplicate '+a.id);
 for(const im of a.images)expect(crypto.createHash('sha256').update(fs.readFileSync(im.file)).digest('hex')===im.sha256,'Asset changed '+im.file);
 state.uploads[a.id]||={};for(const im of a.images)if(!state.uploads[a.id][im.ratio])await mutate(ACCOUNT+'/adimages',{name:path.basename(im.file),bytes:fs.readFileSync(im.file).toString('base64')},'upload '+a.id+' '+im.ratio,r=>{const x=Object.values(r.images||{})[0];expect(x?.hash,'hash missing');state.uploads[a.id][im.ratio]=x.hash;});
 const labels={'4x5':'feed_4x5','1x1':'square_1x1','9x16':'story_9x16'},rules=placementRules();if(!state.uploads[a.id]['9x16'])for(const r of rules)if(r.image_label.name==='story_9x16')r.image_label.name='feed_4x5';
 if(!state.creatives[a.id])await mutate(ACCOUNT+'/adcreatives',{name:a.name+' | Journey Sep13',object_story_spec:{page_id:'576872978850454',instagram_user_id:'17841474211782405'},url_tags:'campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}&site_source_name={{site_source_name}}',asset_feed_spec:{ad_formats:['SINGLE_IMAGE'],images:Object.entries(state.uploads[a.id]).map(([r,hash])=>({hash,adlabels:[{name:labels[r]}]})),bodies:[{text:a.primaryText}],titles:[{text:a.headline}],descriptions:[{text:a.description}],link_urls:[{website_url:a.destination}],call_to_action_types:['SHOP_NOW'],asset_customization_rules:rules}},'creative '+a.id,r=>{expect(r.id,'creative missing');state.creatives[a.id]=r.id;});
 if(!state.ads[a.id])await mutate(ACCOUNT+'/ads',{name:a.name+' | Journey Sep13',adset_id:SID,creative:{creative_id:state.creatives[a.id]},tracking_specs:[{'action.type':['offsite_conversion'],fb_pixel:[PIXEL]}],status:'PAUSED'},'ad '+a.id,r=>{expect(r.id,'ad missing');state.ads[a.id]=r.id;});console.log('Staged '+a.id+' '+state.ads[a.id]);}
 expect(await verify(false),'Paused verification failed');
}else if(mode==='activate'){
 expect(await verify(false),'Paused verification required');const qa=JSON.parse(fs.readFileSync(DIR+'/live-qa/results.json'));expect(!qa.failures.length&&qa.results.filter(x=>x.width===390).length===29,'Live mobile QA required');
 for(const a of ads)await mutate(state.ads[a.id],{status:'ACTIVE'},'activate '+a.id,r=>expect(r.success,'activation failed'));
 await mutate(CID,{daily_budget:150000},'budget 1500',r=>expect(r.success,'budget update failed'));expect(await verify(true),'Active verification failed');
}else expect(await verify(mode==='verify-active'),'Verification failed');

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {api,ACCOUNT} from '../gym-badge-scaling/api.mjs';
const root=process.cwd(),out=path.join(root,'output/impostors-30-journeys');
const rows=JSON.parse(fs.readFileSync(path.join(out,'journeys.json')));
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const meta=api();
const campaignId='52592165597522',adsetId='52592165604522';
const [campaign,adset,ads,product]=await Promise.all([
 meta.get(campaignId,{fields:'id,account_id,name,status,daily_budget,bid_strategy'}),
 meta.get(adsetId,{fields:'id,campaign_id,name,status,bid_amount,optimization_goal,promoted_object,attribution_spec,targeting'}),
 meta.all(campaignId+'/ads',{fields:'id,name,status,effective_status,adset_id',limit:100}),
 fetch('https://zenkaiclothing.com/products/little-impostors-complete-9-plush-collector-set.js').then(r=>{if(!r.ok)throw Error('Product HTTP '+r.status);return r.json()})
]);
if('act_'+campaign.account_id!==ACCOUNT||adset.campaign_id!==campaignId)throw Error('Parent/account mismatch');
const variant=product.variants.find(v=>String(v.id)==='48008090976361');
const blockers=[];if(!variant?.available||variant.price!==13500)blockers.push('Live offer does not match $135 available set');
const plans=rows.map(row=>{
 const images=(row.source?.files||[]).map(file=>({file,ratio:path.basename(file).split('-')[1].replace('.png',''),sha256:digest(file)}));
 if(!images.length)blockers.push(row.id+': no selected assets; concept confirmation required');
 const url=new URL(row.url);url.searchParams.set('variant','48008090976361');url.searchParams.set('utm_source','meta');url.searchParams.set('utm_medium','paid_social');url.searchParams.set('utm_campaign','impostors_journeys_20260913');url.searchParams.set('utm_content',row.id.toLowerCase());
 return {id:row.id,name:'LI | '+row.id+' | '+(row.source?.name||'One Set, Three Displays'),adsetId,status:'PAUSED',destination:url.href,primaryText:row.settings.hero_body,headline:row.settings.hero_title+' '+row.settings.hero_title_accent,description:'All 9 plushes. $135. Free U.S. shipping.',callToAction:'SHOP_NOW',template:row.template,templateSha256:digest(row.template),images,missingRatios:['1x1','4x5','9x16'].filter(r=>!images.some(i=>i.ratio===r))};
});
blockers.push('Pages awaiting merchant review and live Shopify publication verification');
const report={at:new Date().toISOString(),scope:'Read-only live preflight and local launch mapping; no Meta or Shopify mutations',campaign,adset,existingAds:ads,offer:{variantId:variant?.id,price:variant?.price,available:variant?.available},proposedBudgetUsd:1500,ads:plans,blockers,assetCount:plans.reduce((n,p)=>n+p.images.length,0)};
fs.writeFileSync(path.join(out,'launch-preflight.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({campaignBudgetUsd:Number(campaign.daily_budget)/100,bidAmountUsd:Number(adset.bid_amount)/100,existingAds:ads.length,plannedAds:plans.length,assetCount:report.assetCount,missingRatios:plans.filter(p=>p.missingRatios.length).map(p=>({id:p.id,missing:p.missingRatios})),blockers},null,2));

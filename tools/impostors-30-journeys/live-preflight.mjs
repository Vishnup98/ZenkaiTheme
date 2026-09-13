import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('output/impostors-30-journeys');
const journeys=JSON.parse(await fs.readFile(out+'/journeys.json','utf8'));
const results=[];
for(let i=0;i<journeys.length;i+=4){
 results.push(...await Promise.all(journeys.slice(i,i+4).map(async j=>{
  const errors=[];
  try{
   const response=await fetch(j.url,{signal:AbortSignal.timeout(30000)});const html=await response.text();
   if(!response.ok)errors.push('HTTP '+response.status);
   if(!html.includes('data-journey="'+j.slug+'"'))errors.push('Matching published template is missing; Shopify may have returned the default page');
   if(!html.includes('name="properties[_zk_landing_view]" value="'+j.slug+'"'))errors.push('Matching landing-view attribution missing');
   if(!html.includes('value="48008090976361"'))errors.push('Expected product variant missing');
   if(!html.includes('name="return_to" value="/checkout"'))errors.push('Checkout destination missing');
   if(html.includes('data-preview="true"'))errors.push('Local preview marker present on live page');
   return {id:j.id,url:j.url,status:response.status,passed:errors.length===0,errors};
  }catch(e){return {id:j.id,url:j.url,passed:false,errors:[String(e.message)]}}
 })));
}
await fs.writeFile(out+'/live-preflight.json',JSON.stringify({at:new Date().toISOString(),passed:results.every(r=>r.passed),results},null,2)+'\n');
console.log(JSON.stringify({pages:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,firstFailure:results.find(r=>!r.passed)},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Liquid } = require(process.env.LIQUIDJS_PATH || 'liquidjs');
const root = process.cwd();
const engine = new Liquid({root:path.join(root,'snippets'),extname:'.liquid'});
engine.registerFilter('asset_url', value => '../../assets/'+value);
engine.registerFilter('stylesheet_tag', value => `<link rel="stylesheet" href="${value}">`);
engine.registerFilter('preload_tag', () => '');
engine.registerFilter('money', value => '$'+(Number(value)/100).toFixed(2));
engine.registerFilter('money_without_trailing_zeros', value => '$'+(Number(value)/100).toFixed(2));
const template = JSON.parse(await fs.readFile('templates/product.legendary-skies.json','utf8'));
const product = await (await fetch('https://zenkaiclothing.com/products/legendary-skies-complete-3-plush-collector-set.js')).json();
product.selected_or_first_available_variant = product.variants[0];
let section = await fs.readFile('sections/legendary-skies-product.liquid','utf8');
section = section.replace(/{% schema %}[\s\S]*?{% endschema %}/g,'')
  .replace(/{%-? form 'product',[\s\S]*?-%}/g,'<form action="/cart/add" method="post" id="{{ form_id }}" class="ls-product-form">')
  .replace(/{%-? endform -?%}/g,'</form>');
const context = {product,section:{id:'preview',settings:template.sections.main.settings,blocks:[]},request:{locale:{iso_code:'en'},design_mode:false},shop:{name:'Zenkai Clothing',email:'support@zenkaiclothing.com'},routes:{root_url:'/',cart_url:'/cart'},cart:{item_count:0}};
context.content_for_layout = (await engine.parseAndRender(section,context)).replace('data-preview="false"','data-preview="true"');
const layout = await fs.readFile('layout/legendary-skies.liquid','utf8');
const output = await engine.parseAndRender(layout,context);
await fs.writeFile('product-build/legendary-skies/page-preview.html',output.replace(/[\t ]+$/gm,''));
console.log('Rendered preview from current Liquid sources and recorded Shopify price.');

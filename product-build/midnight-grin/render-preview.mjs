import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Liquid } = require(process.env.LIQUIDJS_PATH || 'liquidjs');
const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const engine = new Liquid({ root: path.join(process.cwd(), 'snippets'), extname: '.liquid' });
engine.registerFilter('asset_url', value => '/assets/' + value);
engine.registerFilter('file_url', value => 'https://cdn.shopify.com/s/files/1/0625/0577/9305/files/' + value);
engine.registerFilter('stylesheet_tag', value => `<link rel="stylesheet" href="${escape(value)}">`);
engine.registerFilter('json', value => JSON.stringify(value ?? null));
// Shopify owns this filter; the local preview cannot validate its production output.
// Keep valid, empty JSON locally rather than pretending to reproduce Shopify's schema.
engine.registerFilter('structured_data', () => '{}');
engine.registerFilter('money', value => '$' + (Number(value) / 100).toFixed(2));
engine.registerFilter('handleize', value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
engine.registerFilter('image_url', (value, ...args) => {
  const src = typeof value === 'string' ? value : value?.src || value?.url || '';
  if (!src) return '';
  const url = new URL(src.startsWith('//') ? 'https:' + src : src);
  const width = args.find(arg => Array.isArray(arg) && arg[0] === 'width')?.[1];
  if (width) url.searchParams.set('width', width);
  return url.toString();
});
engine.registerFilter('image_tag', (src, ...args) => {
  const attrs = Object.fromEntries(args.filter(Array.isArray));
  delete attrs.widths;
  return `<img src="${escape(src)}" ${Object.entries(attrs).map(([k,v]) => `${k}="${escape(v)}"`).join(' ')}>`;
});
const response = await fetch('https://zenkaiclothing.com/products/midnight-grin-washed-baseball-cap.js');
if (!response.ok) throw new Error(`Product fetch failed: ${response.status}`);
const product = await response.json();
product.images = product.images.map((src, i) => ({ src, id: i + 1, alt: product.title }));
product.featured_image = product.images[0];
product.variants.forEach(v => {
  if (v.featured_image) v.featured_image = { ...v.featured_image, src: v.featured_image.src };
});
product.selected_or_first_available_variant = product.variants.find(v => v.available) || product.variants[0];
const template = JSON.parse(await fs.readFile('templates/product.midnight-grin.json', 'utf8'));
let source = await fs.readFile('sections/midnight-grin-product.liquid', 'utf8');
source = source.replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/g, '')
  .replace(/{%-?\s*form 'product',[\s\S]*?%}/g, '<form action="/cart/add" method="post" id="{{ form_id }}" class="mg-form">')
  .replace(/{%-?\s*endform\s*-?%}/g, '</form>');
const context = {
  product, section: { id: 'preview', settings: template.sections.main.settings, blocks: [] },
  request: { locale: { iso_code: 'en' }, design_mode: false },
  shop: { name: 'Zenkai Clothing', email: 'support@zenkaiclothing.com', privacy_policy: { url: '/policies/privacy-policy' }, shipping_policy: { url: '/policies/shipping-policy' }, refund_policy: { url: '/policies/refund-policy' }, terms_of_service: { url: '/policies/terms-of-service' } },
  routes: { root_url: '/', cart_url: '/cart', cart_add_url: '/cart/add' },
  canonical_url: 'https://zenkaiclothing.com/products/' + product.handle,
  cart: { item_count: 0 }
};
engine.options.globals = context;
context.content_for_layout = (await engine.parseAndRender(source, context))
  .replace('data-mg-product', 'data-mg-product data-preview="true"');
const layout = await fs.readFile('layout/midnight-grin.liquid', 'utf8');
const html = await engine.parseAndRender(layout, context);
await fs.writeFile('product-build/midnight-grin/page-preview.html', html);
await fs.writeFile('product-build/midnight-grin/product-readback.json', JSON.stringify(product, null, 2));
console.log('Rendered Midnight Grin with live product data; local cart operations disabled.');

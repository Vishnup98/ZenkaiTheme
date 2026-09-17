import { ShopifyAdminClient } from '../../tools/zenkai-catalog-api/client.mjs';

const client = ShopifyAdminClient.fromEnvironment();
const id = 'gid://shopify/Product/9442856468585';
const handle = 'midnight-grin-washed-baseball-cap';
const query = `query($id:ID!){product(id:$id){id title handle status templateSuffix onlineStoreUrl variants(first:10){nodes{id title price compareAtPrice}}}}`;
const before = (await client.graphql(query, { id })).product;
if (!before || before.handle !== handle) throw new Error('Unexpected product; refusing template assignment.');
console.log(JSON.stringify({ phase: 'before', product: before }, null, 2));
if (!process.argv.includes('--apply')) {
  console.log('Read-only. Pass --apply to assign only the midnight-grin template.');
} else {
  if (!['aftersell-collector', 'midnight-grin'].includes(before.templateSuffix)) {
    throw new Error('Product template changed since the reviewed baseline; refusing to overwrite it.');
  }
  const response = await fetch(`https://zenkaiclothing.com/products/${handle}?view=midnight-grin`);
  const html = await response.text();
  if (!response.ok || !html.includes('data-mg-product') || !html.includes('midnight-grin.css')) {
    throw new Error('Shopify has not rendered the new template yet; refusing assignment.');
  }
  const result = await client.graphql(`mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id templateSuffix} userErrors{field message}}}`, { product: { id, templateSuffix: 'midnight-grin' } });
  if (result.productUpdate.userErrors.length) throw new Error(JSON.stringify(result.productUpdate.userErrors));
  const after = (await client.graphql(query, { id })).product;
  if (after.templateSuffix !== 'midnight-grin') throw new Error('Template readback mismatch.');
  if (after.status !== before.status || JSON.stringify(after.variants) !== JSON.stringify(before.variants)) {
    throw new Error('Unrelated product data changed during assignment; inspect before continuing.');
  }
  console.log(JSON.stringify({ phase: 'after', product: after, preservedStatusAndVariantPrices: true }, null, 2));
}

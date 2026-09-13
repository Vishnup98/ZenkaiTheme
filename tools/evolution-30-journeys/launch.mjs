import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { api, ACCOUNT, ROOT, save } from "../../tools/gym-badge-scaling/api.mjs";
import { placementRules } from "../../tools/gym-badge-intent/launch.mjs";

const CAMPAIGN_ID = "52591498796722";
const ADSET_ID = "52591498798722";
const CAMPAIGN_NAME = "ZK | Sales | Evolution Companions Full Set | US | CPA55 | 2026-09-05";
const ADSET_NAME = "US Broad 18+ | All Genders | Purchase | $55 Cost Goal";
const PIXEL_ID = "1675497706426640";
const PAGE_ID = "576872978850454";
const INSTAGRAM_ID = "17841474211782405";
const PRODUCT_HANDLE = "evolution-companions-complete-8-plush-collector-set";
const VARIANT_ID = "47968551764073";
const WINNING_VIEW = "individual-approved-journeys";
const URL_TAGS =
  "campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}&site_source_name={{site_source_name}}";
const DIR = path.join(ROOT, "output/evolution-30-journeys/meta-launch");
const ASSET_DIR = path.join(ROOT, "output/evolution-static-imagegen-2026-09-12/assets");
const STATE_FILE = path.join(DIR, "state.json");
const LOCK_DIR = path.join(DIR, "launch.lock");
const mode = process.argv[2] || "preflight";
const now = () => new Date().toISOString();

const prepared = JSON.parse(fs.readFileSync(path.join(ROOT,"output/evolution-30-journeys/preflight.json")));
const ADS = prepared.ads.map(a=>({...a,adName:a.name,creativeName:a.name+" | Placement Assets",slug:a.id.toLowerCase()}));

const CAMPAIGN_FIELDS =
  "id,account_id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,bid_strategy,special_ad_categories,issues_info";
const ADSET_FIELDS =
  "id,name,campaign_id,status,effective_status,start_time,end_time,destination_type,promoted_object,is_dynamic_creative,optimization_goal,billing_event,targeting,attribution_spec,issues_info";
const AD_FIELDS =
  "id,name,status,effective_status,campaign_id,adset_id,issues_info,ad_review_feedback,creative{id,name,url_tags,object_story_spec,asset_feed_spec}";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function readState() {
  return fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : null;
}

function destination(ad) { return ad.url; }
function assetFiles(ad) { return Object.fromEntries(ad.images.map(i=>[i.placement,i.file])); }

function pngMetadata(file) {
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Not a PNG: ${file}`);
  return {
    file,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function validateAssets() {
  const expected = {
    "1x1": [1080, 1080],
    "4x5": [1080, 1350],
    "9x16": [1080, 1920],
  };
  return ADS.flatMap((ad) =>
    Object.entries(assetFiles(ad)).map(([ratio, file]) => {
      const metadata = pngMetadata(file);
      const [width, height] = expected[ratio];
      expect(Math.abs(metadata.width / metadata.height - width / height) < .015, `Wrong ratio for ${file}`);
      expect(metadata.bytes >= 51_200 && metadata.bytes <= 30 * 1024 * 1024, `Invalid file size for ${file}`);
      return { concept: ad.id, ratio, ...metadata };
    }),
  );
}

function creativePayload(ad, uploads) {
  return {
    name: ad.creativeName,
    object_story_spec: { page_id: PAGE_ID, instagram_user_id: INSTAGRAM_ID },
    url_tags: URL_TAGS,
    asset_feed_spec: {
      ad_formats: ["SINGLE_IMAGE"],
      images: [
        { hash: uploads["4x5"].hash, adlabels: [{ name: "feed_4x5" }] },
        { hash: uploads["9x16"].hash, adlabels: [{ name: "story_9x16" }] },
        { hash: uploads["1x1"].hash, adlabels: [{ name: "square_1x1" }] },
      ],
      bodies: [{ text: ad.primary }],
      titles: [{ text: ad.headline }],
      descriptions: [{ text: "All 8 included · $160 complete set · Free U.S. shipping" }],
      link_urls: [{ website_url: destination(ad) }],
      call_to_action_types: ["SHOP_NOW"],
      asset_customization_rules: placementRules(),
    },
  };
}

async function preflight(meta, state) {
  const assets = validateAssets();
  const [account, campaign, adset, existingAds, product, pageResults] = await Promise.all([
    meta.get(ACCOUNT, { fields: "id,name,account_status,currency,timezone_name" }),
    meta.get(CAMPAIGN_ID, { fields: CAMPAIGN_FIELDS }),
    meta.get(ADSET_ID, { fields: ADSET_FIELDS }),
    meta.all(`${CAMPAIGN_ID}/ads`, { fields: AD_FIELDS, limit: 100 }),
    fetch(`https://zenkaiclothing.com/products/${PRODUCT_HANDLE}.js`, {
      signal: AbortSignal.timeout(30_000),
    }).then((response) => response.json()),
    Promise.all(
      ADS.map(async (ad) => {
        const response = await fetch(destination(ad), {
          signal: AbortSignal.timeout(30_000),
          headers: { "user-agent": "ZenkaiEvolutionCreativeLaunch/1.0" },
        });
        const html = await response.text();
        expect(response.ok, `${ad.id}: landing page HTTP ${response.status}`);
        expect(new URL(response.url).host === "zenkaiclothing.com", `${ad.id}: unexpected redirect`);
        expect(html.includes('data-journey="evo-journey-'+ad.id.toLowerCase()+'"'), `${ad.id}: Matching landing journey missing`);
        expect(html.includes('name="return_to" value="/checkout"'), `${ad.id}: checkout form missing`);
        expect(html.includes(VARIANT_ID), `${ad.id}: product variant missing from checkout`);
        return { id: ad.id, url: destination(ad), status: response.status };
      }),
    ),
  ]);

  expect(account.id === ACCOUNT && account.account_status === 1 && account.currency === "USD", "Unexpected Meta account");
  expect(`act_${campaign.account_id}` === ACCOUNT && campaign.id === CAMPAIGN_ID && campaign.name === CAMPAIGN_NAME, "Campaign identity mismatch");
  expect(campaign.status === "ACTIVE" && campaign.effective_status === "ACTIVE", "Existing campaign is not active");
  expect(campaign.objective === "OUTCOME_SALES" && campaign.buying_type === "AUCTION", "Campaign objective mismatch");
  expect(!campaign.issues_info?.length, "Campaign reports issues");
  expect(adset.id === ADSET_ID && adset.campaign_id === CAMPAIGN_ID && adset.name === ADSET_NAME, "Ad-set identity mismatch");
  expect(adset.status === "ACTIVE" && adset.effective_status === "ACTIVE", "Existing ad set is not active");
  expect(adset.promoted_object?.pixel_id === PIXEL_ID && adset.promoted_object?.custom_event_type === "PURCHASE", "Pixel/event mismatch");
  expect(adset.optimization_goal === "OFFSITE_CONVERSIONS" && adset.destination_type === "WEBSITE", "Optimization mismatch");
  expect(adset.attribution_spec?.length > 0, "Attribution configuration missing");
  const variant = product.variants.find((row) => String(row.id) === VARIANT_ID);
  expect(variant?.available && Number(variant.price) === 16_000, "The $160 complete-set variant is not available");

  const exactNames = new Map(existingAds.map((ad) => [ad.name, ad]));
  for (const ad of ADS) {
    const existing = exactNames.get(ad.adName);
    if (!state) expect(!existing, `Untracked existing ad found: ${ad.adName}`);
    if (state?.ads?.[ad.id]) expect(existing?.id === state.ads[ad.id].id, `Tracked ad identity changed: ${ad.id}`);
  }

  const report = {
    generatedAt: now(),
    account,
    campaign,
    adset,
    assets,
    pageResults,
    offer: { variantId: VARIANT_ID, price: 160, winningView: WINNING_VIEW },
    proposed: ADS.map((ad) => ({
      id: ad.id,
      adName: ad.adName,
      primary: ad.primary,
      headline: ad.headline,
      destination: destination(ad),
    })),
  };
  save(path.join(DIR, "preflight.json"), report);
  return report;
}

async function mutate(meta, state, label, endpoint, params, record) {
  expect(!state.pending, "Unresolved prior mutation; inspect state before retrying");
  const allowed = new Set([`${ACCOUNT}/adimages`, `${ACCOUNT}/adcreatives`, `${ACCOUNT}/ads`]);
  expect(allowed.has(endpoint), `Out-of-scope mutation blocked: ${endpoint}`);
  state.pending = {
    label,
    endpoint,
    params: params.bytes ? { name: params.name } : params,
    at: now(),
  };
  save(STATE_FILE, state);
  const result = await meta.post(endpoint, params);
  record(result);
  state.journal.push({ ...state.pending, result });
  state.pending = null;
  save(STATE_FILE, state);
  return result;
}

function verifyObjects(campaign, adset, rows, state) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  check(campaign.id === CAMPAIGN_ID && campaign.name === CAMPAIGN_NAME, "Campaign identity");
  check(campaign.status === "ACTIVE" && campaign.effective_status === "ACTIVE", "Campaign active state");
  check(adset.id === ADSET_ID && adset.campaign_id === CAMPAIGN_ID, "Ad-set identity");
  check(adset.status === "ACTIVE" && adset.effective_status === "ACTIVE", "Ad-set active state");
  check(adset.promoted_object?.pixel_id === PIXEL_ID && adset.promoted_object?.custom_event_type === "PURCHASE", "Pixel/event");

  for (const ad of ADS) {
    const row = rows.find((candidate) => candidate.id === state.ads[ad.id]?.id);
    const spec = row?.creative?.asset_feed_spec;
    check(row?.name === ad.adName && row?.adset_id === ADSET_ID, `${ad.id}: ad identity/parent`);
    check(row?.status === "ACTIVE", `${ad.id}: configured status`);
    check(!row?.issues_info?.length, `${ad.id}: issues`);
    check(!["DISAPPROVED", "WITH_ISSUES", "ERROR", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(row?.effective_status), `${ad.id}: effective status`);
    check(row?.creative?.id === state.creatives[ad.id]?.id, `${ad.id}: creative ID`);
    check(row?.creative?.object_story_spec?.page_id === PAGE_ID, `${ad.id}: Facebook identity`);
    check(row?.creative?.object_story_spec?.instagram_user_id === INSTAGRAM_ID, `${ad.id}: Instagram identity`);
    check(row?.creative?.url_tags === URL_TAGS, `${ad.id}: URL tags`);
    check(spec?.images?.length === 3 && spec?.asset_customization_rules?.length === 5, `${ad.id}: placement assets/rules`);
    for (const ratio of ["1x1", "4x5", "9x16"]) {
      check(spec?.images?.some((image) => image.hash === state.uploads[ad.id]?.[ratio]?.hash), `${ad.id}: image ${ratio}`);
    }
    check(spec?.link_urls?.[0]?.website_url === destination(ad), `${ad.id}: destination`);
    check(spec?.bodies?.[0]?.text === ad.primary && spec?.titles?.[0]?.text === ad.headline, `${ad.id}: copy`);
    check(spec?.descriptions?.[0]?.text === "All 8 included · $160 complete set · Free U.S. shipping", `${ad.id}: description`);
    check(spec?.call_to_action_types?.[0] === "SHOP_NOW", `${ad.id}: CTA`);
  }
  return { verified: errors.length === 0, errors };
}

async function verify(meta, state) {
  expect(state?.campaignId === CAMPAIGN_ID && state?.adsetId === ADSET_ID, "Launch state is missing or out of scope");
  const [campaign, adset, rows] = await Promise.all([
    meta.get(CAMPAIGN_ID, { fields: CAMPAIGN_FIELDS }),
    meta.get(ADSET_ID, { fields: ADSET_FIELDS }),
    meta.all(`${CAMPAIGN_ID}/ads`, { fields: AD_FIELDS, limit: 100 }),
  ]);
  const result = verifyObjects(campaign, adset, rows, state);
  const report = {
    generatedAt: now(),
    ...result,
    campaign,
    adset,
    ads: ADS.map((ad) => {
      const row = rows.find((candidate) => candidate.id === state.ads[ad.id]?.id);
      return row
        ? {
            concept: ad.id,
            id: row.id,
            name: row.name,
            status: row.status,
            effectiveStatus: row.effective_status,
            creativeId: row.creative?.id,
            destination: row.creative?.asset_feed_spec?.link_urls?.[0]?.website_url,
            issues: row.issues_info || [],
            review: row.ad_review_feedback || null,
          }
        : { concept: ad.id, id: null, name: ad.adName, missing: true };
    }),
  };
  save(path.join(DIR, "verify.json"), report);
  console.log(JSON.stringify(report, null, 2));
  expect(report.verified, `Verification failed: ${report.errors.join("; ")}`);
  return report;
}

expect(["preflight", "create", "verify"].includes(mode), "Use preflight, create, or verify");
const meta = api();
let locked = false;
try {
  let state = readState();
  if (state?.pending) throw new Error(`Unresolved prior mutation: ${state.pending.label}`);
  if (mode === "verify") {
    await verify(meta, state);
  } else {
    const ready = await preflight(meta, state);
    if (mode === "preflight") {
      console.log(
        JSON.stringify(
          {
            verified: true,
            campaign: {
              id: ready.campaign.id,
              name: ready.campaign.name,
              status: ready.campaign.status,
              dailyBudget: Number(ready.campaign.daily_budget || 0) / 100,
              bidStrategy: ready.campaign.bid_strategy,
            },
            adset: {
              id: ready.adset.id,
              name: ready.adset.name,
              status: ready.adset.status,
              costGoal: Number(ready.adset.bid_amount || 0) / 100,
            },
            assets: ready.assets.length,
            adsToCreate: ready.proposed.length,
            landingView: WINNING_VIEW,
            campaignAndAdsetMutations: 0,
            report: path.join(DIR, "preflight.json"),
          },
          null,
          2,
        ),
      );
    } else {
      fs.mkdirSync(DIR, { recursive: true });
      fs.mkdirSync(LOCK_DIR);
      locked = true;
      if (!state) {
        state = {
          version: 1,
          campaignId: CAMPAIGN_ID,
          adsetId: ADSET_ID,
          campaignSnapshot: {
            dailyBudget: ready.campaign.daily_budget,
            bidStrategy: ready.campaign.bid_strategy,
            status: ready.campaign.status,
          },
          adsetSnapshot: {
            bidAmount: ready.adset.bid_amount,
            attributionSpec: ready.adset.attribution_spec,
            targeting: ready.adset.targeting,
          },
          assets: ready.assets,
          uploads: {},
          creatives: {},
          ads: {},
          journal: [],
          pending: null,
          createdAt: now(),
        };
        save(STATE_FILE, state);
      }
      expect(JSON.stringify(state.assets) === JSON.stringify(ready.assets), "Assets changed after launch preparation");
      for (const ad of ADS) {
        state.uploads[ad.id] ||= {};
        for (const [ratio, file] of Object.entries(assetFiles(ad))) {
          if (state.uploads[ad.id][ratio]) continue;
          await mutate(meta, state, `upload ${ad.id} ${ratio}`, `${ACCOUNT}/adimages`, {
            name: path.basename(file),
            bytes: fs.readFileSync(file).toString("base64"),
          }, (result) => {
            const uploaded = Object.values(result.images || {})[0];
            expect(uploaded?.hash, `${ad.id} ${ratio}: image hash missing`);
            state.uploads[ad.id][ratio] = { hash: uploaded.hash, file };
          });
        }
        if (!state.creatives[ad.id]) {
          await mutate(meta, state, `creative ${ad.id}`, `${ACCOUNT}/adcreatives`, creativePayload(ad, state.uploads[ad.id]), (result) => {
            expect(result.id, `${ad.id}: creative ID missing`);
            state.creatives[ad.id] = { id: result.id };
          });
        }
        if (!state.ads[ad.id]) {
          await mutate(meta, state, `ad ${ad.id}`, `${ACCOUNT}/ads`, {
            name: ad.adName,
            adset_id: ADSET_ID,
            creative: { creative_id: state.creatives[ad.id].id },
            tracking_specs: [{ "action.type": ["offsite_conversion"], fb_pixel: [PIXEL_ID] }],
            status: "ACTIVE",
          }, (result) => {
            expect(result.id, `${ad.id}: ad ID missing`);
            state.ads[ad.id] = { id: result.id };
          });
        }
        console.log(`Prepared ${ad.id}: ${state.ads[ad.id].id}`);
      }
      state.completedAt = now();
      save(STATE_FILE, state);
      await verify(meta, state);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (locked && fs.existsSync(LOCK_DIR)) fs.rmdirSync(LOCK_DIR);
}

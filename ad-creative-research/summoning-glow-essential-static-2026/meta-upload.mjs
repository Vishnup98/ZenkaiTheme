import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PACKAGE_DIR = path.join(ROOT, "ad-creative-research/summoning-glow-essential-static-2026");
const MANIFEST_PATH = path.join(PACKAGE_DIR, "creative-manifest.json");
const CONFIG_PATH = process.env.META_CONFIG_PATH || path.join(os.homedir(), ".claude.json");
const GRAPH = "https://graph.facebook.com/v24.0";

const ACCOUNT_ID = "act_511019028990462";
const CAMPAIGN_ID = "52587406407522";
const ADSET_ID = "52587406414122";
const PAGE_ID = "576872978850454";
const INSTAGRAM_USER_ID = "17841474211782405";
const PIXEL_ID = "1675497706426640";
const CAMPAIGN_NAME = "SG Essential | US | Purchase | Broad | $35 Cost Cap | Launch v1";
const ADSET_NAME = "Summoning Glow Essential | US | Broad | Purchase | $35 CPA";

const LAUNCH_ADS = [
  { id: "transformation", adName: "SGE_01_Transformation_Static_PlacementNative" },
  { id: "complete_set", adName: "SGE_02_CompleteSet_Static_PlacementNative" },
  { id: "pablo_review", adName: "SGE_05_PabloReview_Static_PlacementNative" },
  { id: "lights_off_test", adName: "SGE_07_LightsOffTest_Static_PlacementNative_v2" },
  { id: "customer_camera_roll", adName: "SGE_08_CustomerCameraRoll_Static_PlacementNative" },
  { id: "gallery_exhibit", adName: "SGE_09_GalleryExhibit_Static_PlacementNative_v2" },
];

function findDeep(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findDeep(child, key);
    if (found) return found;
  }
  return undefined;
}

async function readToken() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const token = process.env.META_ACCESS_TOKEN || findDeep(config, "META_ACCESS_TOKEN");
  if (!token) throw new Error("Missing META_ACCESS_TOKEN");
  return token;
}

async function readLaunchAds() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  return LAUNCH_ADS.map((entry, index) => {
    const creative = manifest.creatives.find((row) => row.id === entry.id);
    if (!creative) throw new Error(`Manifest is missing creative ${entry.id}`);
    for (const key of ["feed4x5", "story9x16", "square1x1"]) {
      if (!creative.files?.[key]) throw new Error(`${entry.id} is missing ${key}`);
    }
    return {
      ...entry,
      index: index + 1,
      creativeName: `${entry.adName} | 3 Placement Assets | 2026-08-23`,
      files: {
        feed: creative.files.feed4x5,
        story: creative.files.story9x16,
        square: creative.files.square1x1,
      },
      primary: creative.primaryText,
      headline: creative.headline,
      description: creative.description,
      destination: `https://zenkaiclothing.com${creative.destinationPath}`,
    };
  });
}

async function graphGet(pathname, params, token) {
  const url = new URL(`${GRAPH}/${pathname}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) throw new Error(`Meta GET ${response.status} ${pathname}: ${body}`);
  return JSON.parse(body);
}

async function graphPost(pathname, params, token) {
  const body = new URLSearchParams();
  body.set("access_token", token);
  for (const [key, value] of Object.entries(params || {})) {
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const response = await fetch(`${GRAPH}/${pathname}`, { method: "POST", body });
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta POST ${response.status} ${pathname}: ${text}`);
  return JSON.parse(text);
}

async function graphAll(pathname, params, token) {
  const rows = [];
  let next = `${GRAPH}/${pathname}`;
  let first = true;
  while (next) {
    let json;
    if (first) {
      json = await graphGet(pathname, params, token);
      first = false;
    } else {
      const url = new URL(next);
      if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", token);
      const response = await fetch(url);
      const text = await response.text();
      if (!response.ok) throw new Error(`Meta GET ${response.status} ${pathname}: ${text}`);
      json = JSON.parse(text);
    }
    rows.push(...(json.data || []));
    next = json.paging?.next || null;
  }
  return rows;
}

async function uploadImage(relativePath, token) {
  const absolutePath = path.join(PACKAGE_DIR, relativePath);
  const bytes = await fs.readFile(absolutePath);
  const form = new FormData();
  form.set("access_token", token);
  form.set("filename", new Blob([bytes], { type: "image/jpeg" }), path.basename(relativePath));
  const response = await fetch(`${GRAPH}/${ACCOUNT_ID}/adimages`, { method: "POST", body: form });
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta image upload ${response.status} ${relativePath}: ${text}`);
  const uploaded = Object.values(JSON.parse(text).images || {})[0];
  if (!uploaded?.hash) throw new Error(`No image hash returned for ${relativePath}`);
  return {
    hash: uploaded.hash,
    width: uploaded.width,
    height: uploaded.height,
    name: path.basename(relativePath),
  };
}

function placementRules() {
  return [
    {
      customization_spec: {
        publisher_platforms: ["facebook"],
        facebook_positions: ["feed", "video_feeds"],
      },
      image_label: { name: "feed_4x5" },
      priority: 1,
    },
    {
      customization_spec: {
        publisher_platforms: ["instagram"],
        instagram_positions: ["stream", "explore", "explore_home", "profile_feed"],
      },
      image_label: { name: "feed_4x5" },
      priority: 2,
    },
    {
      customization_spec: {
        publisher_platforms: ["facebook"],
        facebook_positions: ["story", "facebook_reels"],
      },
      image_label: { name: "story_9x16" },
      priority: 3,
    },
    {
      customization_spec: {
        publisher_platforms: ["instagram"],
        instagram_positions: ["story", "reels"],
      },
      image_label: { name: "story_9x16" },
      priority: 4,
    },
    {
      customization_spec: {
        publisher_platforms: ["facebook"],
        facebook_positions: ["marketplace", "right_hand_column", "search"],
      },
      image_label: { name: "square_1x1" },
      priority: 5,
    },
  ];
}

function creativePayload(ad, uploads) {
  const identity = { page_id: PAGE_ID };
  if (process.env.SGE_OMIT_IG !== "1") identity.instagram_user_id = INSTAGRAM_USER_ID;
  return {
    name: ad.creativeName,
    object_story_spec: identity,
    asset_feed_spec: {
      ad_formats: ["SINGLE_IMAGE"],
      images: [
        { hash: uploads.feed.hash, adlabels: [{ name: "feed_4x5" }] },
        { hash: uploads.story.hash, adlabels: [{ name: "story_9x16" }] },
        { hash: uploads.square.hash, adlabels: [{ name: "square_1x1" }] },
      ],
      bodies: [{ text: ad.primary }],
      titles: [{ text: ad.headline }],
      descriptions: [{ text: ad.description }],
      link_urls: [{ website_url: ad.destination }],
      call_to_action_types: ["SHOP_NOW"],
      asset_customization_rules: placementRules(),
    },
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: { enroll_status: "OPT_OUT" },
      },
    },
  };
}

async function inspect(token) {
  const [campaign, adset, ads] = await Promise.all([
    graphGet(CAMPAIGN_ID, {
      fields: "id,name,status,effective_status,objective,daily_budget,bid_strategy,special_ad_categories",
    }, token),
    graphGet(ADSET_ID, {
      fields: "id,name,status,effective_status,campaign_id,bid_amount,destination_type,promoted_object,is_dynamic_creative,targeting,attribution_spec",
    }, token),
    graphAll(`${ACCOUNT_ID}/ads`, {
      fields: "id,name,status,effective_status,campaign_id,adset_id,creative{id,name,object_story_spec,asset_feed_spec,degrees_of_freedom_spec},issues_info,ad_review_feedback",
      filtering: [{ field: "campaign.id", operator: "EQUAL", value: CAMPAIGN_ID }],
      limit: 100,
    }, token),
  ]);
  return { campaign, adset, ads };
}

async function create() {
  const token = await readToken();
  const launchAds = await readLaunchAds();
  const before = await inspect(token);
  if (before.campaign.status !== "PAUSED") {
    throw new Error(`Campaign must remain PAUSED; found ${before.campaign.status}`);
  }
  if (String(before.adset.campaign_id) !== CAMPAIGN_ID) {
    throw new Error("Ad set does not belong to the expected campaign");
  }

  await graphPost(CAMPAIGN_ID, { name: CAMPAIGN_NAME, status: "PAUSED" }, token);
  await graphPost(ADSET_ID, { name: ADSET_NAME }, token);

  const results = [];
  for (const ad of launchAds) {
    const existing = before.ads.find((row) => row.name === ad.adName);
    if (existing) {
      results.push({ id: ad.id, skipped: true, adId: existing.id, reason: "already exists" });
      continue;
    }

    const uploads = {};
    for (const [placement, relativePath] of Object.entries(ad.files)) {
      uploads[placement] = await uploadImage(relativePath, token);
    }

    const creative = await graphPost(`${ACCOUNT_ID}/adcreatives`, creativePayload(ad, uploads), token);
    const createdAd = await graphPost(`${ACCOUNT_ID}/ads`, {
      name: ad.adName,
      adset_id: ADSET_ID,
      creative: { creative_id: creative.id },
      tracking_specs: [{ "action.type": ["offsite_conversion"], fb_pixel: [PIXEL_ID] }],
      status: "ACTIVE",
    }, token);

    results.push({
      id: ad.id,
      adName: ad.adName,
      adId: createdAd.id,
      creativeId: creative.id,
      destination: ad.destination,
      uploads,
      effectiveStatus: "CAMPAIGN_PAUSED",
    });
  }

  const after = await inspect(token);
  process.stdout.write(`${JSON.stringify({ created: results, final: after }, null, 2)}\n`);
}

async function uploadAll() {
  const token = await readToken();
  const launchAds = await readLaunchAds();
  const uploaded = [];
  for (const ad of launchAds) {
    for (const [placement, relativePath] of Object.entries(ad.files)) {
      const image = await uploadImage(relativePath, token);
      uploaded.push({
        creativeId: ad.id,
        adName: ad.adName,
        placement,
        relativePath,
        ...image,
      });
    }
  }
  process.stdout.write(`${JSON.stringify({ uploaded }, null, 2)}\n`);
}

async function qa() {
  const token = await readToken();
  const launchAds = await readLaunchAds();
  const state = await inspect(token);
  const errors = [];

  if (state.campaign.status !== "PAUSED") errors.push(`Campaign is not paused: ${state.campaign.status}`);
  if (state.campaign.name !== CAMPAIGN_NAME) errors.push(`Campaign name mismatch: ${state.campaign.name}`);
  if (state.campaign.objective !== "OUTCOME_SALES") errors.push(`Wrong objective: ${state.campaign.objective}`);
  if (state.campaign.daily_budget !== "10500") errors.push(`Wrong daily budget: ${state.campaign.daily_budget}`);
  if (state.campaign.bid_strategy !== "COST_CAP") errors.push(`Wrong bid strategy: ${state.campaign.bid_strategy}`);
  if (state.adset.name !== ADSET_NAME) errors.push(`Ad set name mismatch: ${state.adset.name}`);
  if (Number(state.adset.bid_amount) !== 3500) errors.push(`Wrong cost cap: ${state.adset.bid_amount}`);
  if (state.adset.destination_type !== "WEBSITE") errors.push(`Wrong destination: ${state.adset.destination_type}`);
  if (String(state.adset.promoted_object?.pixel_id) !== PIXEL_ID) errors.push("Wrong pixel");
  if (state.adset.promoted_object?.custom_event_type !== "PURCHASE") errors.push("Not optimizing for purchase");
  if (state.adset.is_dynamic_creative === true) errors.push("Dynamic creative is unexpectedly enabled");
  if (state.ads.length !== launchAds.length) errors.push(`Expected ${launchAds.length} ads, found ${state.ads.length}`);

  for (const expected of launchAds) {
    const ad = state.ads.find((row) => row.name === expected.adName);
    if (!ad) {
      errors.push(`Missing ad ${expected.adName}`);
      continue;
    }
    if (ad.status !== "ACTIVE") errors.push(`${expected.adName}: ad status is ${ad.status}`);
    if (ad.effective_status !== "CAMPAIGN_PAUSED") {
      errors.push(`${expected.adName}: effective status is ${ad.effective_status}`);
    }
    const creative = ad.creative || {};
    const spec = creative.asset_feed_spec || {};
    if ((spec.images || []).length !== 3) {
      errors.push(`${expected.adName}: expected 3 placement images, found ${(spec.images || []).length}`);
    }
    if ((spec.asset_customization_rules || []).length !== 5) {
      errors.push(`${expected.adName}: expected 5 placement rules`);
    }
    if (spec.link_urls?.[0]?.website_url !== expected.destination) {
      errors.push(`${expected.adName}: destination mismatch`);
    }
    if (spec.call_to_action_types?.[0] !== "SHOP_NOW") {
      errors.push(`${expected.adName}: CTA is not SHOP_NOW`);
    }
    if (!expected.destination.includes("summoning-glow-essential-rgb-dragon-display")) {
      errors.push(`${expected.adName}: destination is not the Essential product`);
    }
    const enroll = creative.degrees_of_freedom_spec?.creative_features_spec?.standard_enhancements?.enroll_status;
    if (enroll !== "OPT_OUT") errors.push(`${expected.adName}: standard enhancements are not opted out`);
  }

  process.stdout.write(`${JSON.stringify({ verified: errors.length === 0, errors, state }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
}

const mode = process.argv[2] || "inspect";
if (mode === "inspect") {
  process.stdout.write(`${JSON.stringify(await inspect(await readToken()), null, 2)}\n`);
} else if (mode === "create") {
  await create();
} else if (mode === "upload-all") {
  await uploadAll();
} else if (mode === "qa") {
  await qa();
} else {
  throw new Error(`Unknown mode: ${mode}`);
}

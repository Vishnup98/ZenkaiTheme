# Summoning Glow Essential — Meta upload handoff

## Current Meta state

- Account: `act_511019028990462`
- Campaign: `SG Essential | US | Purchase | Broad | $35 Cost Cap | Launch v1`
- Campaign ID: `52587406407522`
- Campaign status: `PAUSED`
- Campaign budget: `$105/day`
- Bid strategy: `COST_CAP`
- Ad set: `Summoning Glow Essential | US | Broad | Purchase | $35 CPA`
- Ad set ID: `52587406414122`
- Ad set effective status: `CAMPAIGN_PAUSED`
- Cost cap: `$35`
- Geography: United States, broad Advantage audience, ages 18–65
- Optimization: website Purchase
- Pixel: `1675497706426640`
- Attribution: 7-day click / 1-day view
- Ads created: `0`
- Uploaded Account Images: `18`

Ads Manager:

<https://adsmanager.facebook.com/adsmanager/manage/ads?act=511019028990462&selected_campaign_ids=52587406407522&selected_adset_ids=52587406414122>

## Why the ads are not assembled yet

The connected Meta token can read and edit the paused campaign and upload Account Images, but Meta rejected `adcreatives` creation with OAuth error code `100`, subcode `1885183`: the creative post was created by an app in development mode. Omitting the Instagram identity produced the same result. The browser surface was also denied permission to access Ads Manager, so no browser-side workaround was attempted.

To finish the build, either:

1. Switch the Meta developer app used by `META_ACCESS_TOKEN` to Live mode with the required Ads Management access, then run `node meta-upload.mjs create` followed by `node meta-upload.mjs qa`; or
2. Assemble the six ads manually in the paused campaign using the already-uploaded Account Images below and the copy/destinations in `campaign-handoff.md`.

Do not activate the campaign until all six placement previews and the final budget have been reviewed.

## Uploaded Account Images

| Concept | Placement | Account image filename | Dimensions | Image hash |
| --- | --- | --- | --- | --- |
| Transformation | Feed | `01-transformation-feed-4x5-v1.jpg` | 1080×1350 | `d4f1126c14a963d3b518751d9a6f6d05` |
| Transformation | Story/Reels | `01-transformation-story-9x16-v1.jpg` | 1080×1920 | `2cb48f8493b8adbbbb6cc70ec7d7667c` |
| Transformation | Square | `01-transformation-square-1x1-v1.jpg` | 1080×1080 | `6d005071bf1bbd7fc90d5ac40025e55e` |
| Complete Set | Feed | `02-complete-set-feed-4x5-v1.jpg` | 1080×1350 | `a11a39a8362dad6b99c05f517d945df3` |
| Complete Set | Story/Reels | `02-complete-set-story-9x16-v1.jpg` | 1080×1920 | `7869465ddc49d94fc51149bfea0398da` |
| Complete Set | Square | `02-complete-set-square-1x1-v1.jpg` | 1080×1080 | `531653ff4641eb279226dfa1ea9cb208` |
| Pablo Review | Feed | `05-review-pablo-feed-4x5-v1.jpg` | 1080×1350 | `324b1c5bfdd13b9e01755a82eca9919d` |
| Pablo Review | Story/Reels | `05-review-pablo-story-9x16-v1.jpg` | 1080×1920 | `4df0004e0f3feca2f97cc89231e4a42c` |
| Pablo Review | Square | `05-review-pablo-square-1x1-v1.jpg` | 1080×1080 | `818eeefea95a7f4534de4372567ed223` |
| Lights-Off Test | Feed | `07-lights-off-test-feed-4x5-v2.jpg` | 1080×1350 | `323649c95c9039865523146dfd43fbb9` |
| Lights-Off Test | Story/Reels | `07-lights-off-test-story-9x16-v2.jpg` | 1080×1920 | `6add9ab8b10fbf5bdfde0265035d632c` |
| Lights-Off Test | Square | `07-lights-off-test-square-1x1-v2.jpg` | 1080×1080 | `34e7fbc5463d52c8e34dd267ec742447` |
| Customer Camera Roll | Feed | `08-customer-camera-roll-feed-4x5-v1.jpg` | 1080×1350 | `b82632feff630ad9137d98811f3e7af2` |
| Customer Camera Roll | Story/Reels | `08-customer-camera-roll-story-9x16-v1.jpg` | 1080×1920 | `d378596727385b2266c92af459a2c0d9` |
| Customer Camera Roll | Square | `08-customer-camera-roll-square-1x1-v1.jpg` | 1080×1080 | `b5349877c629e497fde59a5c62692f1f` |
| Gallery Exhibit | Feed | `09-museum-placard-feed-4x5-v2.jpg` | 1080×1350 | `581b8aef926ed05991c89a5eedbe585d` |
| Gallery Exhibit | Story/Reels | `09-gallery-exhibit-story-9x16-v2.jpg` | 1080×1920 | `ba70cf8f3c4b140b1775c57193544bd1` |
| Gallery Exhibit | Square | `09-gallery-exhibit-square-1x1-v2.jpg` | 1080×1080 | `4e13c52ea8c50f7fe280a6145f3aeeab` |

## Six-ad assembly map

| Ad name | Feed | Story/Reels | Square | Landing variant |
| --- | --- | --- | --- | --- |
| `SGE_01_Transformation_Static_PlacementNative` | `01-transformation-feed-4x5-v1.jpg` | `01-transformation-story-9x16-v1.jpg` | `01-transformation-square-1x1-v1.jpg` | `transform` |
| `SGE_02_CompleteSet_Static_PlacementNative` | `02-complete-set-feed-4x5-v1.jpg` | `02-complete-set-story-9x16-v1.jpg` | `02-complete-set-square-1x1-v1.jpg` | `complete` |
| `SGE_05_PabloReview_Static_PlacementNative` | `05-review-pablo-feed-4x5-v1.jpg` | `05-review-pablo-story-9x16-v1.jpg` | `05-review-pablo-square-1x1-v1.jpg` | `review` |
| `SGE_07_LightsOffTest_Static_PlacementNative_v2` | `07-lights-off-test-feed-4x5-v2.jpg` | `07-lights-off-test-story-9x16-v2.jpg` | `07-lights-off-test-square-1x1-v2.jpg` | `transform` |
| `SGE_08_CustomerCameraRoll_Static_PlacementNative` | `08-customer-camera-roll-feed-4x5-v1.jpg` | `08-customer-camera-roll-story-9x16-v1.jpg` | `08-customer-camera-roll-square-1x1-v1.jpg` | `review` |
| `SGE_09_GalleryExhibit_Static_PlacementNative_v2` | `09-museum-placard-feed-4x5-v2.jpg` | `09-gallery-exhibit-story-9x16-v2.jpg` | `09-gallery-exhibit-square-1x1-v2.jpg` | `transform` |

For each ad:

- Use `Create ad` → `Single image or video`.
- Use the 4:5 file for Facebook/Instagram feeds.
- Replace Stories and Reels with the corresponding 9:16 file.
- Use the square file for Marketplace, Search, and right-column placements.
- Use the matching copy and destination from `campaign-handoff.md`.
- CTA: `Shop Now`.
- Turn off generated text, text overlay, background generation, music, automatic animation, catalog items, and standard enhancements.
- Keep each ad active beneath the paused campaign so a later campaign-level activation is sufficient.

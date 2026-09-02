export const COMPONENT_KEYS = Object.freeze(["kanto", "johto", "hoenn", "sinnoh", "evolution8"]);
export const BADGE_COMPONENT_KEYS = Object.freeze(["kanto", "johto", "hoenn", "sinnoh"]);

export const FULFILLMENT_SOURCES = Object.freeze({
  "cute-brooch-core": Object.freeze({
    sourceId: "cute-brooch-core",
    role: "core",
    storeName: "Cute Brooch Badge Store",
    storeId: "1103276629",
    productId: "1005012262514551",
    shipFromCountry: "CN",
    variants: Object.freeze({
      kanto: Object.freeze({
        component: "kanto",
        skuId: "12000057909764246",
        skuAttrWithLabel: "200001033:361181#Enamel Pins",
        skuAttr: "200001033:361181",
        expectedProperty: Object.freeze({ name: "Metal color", definition: "Enamel Pins", value: "Gold-color" }),
      }),
      johto: Object.freeze({
        component: "johto",
        skuId: "12000057909764250",
        skuAttrWithLabel: "200001033:200003758#Enamel Pins",
        skuAttr: "200001033:200003758",
        expectedProperty: Object.freeze({ name: "Metal color", definition: "Enamel Pins", value: "Light Yellow Color" }),
      }),
      hoenn: Object.freeze({
        component: "hoenn",
        skuId: "12000057909764251",
        skuAttrWithLabel: "200001033:200003759#Enamel Pins",
        skuAttr: "200001033:200003759",
        expectedProperty: Object.freeze({ name: "Metal color", definition: "Enamel Pins", value: "Pure Gold Color" }),
      }),
      sinnoh: Object.freeze({
        component: "sinnoh",
        skuId: "12000057909764248",
        skuAttrWithLabel: "200001033:361188#Enamel Pins",
        skuAttr: "200001033:361188",
        expectedProperty: Object.freeze({ name: "Metal color", definition: "Enamel Pins", value: "Silver Plated" }),
      }),
    }),
  }),
  "fly-meng-kanto": Object.freeze({
    sourceId: "fly-meng-kanto",
    role: "approved-kanto-alternative",
    storeName: "Fly Meng Choice Store",
    storeId: "1102860719",
    productId: "1005005716899784",
    shipFromCountry: "CN",
    variants: Object.freeze({
      kanto: Object.freeze({
        component: "kanto",
        skuId: "12000034102484924",
        skuAttrWithLabel: "14:350852#Pokemon Brooch",
        skuAttr: "14:350852",
        expectedProperty: Object.freeze({ name: "Color", definition: "Pokemon Brooch", value: "Orange" }),
      }),
    }),
  }),
  "mocake-evolution8": Object.freeze({
    sourceId: "mocake-evolution8",
    role: "approved-evolution8",
    storeName: "Mocake Store",
    storeId: "1105004416",
    productId: "1005012035965982",
    shipFromCountry: "CN",
    variants: Object.freeze({
      evolution8: Object.freeze({
        component: "evolution8",
        skuId: "12000057340465797",
        skuAttrWithLabel: "200001033:200003762#9",
        skuAttr: "200001033:200003762",
        expectedProperty: Object.freeze({
          name: "Metal color",
          definition: "9",
          value: "Antique Bronze Plated",
        }),
      }),
    }),
  }),
});

export const DEFAULT_DRAFT_POLICY = Object.freeze({
  currency: "USD",
  requireTrackedShipping: true,
  minSavingsPerExtraPackageUsd: 2,
});

export function emptyComponentCounts() {
  return Object.fromEntries(COMPONENT_KEYS.map((key) => [key, 0]));
}

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================================
// PostgreSQL Enums
// ============================================================================

export const orgTypeEnum = pgEnum("org_type", ["PHARMACY", "DISTRIBUTOR"]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "PENDING",
  "VERIFIED",
  "SUSPENDED",
]);

export const salesStatusEnum = pgEnum("sales_status", [
  "OPEN",
  "PAUSED_REPRICING",
]);

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "DISTRIBUTOR",
  "PHARMACY",
]);

export const drugStatusEnum = pgEnum("drug_status", [
  "ACTIVE",
  "PENDING_REVIEW",
]);

export const permissionStatusEnum = pgEnum("permission_status", [
  "PENDING",
  "APPROVED",
  "REVOKED",
]);

export const pricingPolicyEnum = pgEnum("pricing_policy", [
  "HIGHEST_AUTHORIZED",
  "PREFERRED_DISTRIBUTOR",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "EXPIRED_CANCELLED",
  "CANCELLED",
]);

// ============================================================================
// Tables (All SDG amounts stored strictly as INTEGER; percentages as NUMERIC)
// ============================================================================

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    type: orgTypeEnum("type").notNull(),
    licenseNumber: text("license_number").notNull().unique(),
    verificationStatus: verificationStatusEnum("verification_status")
      .default("PENDING")
      .notNull(),
    region: text("region").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    salesStatus: salesStatusEnum("sales_status").default("OPEN").notNull(),
    orderExpiryMinutes: integer("order_expiry_minutes").default(60).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "organizations_order_expiry_minutes_positive",
      sql`${t.orderExpiryMinutes} > 0`
    ),
    index("organizations_type_verification_verified_at_idx").on(
      t.type,
      t.verificationStatus,
      t.verifiedAt
    ),
  ]
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const masterDrugs = pgTable(
  "master_drugs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    genericName: text("generic_name").notNull(),
    tradeName: text("trade_name").notNull(),
    manufacturer: text("manufacturer").notNull(),
    strength: text("strength").notNull(),
    dosageForm: text("dosage_form").notNull(),
    status: drugStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("master_drugs_generic_name_idx").on(t.genericName),
    index("master_drugs_trade_name_idx").on(t.tradeName),
    index("master_drugs_manufacturer_idx").on(t.manufacturer),
  ]
);

export const distributorListings = pgTable(
  "distributor_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => organizations.id),
    drugId: uuid("drug_id")
      .notNull()
      .references(() => masterDrugs.id),
    wholesalePriceSdg: integer("wholesale_price_sdg").notNull(),
    isAvailable: boolean("is_available").default(true).notNull(),
    priceVersion: integer("price_version").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "distributor_listings_wholesale_price_positive",
      sql`${t.wholesalePriceSdg} > 0`
    ),
    check(
      "distributor_listings_price_version_positive",
      sql`${t.priceVersion} > 0`
    ),
    unique("distributor_listings_distributor_drug_unique").on(
      t.distributorId,
      t.drugId
    ),
    index("distributor_listings_distributor_available_idx").on(
      t.distributorId,
      t.isAvailable
    ),
    index("distributor_listings_drug_available_idx").on(
      t.drugId,
      t.isAvailable
    ),
  ]
);

export const distributorDrugAliases = pgTable(
  "distributor_drug_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => organizations.id),
    rawNameNormalized: text("raw_name_normalized").notNull(),
    masterDrugId: uuid("master_drug_id")
      .notNull()
      .references(() => masterDrugs.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("distributor_drug_aliases_distributor_raw_name_unique").on(
      t.distributorId,
      t.rawNameNormalized
    ),
  ]
);

export const priceAccessPermissions = pgTable(
  "price_access_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => organizations.id),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => organizations.id),
    status: permissionStatusEnum("status").default("PENDING").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("price_access_permissions_distributor_pharmacy_unique").on(
      t.distributorId,
      t.pharmacyId
    ),
  ]
);

export const priceChangeLogs = pgTable(
  "price_change_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => distributorListings.id),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => organizations.id),
    drugId: uuid("drug_id")
      .notNull()
      .references(() => masterDrugs.id),
    manufacturer: text("manufacturer").notNull(),
    oldPriceSdg: integer("old_price_sdg").notNull(),
    newPriceSdg: integer("new_price_sdg").notNull(),
    percentChange: numeric("percent_change", {
      precision: 6,
      scale: 2,
    }).notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("price_change_logs_distributor_changed_at_idx").on(
      t.distributorId,
      t.changedAt
    ),
  ]
);

export const pharmacyWatchlist = pgTable(
  "pharmacy_watchlist",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => organizations.id),
    drugId: uuid("drug_id")
      .notNull()
      .references(() => masterDrugs.id),
    pricingPolicy: pricingPolicyEnum("pricing_policy")
      .default("HIGHEST_AUTHORIZED")
      .notNull(),
    preferredDistributorId: uuid("preferred_distributor_id").references(
      () => organizations.id
    ),
    profitMarginPercent: numeric("profit_margin_percent", {
      precision: 5,
      scale: 2,
    })
      .default("20.00")
      .notNull(),
    autoCalcEnabled: boolean("auto_calc_enabled").default(true).notNull(),
    lastAcknowledgedWholesaleSdg: integer("last_acknowledged_wholesale_sdg"),
    currentShelfPriceSdg: integer("current_shelf_price_sdg"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "pharmacy_watchlist_profit_margin_non_negative",
      sql`${t.profitMarginPercent} >= 0`
    ),
    unique("pharmacy_watchlist_pharmacy_drug_unique").on(
      t.pharmacyId,
      t.drugId
    ),
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => organizations.id),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => organizations.id),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: orderStatusEnum("status")
      .default("PENDING_CONFIRMATION")
      .notNull(),
    totalSdg: integer("total_sdg").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("orders_total_sdg_non_negative", sql`${t.totalSdg} >= 0`),
    index("orders_pharmacy_status_idx").on(t.pharmacyId, t.status),
    index("orders_distributor_status_idx").on(t.distributorId, t.status),
    index("orders_expires_at_idx").on(t.expiresAt),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => distributorListings.id),
    quantity: integer("quantity").notNull(),
    unitPriceSnapshotSdg: integer("unit_price_snapshot_sdg").notNull(),
    capturedPriceVersion: integer("captured_price_version").notNull(),
  },
  (t) => [
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check(
      "order_items_unit_price_positive",
      sql`${t.unitPriceSnapshotSdg} > 0`
    ),
    check(
      "order_items_captured_price_version_positive",
      sql`${t.capturedPriceVersion} > 0`
    ),
    unique("order_items_order_listing_unique").on(t.orderId, t.listingId),
  ]
);

// ============================================================================
// Drizzle Relations
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  distributorListings: many(distributorListings),
  drugAliases: many(distributorDrugAliases),
  priceChangeLogs: many(priceChangeLogs),
  distributorPricePermissions: many(priceAccessPermissions, {
    relationName: "distributorPermissions",
  }),
  pharmacyPricePermissions: many(priceAccessPermissions, {
    relationName: "pharmacyPermissions",
  }),
  watchlistItems: many(pharmacyWatchlist, {
    relationName: "pharmacyWatchlistOrg",
  }),
  preferredInWatchlists: many(pharmacyWatchlist, {
    relationName: "preferredDistributorWatchlist",
  }),
  pharmacyOrders: many(orders, {
    relationName: "pharmacyOrders",
  }),
  distributorOrders: many(orders, {
    relationName: "distributorOrders",
  }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const masterDrugsRelations = relations(masterDrugs, ({ many }) => ({
  listings: many(distributorListings),
  aliases: many(distributorDrugAliases),
  priceChangeLogs: many(priceChangeLogs),
  watchlistEntries: many(pharmacyWatchlist),
}));

export const distributorListingsRelations = relations(
  distributorListings,
  ({ one, many }) => ({
    distributor: one(organizations, {
      fields: [distributorListings.distributorId],
      references: [organizations.id],
    }),
    drug: one(masterDrugs, {
      fields: [distributorListings.drugId],
      references: [masterDrugs.id],
    }),
    priceChangeLogs: many(priceChangeLogs),
    orderItems: many(orderItems),
  })
);

export const distributorDrugAliasesRelations = relations(
  distributorDrugAliases,
  ({ one }) => ({
    distributor: one(organizations, {
      fields: [distributorDrugAliases.distributorId],
      references: [organizations.id],
    }),
    masterDrug: one(masterDrugs, {
      fields: [distributorDrugAliases.masterDrugId],
      references: [masterDrugs.id],
    }),
  })
);

export const priceAccessPermissionsRelations = relations(
  priceAccessPermissions,
  ({ one }) => ({
    distributor: one(organizations, {
      fields: [priceAccessPermissions.distributorId],
      references: [organizations.id],
      relationName: "distributorPermissions",
    }),
    pharmacy: one(organizations, {
      fields: [priceAccessPermissions.pharmacyId],
      references: [organizations.id],
      relationName: "pharmacyPermissions",
    }),
  })
);

export const priceChangeLogsRelations = relations(
  priceChangeLogs,
  ({ one }) => ({
    listing: one(distributorListings, {
      fields: [priceChangeLogs.listingId],
      references: [distributorListings.id],
    }),
    distributor: one(organizations, {
      fields: [priceChangeLogs.distributorId],
      references: [organizations.id],
    }),
    drug: one(masterDrugs, {
      fields: [priceChangeLogs.drugId],
      references: [masterDrugs.id],
    }),
  })
);

export const pharmacyWatchlistRelations = relations(
  pharmacyWatchlist,
  ({ one }) => ({
    pharmacy: one(organizations, {
      fields: [pharmacyWatchlist.pharmacyId],
      references: [organizations.id],
      relationName: "pharmacyWatchlistOrg",
    }),
    drug: one(masterDrugs, {
      fields: [pharmacyWatchlist.drugId],
      references: [masterDrugs.id],
    }),
    preferredDistributor: one(organizations, {
      fields: [pharmacyWatchlist.preferredDistributorId],
      references: [organizations.id],
      relationName: "preferredDistributorWatchlist",
    }),
  })
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  pharmacy: one(organizations, {
    fields: [orders.pharmacyId],
    references: [organizations.id],
    relationName: "pharmacyOrders",
  }),
  distributor: one(organizations, {
    fields: [orders.distributorId],
    references: [organizations.id],
    relationName: "distributorOrders",
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  listing: one(distributorListings, {
    fields: [orderItems.listingId],
    references: [distributorListings.id],
  }),
}));

// ============================================================================
// Inferred TypeScript Types
// ============================================================================

export type OrgType = (typeof orgTypeEnum.enumValues)[number];
export type VerificationStatus =
  (typeof verificationStatusEnum.enumValues)[number];
export type SalesStatus = (typeof salesStatusEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type DrugStatus = (typeof drugStatusEnum.enumValues)[number];
export type PermissionStatus = (typeof permissionStatusEnum.enumValues)[number];
export type PricingPolicy = (typeof pricingPolicyEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type MasterDrug = typeof masterDrugs.$inferSelect;
export type NewMasterDrug = typeof masterDrugs.$inferInsert;

export type DistributorListing = typeof distributorListings.$inferSelect;
export type NewDistributorListing = typeof distributorListings.$inferInsert;

export type DistributorDrugAlias = typeof distributorDrugAliases.$inferSelect;
export type NewDistributorDrugAlias =
  typeof distributorDrugAliases.$inferInsert;

export type PriceAccessPermission = typeof priceAccessPermissions.$inferSelect;
export type NewPriceAccessPermission =
  typeof priceAccessPermissions.$inferInsert;

export type PriceChangeLog = typeof priceChangeLogs.$inferSelect;
export type NewPriceChangeLog = typeof priceChangeLogs.$inferInsert;

export type PharmacyWatchlistItem = typeof pharmacyWatchlist.$inferSelect;
export type NewPharmacyWatchlistItem = typeof pharmacyWatchlist.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

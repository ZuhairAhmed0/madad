import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./index";
import {
  distributorDrugAliases,
  distributorListings,
  masterDrugs,
  organizations,
  pharmacyWatchlist,
  priceAccessPermissions,
  priceChangeLogs,
  users,
  type MasterDrug,
  type Organization,
} from "./schema";

const MANUFACTURERS = {
  AMIPHARMA: "أمي فارما (Amipharma)",
  AZAL: "أزال (Azal)",
  TABUK: "تبوك (Tabuk)",
  AL_SHIFA: "الشفا (Al-Shifa)",
  SANOFI: "سانوفي (Sanofi)",
} as const;

const minutesAgo = (minutes: number): Date =>
  new Date(Date.now() - minutes * 60 * 1000);

const hoursAgo = (hours: number): Date => minutesAgo(hours * 60);

const daysAgo = (days: number): Date => hoursAgo(days * 24);

interface MasterDrugSeed {
  key: string;
  genericName: string;
  tradeName: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
}

const MASTER_DRUG_SEEDS: readonly MasterDrugSeed[] = [
  // Amoxicillin + Clavulanic Acid (5 variants)
  {
    key: "augmentin_1g",
    genericName: "Amoxicillin + Clavulanic Acid",
    tradeName: "Augmentin",
    manufacturer: MANUFACTURERS.SANOFI,
    strength: "1g",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "amoclan_1g",
    genericName: "Amoxicillin + Clavulanic Acid",
    tradeName: "Amoclan",
    manufacturer: MANUFACTURERS.AMIPHARMA,
    strength: "1g",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "megamox_1g",
    genericName: "Amoxicillin + Clavulanic Acid",
    tradeName: "Megamox",
    manufacturer: MANUFACTURERS.AZAL,
    strength: "1g",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "klavox_625",
    genericName: "Amoxicillin + Clavulanic Acid",
    tradeName: "Klavox",
    manufacturer: MANUFACTURERS.TABUK,
    strength: "625mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "amoclan_625",
    genericName: "Amoxicillin + Clavulanic Acid",
    tradeName: "Amoclan 625",
    manufacturer: MANUFACTURERS.AMIPHARMA,
    strength: "625mg",
    dosageForm: "أقراص (Tablets)",
  },

  // Paracetamol (4 variants)
  {
    key: "panadol_extra",
    genericName: "Paracetamol",
    tradeName: "Panadol Extra",
    manufacturer: MANUFACTURERS.SANOFI,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "adol_500",
    genericName: "Paracetamol",
    tradeName: "Adol",
    manufacturer: MANUFACTURERS.AL_SHIFA,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "paramol_500",
    genericName: "Paracetamol",
    tradeName: "Paramol",
    manufacturer: MANUFACTURERS.AMIPHARMA,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "fevadol_500",
    genericName: "Paracetamol",
    tradeName: "Fevadol",
    manufacturer: MANUFACTURERS.TABUK,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },

  // Omeprazole (4 variants)
  {
    key: "losec_20",
    genericName: "Omeprazole",
    tradeName: "Losec",
    manufacturer: MANUFACTURERS.SANOFI,
    strength: "20mg",
    dosageForm: "كبسولات (Capsules)",
  },
  {
    key: "risek_20",
    genericName: "Omeprazole",
    tradeName: "Risek",
    manufacturer: MANUFACTURERS.AZAL,
    strength: "20mg",
    dosageForm: "كبسولات (Capsules)",
  },
  {
    key: "omez_20",
    genericName: "Omeprazole",
    tradeName: "Omez",
    manufacturer: MANUFACTURERS.TABUK,
    strength: "20mg",
    dosageForm: "كبسولات (Capsules)",
  },
  {
    key: "omepraz_20",
    genericName: "Omeprazole",
    tradeName: "Omepraz",
    manufacturer: MANUFACTURERS.AL_SHIFA,
    strength: "20mg",
    dosageForm: "كبسولات (Capsules)",
  },

  // Amlodipine (3 variants)
  {
    key: "norvasc_5",
    genericName: "Amlodipine",
    tradeName: "Norvasc",
    manufacturer: MANUFACTURERS.SANOFI,
    strength: "5mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "amlor_5",
    genericName: "Amlodipine",
    tradeName: "Amlor",
    manufacturer: MANUFACTURERS.AMIPHARMA,
    strength: "5mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "amlocard_5",
    genericName: "Amlodipine",
    tradeName: "Amlocard",
    manufacturer: MANUFACTURERS.AZAL,
    strength: "5mg",
    dosageForm: "أقراص (Tablets)",
  },

  // Metformin (4 variants)
  {
    key: "glucophage_500",
    genericName: "Metformin",
    tradeName: "Glucophage",
    manufacturer: MANUFACTURERS.SANOFI,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "formit_500",
    genericName: "Metformin",
    tradeName: "Formit",
    manufacturer: MANUFACTURERS.AMIPHARMA,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "dialon_850",
    genericName: "Metformin",
    tradeName: "Dialon",
    manufacturer: MANUFACTURERS.TABUK,
    strength: "850mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "glucophage_xr_850",
    genericName: "Metformin",
    tradeName: "Glucophage XR",
    manufacturer: MANUFACTURERS.SANOFI,
    strength: "850mg",
    dosageForm: "أقراص ممتدة المفعول (XR Tablets)",
  },

  // Insulin Glargine (1 variant)
  {
    key: "lantus_100",
    genericName: "Insulin Glargine",
    tradeName: "Lantus SoloStar",
    manufacturer: MANUFACTURERS.SANOFI,
    strength: "100 IU/ml",
    dosageForm: "قلم حقن مسبق التعبئة (Pre-filled Pen)",
  },

  // Azithromycin (3 variants)
  {
    key: "zithromax_500",
    genericName: "Azithromycin",
    tradeName: "Zithromax",
    manufacturer: MANUFACTURERS.SANOFI,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "azomax_500",
    genericName: "Azithromycin",
    tradeName: "Azomax",
    manufacturer: MANUFACTURERS.TABUK,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },
  {
    key: "azro_500",
    genericName: "Azithromycin",
    tradeName: "Azro",
    manufacturer: MANUFACTURERS.AZAL,
    strength: "500mg",
    dosageForm: "أقراص (Tablets)",
  },
];

function drugNaturalKey(d: {
  genericName: string;
  tradeName: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
}): string {
  return `${d.genericName}|${d.tradeName}|${d.manufacturer}|${d.strength}|${d.dosageForm}`;
}

interface ListingSeedSpec {
  drugKey: string;
  wholesalePriceSdg: number;
  isAvailable: boolean;
  minutesAgo: number;
}

const FANAR_LISTINGS: readonly ListingSeedSpec[] = [
  { drugKey: "augmentin_1g", wholesalePriceSdg: 27500, isAvailable: true, minutesAgo: 15 },
  { drugKey: "amoclan_1g", wholesalePriceSdg: 20800, isAvailable: true, minutesAgo: 10 },
  { drugKey: "megamox_1g", wholesalePriceSdg: 19200, isAvailable: true, minutesAgo: 90 },
  { drugKey: "klavox_625", wholesalePriceSdg: 14800, isAvailable: true, minutesAgo: 180 },
  { drugKey: "amoclan_625", wholesalePriceSdg: 12600, isAvailable: true, minutesAgo: 45 },
  { drugKey: "panadol_extra", wholesalePriceSdg: 5200, isAvailable: true, minutesAgo: 25 },
  { drugKey: "adol_500", wholesalePriceSdg: 3900, isAvailable: true, minutesAgo: 240 },
  { drugKey: "paramol_500", wholesalePriceSdg: 3500, isAvailable: true, minutesAgo: 300 },
  { drugKey: "fevadol_500", wholesalePriceSdg: 4100, isAvailable: false, minutesAgo: 360 },
  { drugKey: "losec_20", wholesalePriceSdg: 13500, isAvailable: true, minutesAgo: 55 },
  { drugKey: "risek_20", wholesalePriceSdg: 12000, isAvailable: true, minutesAgo: 12 },
  { drugKey: "omez_20", wholesalePriceSdg: 8900, isAvailable: true, minutesAgo: 150 },
  { drugKey: "omepraz_20", wholesalePriceSdg: 7600, isAvailable: true, minutesAgo: 270 },
  { drugKey: "norvasc_5", wholesalePriceSdg: 14200, isAvailable: true, minutesAgo: 110 },
  { drugKey: "amlor_5", wholesalePriceSdg: 9800, isAvailable: true, minutesAgo: 210 },
  { drugKey: "amlocard_5", wholesalePriceSdg: 9600, isAvailable: true, minutesAgo: 20 },
  { drugKey: "glucophage_500", wholesalePriceSdg: 8400, isAvailable: true, minutesAgo: 35 },
  { drugKey: "formit_500", wholesalePriceSdg: 7800, isAvailable: true, minutesAgo: 18 },
  { drugKey: "lantus_100", wholesalePriceSdg: 68000, isAvailable: true, minutesAgo: 40 },
  { drugKey: "zithromax_500", wholesalePriceSdg: 18500, isAvailable: false, minutesAgo: 330 },
];

const BLUE_NILE_LISTINGS: readonly ListingSeedSpec[] = [
  { drugKey: "augmentin_1g", wholesalePriceSdg: 26800, isAvailable: true, minutesAgo: 30 },
  { drugKey: "amoclan_1g", wholesalePriceSdg: 21400, isAvailable: true, minutesAgo: 75 },
  { drugKey: "megamox_1g", wholesalePriceSdg: 18900, isAvailable: true, minutesAgo: 140 },
  { drugKey: "klavox_625", wholesalePriceSdg: 15200, isAvailable: true, minutesAgo: 220 },
  { drugKey: "panadol_extra", wholesalePriceSdg: 5000, isAvailable: true, minutesAgo: 14 },
  { drugKey: "adol_500", wholesalePriceSdg: 4100, isAvailable: true, minutesAgo: 195 },
  { drugKey: "paramol_500", wholesalePriceSdg: 3700, isAvailable: true, minutesAgo: 320 },
  { drugKey: "losec_20", wholesalePriceSdg: 13100, isAvailable: true, minutesAgo: 65 },
  { drugKey: "risek_20", wholesalePriceSdg: 11700, isAvailable: true, minutesAgo: 85 },
  { drugKey: "norvasc_5", wholesalePriceSdg: 14600, isAvailable: true, minutesAgo: 160 },
  { drugKey: "amlor_5", wholesalePriceSdg: 9400, isAvailable: false, minutesAgo: 350 },
  { drugKey: "glucophage_500", wholesalePriceSdg: 8200, isAvailable: true, minutesAgo: 50 },
  { drugKey: "dialon_850", wholesalePriceSdg: 9500, isAvailable: true, minutesAgo: 130 },
  { drugKey: "glucophage_xr_850", wholesalePriceSdg: 11400, isAvailable: true, minutesAgo: 200 },
  { drugKey: "lantus_100", wholesalePriceSdg: 66500, isAvailable: true, minutesAgo: 28 },
  { drugKey: "zithromax_500", wholesalePriceSdg: 17900, isAvailable: true, minutesAgo: 95 },
  { drugKey: "azomax_500", wholesalePriceSdg: 13800, isAvailable: true, minutesAgo: 260 },
  { drugKey: "azro_500", wholesalePriceSdg: 12400, isAvailable: true, minutesAgo: 340 },
];

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function seedOrganizations(tx: DbTx) {
  const orgRows = [
    {
      name: "شركة الفنار للتوزيع الدوائي",
      type: "DISTRIBUTOR" as const,
      licenseNumber: "DIST-OMD-001",
      verificationStatus: "VERIFIED" as const,
      region: "الشهداء - أمدرمان",
      verifiedAt: daysAgo(7),
      salesStatus: "OPEN" as const,
      orderExpiryMinutes: 60,
    },
    {
      name: "شركة النيل الأزرق للإمداد الدوائي",
      type: "DISTRIBUTOR" as const,
      licenseNumber: "DIST-OMD-002",
      verificationStatus: "VERIFIED" as const,
      region: "السوق الشعبي - أمدرمان",
      verifiedAt: daysAgo(7),
      salesStatus: "OPEN" as const,
      orderExpiryMinutes: 45,
    },
    {
      name: "صيدلية يولاند",
      type: "PHARMACY" as const,
      licenseNumber: "PHARM-OMD-101",
      verificationStatus: "VERIFIED" as const,
      region: "الفتيحاب - أمدرمان",
      verifiedAt: daysAgo(2),
      salesStatus: "OPEN" as const,
      orderExpiryMinutes: 60,
    },
    {
      name: "صيدلية د. رؤى",
      type: "PHARMACY" as const,
      licenseNumber: "PHARM-OMD-102",
      verificationStatus: "VERIFIED" as const,
      region: "الثورة - أمدرمان",
      verifiedAt: hoursAgo(1),
      salesStatus: "OPEN" as const,
      orderExpiryMinutes: 60,
    },
    {
      name: "صيدلية الأمل الجديدة",
      type: "PHARMACY" as const,
      licenseNumber: "PHARM-OMD-103",
      verificationStatus: "PENDING" as const,
      region: "المهندسين - أمدرمان",
      verifiedAt: null,
      salesStatus: "OPEN" as const,
      orderExpiryMinutes: 60,
    },
  ];

  const inserted = await tx
    .insert(organizations)
    .values(orgRows)
    .onConflictDoNothing({ target: organizations.licenseNumber })
    .returning({ id: organizations.id });

  const allOrgs = await tx
    .select()
    .from(organizations)
    .where(
      inArray(
        organizations.licenseNumber,
        orgRows.map((o) => o.licenseNumber)
      )
    );

  const byLicense = new Map<string, Organization>(
    allOrgs.map((org) => [org.licenseNumber, org])
  );

  return {
    insertedCount: inserted.length,
    totalCount: allOrgs.length,
    byLicense,
  };
}

async function seedUsers(
  tx: DbTx,
  orgsByLicense: Map<string, Organization>,
  hashes: { adminHash: string; memberHash: string }
) {
  const getOrgId = (license: string): string => {
    const org = orgsByLicense.get(license);
    if (!org) {
      throw new Error(`Missing seeded organization for license ${license}`);
    }
    return org.id;
  };

  const userRows = [
    {
      organizationId: null,
      email: "admin@madad.sd",
      passwordHash: hashes.adminHash,
      fullName: "إدارة منصة مدد",
      role: "ADMIN" as const,
    },
    {
      organizationId: getOrgId("DIST-OMD-001"),
      email: "fanar@madad.sd",
      passwordHash: hashes.memberHash,
      fullName: "أحمد الطيب - شركة الفنار",
      role: "DISTRIBUTOR" as const,
    },
    {
      organizationId: getOrgId("DIST-OMD-002"),
      email: "bluenile@madad.sd",
      passwordHash: hashes.memberHash,
      fullName: "محمد عثمان - النيل الأزرق",
      role: "DISTRIBUTOR" as const,
    },
    {
      organizationId: getOrgId("PHARM-OMD-101"),
      email: "yoland@madad.sd",
      passwordHash: hashes.memberHash,
      fullName: "د. سارة أحمد - صيدلية يولاند",
      role: "PHARMACY" as const,
    },
    {
      organizationId: getOrgId("PHARM-OMD-102"),
      email: "roa@madad.sd",
      passwordHash: hashes.memberHash,
      fullName: "د. رؤى خالد - صيدلية د. رؤى",
      role: "PHARMACY" as const,
    },
    {
      organizationId: getOrgId("PHARM-OMD-103"),
      email: "amal@madad.sd",
      passwordHash: hashes.memberHash,
      fullName: "د. طارق حسن - صيدلية الأمل الجديدة",
      role: "PHARMACY" as const,
    },
  ];

  const inserted = await tx
    .insert(users)
    .values(userRows)
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  return {
    insertedCount: inserted.length,
    totalCount: userRows.length,
    credentials: [
      {
        email: "admin@madad.sd",
        password: "Admin123!",
        role: "ADMIN",
        organization: "منصة مدد",
        status: "ACTIVE",
      },
      {
        email: "fanar@madad.sd",
        password: "Pass123!",
        role: "DISTRIBUTOR",
        organization: "شركة الفنار للتوزيع الدوائي",
        status: "VERIFIED",
      },
      {
        email: "bluenile@madad.sd",
        password: "Pass123!",
        role: "DISTRIBUTOR",
        organization: "شركة النيل الأزرق للإمداد الدوائي",
        status: "VERIFIED",
      },
      {
        email: "yoland@madad.sd",
        password: "Pass123!",
        role: "PHARMACY",
        organization: "صيدلية يولاند",
        status: "VERIFIED",
      },
      {
        email: "roa@madad.sd",
        password: "Pass123!",
        role: "PHARMACY",
        organization: "صيدلية د. رؤى",
        status: "VERIFIED",
      },
      {
        email: "amal@madad.sd",
        password: "Pass123!",
        role: "PHARMACY",
        organization: "صيدلية الأمل الجديدة",
        status: "PENDING",
      },
    ],
  };
}

async function seedMasterDrugs(tx: DbTx) {
  const existing = await tx.select().from(masterDrugs);
  const byNaturalKey = new Map<string, MasterDrug>(
    existing.map((drug) => [drugNaturalKey(drug), drug])
  );

  const missing = MASTER_DRUG_SEEDS.filter(
    (seed) => !byNaturalKey.has(drugNaturalKey(seed))
  );

  let insertedCount = 0;
  if (missing.length > 0) {
    const inserted = await tx
      .insert(masterDrugs)
      .values(
        missing.map((d) => ({
          genericName: d.genericName,
          tradeName: d.tradeName,
          manufacturer: d.manufacturer,
          strength: d.strength,
          dosageForm: d.dosageForm,
          status: "ACTIVE" as const,
        }))
      )
      .returning();

    insertedCount = inserted.length;
    for (const drug of inserted) {
      byNaturalKey.set(drugNaturalKey(drug), drug);
    }
  }

  const bySeedKey = new Map<string, MasterDrug>();
  for (const seed of MASTER_DRUG_SEEDS) {
    const matched = byNaturalKey.get(drugNaturalKey(seed));
    if (!matched) {
      throw new Error(`Failed to resolve seeded drug ${seed.key}`);
    }
    bySeedKey.set(seed.key, matched);
  }

  return {
    insertedCount,
    totalCount: MASTER_DRUG_SEEDS.length,
    bySeedKey,
  };
}

async function seedListings(
  tx: DbTx,
  fanarId: string,
  blueNileId: string,
  drugsByKey: Map<string, MasterDrug>
) {
  const resolveDrugId = (key: string): string => {
    const drug = drugsByKey.get(key);
    if (!drug) {
      throw new Error(`Missing drug for listing key ${key}`);
    }
    return drug.id;
  };

  const listingValues = [
    ...FANAR_LISTINGS.map((item) => ({
      distributorId: fanarId,
      drugId: resolveDrugId(item.drugKey),
      wholesalePriceSdg: item.wholesalePriceSdg,
      isAvailable: item.isAvailable,
      priceVersion: 1,
      updatedAt: minutesAgo(item.minutesAgo),
    })),
    ...BLUE_NILE_LISTINGS.map((item) => ({
      distributorId: blueNileId,
      drugId: resolveDrugId(item.drugKey),
      wholesalePriceSdg: item.wholesalePriceSdg,
      isAvailable: item.isAvailable,
      priceVersion: 1,
      updatedAt: minutesAgo(item.minutesAgo),
    })),
  ];

  const inserted = await tx
    .insert(distributorListings)
    .values(listingValues)
    .onConflictDoNothing({
      target: [distributorListings.distributorId, distributorListings.drugId],
    })
    .returning({ id: distributorListings.id });

  const allListings = await tx
    .select()
    .from(distributorListings)
    .where(inArray(distributorListings.distributorId, [fanarId, blueNileId]));

  const fanarByDrugId = new Map(
    allListings
      .filter((l) => l.distributorId === fanarId)
      .map((l) => [l.drugId, l])
  );

  return {
    insertedCount: inserted.length,
    totalCount: listingValues.length,
    fanarByDrugId,
  };
}

async function seedPriceChangeLogs(
  tx: DbTx,
  fanarId: string,
  drugsByKey: Map<string, MasterDrug>,
  fanarListingsByDrugId: Map<string, typeof distributorListings.$inferSelect>
) {
  const logSpecs = [
    {
      drugKey: "amoclan_1g",
      oldPriceSdg: 16000,
      newPriceSdg: 20800,
      percentChange: "30.00",
      minutesAgo: 10,
    },
    {
      drugKey: "risek_20",
      oldPriceSdg: 10000,
      newPriceSdg: 12000,
      percentChange: "20.00",
      minutesAgo: 12,
    },
    {
      drugKey: "formit_500",
      oldPriceSdg: 6000,
      newPriceSdg: 7800,
      percentChange: "30.00",
      minutesAgo: 18,
    },
    {
      drugKey: "amlocard_5",
      oldPriceSdg: 8000,
      newPriceSdg: 9600,
      percentChange: "20.00",
      minutesAgo: 20,
    },
  ];

  const existingLogs = await tx
    .select()
    .from(priceChangeLogs)
    .where(eq(priceChangeLogs.distributorId, fanarId));

  const existingKeys = new Set(
    existingLogs.map(
      (log) => `${log.listingId}|${log.oldPriceSdg}|${log.newPriceSdg}`
    )
  );

  const toInsert = logSpecs.flatMap((spec) => {
    const drug = drugsByKey.get(spec.drugKey);
    if (!drug) {
      throw new Error(`Missing drug for price change log ${spec.drugKey}`);
    }
    const listing = fanarListingsByDrugId.get(drug.id);
    if (!listing) {
      throw new Error(`Missing Fanar listing for price change log ${spec.drugKey}`);
    }
    const dedupeKey = `${listing.id}|${spec.oldPriceSdg}|${spec.newPriceSdg}`;
    if (existingKeys.has(dedupeKey)) {
      return [];
    }
    return [
      {
        listingId: listing.id,
        distributorId: fanarId,
        drugId: drug.id,
        manufacturer: drug.manufacturer,
        oldPriceSdg: spec.oldPriceSdg,
        newPriceSdg: spec.newPriceSdg,
        percentChange: spec.percentChange,
        changedAt: minutesAgo(spec.minutesAgo),
      },
    ];
  });

  let insertedCount = 0;
  if (toInsert.length > 0) {
    const inserted = await tx
      .insert(priceChangeLogs)
      .values(toInsert)
      .returning({ id: priceChangeLogs.id });
    insertedCount = inserted.length;
  }

  return {
    insertedCount,
    totalCount: logSpecs.length,
  };
}

/** Run the idempotent database seed for Omdurman B2B MVP demo data. */
async function seed(): Promise<void> {
  const [adminHash, memberHash] = await Promise.all([
    bcrypt.hash("Admin123!", 10),
    bcrypt.hash("Pass123!", 10),
  ]);

  const summary = await db.transaction(async (tx) => {
    const orgResult = await seedOrganizations(tx);
    const fanar = orgResult.byLicense.get("DIST-OMD-001")!;
    const blueNile = orgResult.byLicense.get("DIST-OMD-002")!;
    const yoland = orgResult.byLicense.get("PHARM-OMD-101")!;
    const roa = orgResult.byLicense.get("PHARM-OMD-102")!;

    const userResult = await seedUsers(tx, orgResult.byLicense, {
      adminHash,
      memberHash,
    });
    const drugResult = await seedMasterDrugs(tx);
    const listingResult = await seedListings(
      tx,
      fanar.id,
      blueNile.id,
      drugResult.bySeedKey
    );

    const permissionRows = [
      {
        distributorId: fanar.id,
        pharmacyId: yoland.id,
        status: "APPROVED" as const,
      },
      {
        distributorId: blueNile.id,
        pharmacyId: yoland.id,
        status: "PENDING" as const,
      },
      {
        distributorId: fanar.id,
        pharmacyId: roa.id,
        status: "APPROVED" as const,
      },
      {
        distributorId: blueNile.id,
        pharmacyId: roa.id,
        status: "APPROVED" as const,
      },
    ];
    const permissionsInserted = await tx
      .insert(priceAccessPermissions)
      .values(permissionRows)
      .onConflictDoNothing({
        target: [
          priceAccessPermissions.distributorId,
          priceAccessPermissions.pharmacyId,
        ],
      })
      .returning({ id: priceAccessPermissions.id });

    const aliasRows = [
      {
        distributorId: fanar.id,
        rawNameNormalized: "اوقمنتين 1 جم",
        masterDrugId: drugResult.bySeedKey.get("augmentin_1g")!.id,
      },
      {
        distributorId: fanar.id,
        rawNameNormalized: "بانادول اكسترا",
        masterDrugId: drugResult.bySeedKey.get("panadol_extra")!.id,
      },
      {
        distributorId: fanar.id,
        rawNameNormalized: "لانتوس قلم",
        masterDrugId: drugResult.bySeedKey.get("lantus_100")!.id,
      },
      {
        distributorId: fanar.id,
        rawNameNormalized: "اموكلان 625",
        masterDrugId: drugResult.bySeedKey.get("amoclan_625")!.id,
      },
    ];
    const aliasesInserted = await tx
      .insert(distributorDrugAliases)
      .values(aliasRows)
      .onConflictDoNothing({
        target: [
          distributorDrugAliases.distributorId,
          distributorDrugAliases.rawNameNormalized,
        ],
      })
      .returning({ id: distributorDrugAliases.id });

    const watchlistRows = [
      {
        pharmacyId: yoland.id,
        drugId: drugResult.bySeedKey.get("amoclan_1g")!.id,
        pricingPolicy: "HIGHEST_AUTHORIZED" as const,
        preferredDistributorId: null,
        profitMarginPercent: "20.00",
        autoCalcEnabled: true,
        lastAcknowledgedWholesaleSdg: 16000,
        currentShelfPriceSdg: 19200,
      },
      {
        pharmacyId: yoland.id,
        drugId: drugResult.bySeedKey.get("risek_20")!.id,
        pricingPolicy: "HIGHEST_AUTHORIZED" as const,
        preferredDistributorId: null,
        profitMarginPercent: "20.00",
        autoCalcEnabled: true,
        lastAcknowledgedWholesaleSdg: 10000,
        currentShelfPriceSdg: 12000,
      },
      {
        pharmacyId: yoland.id,
        drugId: drugResult.bySeedKey.get("augmentin_1g")!.id,
        pricingPolicy: "HIGHEST_AUTHORIZED" as const,
        preferredDistributorId: null,
        profitMarginPercent: "20.00",
        autoCalcEnabled: true,
        lastAcknowledgedWholesaleSdg: 27500,
        currentShelfPriceSdg: 33000,
      },
      {
        pharmacyId: yoland.id,
        drugId: drugResult.bySeedKey.get("panadol_extra")!.id,
        pricingPolicy: "HIGHEST_AUTHORIZED" as const,
        preferredDistributorId: null,
        profitMarginPercent: "20.00",
        autoCalcEnabled: true,
        lastAcknowledgedWholesaleSdg: 5200,
        currentShelfPriceSdg: 6240,
      },
      {
        pharmacyId: yoland.id,
        drugId: drugResult.bySeedKey.get("glucophage_500")!.id,
        pricingPolicy: "HIGHEST_AUTHORIZED" as const,
        preferredDistributorId: null,
        profitMarginPercent: "20.00",
        autoCalcEnabled: true,
        lastAcknowledgedWholesaleSdg: 8400,
        currentShelfPriceSdg: 10080,
      },
    ];
    const watchlistInserted = await tx
      .insert(pharmacyWatchlist)
      .values(watchlistRows)
      .onConflictDoNothing({
        target: [pharmacyWatchlist.pharmacyId, pharmacyWatchlist.drugId],
      })
      .returning({ id: pharmacyWatchlist.id });

    const priceLogResult = await seedPriceChangeLogs(
      tx,
      fanar.id,
      drugResult.bySeedKey,
      listingResult.fanarByDrugId
    );

    return {
      counts: [
        {
          table: "organizations",
          inserted: orgResult.insertedCount,
          target: orgResult.totalCount,
        },
        {
          table: "users",
          inserted: userResult.insertedCount,
          target: userResult.totalCount,
        },
        {
          table: "master_drugs",
          inserted: drugResult.insertedCount,
          target: drugResult.totalCount,
        },
        {
          table: "distributor_listings",
          inserted: listingResult.insertedCount,
          target: listingResult.totalCount,
        },
        {
          table: "price_access_permissions",
          inserted: permissionsInserted.length,
          target: permissionRows.length,
        },
        {
          table: "distributor_drug_aliases",
          inserted: aliasesInserted.length,
          target: aliasRows.length,
        },
        {
          table: "pharmacy_watchlist",
          inserted: watchlistInserted.length,
          target: watchlistRows.length,
        },
        {
          table: "price_change_logs",
          inserted: priceLogResult.insertedCount,
          target: priceLogResult.totalCount,
        },
      ],
      credentials: userResult.credentials,
    };
  });

  console.log("\nMadad B2B Seed Summary (Counts):");
  console.table(summary.counts);
  console.log("Seeded Login Credentials:");
  console.table(summary.credentials);
}

seed()
  .catch((err) => {
    console.error("Database seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

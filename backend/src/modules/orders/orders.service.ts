import {
  and,
  asc,
  desc,
  DrizzleQueryError,
  eq,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { DatabaseError } from "pg";
import { db } from "../../db";
import {
  distributorListings,
  masterDrugs,
  orderItems,
  orders,
  organizations,
  priceAccessPermissions,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { eventBus } from "../../lib/events";
import type { AuthenticatedUser } from "../../types/express";
import type { CreateOrderInput, ListOrdersQuery } from "./orders.schemas";

const PG_INT4_MAX = 2_147_483_647;

function isUniqueViolationError(err: unknown): boolean {
  const candidate = err instanceof DrizzleQueryError ? err.cause : err;
  if (candidate instanceof DatabaseError) {
    return candidate.code === "23505";
  }

  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "code" in candidate &&
    (candidate as { code?: unknown }).code === "23505"
  );
}

async function fetchHydratedOrderItems(orderIds: string[]) {
  if (orderIds.length === 0) {
    return new Map<
      string,
      Array<{
        id: string;
        orderId: string;
        listingId: string;
        quantity: number;
        unitPriceSnapshotSdg: number;
        capturedPriceVersion: number;
        drug: {
          id: string;
          tradeName: string;
          genericName: string;
          manufacturer: string;
          strength: string;
          dosageForm: string;
        };
      }>
    >();
  }

  const rows = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      listingId: orderItems.listingId,
      quantity: orderItems.quantity,
      unitPriceSnapshotSdg: orderItems.unitPriceSnapshotSdg,
      capturedPriceVersion: orderItems.capturedPriceVersion,
      drug: {
        id: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        manufacturer: masterDrugs.manufacturer,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
      },
    })
    .from(orderItems)
    .innerJoin(
      distributorListings,
      eq(orderItems.listingId, distributorListings.id)
    )
    .innerJoin(masterDrugs, eq(distributorListings.drugId, masterDrugs.id))
    .where(inArray(orderItems.orderId, orderIds));

  const itemsByOrderId = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = itemsByOrderId.get(row.orderId);
    if (list) {
      list.push(row);
    } else {
      itemsByOrderId.set(row.orderId, [row]);
    }
  }

  return itemsByOrderId;
}

async function findOrderByIdempotencyKey(idempotencyKey: string) {
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey))
    .limit(1);

  return existing ?? null;
}

async function resolveIdempotentReplay(
  pharmacyId: string,
  idempotencyKey: string
) {
  const existing = await findOrderByIdempotencyKey(idempotencyKey);
  if (!existing) {
    return null;
  }

  if (existing.pharmacyId !== pharmacyId) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_CONFLICT",
      "مفتاح عدم التكرار مستخدم من قبل منشأة أخرى"
    );
  }

  const itemsMap = await fetchHydratedOrderItems([existing.id]);
  return {
    order: existing,
    items: itemsMap.get(existing.id) ?? [],
    idempotentReplay: true,
  };
}

/** Atomically expire overdue PENDING_CONFIRMATION orders and emit statusChanged events. */
export async function expireStaleOrders(scope?: {
  pharmacyId?: string;
  distributorId?: string;
}): Promise<number> {
  const conditions: SQL[] = [
    eq(orders.status, "PENDING_CONFIRMATION"),
    lte(orders.expiresAt, sql`now()`),
  ];

  if (scope?.pharmacyId) {
    conditions.push(eq(orders.pharmacyId, scope.pharmacyId));
  }
  if (scope?.distributorId) {
    conditions.push(eq(orders.distributorId, scope.distributorId));
  }

  const expiredRows = await db
    .update(orders)
    .set({
      status: "EXPIRED_CANCELLED",
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning({
      id: orders.id,
      pharmacyId: orders.pharmacyId,
      distributorId: orders.distributorId,
    });

  for (const row of expiredRows) {
    eventBus.emit("order.statusChanged", {
      orderId: row.id,
      pharmacyId: row.pharmacyId,
      distributorId: row.distributorId,
      status: "EXPIRED_CANCELLED",
    });
  }

  return expiredRows.length;
}

/** Start a background interval that expires overdue orders; returns a stop cleanup function. */
export function startOrderExpirySweeper(intervalMs = 60_000): () => void {
  let running = false;

  const timer = setInterval(() => {
    if (running) {
      return;
    }
    running = true;

    void expireStaleOrders()
      .catch((err) => {
        console.error(
          "[orders] background expiry sweep failed:",
          err instanceof Error ? err.message : String(err)
        );
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  timer.unref();

  return () => {
    clearInterval(timer);
  };
}

/** Create a B2B order inside an ACID transaction with Idempotency-Key and priceVersion 409 checks. */
export async function createOrder(
  pharmacyId: string,
  idempotencyKey: string,
  input: CreateOrderInput
) {
  const replay = await resolveIdempotentReplay(pharmacyId, idempotencyKey);
  if (replay) {
    return replay;
  }

  let created: {
    order: typeof orders.$inferSelect;
  };

  try {
    created = await db.transaction(async (tx) => {
      const [distributor] = await tx
        .select({
          id: organizations.id,
          salesStatus: organizations.salesStatus,
          orderExpiryMinutes: organizations.orderExpiryMinutes,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, input.distributorId),
            eq(organizations.type, "DISTRIBUTOR"),
            eq(organizations.verificationStatus, "VERIFIED")
          )
        )
        .limit(1);

      if (!distributor) {
        throw new AppError(404, "NOT_FOUND", "الموزع غير موجود أو غير مفعل");
      }

      if (distributor.salesStatus === "PAUSED_REPRICING") {
        throw new AppError(
          409,
          "DISTRIBUTOR_PAUSED",
          "الموزع أوقف استقبال الطلبيات مؤقتاً لإعادة التسعير"
        );
      }

      const [permission] = await tx
        .select({ id: priceAccessPermissions.id })
        .from(priceAccessPermissions)
        .where(
          and(
            eq(priceAccessPermissions.distributorId, input.distributorId),
            eq(priceAccessPermissions.pharmacyId, pharmacyId),
            eq(priceAccessPermissions.status, "APPROVED")
          )
        )
        .limit(1);

      if (!permission) {
        throw new AppError(
          403,
          "PRICE_ACCESS_REQUIRED",
          "يجب الحصول على موافقة الموزع للاطلاع على الأسعار وإنشاء الطلبية"
        );
      }

      const listingIds = input.items.map((item) => item.listingId);
      const lockedListings = await tx
        .select({
          id: distributorListings.id,
          wholesalePriceSdg: distributorListings.wholesalePriceSdg,
          isAvailable: distributorListings.isAvailable,
          priceVersion: distributorListings.priceVersion,
          tradeName: masterDrugs.tradeName,
        })
        .from(distributorListings)
        .innerJoin(
          masterDrugs,
          and(
            eq(distributorListings.drugId, masterDrugs.id),
            eq(masterDrugs.status, "ACTIVE")
          )
        )
        .where(
          and(
            eq(distributorListings.distributorId, input.distributorId),
            inArray(distributorListings.id, listingIds)
          )
        )
        .orderBy(asc(distributorListings.id))
        .for("update", { of: distributorListings });

      if (lockedListings.length < input.items.length) {
        throw new AppError(
          400,
          "INVALID_LISTING",
          "بعض الأصناف غير موجودة أو لا تتبع لهذا الموزع"
        );
      }

      const listingById = new Map(lockedListings.map((l) => [l.id, l]));

      const unavailableItems: Array<{ listingId: string; tradeName: string }> =
        [];
      const conflicts: Array<{
        listingId: string;
        tradeName: string;
        expectedPriceVersion: number;
        currentPriceVersion: number;
        currentWholesalePriceSdg: number;
      }> = [];

      let totalSdg = 0;

      for (const item of input.items) {
        const listing = listingById.get(item.listingId)!;

        if (!listing.isAvailable) {
          unavailableItems.push({
            listingId: listing.id,
            tradeName: listing.tradeName,
          });
        }

        if (listing.priceVersion !== item.expectedPriceVersion) {
          conflicts.push({
            listingId: listing.id,
            tradeName: listing.tradeName,
            expectedPriceVersion: item.expectedPriceVersion,
            currentPriceVersion: listing.priceVersion,
            currentWholesalePriceSdg: listing.wholesalePriceSdg,
          });
        }

        totalSdg += listing.wholesalePriceSdg * item.quantity;
      }

      if (unavailableItems.length > 0) {
        throw new AppError(
          409,
          "ITEM_UNAVAILABLE",
          "بعض الأصناف المطلوبة غير متوفرة حالياً",
          { unavailableItems }
        );
      }

      if (conflicts.length > 0) {
        throw new AppError(
          409,
          "PRICE_VERSION_CONFLICT",
          "تغيرت أسعار بعض الأصناف منذ آخر تحديث؛ يرجى مراجعة الأسعار الجديدة",
          { conflicts }
        );
      }

      if (!Number.isSafeInteger(totalSdg) || totalSdg > PG_INT4_MAX) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "إجمالي الطلبية يتجاوز الحد الأقصى المسموح"
        );
      }

      const expiresAt = new Date(
        Date.now() + distributor.orderExpiryMinutes * 60_000
      );

      const [order] = await tx
        .insert(orders)
        .values({
          pharmacyId,
          distributorId: input.distributorId,
          idempotencyKey,
          status: "PENDING_CONFIRMATION",
          totalSdg,
          expiresAt,
        })
        .returning();

      await tx.insert(orderItems).values(
        input.items.map((item) => {
          const listing = listingById.get(item.listingId)!;
          return {
            orderId: order.id,
            listingId: listing.id,
            quantity: item.quantity,
            unitPriceSnapshotSdg: listing.wholesalePriceSdg,
            capturedPriceVersion: listing.priceVersion,
          };
        })
      );

      return { order };
    });
  } catch (err) {
    // Recover outside the aborted transaction to avoid PostgreSQL 25P02 errors.
    if (isUniqueViolationError(err)) {
      const concurrentReplay = await resolveIdempotentReplay(
        pharmacyId,
        idempotencyKey
      );
      if (concurrentReplay) {
        return concurrentReplay;
      }
    }
    throw err;
  }

  const itemsMap = await fetchHydratedOrderItems([created.order.id]);

  eventBus.emit("order.created", {
    orderId: created.order.id,
    pharmacyId: created.order.pharmacyId,
    distributorId: created.order.distributorId,
    totalSdg: created.order.totalSdg,
  });

  return {
    order: created.order,
    items: itemsMap.get(created.order.id) ?? [],
    idempotentReplay: false,
  };
}

/** List orders for the authenticated pharmacy or distributor after expiring stale orders. */
export async function listOrdersForUser(
  authUser: AuthenticatedUser,
  filters: ListOrdersQuery
) {
  const orgId = authUser.organizationId;
  if (!orgId) {
    throw new AppError(403, "FORBIDDEN", "لا توجد منشأة مرتبطة بهذا الحساب");
  }

  const isPharmacy = authUser.role === "PHARMACY";
  if (!isPharmacy && authUser.role !== "DISTRIBUTOR") {
    throw new AppError(403, "FORBIDDEN", "ليست لديك صلاحية لعرض الطلبيات");
  }

  await expireStaleOrders(
    isPharmacy ? { pharmacyId: orgId } : { distributorId: orgId }
  );

  const conditions: SQL[] = [
    isPharmacy
      ? eq(orders.pharmacyId, orgId)
      : eq(orders.distributorId, orgId),
  ];

  if (filters.status) {
    conditions.push(eq(orders.status, filters.status));
  }

  const orderRows = await db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt));

  if (orderRows.length === 0) {
    return [];
  }

  const counterpartyIds = Array.from(
    new Set(
      orderRows.map((o) => (isPharmacy ? o.distributorId : o.pharmacyId))
    )
  );
  const orderIds = orderRows.map((o) => o.id);

  const [counterparties, itemsByOrderId] = await Promise.all([
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        region: organizations.region,
        licenseNumber: organizations.licenseNumber,
        salesStatus: organizations.salesStatus,
      })
      .from(organizations)
      .where(inArray(organizations.id, counterpartyIds)),
    fetchHydratedOrderItems(orderIds),
  ]);

  const counterpartyById = new Map(counterparties.map((c) => [c.id, c]));

  return orderRows.map((order) => ({
    ...order,
    counterparty:
      counterpartyById.get(
        isPharmacy ? order.distributorId : order.pharmacyId
      ) ?? null,
    items: itemsByOrderId.get(order.id) ?? [],
  }));
}

async function transitionOrderStatus(
  orderId: string,
  actor: { orgId: string; role: "DISTRIBUTOR" | "PHARMACY" },
  targetStatus: "CONFIRMED" | "CANCELLED"
) {
  const txResult = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update");

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "الطلبية غير موجودة");
    }

    const isAuthorized =
      targetStatus === "CONFIRMED"
        ? actor.role === "DISTRIBUTOR" &&
          existing.distributorId === actor.orgId
        : (actor.role === "PHARMACY" && existing.pharmacyId === actor.orgId) ||
          (actor.role === "DISTRIBUTOR" &&
            existing.distributorId === actor.orgId);

    if (!isAuthorized) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "ليست لديك صلاحية لتعديل هذه الطلبية"
      );
    }

    const now = new Date();
    if (
      existing.status === "PENDING_CONFIRMATION" &&
      existing.expiresAt.getTime() <= now.getTime()
    ) {
      const [expiredOrder] = await tx
        .update(orders)
        .set({
          status: "EXPIRED_CANCELLED",
          updatedAt: now,
        })
        .where(eq(orders.id, orderId))
        .returning();

      return { outcome: "EXPIRED" as const, order: expiredOrder };
    }

    if (existing.status !== "PENDING_CONFIRMATION") {
      throw new AppError(
        409,
        "INVALID_ORDER_STATE",
        "لا يمكن تعديل هذه الطلبية في حالتها الحالية",
        { status: existing.status }
      );
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: targetStatus,
        updatedAt: now,
      })
      .where(eq(orders.id, orderId))
      .returning();

    return { outcome: "TRANSITIONED" as const, order: updatedOrder };
  });

  if (txResult.outcome === "EXPIRED") {
    eventBus.emit("order.statusChanged", {
      orderId: txResult.order.id,
      pharmacyId: txResult.order.pharmacyId,
      distributorId: txResult.order.distributorId,
      status: "EXPIRED_CANCELLED",
    });

    throw new AppError(
      409,
      "ORDER_EXPIRED",
      "انتهت مهلة تأكيد هذه الطلبية وتم إلغاؤها تلقائياً",
      { order: txResult.order }
    );
  }

  eventBus.emit("order.statusChanged", {
    orderId: txResult.order.id,
    pharmacyId: txResult.order.pharmacyId,
    distributorId: txResult.order.distributorId,
    status: txResult.order.status,
  });

  return { order: txResult.order };
}

/** Confirm a pending order as the owning distributor (or commit auto-expiry if overdue). */
export async function confirmOrder(distributorId: string, orderId: string) {
  return transitionOrderStatus(
    orderId,
    { orgId: distributorId, role: "DISTRIBUTOR" },
    "CONFIRMED"
  );
}

/** Cancel a pending order as either the owning pharmacy or distributor. */
export async function cancelOrder(
  authUser: AuthenticatedUser,
  orderId: string
) {
  if (
    !authUser.organizationId ||
    (authUser.role !== "PHARMACY" && authUser.role !== "DISTRIBUTOR")
  ) {
    throw new AppError(403, "FORBIDDEN", "ليست لديك صلاحية لإلغاء هذه الطلبية");
  }

  return transitionOrderStatus(
    orderId,
    { orgId: authUser.organizationId, role: authUser.role },
    "CANCELLED"
  );
}

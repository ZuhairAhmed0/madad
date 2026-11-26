import { EventEmitter } from "node:events";
import type { OrderStatus, PermissionStatus } from "../db/schema";
import { bumpCatalogVersion, bumpPharmacyPermVersion } from "./redis";

export interface DomainEventMap {
  "catalog.invalidated": {
    reason:
      | "DISTRIBUTOR_STATUS_CHANGED"
      | "LISTING_MUTATED"
      | "BULK_PRICE_UPDATE"
      | "BULK_IMPORT";
    distributorId?: string;
  };
  "pricing.updated": {
    distributorId: string;
    manufacturer?: string;
    affectedCount: number;
    percentChange?: number;
  };
  "order.created": {
    orderId: string;
    pharmacyId: string;
    distributorId: string;
    totalSdg: number;
  };
  "order.statusChanged": {
    orderId: string;
    pharmacyId: string;
    distributorId: string;
    status: OrderStatus;
  };
  "permission.changed": {
    distributorId: string;
    pharmacyId: string;
    status: PermissionStatus;
  };
}

export type DomainEventName = keyof DomainEventMap;
export type DomainEventListener<K extends DomainEventName> = (
  payload: DomainEventMap[K]
) => void | Promise<void>;

class TypedEventBus {
  private readonly emitter = new EventEmitter();

  emit<K extends DomainEventName>(event: K, payload: DomainEventMap[K]): boolean {
    return this.emitter.emit(event, payload);
  }

  on<K extends DomainEventName>(
    event: K,
    listener: DomainEventListener<K>
  ): this {
    this.emitter.on(event, listener);
    return this;
  }

  off<K extends DomainEventName>(
    event: K,
    listener: DomainEventListener<K>
  ): this {
    this.emitter.off(event, listener);
    return this;
  }

  once<K extends DomainEventName>(
    event: K,
    listener: DomainEventListener<K>
  ): this {
    this.emitter.once(event, listener);
    return this;
  }
}

export const eventBus = new TypedEventBus();

let coreListenersRegistered = false;

/** Register core application side-effect listeners once at startup. */
export function registerCoreEventListeners(): void {
  if (coreListenersRegistered) {
    return;
  }
  coreListenersRegistered = true;

  const runSafely = async (
    eventName: string,
    fn: () => Promise<void>
  ): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      console.error(
        `[events] failed handling ${eventName}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  eventBus.on("catalog.invalidated", () => {
    void runSafely("catalog.invalidated", () => bumpCatalogVersion());
  });

  eventBus.on("pricing.updated", () => {
    void runSafely("pricing.updated", () => bumpCatalogVersion());
  });

  eventBus.on("permission.changed", (payload) => {
    void runSafely("permission.changed", () =>
      bumpPharmacyPermVersion(payload.pharmacyId)
    );
  });
}

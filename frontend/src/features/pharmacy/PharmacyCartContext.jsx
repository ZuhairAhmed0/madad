import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "../../context/ToastContext";

const PharmacyCartContext = createContext(null);

const EMPTY_CART = {
  distributor: null,
  items: [],
  idempotencyKey: null,
};

function generateIdempotencyKey() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `madad-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDistributor(distributor) {
  return {
    id: distributor.id,
    name: distributor.name,
    salesStatus: distributor.salesStatus || "OPEN",
    orderExpiryMinutes: distributor.orderExpiryMinutes || 60,
  };
}

function toCartItem(listing) {
  return {
    listingId: listing.listingId || listing.id,
    drugId: listing.drugId,
    tradeName: listing.tradeName,
    strength: listing.strength || "",
    dosageForm: listing.dosageForm || "",
    wholesalePriceSdg: listing.wholesalePriceSdg,
    expectedPriceVersion: listing.priceVersion,
    quantity: 1,
  };
}

export function PharmacyCartProvider({ children }) {
  const toast = useToast();

  const [cart, setCart] = useState(EMPTY_CART);
  const [cartOpen, setCartOpen] = useState(false);
  const [pendingReplace, setPendingReplace] = useState(null);
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [catalogOffline, setCatalogOffline] = useState(false);

  const cartRef = useRef(cart);
  const idempotencyKeyRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const commitCart = useCallback((nextCart, resetIdempotency = true) => {
    if (resetIdempotency) {
      idempotencyKeyRef.current = null;
    }
    const resolved = {
      ...nextCart,
      idempotencyKey: idempotencyKeyRef.current,
    };
    cartRef.current = resolved;
    setCart(resolved);
    return resolved;
  }, []);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const addItem = useCallback(
    (listing, distributor) => {
      if (
        listing?.priceLocked ||
        listing?.wholesalePriceSdg === null ||
        listing?.wholesalePriceSdg === undefined
      ) {
        toast.warning("السعر مخفي؛ اطلب صلاحية الاطلاع من الموزّع أولاً");
        return { added: false, reason: "LOCKED" };
      }

      if (!listing.isAvailable) {
        toast.warning("هذا الصنف غير متوفر حالياً لدى الموزّع");
        return { added: false, reason: "UNAVAILABLE" };
      }

      const targetDist = normalizeDistributor(distributor);
      const current = cartRef.current;

      if (
        current.distributor &&
        current.items.length > 0 &&
        current.distributor.id !== targetDist.id
      ) {
        setPendingReplace({
          listing,
          distributor: targetDist,
          conflictDistributor: current.distributor,
        });
        return { conflictDistributor: current.distributor };
      }

      const listingId = listing.listingId || listing.id;
      const existingIndex = current.items.findIndex(
        (item) => item.listingId === listingId
      );

      let nextItems;
      if (existingIndex >= 0) {
        nextItems = current.items.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                wholesalePriceSdg: listing.wholesalePriceSdg,
                expectedPriceVersion: listing.priceVersion,
                quantity: Math.min(100_000, item.quantity + 1),
              }
            : item
        );
      } else {
        nextItems = [...current.items, toCartItem(listing)];
      }

      commitCart({ distributor: targetDist, items: nextItems }, true);
      toast.success(`تمت إضافة "${listing.tradeName}" إلى السلة`);
      return { added: true };
    },
    [commitCart, toast]
  );

  const replaceCartWithItem = useCallback(
    (listing, distributor) => {
      if (
        listing?.priceLocked ||
        listing?.wholesalePriceSdg === null ||
        listing?.wholesalePriceSdg === undefined
      ) {
        toast.warning("السعر مخفي؛ اطلب صلاحية الاطلاع من الموزّع أولاً");
        setPendingReplace(null);
        return;
      }

      if (!listing.isAvailable) {
        toast.warning("هذا الصنف غير متوفر حالياً لدى الموزّع");
        setPendingReplace(null);
        return;
      }

      const targetDist = normalizeDistributor(distributor);
      commitCart(
        {
          distributor: targetDist,
          items: [toCartItem(listing)],
        },
        true
      );
      setPendingReplace(null);
      toast.success(`تم تحديث السلة لطلبية "${targetDist.name}"`);
    },
    [commitCart, toast]
  );

  const confirmReplaceCart = useCallback(() => {
    if (!pendingReplace) return;
    replaceCartWithItem(pendingReplace.listing, pendingReplace.distributor);
  }, [pendingReplace, replaceCartWithItem]);

  const cancelReplaceCart = useCallback(() => {
    setPendingReplace(null);
  }, []);

  const updateQuantity = useCallback(
    (listingId, qty) => {
      const parsedQty = Math.floor(Number(qty));
      const current = cartRef.current;

      if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
        const filtered = current.items.filter(
          (item) => item.listingId !== listingId
        );
        commitCart(
          {
            distributor: filtered.length > 0 ? current.distributor : null,
            items: filtered,
          },
          true
        );
        return;
      }

      const clamped = Math.min(100_000, parsedQty);
      const nextItems = current.items.map((item) =>
        item.listingId === listingId ? { ...item, quantity: clamped } : item
      );
      commitCart({ distributor: current.distributor, items: nextItems }, true);
    },
    [commitCart]
  );

  const removeItem = useCallback(
    (listingId) => {
      const current = cartRef.current;
      const nextItems = current.items.filter(
        (item) => item.listingId !== listingId
      );
      commitCart(
        {
          distributor: nextItems.length > 0 ? current.distributor : null,
          items: nextItems,
        },
        true
      );
    },
    [commitCart]
  );

  const clearCart = useCallback(() => {
    commitCart({ distributor: null, items: [] }, true);
  }, [commitCart]);

  const applyPriceConflicts = useCallback(
    (conflicts = []) => {
      // Synchronously reset Idempotency-Key so resubmission creates a fresh key.
      idempotencyKeyRef.current = null;
      const byListingId = new Map(
        conflicts.map((conflict) => [conflict.listingId, conflict])
      );

      const current = cartRef.current;
      const nextItems = current.items.map((item) => {
        const match = byListingId.get(item.listingId);
        if (!match) return item;
        return {
          ...item,
          wholesalePriceSdg: match.currentWholesalePriceSdg,
          expectedPriceVersion: match.currentPriceVersion,
        };
      });

      commitCart({ distributor: current.distributor, items: nextItems }, true);
      return nextItems;
    },
    [commitCart]
  );

  const getOrCreateIdempotencyKey = useCallback(() => {
    if (!idempotencyKeyRef.current) {
      const generated = generateIdempotencyKey();
      idempotencyKeyRef.current = generated;
      const current = cartRef.current;
      const next = { ...current, idempotencyKey: generated };
      cartRef.current = next;
      setCart(next);
    }
    return idempotencyKeyRef.current;
  }, []);

  const totalCount = useMemo(
    () => cart.items.reduce((sum, item) => sum + item.quantity, 0),
    [cart.items]
  );

  const totalSdg = useMemo(
    () =>
      cart.items.reduce(
        (sum, item) => sum + item.wholesalePriceSdg * item.quantity,
        0
      ),
    [cart.items]
  );

  const isOffline = !browserOnline || catalogOffline;

  const value = useMemo(
    () => ({
      distributor: cart.distributor,
      items: cart.items,
      idempotencyKey: cart.idempotencyKey,
      totalCount,
      totalSdg,
      cartOpen,
      openCart,
      closeCart,
      pendingReplace,
      confirmReplaceCart,
      cancelReplaceCart,
      addItem,
      replaceCartWithItem,
      updateQuantity,
      removeItem,
      clearCart,
      applyPriceConflicts,
      getOrCreateIdempotencyKey,
      isOffline,
      setOfflineMode: setCatalogOffline,
    }),
    [
      cart,
      totalCount,
      totalSdg,
      cartOpen,
      openCart,
      closeCart,
      pendingReplace,
      confirmReplaceCart,
      cancelReplaceCart,
      addItem,
      replaceCartWithItem,
      updateQuantity,
      removeItem,
      clearCart,
      applyPriceConflicts,
      getOrCreateIdempotencyKey,
      isOffline,
    ]
  );

  return (
    <PharmacyCartContext.Provider value={value}>
      {children}
    </PharmacyCartContext.Provider>
  );
}

/** Access single-distributor pharmacy cart state and actions. */
export function usePharmacyCart() {
  const ctx = useContext(PharmacyCartContext);
  if (!ctx) {
    throw new Error("usePharmacyCart must be used within a PharmacyCartProvider");
  }
  return ctx;
}

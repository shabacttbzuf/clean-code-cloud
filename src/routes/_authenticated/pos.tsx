import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  Search,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Wallet,
  Printer,
  Pause,
  Save,
  X,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { printInvoiceHTML, type InvoiceData } from "@/lib/invoice-pdf";
import { PageHeader } from "@/components/page-header";
import { getMyPosAccessStatus, verifyMyPosPasscode } from "@/lib/pos-access.functions";
import { offlineCacheKey, withOfflineFallback, OFFLINE_INVENTORY_CACHE_MAX_AGE_MS } from "@/lib/offline-reference-cache";

export const Route = createFileRoute("/_authenticated/pos")({
  component: POSPage,
});

// POS must see the complete product and stock catalogue, even for large branches.
async function fetchAllRows<T>(query: any): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

type Product = {
  id: string;
  name: string;
  sale_price: number;
  category_id: string | null;
  is_active: boolean;
  image_url: string | null;
};
type Category = { id: string; name: string };
type Branch = { id: string; name: string; tax_number: string | null; address: string | null; phone: string | null };
type Session = { id: string; branch_id: string; status: string };
type CustomerOption = { id: string; name: string; phone: string | null; credit_limit: number };

type CartItem = { product_id: string; name: string; unit_price: number; quantity: number };
type PromotionOffer = {
  id: string; name: string; offer_type: "percentage" | "fixed" | "buy_x_get_y";
  discount_value: number; minimum_subtotal: number; max_discount: number | null;
  product_id: string | null; reward_product_id: string | null;
  buy_quantity: number; get_quantity: number;
};

type PaymentUI = "cash" | "card" | "wallet";
const paymentToDb: Record<PaymentUI, "cash" | "card" | "transfer"> = {
  cash: "cash",
  card: "card",
  wallet: "transfer",
};

const DRAFTS_KEY = "pos-drafts-v1";
type Draft = { id: string; cart: CartItem[]; discount: string; created_at: string };
type POSWorkspaceSnapshot = {
  branchId: string | null; search: string; catFilter: string; cart: CartItem[];
  discount: string; selectedPromotionId: string; selectedCustomerId: string;
  orderType: "dine_in" | "takeaway" | "delivery"; selectedTableId: string;
  deliveryName: string; deliveryPhone: string; deliveryAddress: string;
  deliveryFeeInput: string; paidAmount: string; openingBalance: string;
  paperSize: "58mm" | "80mm" | "A4"; reviewOpen: boolean; reviewMethod: PaymentUI; draftsOpen: boolean;
};
function readPOSWorkspaceSnapshot(key: string): Partial<POSWorkspaceSnapshot> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return {};
    const value = JSON.parse(raw) as Partial<POSWorkspaceSnapshot>;
    const validCart = Array.isArray(value.cart) ? value.cart.filter((item) =>
      !!item && typeof item.product_id === "string" && typeof item.name === "string" &&
      Number.isFinite(item.unit_price) && item.unit_price >= 0 &&
      Number.isInteger(item.quantity) && item.quantity > 0
    ).slice(0, 300) : [];
    return {
      ...value,
      cart: validCart,
      branchId: typeof value.branchId === "string" ? value.branchId : null,
      search: typeof value.search === "string" ? value.search.slice(0, 200) : "",
      catFilter: typeof value.catFilter === "string" ? value.catFilter : "all",
      discount: typeof value.discount === "string" ? value.discount : "0",
      selectedPromotionId: typeof value.selectedPromotionId === "string" ? value.selectedPromotionId : "",
      selectedCustomerId: typeof value.selectedCustomerId === "string" ? value.selectedCustomerId : "none",
      orderType: ["dine_in", "takeaway", "delivery"].includes(value.orderType ?? "") ? value.orderType : "takeaway",
      selectedTableId: typeof value.selectedTableId === "string" ? value.selectedTableId : "none",
      deliveryName: typeof value.deliveryName === "string" ? value.deliveryName.slice(0, 120) : "",
      deliveryPhone: typeof value.deliveryPhone === "string" ? value.deliveryPhone.slice(0, 40) : "",
      deliveryAddress: typeof value.deliveryAddress === "string" ? value.deliveryAddress.slice(0, 500) : "",
      deliveryFeeInput: typeof value.deliveryFeeInput === "string" ? value.deliveryFeeInput : "0",
      paidAmount: typeof value.paidAmount === "string" ? value.paidAmount : "",
      openingBalance: typeof value.openingBalance === "string" ? value.openingBalance : "0",
      paperSize: ["58mm", "80mm", "A4"].includes(value.paperSize ?? "") ? value.paperSize : "80mm",
      reviewOpen: value.reviewOpen === true,
      draftsOpen: value.draftsOpen === true,
      reviewMethod: ["cash", "card", "wallet"].includes(value.reviewMethod ?? "") ? value.reviewMethod : "cash",
    };
  } catch { return {}; }
}
function savePOSWorkspaceSnapshot(key: string, snapshot: POSWorkspaceSnapshot) {
  try { sessionStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* session storage is best-effort */ }
}

function POSPage() {
  return <POSWorkspace />;
}

function loadDrafts(storageKey: string): Draft[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((draft): draft is Draft => {
      if (!draft || typeof draft !== "object") return false;
      const candidate = draft as Partial<Draft>;
      if (typeof candidate.id !== "string" || typeof candidate.discount !== "string" ||
          typeof candidate.created_at !== "string" || !Number.isFinite(Date.parse(candidate.created_at)) ||
          !Array.isArray(candidate.cart) || candidate.cart.length === 0) return false;
      return candidate.cart.every((item) =>
        !!item && typeof item.product_id === "string" && typeof item.name === "string" &&
        Number.isFinite(item.unit_price) && item.unit_price >= 0 &&
        Number.isInteger(item.quantity) && item.quantity > 0
      );
    }).slice(0, 100);
  } catch {
    return [];
  }
}
function saveDrafts(list: Draft[], storageKey: string) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {
    // Draft persistence is best-effort when browser storage is unavailable.
  }
}

function POSWorkspace() {
  const { tenantId, tenant, userId, membership, role, isAdmin, isSuperOwner } = useActiveTenant();
  const qc = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const updateConnection = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        void qc.invalidateQueries({ queryKey: ["products-pos", tenantId] });
        void qc.invalidateQueries({ queryKey: ["categories-min", tenantId] });
        void qc.invalidateQueries({ queryKey: ["branches-active", tenantId] });
        void qc.invalidateQueries({ queryKey: ["pos-inventory", tenantId] });
        void qc.invalidateQueries({ queryKey: ["open-session"] });
      }
    };
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [qc, tenantId]);
  const offlineScope = {
    tenantId: tenantId ?? "no-tenant",
    userId: userId ?? "no-user",
    companyId: membership?.company_id,
    branchId: membership?.branch_id,
  };
  const getPosAccessStatus = useServerFn(getMyPosAccessStatus);
  const verifyPosPasscode = useServerFn(verifyMyPosPasscode);
  const [posPasscode, setPosPasscode] = useState("");
  const [passcodeDialogOpen, setPasscodeDialogOpen] = useState(false);
  const [verifyingPasscode, setVerifyingPasscode] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pendingOpenShift, setPendingOpenShift] = useState(false);
  const unlockStorageKey = `pos-access-unlocked-v1:${tenantId ?? "none"}:${userId ?? "none"}`;
  const posAccessStatus = useQuery({
    queryKey: ["pos-access-status", tenantId, userId],
    queryFn: () => getPosAccessStatus({ data: { tenant_id: tenantId! } }),
    enabled: !!tenantId && !!userId,
    staleTime: 30_000,
  });
  useEffect(() => {
    try {
      setUnlocked(typeof window !== "undefined" && window.sessionStorage.getItem(unlockStorageKey) === "1");
    } catch {
      setUnlocked(false);
    }
    setPosPasscode("");
  }, [unlockStorageKey]);
  const workspaceStorageKey = `pos-workspace-v1:${tenantId ?? "none"}:${userId ?? "none"}:${membership?.company_id ?? "none"}:${membership?.branch_id ?? "none"}`;
  const restoredWorkspace = useMemo(() => readPOSWorkspaceSnapshot(workspaceStorageKey), [workspaceStorageKey]);

  const cashierProfile = useQuery({
    queryKey: ["pos-cashier-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const [branchId, setBranchId] = useState<string | null>(membership?.branch_id ?? restoredWorkspace.branchId ?? null);
  const [search, setSearch] = useState(restoredWorkspace.search ?? "");
  const [catFilter, setCatFilter] = useState<string>(restoredWorkspace.catFilter ?? "all");
  const [cart, setCart] = useState<CartItem[]>(restoredWorkspace.cart ?? []);
  useEffect(() => {
    const dirty = cart.length > 0;
    window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
      detail: { path: "/pos", dirty, source: "pos-cart" },
    }));
  }, [cart]);
  const [discount, setDiscount] = useState(restoredWorkspace.discount ?? "0");
  const [selectedPromotionId, setSelectedPromotionId] = useState(restoredWorkspace.selectedPromotionId ?? "");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(restoredWorkspace.selectedCustomerId ?? "none");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">(restoredWorkspace.orderType ?? "takeaway");
  const [selectedTableId, setSelectedTableId] = useState<string>(restoredWorkspace.selectedTableId ?? "none");
  const [deliveryName, setDeliveryName] = useState(restoredWorkspace.deliveryName ?? "");
  const [deliveryPhone, setDeliveryPhone] = useState(restoredWorkspace.deliveryPhone ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(restoredWorkspace.deliveryAddress ?? "");
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(restoredWorkspace.deliveryFeeInput ?? "0");
  const [paidAmount, setPaidAmount] = useState(restoredWorkspace.paidAmount ?? "");
  const [openingBalance, setOpeningBalance] = useState(restoredWorkspace.openingBalance ?? "0");
  // Keep paused invoices isolated per signed-in user, tenant, and branch on shared devices.
  const draftsStorageKey = `${DRAFTS_KEY}:${tenantId ?? "none"}:${userId ?? "none"}:${branchId ?? "none"}`;
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(restoredWorkspace.draftsOpen ?? false);
  useEffect(() => {
    setDrafts(loadDrafts(draftsStorageKey));
  }, [draftsStorageKey]);
  const [paperSize, setPaperSize] = useState<"58mm" | "80mm" | "A4">(restoredWorkspace.paperSize ?? "80mm");
  const [reviewOpen, setReviewOpen] = useState(restoredWorkspace.reviewOpen ?? false);
  const [reviewMethod, setReviewMethod] = useState<PaymentUI>(restoredWorkspace.reviewMethod ?? "cash");
  const printWindowRef = useRef<Window | null>(null);
  useEffect(() => {
    savePOSWorkspaceSnapshot(workspaceStorageKey, {
      branchId, search, catFilter, cart, discount, selectedPromotionId, selectedCustomerId,
      orderType, selectedTableId, deliveryName, deliveryPhone, deliveryAddress,
      deliveryFeeInput, paidAmount, openingBalance, paperSize, reviewOpen, reviewMethod, draftsOpen,
    });
  }, [workspaceStorageKey, branchId, search, catFilter, cart, discount, selectedPromotionId,
    selectedCustomerId, orderType, selectedTableId, deliveryName, deliveryPhone, deliveryAddress,
    deliveryFeeInput, paidAmount, openingBalance, paperSize, reviewOpen, reviewMethod, draftsOpen]);

  const beginCheckout = (method: PaymentUI) => {
    if (!isOnline || !navigator.onLine) {
      toast.error("لا يمكن إتمام البيع دون اتصال. حُفظت السلة كمسودة محلية فقط.");
      return;
    }
    if (inventory.isLoading || inventory.isError) {
      toast.error("يلزم تحديث بيانات المخزون والاتصال بالخادم قبل البيع.");
      return;
    }
    if (cart.length === 0) return toast.info("الفاتورة فارغة");
    setReviewMethod(method);
    setReviewOpen(true);
  };

  const branches = useQuery({
    queryKey: ["branches-active", tenantId, userId, membership?.company_id, membership?.branch_id, isSuperOwner],
    queryFn: async (): Promise<Branch[]> =>
      withOfflineFallback(offlineCacheKey(offlineScope, "pos-branches"), async () => {
        let query = supabase
          .from("branches")
          .select("id, name, tax_number, address, phone")
          .eq("tenant_id", tenantId!)
          .eq("is_active", true);
        // Every non-platform account is limited to its assigned branch or company.
        if (!isSuperOwner && membership?.branch_id) {
          query = query.eq("id", membership.branch_id);
        } else if (!isSuperOwner && membership?.company_id) {
          query = query.eq("company_id", membership.company_id);
        }
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Branch[];
      }),
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (membership?.branch_id && !isSuperOwner && branchId !== membership.branch_id) {
      setBranchId(membership.branch_id);
    }
  }, [membership?.branch_id, isAdmin, isSuperOwner, branchId]);

  useEffect(() => {
    if (branchId) return;
    if (membership?.branch_id) setBranchId(membership.branch_id);
    else if (branches.data && branches.data.length > 0) setBranchId(branches.data[0].id);
  }, [branches.data, membership, branchId]);

  const previousBranchIdRef = useRef(branchId);
  useEffect(() => {
    if (previousBranchIdRef.current === branchId) return;
    previousBranchIdRef.current = branchId;
    setSelectedPromotionId("");
    setSelectedTableId("none");
  }, [branchId]);

  const currentBranch = useMemo(
    () => branches.data?.find((b) => b.id === branchId) ?? null,
    [branches.data, branchId],
  );

  const activePromotions = useQuery({
    queryKey: ["pos-active-promotions", tenantId, branchId],
    queryFn: async (): Promise<PromotionOffer[]> => {
      const now = new Date().toISOString();
      const { data, error } = await (supabase.from("promotional_offers" as any) as any)
        .select("id,name,offer_type,discount_value,minimum_subtotal,max_discount,product_id,reward_product_id,buy_quantity,get_quantity")
        .eq("tenant_id", tenantId!).eq("status", "active")
        .or(`branch_id.is.null,branch_id.eq.${branchId}`)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PromotionOffer[];
    },
    enabled: !!tenantId && !!branchId,
    staleTime: 15_000,
  });



  const selectedPromotion = activePromotions.data?.find((offer) => offer.id === selectedPromotionId) ?? null;



  const restaurantTables = useQuery({
    queryKey: ["pos-restaurant-tables", tenantId, branchId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurant_tables" as any) as any)
        .select("id,name,capacity,section_name,status,current_sale_id")
        .eq("tenant_id", tenantId!).eq("branch_id", branchId!)
        .eq("status", "active").is("current_sale_id", null).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{id:string;name:string;capacity:number;section_name:string|null;status:string;current_sale_id:string|null}>;
    },
    enabled: !!tenantId && !!branchId,
    refetchInterval: 15_000,
  });

  const customers = useQuery({
    queryKey: ["pos-customers", tenantId],
    queryFn: async (): Promise<CustomerOption[]> => {
      const { data, error } = await (supabase.from("customers" as any) as any)
        .select("id,name,phone,credit_limit").eq("tenant_id", tenantId!).eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as CustomerOption[];
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const categories = useQuery({
    queryKey: ["categories-min", tenantId, userId, membership?.company_id, membership?.branch_id],
    queryFn: async (): Promise<Category[]> =>
      withOfflineFallback(offlineCacheKey(offlineScope, "pos-categories"), async () => {
        const { data, error } = await supabase.from("categories").select("id, name").eq("tenant_id", tenantId!).order("sort_order");
        if (error) throw error;
        return (data ?? []) as Category[];
      }),
    enabled: !!tenantId,
  });

  const products = useQuery({
    queryKey: ["products-pos", tenantId, userId, membership?.company_id, membership?.branch_id],
    queryFn: async (): Promise<Product[]> =>
      withOfflineFallback(offlineCacheKey(offlineScope, "pos-products"), () =>
        fetchAllRows<Product>(
          supabase.from("products")
            .select("id, name, sale_price, category_id, is_active, image_url")
            .eq("tenant_id", tenantId!)
            .eq("is_active", true)
            .order("name")
            .order("id"),
        ),
      ),
    enabled: !!tenantId,
  });

  const posPromos = useQuery({
    queryKey: ["pos-marketing-campaigns", tenantId, membership?.company_id ?? "tenant"],
    queryFn: async () => {
      const now = new Date().toISOString();
      let query = supabase.from("marketing_campaigns")
        .select("id,title,description,image_url,target_url,starts_at,ends_at")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .eq("placement", "pos_promo")
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("sort_order")
        .limit(3);
      if (membership?.company_id) {
        query = query.or(`company_id.is.null,company_id.eq.${membership.company_id}`);
      } else if (!isSuperOwner && !(role === "owner" && !membership?.company_id)) {
        // Do not expose company-specific campaigns to branch-only or regular tenant members.
        query = query.is("company_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      const nowMs = Date.now();
      return (data ?? []).filter((campaign) =>
        (!campaign.starts_at || new Date(campaign.starts_at).getTime() <= nowMs) &&
        (!campaign.ends_at || new Date(campaign.ends_at).getTime() > nowMs)
      );
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
  useEffect(() => {
    for (const promo of posPromos.data ?? []) {
      void (supabase.rpc as any)("record_marketing_campaign_event", {
        _campaign_id: promo.id,
        _event_type: "impression",
      }).catch((error: unknown) => console.warn("POS campaign impression tracking failed", error));
    }
  }, [posPromos.data]);


  const inventory = useQuery({
    queryKey: ["pos-inventory", tenantId, userId, membership?.company_id, branchId],
    queryFn: async () =>
      withOfflineFallback(
        offlineCacheKey({ ...offlineScope, branchId }, "pos-inventory"),
        () =>
          fetchAllRows<{ product_id: string; quantity: number }>(
            supabase.from("inventory")
              .select("product_id, quantity")
              .eq("tenant_id", tenantId!)
              .eq("branch_id", branchId!)
              .order("product_id"),
          ),
        OFFLINE_INVENTORY_CACHE_MAX_AGE_MS,
      ),
    enabled: !!tenantId && !!branchId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const stockByProduct = useMemo(
    () => new Map((inventory.data ?? []).map((row) => [row.product_id, Number(row.quantity)])),
    [inventory.data],
  );

  const openSession = useQuery({
    queryKey: ["open-session", userId, branchId],
    queryFn: async (): Promise<Session | null> => {
      if (!userId) return null;
      const { data, error } = await supabase.from("cash_sessions").select("id, branch_id, status").eq("tenant_id", tenantId!)
        .eq("branch_id", branchId!)
        .eq("cashier_id", userId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return (data as Session | null) ?? null;
    },
    enabled: !!userId && !!tenantId && !!branchId,
  });

  const filteredProducts = useMemo(() => {
    const list = products.data ?? [];
    const s = search.trim().toLowerCase();
    return list.filter((p) => {
      if (catFilter !== "all" && p.category_id !== catFilter) return false;
      if (!s) return true;
      return p.name.toLowerCase().includes(s);
    });
  }, [products.data, search, catFilter]);

  const addToCart = (p: Product) => {
    const offline = !isOnline || !navigator.onLine;
    if (!offline && (inventory.isLoading || inventory.isError)) {
      toast.error("لا يمكن إضافة المنتج قبل التحقق من المخزون");
      return;
    }
    const available = stockByProduct.get(p.id);
    const current = cart.find((item) => item.product_id === p.id)?.quantity ?? 0;
    if (!offline && available === undefined) {
      toast.error("لا يوجد رصيد مخزون مسجل لهذا المنتج في الفرع");
      return;
    }
    if (!offline && available !== undefined && available <= current) {
      toast.error(available <= 0 ? "المنتج غير متوفر في المخزون" : "الكمية المطلوبة تتجاوز المخزون المتاح");
      return;
    }
    if (offline) toast.info("أضيف المنتج إلى مسودة محلية؛ لم يتم التحقق من المخزون أو اعتماد البيع.");
    setCart((prev) => {
      const found = prev.find((item) => item.product_id === p.id);
      if (found) return prev.map((item) => (item.product_id === p.id ? { ...item, quantity: item.quantity + 1 } : item));
      return [...prev, { product_id: p.id, name: p.name, unit_price: Number(p.sale_price), quantity: 1 }];
    });
  };
  const inc = (id: string) => {
    const item = cart.find((entry) => entry.product_id === id);
    const available = stockByProduct.get(id);
    const offline = !isOnline || !navigator.onLine;
    if (!item || (!offline && (inventory.isLoading || inventory.isError || available === undefined || item.quantity >= available))) {
      toast.error("لا يمكن زيادة الكمية؛ تحقق من رصيد المخزون");
      return;
    }
    if (offline) toast.info("تعديل محلي للمسودة فقط؛ الكمية غير مؤكدة حتى الاتصال بالخادم.");
    setCart((prev) => prev.map((entry) => (entry.product_id === id ? { ...entry, quantity: entry.quantity + 1 } : entry)));
  };
  const dec = (id: string) => setCart((p) => p.flatMap((i) => (i.product_id === id ? (i.quantity > 1 ? [{ ...i, quantity: i.quantity - 1 }] : []) : [i])));
  const remove = (id: string) => setCart((p) => p.filter((i) => i.product_id !== id));

  const totalQty = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const manualDiscount = Math.max(0, Number(discount) || 0);
  const promotionDiscount = useMemo(() => {
    const offer = selectedPromotion;
    if (!offer || subtotal < Number(offer.minimum_subtotal)) return 0;
    const eligible = cart.filter((item) => !offer.product_id || item.product_id === offer.product_id);
    const eligibleSubtotal = eligible.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    if (eligibleSubtotal <= 0) return 0;
    let amount = 0;
    if (offer.offer_type === "percentage") amount = eligibleSubtotal * Number(offer.discount_value) / 100;
    else if (offer.offer_type === "fixed") amount = Math.min(eligibleSubtotal, Number(offer.discount_value));
    else {
      const rewardId = offer.reward_product_id || offer.product_id;
      const buyQty = cart.filter((item) => item.product_id === offer.product_id).reduce((sum, item) => sum + item.quantity, 0);
      const reward = cart.find((item) => item.product_id === rewardId);
      const rewardQty = cart.filter((item) => item.product_id === rewardId).reduce((sum, item) => sum + item.quantity, 0);
      const freeQty = Math.min(rewardQty, Math.floor(buyQty / Math.max(1, Number(offer.buy_quantity))) * Number(offer.get_quantity));
      amount = freeQty * (reward?.unit_price ?? 0);
    }
    if (offer.max_discount !== null) amount = Math.min(amount, Number(offer.max_discount));
    return Math.max(0, Math.min(amount, subtotal - manualDiscount));
  }, [selectedPromotion, cart, subtotal, manualDiscount]);
  const disc = Math.min(subtotal, manualDiscount + promotionDiscount);
  const taxable = Math.max(0, subtotal - disc);
  const taxRate = Number(tenant?.tax_rate ?? 0);
  const taxAmount = +(taxable * (taxRate / 100)).toFixed(2);
  const deliveryFee = orderType === "delivery" ? Math.max(0, Number(deliveryFeeInput) || 0) : 0;
  const total = +(taxable + taxAmount + deliveryFee).toFixed(2);
  const selectedTable = restaurantTables.data?.find((table) => table.id === selectedTableId) ?? null;

  const openSess = useMutation({
    mutationFn: async () => {
      if (!tenantId || !branchId || !userId) throw new Error("Missing context");
      const ob = Math.max(0, Number(openingBalance) || 0);
      const { error } = await supabase.from("cash_sessions").insert({
        tenant_id: tenantId,
        branch_id: branchId,
        cashier_id: userId,
        opening_balance: ob,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["open-session"] });
      toast.success("تم فتح الوردية");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل فتح الوردية"),
  });

  const requestPosUnlock = (openShiftAfterUnlock = false) => {
    if (posAccessStatus.isLoading) {
      toast.info("انتظر حتى يكتمل التحقق من إعداد كلمة المرور.");
      return;
    }
    if (posAccessStatus.isError) {
      toast.error("تعذر التحقق من إعداد كلمة مرور نقطة البيع. أعد المحاولة.");
      return;
    }
    if (!posAccessStatus.data?.configured) {
      toast.error("أنشئ كلمة مرور نقطة البيع أولاً من ملفك الشخصي.");
      return;
    }
    setPendingOpenShift(openShiftAfterUnlock);
    setPosPasscode("");
    setPasscodeDialogOpen(true);
  };

  const verifyAndOpenPos = async () => {
    if (!tenantId || !posPasscode || verifyingPasscode) return;
    setVerifyingPasscode(true);
    try {
      const result = await verifyPosPasscode({ data: { tenant_id: tenantId, passcode: posPasscode } });
      if (!result.ok) {
        toast.error(result.locked
          ? "تم إيقاف المحاولة مؤقتاً لكثرة المحاولات. حاول لاحقاً."
          : "كلمة مرور نقطة البيع غير صحيحة.");
        return;
      }
      try { window.sessionStorage.setItem(unlockStorageKey, "1"); } catch { /* session storage is optional */ }
      setUnlocked(true);
      setPasscodeDialogOpen(false);
      setPosPasscode("");
      if (pendingOpenShift) {
        setPendingOpenShift(false);
        await openSess.mutateAsync();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر التحقق من كلمة المرور.");
    } finally {
      setVerifyingPasscode(false);
    }
  };

  const buildInvoice = (
    sale: {
      invoice_no: number;
      created_at: string;
      subtotal: number;
      discount: number;
      tax_amount: number;
      total: number;
    },
    items: Array<{ name: string; unit_price: number; quantity: number }>,
    method: PaymentUI,
    paymentMethod?: string,
  ): InvoiceData & {
    address?: string | null; phone?: string | null; tenant_name?: string | null; logo_url?: string | null;
  } => ({
    invoice_no: sale.invoice_no,
    created_at: sale.created_at,
    branch_name: currentBranch?.name ?? "",
    cashier_name: cashierProfile.data?.full_name?.trim() || cashierProfile.data?.username || "—",
    tax_number: currentBranch?.tax_number,
    address: currentBranch?.address,
    phone: currentBranch?.phone,
    tenant_name: tenant?.name ?? null,
    logo_url: tenant?.logo_url ?? null,
    currency: tenant?.currency ?? "SAR",
    order_type: orderType,
    table_name: selectedTable?.name ?? null,
    customer_name: orderType === "delivery" ? deliveryName : customers.data?.find((customer) => customer.id === selectedCustomerId)?.name ?? null,
    customer_phone: orderType === "delivery" ? deliveryPhone : customers.data?.find((customer) => customer.id === selectedCustomerId)?.phone ?? null,
    delivery_fee: Number((sale as any).delivery_fee ?? deliveryFee),
    delivery_customer_name: orderType === "delivery" ? deliveryName : null,
    delivery_customer_phone: orderType === "delivery" ? deliveryPhone : null,
    delivery_address: orderType === "delivery" ? deliveryAddress : null,
    paid_amount: paidAmount.trim() === "" ? Number(sale.total) : Number(paidAmount),
    due_amount: Math.max(0, Number(sale.total) - (paidAmount.trim() === "" ? Number(sale.total) : Number(paidAmount))),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    tax_amount: Number(sale.tax_amount),
    total: Number(sale.total),
    payment_method: paymentMethod ?? paymentToDb[method],
    items: items.map((i) => ({
      product_name: i.name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_total: +(i.unit_price * i.quantity).toFixed(2),
    })),
  });

  const checkoutMut = useMutation({
    mutationFn: async (method: PaymentUI) => {
      if (!navigator.onLine) throw new Error("لا يمكن إتمام البيع دون اتصال؛ لم يتم تسجيل أي عملية مالية.");
      if (!tenantId || !branchId || !userId) throw new Error("سياق ناقص");
      if (cart.length === 0) throw new Error("السلة فارغة");
      if (!openSession.data) throw new Error("يجب فتح وردية أولاً");

      const dbMethod = paymentToDb[method];
      const initialPaid = paidAmount.trim() === "" ? total : Number(paidAmount);
      if (!Number.isFinite(initialPaid) || initialPaid < 0 || initialPaid > total) {
        throw new Error("مبلغ المدفوع يجب أن يكون بين صفر وإجمالي الفاتورة");
      }
      if (orderType === "dine_in" && (!selectedTableId || selectedTableId === "none")) {
        throw new Error("اختر طاولة متاحة للطلب المحلي");
      }
      if (orderType === "delivery" && (!deliveryName.trim() || !deliveryPhone.trim() || !deliveryAddress.trim())) {
        throw new Error("أدخل اسم عميل التوصيل ورقم هاتفه وعنوانه");
      }
      if (orderType === "delivery" && (!Number.isFinite(Number(deliveryFeeInput)) || Number(deliveryFeeInput) < 0)) {
        throw new Error("أدخل رسوم توصيل صحيحة");
      }
      let { data: sale, error: saleErr } = await (supabase.rpc as any)("create_pos_order", {
        _tenant_id: tenantId,
        _branch_id: branchId,
        _cashier_id: userId,
        _session_id: openSession.data.id,
        _discount: manualDiscount,
        _customer_id: selectedCustomerId === "none" ? null : selectedCustomerId,
        _paid_amount: initialPaid,
        _paid_method: dbMethod,
        _items: cart.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
        _order_type: orderType,
        _table_id: orderType === "dine_in" ? selectedTableId : null,
        _delivery_customer_name: orderType === "delivery" ? deliveryName.trim() : null,
        _delivery_customer_phone: orderType === "delivery" ? deliveryPhone.trim() : null,
        _delivery_address: orderType === "delivery" ? deliveryAddress.trim() : null,
        _delivery_fee: deliveryFee,
        ...(selectedPromotionId ? { _promotion_id: selectedPromotionId } : {}),
      });

      // Keep legacy takeaway checkout operational until the additive database
      // migration is deployed. Never silently downgrade dine-in or delivery.
      const missingOrderRpc = saleErr && (
        saleErr.code === "PGRST202" ||
        /could not find the function|function public\.create_pos_order.*does not exist/i.test(saleErr.message ?? "")
      );
      if (missingOrderRpc) {
        if (selectedPromotionId) {
          throw new Error("يتطلب تطبيق العروض الترويجية تحديث قاعدة البيانات أولاً؛ لم يتم إصدار الفاتورة دون التحقق من العرض.");
        }
        if (orderType !== "takeaway" || deliveryFee > 0) {
          throw new Error("يتطلب الطلب المحلي والتوصيل تطبيق تحديث قاعدة البيانات أولاً. يمكنك إكمال الطلب السفري حالياً.");
        }
        const legacy = await (supabase.rpc as any)("create_sale_with_customer", {
          _tenant_id: tenantId,
          _branch_id: branchId,
          _cashier_id: userId,
          _session_id: openSession.data.id,
          _discount: manualDiscount,
          _customer_id: selectedCustomerId === "none" ? null : selectedCustomerId,
          _paid_amount: initialPaid,
          _paid_method: dbMethod,
          _items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
          })),
        });
        sale = legacy.data;
        saleErr = legacy.error;
      }
      if (saleErr) throw saleErr;
      if (!sale) throw new Error("لم يتم إنشاء الفاتورة.");

      // Read the committed item snapshots for printing. A read failure must
      // not cause a retry of an already-committed sale.
      const { data: savedItems, error: savedItemsError } = await supabase
        .from("sale_items")
        .select("product_name, quantity, unit_price")
        .eq("sale_id", sale.id);
      if (savedItemsError) console.error("Could not load committed sale items", savedItemsError);

      const invoiceItems = savedItems?.map((item) => ({
        name: item.product_name,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })) ?? cart.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));

      return { sale, method, items: invoiceItems };
    },
    onSuccess: ({ sale, method, items }) => {
      setReviewOpen(false);
      toast.success(`تم إصدار فاتورة #${sale.invoice_no}`);
      const inv = buildInvoice(sale, items, method, sale.payment_method);
      try {
        const printed = printInvoiceHTML(inv, paperSize, printWindowRef.current);
        if (!printed) toast.warning("تم إصدار الفاتورة، لكن نافذة الطباعة لم تفتح. استخدم زر معاينة الفاتورة.");
      } catch (e) {
        console.error(e);
        toast.warning("تم إصدار الفاتورة، وتعذرت الطباعة التلقائية. يمكنك معاينتها وإعادة طباعتها.");
      } finally {
        printWindowRef.current = null;
      }
      setCart([]);
      setDiscount("0");
      setSelectedPromotionId("");
      setSelectedCustomerId("none");
      setPaidAmount("");
      setOrderType("takeaway");
      setSelectedTableId("none");
      setDeliveryName("");
      setDeliveryPhone("");
      setDeliveryAddress("");
      setDeliveryFeeInput("0");
      void qc.invalidateQueries({ queryKey: ["pos-restaurant-tables", tenantId, branchId] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["pos-inventory", tenantId, branchId] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
    },
    onError: (e) => {
      printWindowRef.current?.close();
      printWindowRef.current = null;
      const rawMessage = e instanceof Error ? e.message : "";
      const message = /insufficient stock|inventory record missing/i.test(rawMessage)
        ? "المخزون غير كافٍ أو لم يتم تسجيل الرصيد الافتتاحي لهذا المنتج في الفرع."
        : rawMessage || "فشل إتمام البيع";
      toast.error(message);
    },
  });

  const confirmCheckout = () => {
    if (!navigator.onLine) {
      toast.error("انقطع الاتصال؛ لم يتم إرسال البيع. احتفظ بالمسودة ثم أعد المحاولة عند عودة الإنترنت.");
      return;
    }
    if (checkoutMut.isPending || cart.length === 0) return;
    printWindowRef.current?.close();
    printWindowRef.current = window.open("", "_blank", "width=420,height=720");
    checkoutMut.mutate(reviewMethod);
  };

  const holdOrDraft = (label: string) => {
    if (cart.length === 0) return toast.info("السلة فارغة");
    const list = loadDrafts(draftsStorageKey);
    const d: Draft = { id: crypto.randomUUID(), cart, discount, created_at: new Date().toISOString() };
    list.unshift(d);
    saveDrafts(list, draftsStorageKey);
    setDrafts(list);
    setCart([]);
    setDiscount("0");
    toast.success(label);
  };
  const restoreDraft = (d: Draft) => {
    const list = loadDrafts(draftsStorageKey).filter((x) => x.id !== d.id);
    if (cart.length > 0) list.unshift({ id: crypto.randomUUID(), cart, discount, created_at: new Date().toISOString() });
    saveDrafts(list, draftsStorageKey);
    setDrafts(list);
    setCart(d.cart);
    setDiscount(d.discount);
    setDraftsOpen(false);
    if (cart.length > 0) toast.info("حُفظت الفاتورة الحالية كمسودة قبل استعادة المختارة");
  };
  const deleteDraft = (id: string) => {
    const list = loadDrafts(draftsStorageKey).filter((draft) => draft.id !== id);
    saveDrafts(list, draftsStorageKey);
    setDrafts(list);
    toast.success("تم حذف المسودة من هذا الجهاز");
  };
  const getDraftTotal = (draft: Draft) => {
    const subtotal = draft.cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const discountValue = Math.min(subtotal, Math.max(0, Number(draft.discount) || 0));
    return subtotal - discountValue + (subtotal - discountValue) * (taxRate / 100);
  };

  const printPreview = () => {
    if (cart.length === 0) return toast.info("السلة فارغة");
    const inv = buildInvoice(
      {
        invoice_no: 0,
        created_at: new Date().toISOString(),
        subtotal,
        discount: disc,
        tax_amount: taxAmount,
        total,
      },
      cart,
      "cash",
    );
    printInvoiceHTML(inv, paperSize);
  };

  if (branches.isLoading || openSession.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!branches.data || branches.data.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="نقطة البيع" />
        <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد فروع مفعّلة. أنشئ فرعاً أولاً من صفحة الفروع.</CardContent></Card>
      </div>
    );
  }

  if (openSession.data && !unlocked) {
    return (
      <div className="mx-auto max-w-md space-y-4" dir="rtl">
        <PageHeader title="نقطة البيع جاهزة" subtitle="اضغط فتح نقطة البيع ثم أدخل كلمة المرور الخاصة بك للبدء." />
        <Card><CardContent className="space-y-4 p-6 text-center">
          <KeyRound className="mx-auto h-10 w-10 text-primary" />
          <p className="text-sm text-muted-foreground">لن تظهر نافذة كلمة المرور عند مجرد عرض التبويب؛ ستظهر فقط عند اختيار فتح نقطة البيع.</p>
          <Button className="w-full" onClick={() => requestPosUnlock(false)} disabled={posAccessStatus.isLoading}>
            <KeyRound className="ml-2 h-4 w-4" /> فتح نقطة البيع
          </Button>
          {posAccessStatus.isError && <p role="alert" className="text-xs text-destructive">تعذر التحقق من إعداد كلمة المرور. أعد المحاولة.</p>}
          {!posAccessStatus.data?.configured && !posAccessStatus.isLoading && (
            <Link to="/profile" className="text-sm text-primary underline">إعداد كلمة المرور من ملفي الشخصي</Link>
          )}
        </CardContent></Card>
        <POSPasscodeDialog
          open={passcodeDialogOpen}
          onOpenChange={setPasscodeDialogOpen}
          passcode={posPasscode}
          onPasscodeChange={setPosPasscode}
          verifying={verifyingPasscode}
          onSubmit={() => void verifyAndOpenPos()}
        />
      </div>
    );
  }

  if (!openSession.data && (isOnline || !unlocked)) {
    return (
      <div className="space-y-4">
        <PageHeader title="نقطة البيع" subtitle="افتح وردية للبدء بالبيع" />
        <Card className="max-w-md">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>الفرع</Label>
              <Select value={branchId ?? ""} onValueChange={setBranchId} disabled={!isAdmin && !isSuperOwner}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.data.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>رصيد بداية الوردية</Label>
              <Input type="number" min="0" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
            </div>
            <Button className="w-full" disabled={!branchId || openSess.isPending || posAccessStatus.isLoading} onClick={() => unlocked ? openSess.mutate() : requestPosUnlock(true)}>
              {openSess.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              موافق — فتح الوردية والبدء بالبيع
            </Button>
            {posAccessStatus.isError && <p role="alert" className="text-xs text-destructive">تعذر التحقق من إعداد كلمة المرور. أعد المحاولة.</p>}
            {!posAccessStatus.data?.configured && !posAccessStatus.isLoading && !posAccessStatus.isError && (
              <Link to="/profile" className="block text-center text-xs text-primary underline">إعداد كلمة مرور نقطة البيع من الملف الشخصي</Link>
            )}
            <POSPasscodeDialog
              open={passcodeDialogOpen}
              onOpenChange={setPasscodeDialogOpen}
              passcode={posPasscode}
              onPasscodeChange={setPosPasscode}
              verifying={verifyingPasscode}
              onSubmit={() => void verifyAndOpenPos()}
            />
          </CardContent>
        </Card>
        {drafts.length > 0 && (
          <Card>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div><h2 className="font-bold">لديك {drafts.length} فاتورة مسودة</h2><p className="text-xs text-muted-foreground">يمكنك استعادتها الآن أو بعد فتح الوردية.</p></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setDraftsOpen((value) => !value)}>{draftsOpen ? "إخفاء" : "عرض المسودات"}</Button>
              </div>
              {draftsOpen && drafts.map((draft, index) => (
                <div key={draft.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0"><div className="text-sm font-semibold">مسودة #{drafts.length - index}</div><div className="text-xs text-muted-foreground">{draft.cart.length} أصناف • {formatMoney(getDraftTotal(draft))} {tenant?.currency ?? ""}</div></div>
                  <div className="flex gap-1"><Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => deleteDraft(draft.id)}>حذف</Button><Button type="button" size="sm" onClick={() => restoreDraft(draft)}>استعادة وإكمال</Button></div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const currency = tenant?.currency ?? "";

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[420px] flex-col gap-2 overflow-hidden p-1">
      {!isOnline ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" dir="rtl">
          وضع عدم الاتصال: يعرض النظام بيانات الأصناف والتصنيفات المحفوظة سابقاً، ويمكن إعداد مسودات محلية فقط. المخزون والأسعار والعروض غير مؤكدة، وإتمام البيع والمحاسبة متوقف حتى عودة الاتصال.
        </div>
      ) : null}
      <PageHeader
        title="نقطة البيع"
        subtitle={currentBranch?.name}
        action={
          <div className="flex items-center gap-2">
            <Select value={paperSize} onValueChange={(v) => setPaperSize(v as "58mm" | "80mm" | "A4")}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">حراري 58mm</SelectItem>
                <SelectItem value="80mm">حراري 80mm</SelectItem>
                <SelectItem value="A4">ورق A4</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setDraftsOpen(true)}>المسودات ({drafts.length})</Button>
            <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">وردية مفتوحة</span>
          </div>
        }
      />

      {posPromos.isError && (
        <div className="shrink-0 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          تعذر تحميل عروض نقطة البيع. <button type="button" className="underline" onClick={() => posPromos.refetch()}>إعادة المحاولة</button>
        </div>
      )}
      {posPromos.data && posPromos.data.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto">
          {posPromos.data.map((promo) => {
            const card = (
              <div className="relative flex h-14 min-w-[220px] flex-1 items-center overflow-hidden rounded-lg border bg-card px-3">
                {promo.image_url && <img src={promo.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
                <div className="relative z-[1] min-w-0"><div className="truncate text-xs font-bold">{promo.title}</div>{promo.description && <div className="truncate text-[10px] text-muted-foreground">{promo.description}</div>}</div>
              </div>
            );
            return promo.target_url ? <a key={promo.id} href={promo.target_url} target="_blank" rel="noopener noreferrer" onClick={() => void (supabase.rpc as any)("record_marketing_campaign_event", { _campaign_id: promo.id, _event_type: "click" }).catch((error: unknown) => console.warn("POS campaign click tracking failed", error))} className="min-w-0 flex-1">{card}</a> : <div key={promo.id} className="min-w-0 flex-1">{card}</div>;
          })}
        </div>
      )}

      {/* Responsive POS: category chips, dense product grid and a reviewable invoice. */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-2 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <Card className="overflow-hidden">
            <CardContent className="p-2">
              <div className="mb-1 flex items-center justify-between border-b pb-1">
                <h2 className="text-xs font-bold">الأقسام</h2>
                <span className="text-[10px] text-muted-foreground">{(categories.data?.length ?? 0) + 1} قسم</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                <CategoryTile label="الكل" active={catFilter === "all"} onClick={() => setCatFilter("all")} />
                {(categories.data ?? []).map((category) => (
                  <CategoryTile key={category.id} label={category.name} active={catFilter === category.id} onClick={() => setCatFilter(category.id)} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardContent className="flex h-full flex-col p-2">
              <div className="mb-1.5 flex items-center gap-2 border-b pb-1">
                <h2 className="text-xs font-bold">المنتجات</h2>
                <div className="relative mr-auto w-56 max-w-full">
                  <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن منتج..." className="h-8 pr-7 text-xs" />
                </div>
                <span className="text-[10px] text-muted-foreground">{filteredProducts.length} منتج</span>
              </div>
              {inventory.isError ? (
                <div className="mb-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] text-destructive" role="alert">
                  تعذر تحميل رصيد المخزون؛ البيع متوقف حتى يتم التحقق من اتصال قاعدة البيانات.
                </div>
              ) : !inventory.isLoading && filteredProducts.length > 0 && filteredProducts.every((product) => (stockByProduct.get(product.id) ?? 0) <= 0) ? (
                <div className="mb-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] text-destructive" role="status">
                  لا يوجد رصيد متاح في هذا الفرع. سجّل الكميات الافتتاحية من شاشة المخزون قبل البيع.
                </div>
              ) : null}
              <div className="grid min-h-0 flex-1 content-start grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredProducts.map((product) => {
                  const available = stockByProduct.get(product.id);
                  const stockUnavailable = isOnline && (inventory.isLoading || inventory.isError || available === undefined || available <= 0);
                  const stockLabel = !isOnline
                    ? "مسودة محلية — المخزون غير مؤكد"
                    : inventory.isLoading
                      ? "جاري التحقق"
                      : inventory.isError
                        ? "تعذر المخزون"
                        : available === undefined
                          ? "غير مسجل"
                          : available < 0
                            ? `رصيد سالب: ${available}`
                            : available === 0
                              ? "نفد المخزون"
                              : `متاح: ${available}`;
                  return (
                    <button key={product.id} type="button" onClick={() => addToCart(product)}
                      disabled={stockUnavailable || checkoutMut.isPending}
                      title={stockLabel}
                      className="flex min-h-[76px] flex-row items-center gap-2 rounded-xl border bg-card p-2 text-right text-xs font-semibold leading-tight shadow-sm transition hover:border-primary hover:bg-primary/5 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-[84px]">
                      <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-sm font-black text-muted-foreground">
                        {product.name.slice(0, 1)}
                        {product.image_url && <img src={product.image_url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                        <span className="line-clamp-2 w-full text-[11px] font-bold sm:text-xs">{product.name}</span>
                        <span className="text-xs font-extrabold text-primary num">{formatMoney(Number(product.sale_price))}</span>
                        <span className={`text-[10px] font-semibold ${available !== undefined && available > 0 ? "text-success" : "text-destructive"}`}>{stockLabel}</span>
                      </span>
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div className="col-span-full grid place-items-center rounded-md border bg-muted/30 p-6 text-center text-xs text-muted-foreground">لا توجد منتجات مطابقة</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="hidden min-h-0 overflow-hidden lg:block">
          <CardContent className="flex h-full flex-col p-2">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 border-b pb-1">
              <h2 className="text-xs font-bold">الفاتورة الحالية</h2>
              <span className="text-xs text-muted-foreground">{cart.length} صنف • {totalQty} قطعة</span>
              {drafts.length > 0 && <Button type="button" size="sm" variant="ghost" className="mr-auto h-6 text-[10px]" onClick={() => setDraftsOpen(true)}>عرض جميع المسودات ({drafts.length})</Button>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/70 text-[10px]">
                  <tr><th className="p-1.5 text-right">المنتج</th><th className="p-1.5 text-center">الكمية</th><th className="p-1.5 text-center">الإجمالي</th><th className="p-1.5 text-center"></th></tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-[11px] text-muted-foreground">أضف المنتجات لتكوين الفاتورة</td></tr>
                  ) : cart.map((item) => (
                    <tr key={item.product_id} className="border-t">
                      <td className="p-1.5 text-right"><div className="font-medium leading-tight">{item.name}</div><div className="text-[10px] text-muted-foreground num">{formatMoney(item.unit_price)}</div></td>
                      <td className="p-1.5 text-center"><div className="inline-flex items-center gap-0.5">
                        <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => dec(item.product_id)} disabled={checkoutMut.isPending}><Minus className="h-3 w-3" /></Button>
                        <span className="min-w-6 text-center font-semibold num">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => inc(item.product_id)} disabled={checkoutMut.isPending || (isOnline && (inventory.isLoading || inventory.isError || (stockByProduct.get(item.product_id) ?? 0) <= item.quantity))}><Plus className="h-3 w-3" /></Button>
                      </div></td>
                      <td className="p-1.5 text-center font-bold num">{formatMoney(item.unit_price * item.quantity)}</td>
                      <td className="p-1.5 text-center"><Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" aria-label="حذف الصنف" onClick={() => remove(item.product_id)} disabled={checkoutMut.isPending}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5 rounded-md border bg-muted/30 p-2 text-xs">
              <div className="mb-1.5 flex items-center gap-2"><Label className="shrink-0 text-[10px] text-muted-foreground">الخصم اليدوي</Label><Input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-7 text-xs" disabled={checkoutMut.isPending} /></div>
              <div className="mb-2 space-y-1"><Label className="text-[10px] text-muted-foreground">العروض الترويجية المتاحة</Label><select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={selectedPromotionId} onChange={e=>setSelectedPromotionId(e.target.value)} disabled={checkoutMut.isPending || activePromotions.isLoading}><option value="">بدون عرض ترويجي</option>{(activePromotions.data??[]).map(offer=><option key={offer.id} value={offer.id}>{offer.name}</option>)}</select>{selectedPromotionId && !selectedPromotion && <span className="text-[10px] text-destructive">العرض المحدد لم يعد متاحاً لهذا الفرع.</span>}{selectedPromotion && promotionDiscount<=0 && <span className="text-[10px] text-destructive">السلة لا تحقق شروط العرض المحدد.</span>}</div>
              <div className="flex justify-between text-muted-foreground"><span>المجموع الفرعي</span><span className="num">{formatMoney(subtotal)}</span></div>
              {promotionDiscount > 0 && <div className="flex justify-between text-emerald-600"><span>خصم العرض الترويجي</span><span className="num">-{formatMoney(promotionDiscount)}</span></div>}
              {manualDiscount > 0 && <div className="flex justify-between text-destructive"><span>الخصم اليدوي</span><span className="num">-{formatMoney(manualDiscount)}</span></div>}
              {disc > 0 && <div className="flex justify-between font-medium text-destructive"><span>إجمالي الخصم</span><span className="num">-{formatMoney(disc)}</span></div>}
              {taxRate > 0 && <div className="flex justify-between text-muted-foreground"><span>الضريبة ({taxRate}%)</span><span className="num">{formatMoney(taxAmount)}</span></div>}
              <div className="mt-1 flex items-baseline justify-between border-t pt-1 text-lg font-black"><span>الإجمالي</span><span className="num text-primary">{formatMoney(total)} <span className="text-[10px] font-normal text-muted-foreground">{currency}</span></span></div>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <PayBtn icon={Banknote} label="نقدي" onClick={() => beginCheckout("cash")} disabled={checkoutMut.isPending || cart.length === 0} />
              <PayBtn icon={Wallet} label="محفظة" onClick={() => beginCheckout("wallet")} disabled={checkoutMut.isPending || cart.length === 0} />
              <PayBtn icon={CreditCard} label="بطاقة" onClick={() => beginCheckout("card")} disabled={checkoutMut.isPending || cart.length === 0} />
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={() => holdOrDraft("تم تعليق الفاتورة")}><Pause className="ml-0.5 h-3 w-3" />تعليق</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={() => holdOrDraft("تم حفظ المسودة")}><Save className="ml-0.5 h-3 w-3" />مسودة</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={printPreview}><Printer className="ml-0.5 h-3 w-3" />معاينة</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px] text-destructive" onClick={() => { setCart([]); setDiscount("0"); }} disabled={cart.length === 0}><X className="ml-0.5 h-3 w-3" />إلغاء</Button>
            </div>
            <Button size="sm" className="mt-1.5 h-10 bg-success text-sm font-bold text-success-foreground hover:bg-success/90" onClick={() => beginCheckout("cash")} disabled={checkoutMut.isPending || cart.length === 0}>
              <CheckCircle2 className="ml-1 h-4 w-4" />مراجعة وإتمام البيع
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:hidden">
          <CardContent className="flex items-center gap-2 p-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground">الفاتورة • {cart.length} أصناف / {totalQty} قطع</div>
              <div className="text-lg font-black text-primary num">{formatMoney(total)} <span className="text-xs font-normal text-muted-foreground">{currency}</span></div>
            </div>
            <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 px-2" onClick={() => setDraftsOpen(true)}>المسودات ({drafts.length})</Button>
            <Button size="sm" className="h-10 shrink-0 font-bold" onClick={() => beginCheckout("cash")} disabled={checkoutMut.isPending || cart.length === 0}>مراجعة الفاتورة</Button>
            <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label="حفظ مسودة" onClick={() => holdOrDraft("تم حفظ المسودة")} disabled={cart.length === 0}><Save className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label="معاينة وطباعة الفاتورة" onClick={printPreview} disabled={cart.length === 0}><Printer className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={draftsOpen} onOpenChange={setDraftsOpen}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>الفواتير المسودة والمعلقة</DialogTitle><DialogDescription>مسودات محفوظة على هذا الجهاز لهذا المستخدم والفرع، وليست فواتير بيع صادرة.</DialogDescription></DialogHeader>
          {drafts.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد مسودات. احفظ فاتورة من نقطة البيع لتظهر هنا وتكملها لاحقاً.</div> : (
            <div className="space-y-2">
              {drafts.map((draft, index) => (
                <div key={draft.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap justify-between gap-2"><div><div className="font-bold">مسودة #{drafts.length - index}</div><div className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(draft.created_at))}</div></div><div className="text-left"><div className="font-bold text-primary num">{formatMoney(getDraftTotal(draft))} {currency}</div><div className="text-xs text-muted-foreground">{draft.cart.length} أصناف • {draft.cart.reduce((sum, item) => sum + item.quantity, 0)} قطعة</div></div></div>
                  <div className="mt-2 rounded bg-muted/40 p-2">{draft.cart.slice(0, 5).map(item => <div key={item.product_id} className="flex justify-between gap-2 text-xs"><span className="truncate">{item.name} × {item.quantity}</span><span className="shrink-0 num">{formatMoney(item.unit_price * item.quantity)}</span></div>)}{draft.cart.length > 5 && <div className="text-xs text-muted-foreground">و{draft.cart.length - 5} أصناف أخرى</div>}</div>
                  <div className="mt-2 flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => deleteDraft(draft.id)}>حذف المسودة</Button><Button type="button" size="sm" onClick={() => restoreDraft(draft)}>فتح وإكمال الفاتورة</Button></div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDraftsOpen(false)}>إغلاق</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={(open) => { if (!checkoutMut.isPending) setReviewOpen(open); }}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>مراجعة الفاتورة قبل الإصدار</DialogTitle>
            <DialogDescription>راجع الأصناف والكميات والأسعار، ويمكنك الزيادة أو التخفيض أو حذف أي صنف قبل اعتماد البيع.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>نوع الطلب</Label>
                <Select value={orderType} onValueChange={(value) => { setOrderType(value as "dine_in" | "takeaway" | "delivery"); setSelectedTableId("none"); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dine_in">محلي — داخل المطعم</SelectItem>
                    <SelectItem value="takeaway">سفري — استلام من المطعم</SelectItem>
                    <SelectItem value="delivery">توصيل إلى العميل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {orderType === "dine_in" && (
                <div className="space-y-1 sm:col-span-2">
                  <Label>الطاولة المتاحة</Label>
                  <Select value={selectedTableId} onValueChange={setSelectedTableId}>
                    <SelectTrigger><SelectValue placeholder="اختر طاولة" /></SelectTrigger>
                    <SelectContent>
                      {(restaurantTables.data ?? []).map((table) => <SelectItem key={table.id} value={table.id}>{table.name} — {table.capacity} مقاعد{table.section_name ? " · " + table.section_name : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {restaurantTables.isError && <p className="text-xs text-destructive">تعذر تحميل الطاولات. أعد المحاولة.</p>}
                  {restaurantTables.data?.length === 0 && <p className="text-xs text-muted-foreground">لا توجد طاولات متاحة في هذا الفرع. أضف طاولات أو أخلِ طاولة مشغولة من صفحة الطاولات.</p>}
                </div>
              )}
              {orderType === "delivery" && <>
                <div className="space-y-1"><Label>اسم عميل التوصيل</Label><Input value={deliveryName} onChange={(e) => setDeliveryName(e.target.value)} maxLength={120} /></div>
                <div className="space-y-1"><Label>رقم الهاتف</Label><Input value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} maxLength={30} dir="ltr" /></div>
                <div className="space-y-1 sm:col-span-2"><Label>عنوان التوصيل</Label><Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} maxLength={500} /></div>
                <div className="space-y-1"><Label>رسوم التوصيل</Label><Input type="number" min="0" step="0.01" value={deliveryFeeInput} onChange={(e) => setDeliveryFeeInput(e.target.value)} /></div>
              </>}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[320px] text-xs">
                <thead className="bg-muted/60"><tr><th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-center">السعر</th><th className="p-2 text-center">الإجمالي</th><th className="p-2"></th></tr></thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.product_id} className="border-t">
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2"><div className="flex items-center justify-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" aria-label="تقليل الكمية" onClick={() => dec(item.product_id)} disabled={checkoutMut.isPending}><Minus className="h-3 w-3" /></Button>
                        <span className="min-w-6 text-center font-bold num">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" aria-label="زيادة الكمية" onClick={() => inc(item.product_id)} disabled={checkoutMut.isPending || inventory.isLoading || inventory.isError || (stockByProduct.get(item.product_id) ?? 0) <= item.quantity}><Plus className="h-3 w-3" /></Button>
                      </div></td>
                      <td className="p-2 text-center num">{formatMoney(item.unit_price)}</td>
                      <td className="p-2 text-center font-bold num">{formatMoney(item.unit_price * item.quantity)}</td>
                      <td className="p-2 text-center"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="حذف الصنف" onClick={() => remove(item.product_id)} disabled={checkoutMut.isPending}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                  {cart.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">أصبحت الفاتورة فارغة؛ أغلق المراجعة وأضف المنتجات من جديد.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">الخصم</Label><Input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={checkoutMut.isPending} /></div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">العميل (اختياري للبيع النقدي، وإلزامي للبيع الآجل)</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId} disabled={checkoutMut.isPending}>
                  <SelectTrigger><SelectValue placeholder="بيع نقدي بدون عميل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بيع نقدي بدون عميل</SelectItem>
                    {(customers.data ?? []).map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name} — سقف {formatMoney(Number(customer.credit_limit))}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">طريقة الدفع</Label><Select value={reviewMethod} onValueChange={(value) => setReviewMethod(value as PaymentUI)} disabled={checkoutMut.isPending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">نقداً</SelectItem><SelectItem value="wallet">محفظة / تحويل</SelectItem><SelectItem value="card">بطاقة</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label className="text-xs">المبلغ المدفوع الآن</Label><Input type="number" min="0" max={total} step="0.01" placeholder={String(total)} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} disabled={checkoutMut.isPending} /><p className="text-[10px] text-muted-foreground">اتركه فارغاً لسداد كامل الفاتورة. المتبقي يصبح مديونية على العميل.</p></div>
              <div className="flex justify-between text-sm font-semibold text-destructive sm:col-span-2"><span>المتبقي على العميل</span><span className="num">{formatMoney(Math.max(0, total - (paidAmount.trim() === "" ? total : Number(paidAmount) || 0)))} {currency}</span></div>
              <div className="flex justify-between text-sm text-muted-foreground"><span>المجموع الفرعي</span><span className="num">{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between text-sm text-muted-foreground"><span>الخصم</span><span className="num">-{formatMoney(disc)}</span></div>
              <div className="flex justify-between text-sm text-muted-foreground"><span>الضريبة ({taxRate}%)</span><span className="num">{formatMoney(taxAmount)}</span></div>
              {orderType === "delivery" && <div className="flex justify-between text-sm text-muted-foreground"><span>رسوم التوصيل</span><span className="num">{formatMoney(deliveryFee)}</span></div>}
              <div className="flex justify-between border-t pt-2 text-base font-black"><span>الإجمالي</span><span className="text-primary num">{formatMoney(total)} {currency}</span></div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={checkoutMut.isPending}>العودة للتعديل</Button>
            <Button className="bg-success font-bold text-success-foreground hover:bg-success/90" disabled={checkoutMut.isPending || cart.length === 0 || disc > subtotal || (orderType === "dine_in" && (!selectedTableId || selectedTableId === "none" || restaurantTables.isLoading || restaurantTables.isError)) || (orderType === "delivery" && (!deliveryName.trim() || !deliveryPhone.trim() || !deliveryAddress.trim() || !Number.isFinite(Number(deliveryFeeInput)) || Number(deliveryFeeInput) < 0)) || (selectedCustomerId === "none" && paidAmount.trim() !== "" && Number(paidAmount) !== total) || (paidAmount.trim() !== "" && (!Number.isFinite(Number(paidAmount)) || Number(paidAmount) < 0 || Number(paidAmount) > total))}
              onClick={confirmCheckout}>
              {checkoutMut.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}
              تأكيد وإصدار الفاتورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function POSPasscodeDialog({
  open,
  onOpenChange,
  passcode,
  onPasscodeChange,
  verifying,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passcode: string;
  onPasscodeChange: (value: string) => void;
  verifying: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!verifying) onOpenChange(nextOpen); }}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>تأكيد فتح نقطة البيع</DialogTitle>
          <DialogDescription>أدخل كلمة مرور نقطة البيع التي أنشأتها من ملفك الشخصي.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pos-access-passcode">كلمة المرور</Label>
          <Input
            id="pos-access-passcode"
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={(event) => onPasscodeChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); }}
            placeholder="أدخل كلمة المرور التي اخترتها"
            disabled={verifying}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={verifying}>إلغاء</Button>
          <Button type="button" onClick={onSubmit} disabled={verifying || !passcode}>
            {verifying ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <KeyRound className="ml-2 h-4 w-4" />}
            تأكيد وفتح نقطة البيع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryTile({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "inline-flex h-9 min-w-[92px] shrink-0 items-center justify-center rounded-full border border-primary bg-primary px-4 text-center text-xs font-bold text-primary-foreground shadow-sm transition active:scale-95"
        : "inline-flex h-9 min-w-[92px] shrink-0 items-center justify-center rounded-full border bg-card px-4 text-center text-xs font-semibold transition hover:border-primary hover:bg-primary/5 active:scale-95"}
      title={label}
    >
      <span className="line-clamp-1">{label}</span>
    </button>
  );
}

function PayBtn({ icon: Icon, label, onClick, disabled }: { icon: typeof Banknote; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 flex-col gap-0.5 border hover:border-primary hover:bg-primary/5"
    >
      <Icon className="h-4 w-4" />
      <span className="text-[10px] font-semibold">{label}</span>
    </Button>
  );
}
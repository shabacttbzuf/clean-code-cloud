import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Seed demo data (branches, categories, products, customers, suppliers, expense categories,
 * and some historical sales) into a tenant. Owner/Super Owner only.
 * Skips creation of items whose name already exists to keep it idempotent-ish.
 */
export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ tenant_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Authorize
    const { data: isSO } = await context.supabase.rpc("is_super_owner", { _user_id: context.userId });
    if (!isSO) {
      const { data: rows } = await context.supabase
        .from("user_roles").select("role").eq("user_id", context.userId).eq("tenant_id", data.tenant_id);
      const roles = (rows ?? []).map((r: { role: string }) => r.role);
      if (!roles.includes("owner")) throw new Error("غير مصرح: للمالك فقط.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = data.tenant_id;
    const stats = { branches: 0, categories: 0, products: 0, customers: 0, suppliers: 0, sales: 0 };

    // --- Branches ---
    const demoBranches = [
      { name: "الفرع الرئيسي", description: "الفرع المركزي في وسط المدينة",
        image_url: "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800" },
      { name: "فرع المدينة", description: "قرب مركز المدينة التجاري",
        image_url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800" },
      { name: "فرع المطار", description: "داخل صالة المسافرين",
        image_url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800" },
    ];
    for (const b of demoBranches) {
      const { data: existing } = await supabaseAdmin
        .from("branches").select("id").eq("tenant_id", tenantId).eq("name", b.name).maybeSingle();
      if (existing) continue;
      const { error } = await supabaseAdmin.from("branches").insert({ tenant_id: tenantId, ...b, is_active: true });
      if (!error) stats.branches++;
    }

    // --- Categories ---
    const demoCategories = [
      { name: "المشروبات الساخنة", image_url: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600" },
      { name: "المشروبات الباردة", image_url: "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600" },
      { name: "المقبلات", image_url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600" },
      { name: "الأطباق الرئيسية", image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600" },
      { name: "البرجر", image_url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600" },
      { name: "البيتزا", image_url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600" },
      { name: "الحلويات", image_url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600" },
      { name: "السلطات", image_url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600" },
    ];
    const catIds: Record<string, string> = {};
    for (const c of demoCategories) {
      const { data: existing } = await supabaseAdmin
        .from("categories").select("id").eq("tenant_id", tenantId).eq("name", c.name).maybeSingle();
      if (existing) { catIds[c.name] = existing.id; continue; }
      const { data: inserted, error } = await supabaseAdmin
        .from("categories").insert({ tenant_id: tenantId, ...c, is_active: true }).select("id").single();
      if (!error && inserted) { catIds[c.name] = inserted.id; stats.categories++; }
    }

    // --- Products ---
    const demoProducts: Array<{ name: string; category: string; price: number; cost_price: number; image_url: string }> = [
      { name: "قهوة سادة", category: "المشروبات الساخنة", price: 15, cost_price: 5, image_url: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600" },
      { name: "كابتشينو", category: "المشروبات الساخنة", price: 22, cost_price: 8, image_url: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600" },
      { name: "شاي بالنعناع", category: "المشروبات الساخنة", price: 10, cost_price: 3, image_url: "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=600" },
      { name: "عصير برتقال", category: "المشروبات الباردة", price: 18, cost_price: 7, image_url: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600" },
      { name: "ليموناضة", category: "المشروبات الباردة", price: 15, cost_price: 4, image_url: "https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600" },
      { name: "كولا", category: "المشروبات الباردة", price: 12, cost_price: 5, image_url: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600" },
      { name: "بطاطس مقلية", category: "المقبلات", price: 20, cost_price: 6, image_url: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600" },
      { name: "أصابع موزاريلا", category: "المقبلات", price: 30, cost_price: 12, image_url: "https://images.unsplash.com/photo-1548340748-6d2b7d7da280?w=600" },
      { name: "دجاج مشوي", category: "الأطباق الرئيسية", price: 75, cost_price: 30, image_url: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=600" },
      { name: "ستيك لحم", category: "الأطباق الرئيسية", price: 150, cost_price: 70, image_url: "https://images.unsplash.com/photo-1546964124-0cce460f38ef?w=600" },
      { name: "سمك مشوي", category: "الأطباق الرئيسية", price: 95, cost_price: 40, image_url: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600" },
      { name: "برجر كلاسيك", category: "البرجر", price: 55, cost_price: 20, image_url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600" },
      { name: "برجر تشيز", category: "البرجر", price: 65, cost_price: 25, image_url: "https://images.unsplash.com/photo-1550317138-10000687a72b?w=600" },
      { name: "برجر دجاج", category: "البرجر", price: 50, cost_price: 18, image_url: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600" },
      { name: "بيتزا مارجريتا", category: "البيتزا", price: 60, cost_price: 22, image_url: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600" },
      { name: "بيتزا بيبروني", category: "البيتزا", price: 70, cost_price: 28, image_url: "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600" },
      { name: "بيتزا خضار", category: "البيتزا", price: 65, cost_price: 24, image_url: "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=600" },
      { name: "تشيز كيك", category: "الحلويات", price: 35, cost_price: 12, image_url: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600" },
      { name: "براوني", category: "الحلويات", price: 25, cost_price: 8, image_url: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600" },
      { name: "آيس كريم", category: "الحلويات", price: 20, cost_price: 6, image_url: "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600" },
      { name: "سلطة سيزر", category: "السلطات", price: 40, cost_price: 15, image_url: "https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=600" },
      { name: "سلطة يونانية", category: "السلطات", price: 35, cost_price: 13, image_url: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600" },
      { name: "سلطة تونة", category: "السلطات", price: 45, cost_price: 18, image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600" },
    ];
    const productIds: string[] = [];
    for (const p of demoProducts) {
      const catId = catIds[p.category];
      if (!catId) continue;
      const { data: existing } = await supabaseAdmin
        .from("products").select("id").eq("tenant_id", tenantId).eq("name", p.name).maybeSingle();
      if (existing) { productIds.push(existing.id); continue; }
      const { data: ins, error } = await supabaseAdmin.from("products").insert({
        tenant_id: tenantId, category_id: catId,
        name: p.name, sale_price: p.price, cost_price: p.cost_price,
        image_url: p.image_url, is_active: true,
      }).select("id").single();
      if (!error && ins) { productIds.push(ins.id); stats.products++; }
    }

    // --- Customers ---
    const demoCustomers = [
      { name: "أحمد محمد", phone: "0100000001" },
      { name: "سارة علي", phone: "0100000002" },
      { name: "خالد إبراهيم", phone: "0100000003" },
      { name: "منى حسن", phone: "0100000004" },
      { name: "يوسف طارق", phone: "0100000005" },
      { name: "ليلى سمير", phone: "0100000006" },
      { name: "عمر فاروق", phone: "0100000007" },
      { name: "نور الدين", phone: "0100000008" },
      { name: "فاطمة أحمد", phone: "0100000009" },
      { name: "زياد محمود", phone: "0100000010" },
    ];
    for (const c of demoCustomers) {
      const { data: existing } = await supabaseAdmin
        .from("customers").select("id").eq("tenant_id", tenantId).eq("phone", c.phone).maybeSingle();
      if (existing) continue;
      const { error } = await supabaseAdmin.from("customers").insert({ tenant_id: tenantId, ...c });
      if (!error) stats.customers++;
    }

    // --- Suppliers ---
    const demoSuppliers = [
      { name: "شركة الغذاء الطازج", phone: "0111111111" },
      { name: "مخبز المدينة", phone: "0111111112" },
      { name: "توزيع المشروبات", phone: "0111111113" },
      { name: "مورد اللحوم", phone: "0111111114" },
      { name: "مورد الخضروات", phone: "0111111115" },
    ];
    for (const s of demoSuppliers) {
      const { data: existing } = await supabaseAdmin
        .from("suppliers").select("id").eq("tenant_id", tenantId).eq("name", s.name).maybeSingle();
      if (existing) continue;
      const { error } = await supabaseAdmin.from("suppliers").insert({ tenant_id: tenantId, ...s });
      if (!error) stats.suppliers++;
    }

    return { ok: true, stats };
  });

/**
 * Set or clear a per-user permission override.
 * RLS enforces who can toggle whom.
 */
export const setUserPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      tenant_id: z.string().uuid(),
      user_id: z.string().uuid(),
      permission_key: z.string().min(1),
      granted: z.boolean().nullable(), // null = clear override
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.granted === null) {
      const { error } = await context.supabase
        .from("user_permission_overrides").delete()
        .eq("tenant_id", data.tenant_id)
        .eq("user_id", data.user_id)
        .eq("permission_key", data.permission_key);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await context.supabase
      .from("user_permission_overrides")
      .upsert(
        {
          tenant_id: data.tenant_id,
          user_id: data.user_id,
          permission_key: data.permission_key,
          granted: data.granted,
          granted_by: context.userId,
        },
        { onConflict: "tenant_id,user_id,permission_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
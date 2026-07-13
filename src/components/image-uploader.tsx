import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
type Props = {
  tenantId: string;
  folder: string; // e.g. "branches", "categories", "suppliers", "customers"
  value: string | null;
  onChange: (url: string | null) => void;
  aspect?: "square" | "wide";
  label?: string;
};

const YEAR = 60 * 60 * 24 * 365;

export function ImageUploader({ tenantId, folder, value, onChange, aspect = "square", label = "الصورة" }: Props) {
  const [uploading, setUploading] = useState(false);

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحجم الأقصى 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("restaurant-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = await supabase.storage.from("restaurant-assets").createSignedUrl(path, YEAR);
      if (data?.signedUrl) onChange(data.signedUrl);
      toast.success("تم رفع الصورة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الرفع");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const boxClass = aspect === "wide"
    ? "h-24 w-40"
    : "h-20 w-20";

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-center gap-3">
        <div className={`${boxClass} relative shrink-0 overflow-hidden rounded-lg border bg-muted`}>
          {value ? (
            <>
              <img src={value} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(null)}
                className="absolute top-1 right-1 rounded-full bg-background/90 p-1 text-destructive shadow"
                aria-label="إزالة"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <div className="grid h-full place-items-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
          )}
        </div>
        <label className="flex-1">
          <div className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "جاري الرفع..." : "اختر صورة (حد أقصى 5MB)"}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={handle} disabled={uploading} />
        </label>
      </div>
    </div>
  );
}

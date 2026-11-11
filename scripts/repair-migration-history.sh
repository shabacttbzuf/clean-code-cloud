#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="elflszuqcznexrepblsz"
ALREADY_MATCHED_VERSION="20261111030810"

if ! command -v supabase >/dev/null 2>&1; then
  echo "خطأ: Supabase CLI غير مثبت في Termux."
  exit 1
fi

if [[ ! -f "supabase/migrations/20261111000034_allow_super_owners_tenant_admin_rls.sql" ||
      ! -f "supabase/migrations/20261111030810_prevent_negative_inventory_bootstrap.sql" ]]; then
  echo "خطأ: ملفات الهجرة الحديثة غير موجودة. اسحب فرع feature/production-pos-responsive أولاً."
  exit 1
fi

REMOTE_VERSIONS=(
  20261110230543 20261110230548 20261110230552 20261110230559
  20261110230604 20261110230609 20261110230613 20261110230618
  20261110230623 20261110230632 20261110230636 20261110230642
  20261110230647 20261110230652 20261110230700 20261110230704
  20261110230709 20261110230714 20261110230720 20261110230729
  20261110230734 20261110230739 20261110230743 20261110230748
  20261110230756 20261110230801 20261110230805 20261110230810
  20261110230814 20261110230822 20261110230827 20261110230939
  20261110232017 20261110233550 20261110234218 20261110235631
  20261110235726 20261111000038 20261111000147 20261111000241
  20261111000327 20261111000621 20261111000636 20261111000716
  20261111000729 20261111000810 20261111000822 20261111000910
  20261111000931 20261111001001 20261111001222 20261111001430
  20261111001438 20261111001618
)

LOCAL_VERSIONS=()
for file in supabase/migrations/*.sql; do
  version="$(basename "$file" | cut -d_ -f1)"
  if [[ "$version" != "$ALREADY_MATCHED_VERSION" ]]; then
    LOCAL_VERSIONS+=("$version")
  fi
done

echo "المشروع المستهدف: $PROJECT_REF"
echo "سيتم تصحيح سجل الهجرات فقط؛ لن يتم تنفيذ SQL أو حذف بيانات العمل."
echo "سجلات قديمة ستُعلّم كمتراجعة: ${#REMOTE_VERSIONS[@]}"
echo "إصدارات ملفات المشروع ستُعلّم كمطبقة: ${#LOCAL_VERSIONS[@]}"
echo "المراجعة ستتم على المشروع المرتبط بهذا المجلد."
read -r -p "اكتب REPAIR للمتابعة، أو أي شيء آخر للإلغاء: " answer
if [[ "$answer" != "REPAIR" ]]; then
  echo "تم الإلغاء دون إجراء أي تغيير."
  exit 0
fi

supabase link --project-ref "$PROJECT_REF"

supabase migration repair "${REMOTE_VERSIONS[@]}" --status reverted --linked --yes
supabase migration repair "${LOCAL_VERSIONS[@]}" --status applied --linked --yes

echo
echo "التحقق النهائي من تطابق سجل الهجرات:"
supabase migration list --linked

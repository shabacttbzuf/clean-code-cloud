import { jsPDF } from "jspdf";
import { formatMoney, formatDateTime } from "./format";

export type InvoiceData = {
  invoice_no: number;
  created_at: string;
  branch_name: string;
  cashier_name: string;
  tax_number?: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

const paymentLabels: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Transfer",
  mixed: "Mixed",
};

/**
 * Generate a printable invoice PDF.
 * NOTE: jsPDF has no bundled Arabic font. To keep this shippable without
 * a 500KB TTF, we render the invoice in English with numeric values. The
 * on-screen invoice view is fully Arabic; PDF is a receipt-style summary.
 */
export function generateInvoicePDF(data: InvoiceData): Blob {
  const doc = new jsPDF({ unit: "mm", format: [80, 200] });

  const pageWidth = 80;
  let y = 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.branch_name, pageWidth / 2, y, { align: "center" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (data.tax_number) {
    doc.text(`Tax No: ${data.tax_number}`, pageWidth / 2, y, { align: "center" });
    y += 4;
  }

  doc.setLineDashPattern([1, 1], 0);
  doc.line(4, y, pageWidth - 4, y);
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Invoice #${data.invoice_no}`, 4, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(formatDateTime(data.created_at), 4, y);
  y += 4;
  doc.text(`Cashier: ${data.cashier_name}`, 4, y);
  y += 4;

  doc.line(4, y, pageWidth - 4, y);
  y += 4;

  // Items
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Item", 4, y);
  doc.text("Qty", 44, y, { align: "right" });
  doc.text("Price", 58, y, { align: "right" });
  doc.text("Total", 76, y, { align: "right" });
  y += 3;
  doc.line(4, y, pageWidth - 4, y);
  y += 3;

  doc.setFont("helvetica", "normal");
  for (const item of data.items) {
    const name = item.product_name.length > 22 ? item.product_name.slice(0, 22) + "…" : item.product_name;
    doc.text(name, 4, y);
    doc.text(String(item.quantity), 44, y, { align: "right" });
    doc.text(formatMoney(item.unit_price), 58, y, { align: "right" });
    doc.text(formatMoney(item.line_total), 76, y, { align: "right" });
    y += 4;
  }

  doc.line(4, y, pageWidth - 4, y);
  y += 4;

  const putRow = (label: string, value: string, bold = false) => {
    if (bold) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    doc.text(label, 4, y);
    doc.text(value, 76, y, { align: "right" });
    y += 4;
  };

  putRow("Subtotal", `${formatMoney(data.subtotal)} ${data.currency}`);
  if (data.discount > 0) putRow("Discount", `-${formatMoney(data.discount)} ${data.currency}`);
  if (data.tax_amount > 0) putRow("Tax", `${formatMoney(data.tax_amount)} ${data.currency}`);
  y += 1;
  putRow("TOTAL", `${formatMoney(data.total)} ${data.currency}`, true);

  y += 2;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(`Payment: ${paymentLabels[data.payment_method] ?? data.payment_method}`, 4, y);
  y += 5;

  doc.text("Thank you for your visit!", pageWidth / 2, y, { align: "center" });

  return doc.output("blob");
}

export function printInvoicePDF(data: InvoiceData) {
  const blob = generateInvoicePDF(data);
  const url = URL.createObjectURL(blob);
  const w = window.open(url);
  if (w) {
    w.onload = () => {
      w.focus();
      w.print();
    };
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadInvoicePDF(data: InvoiceData) {
  const blob = generateInvoicePDF(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${data.invoice_no}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

const paymentAr: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل / محفظة",
  wallet: "محفظة",
  mixed: "مختلط",
};

/**
 * Open a print-ready HTML receipt in a new window.
 * `paper` controls the CSS @page: 58mm / 80mm thermal or A4.
 */
export function printInvoiceHTML(
  data: InvoiceData & {
    address?: string | null;
    phone?: string | null;
    tenant_name?: string | null;
    logo_url?: string | null;
  },
  paper: "58mm" | "80mm" | "A4" = "80mm",
) {
  const pageCss =
    paper === "A4"
      ? "@page { size: A4; margin: 12mm; }"
      : paper === "58mm"
        ? "@page { size: 58mm auto; margin: 2mm; }"
        : "@page { size: 80mm auto; margin: 3mm; }";
  const widthCss =
    paper === "A4" ? "width: 100%;" : paper === "58mm" ? "width: 54mm;" : "width: 74mm;";
  const rows = data.items
    .map(
      (i) => `
        <tr>
          <td class="name">${escapeHtml(i.product_name)}</td>
          <td class="num">${i.quantity}</td>
          <td class="num">${formatMoney(i.unit_price)}</td>
          <td class="num">${formatMoney(i.line_total)}</td>
        </tr>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>فاتورة #${data.invoice_no}</title>
<style>
  ${pageCss}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: "Cairo","Tajawal","Segoe UI",Tahoma,sans-serif; color:#000; background:#fff; }
  .receipt { ${widthCss} margin: 0 auto; padding: 6px; font-size: ${paper === "A4" ? "13px" : "12px"}; }
  .center { text-align: center; }
  .muted { color: #444; font-size: 11px; }
  h1 { font-size: ${paper === "A4" ? "20px" : "15px"}; margin: 2px 0; }
  .logo { max-height: ${paper === "A4" ? "70px" : "48px"}; margin: 4px auto; display:block; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 3px 2px; font-size: ${paper === "A4" ? "12px" : "11px"}; }
  thead th { border-bottom: 1px solid #000; text-align: right; }
  td.num, th.num { text-align: center; font-variant-numeric: tabular-nums; }
  td.name { text-align: right; word-break: break-word; }
  .totals { margin-top: 6px; }
  .totals .row { display:flex; justify-content: space-between; padding: 2px 0; }
  .totals .grand { font-weight: 800; font-size: ${paper === "A4" ? "18px" : "14px"}; border-top:1px solid #000; padding-top:4px; margin-top:4px; }
  .thanks { margin-top: 8px; font-weight: 700; }
  .meta { display:flex; justify-content: space-between; gap:8px; }
  .meta div { font-size: 11px; }
  @media print { .no-print { display:none; } }
</style>
</head>
<body>
<div class="receipt">
  ${data.logo_url ? `<img src="${escapeAttr(data.logo_url)}" class="logo" alt="logo" />` : ""}
  <div class="center">
    <h1>${escapeHtml(data.tenant_name || data.branch_name)}</h1>
    <div class="muted">${escapeHtml(data.branch_name)}</div>
    ${data.address ? `<div class="muted">${escapeHtml(data.address)}</div>` : ""}
    ${data.phone ? `<div class="muted">هاتف: ${escapeHtml(data.phone)}</div>` : ""}
    ${data.tax_number ? `<div class="muted">الرقم الضريبي: ${escapeHtml(data.tax_number)}</div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="meta">
    <div>فاتورة #<b>${data.invoice_no}</b></div>
    <div>${formatDateTime(data.created_at)}</div>
  </div>
  <div class="meta">
    <div>الكاشير: ${escapeHtml(data.cashier_name || "-")}</div>
    <div>الفرع: ${escapeHtml(data.branch_name)}</div>
  </div>
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th class="num">كمية</th>
        <th class="num">سعر</th>
        <th class="num">إجمالي</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>المجموع الفرعي</span><span>${formatMoney(data.subtotal)} ${escapeHtml(data.currency)}</span></div>
    ${data.discount > 0 ? `<div class="row"><span>الخصم</span><span>-${formatMoney(data.discount)} ${escapeHtml(data.currency)}</span></div>` : ""}
    ${data.tax_amount > 0 ? `<div class="row"><span>الضريبة</span><span>${formatMoney(data.tax_amount)} ${escapeHtml(data.currency)}</span></div>` : ""}
    <div class="row grand"><span>الإجمالي</span><span>${formatMoney(data.total)} ${escapeHtml(data.currency)}</span></div>
    <div class="row"><span>طريقة الدفع</span><span>${escapeHtml(paymentAr[data.payment_method] ?? data.payment_method)}</span></div>
  </div>
  <div class="center thanks">شكراً لزيارتكم — نتشرف بخدمتكم مجدداً</div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 150); };</script>
</body>
</html>`;
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

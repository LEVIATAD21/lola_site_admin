export type Product = {id:string;name:string;category:string;sku:string;price:number;stock:number;published:boolean;image:string};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
export function safeImage(value: unknown): value is string {
  if (value === '') return true;
  if (!text(value, 7_000_000)) return false;
  if (/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function validProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return text(p.id,120) && !!p.id.trim() && text(p.name,200) && !!p.name.trim()
    && text(p.sku,100) && !!p.sku.trim() && text(p.category,100) && !!p.category.trim()
    && typeof p.price === 'number' && Number.isFinite(p.price) && p.price >= 0 && p.price <= 10_000_000
    && typeof p.stock === 'number' && Number.isSafeInteger(p.stock) && p.stock >= 0 && p.stock <= 1_000_000
    && typeof p.published === 'boolean' && safeImage(p.image);
}
export function loadProducts(raw: string | null, fallback: Product[]): Product[] {
  try {
    if (raw === null || raw.length > 20_000_000) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 5000 || !parsed.every(validProduct)) return fallback;
    if (new Set(parsed.map(p=>p.id)).size !== parsed.length) return fallback;
    return parsed.map(p=>({id:p.id,name:p.name,sku:p.sku,category:p.category,price:p.price,stock:p.stock,published:p.published,image:p.image}));
  } catch { return fallback; }
}
export function csvCell(value: string): string {
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"','""') + '"';
}
export function isRasterImage(bytes: Uint8Array): boolean {
  const b = bytes;
  return (b[0]===0xff && b[1]===0xd8 && b[2]===0xff)
    || (b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47 && b[4]===13 && b[5]===10 && b[6]===26 && b[7]===10)
    || (String.fromCharCode(...b.slice(0,6))==='GIF87a' || String.fromCharCode(...b.slice(0,6))==='GIF89a')
    || (String.fromCharCode(...b.slice(0,4))==='RIFF' && String.fromCharCode(...b.slice(8,12))==='WEBP');
}

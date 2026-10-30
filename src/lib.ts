import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { flowType: "pkce", detectSessionInUrl: true },
      })
    : null;
export const demo = !supabase;
export function db() {
  if (!supabase)
    throw new Error(
      "Esta es una vista previa. Conecta el proyecto de Supabase para realizar esta operación.",
    );
  return supabase;
}
export type Event = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  city: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  min_age: number;
  status: string;
  cover_url: string;
  payment_name: string;
  payment_number: string;
};
export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  quota: number;
  active: boolean;
};
export type Order = {
  id: string;
  user_id: string;
  event_id: string;
  ticket_type_id: string;
  attendee_name: string;
  dni: string;
  amount_cents: number;
  status: string;
  receipt_path: string | null;
  payment_reference: string | null;
  rejection_reason: string | null;
  created_at: string;
  expires_at: string;
  checked_in_at: string | null;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    cents / 100,
  );
export const date = (value: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  }).format(new Date(value));
export const statusLabel: Record<string, string> = {
  reserved: "Reserva • falta comprobante",
  pending: "Pago en revisión",
  approved: "Entrada confirmada",
  rejected: "Pago rechazado",
  checked_in: "Ingreso registrado",
  expired: "Reserva vencida",
  cancelled: "Cancelada",
};
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "No pudimos completar la operación. Inténtalo nuevamente.";
}
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export const attendeeSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo.").max(120),
  dni: z.string().regex(/^\d{8}$/, "El DNI debe tener 8 números."),
  birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona tu fecha de nacimiento."),
});
export function safeCsv(rows: string[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function download(content: Blob, name: string) {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function normalizeReceipt(file: File): Promise<Blob> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Usa una imagen JPG, PNG o WebP de hasta 5 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("La imagen es demasiado grande. Reduce su resolución.");
  }
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("No se pudo procesar la imagen.")),
      "image/jpeg",
      0.86,
    ),
  );
}
export const demoEvents: Event[] = [
  {
    id: "demo-1",
    slug: "afterglow",
    title: "AFTERGLOW",
    description:
      "Cuando baja el sol, empieza lo que vas a recordar. Una noche de electrónica, arte y encuentros frente al mar. Dos escenarios, una selección de DJs locales y una experiencia diseñada para perder la noción del tiempo.",
    category: "Electrónica",
    city: "Lima",
    venue: "Costa Verde · Barranco",
    starts_at: "2026-12-12T22:00:00-05:00",
    ends_at: "2026-12-13T05:00:00-05:00",
    capacity: 500,
    min_age: 18,
    status: "published",
    cover_url: "/art/afterglow.svg",
    payment_name: "Vista previa",
    payment_number: "Sin pagos habilitados",
  },
  {
    id: "demo-2",
    slug: "jazz-bajo-las-estrellas",
    title: "Jazz bajo las estrellas",
    description:
      "Una sesión íntima de jazz contemporáneo al aire libre. Disfruta la música, los encuentros y una noche diferente en la ciudad.",
    category: "En vivo",
    city: "Lima",
    venue: "Terraza Miraflores",
    starts_at: "2026-12-18T20:00:00-05:00",
    ends_at: "2026-12-18T23:30:00-05:00",
    capacity: 120,
    min_age: 18,
    status: "published",
    cover_url: "/art/jazz.svg",
    payment_name: "Vista previa",
    payment_number: "Sin pagos habilitados",
  },
  {
    id: "demo-3",
    slug: "creative-sessions",
    title: "Creative Sessions",
    description:
      "Ideas que conectan. Charlas, encuentros y nuevas perspectivas para la comunidad creativa. Un espacio para compartir lo que haces y descubrir lo que viene.",
    category: "Comunidad",
    city: "Arequipa",
    venue: "Casa Cultural · Centro",
    starts_at: "2026-12-20T16:00:00-05:00",
    ends_at: "2026-12-20T21:00:00-05:00",
    capacity: 200,
    min_age: 16,
    status: "published",
    cover_url: "/art/creative.svg",
    payment_name: "Vista previa",
    payment_number: "Sin pagos habilitados",
  },
];
export const demoTypes: TicketType[] = demoEvents.map((e, i) => ({
  id: `type-${i}`,
  event_id: e.id,
  name: "Entrada general",
  price_cents: [6500, 4500, 3000][i],
  quota: e.capacity,
  active: true,
}));

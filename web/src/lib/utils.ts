import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function formatDate(date: any) {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return format(d, "dd MMM yyyy", { locale: idLocale });
}
export function formatMinutes(value: any) {
  const minutes = Number(value || 0);
  if (!minutes) return "0 menit";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} menit`;
  if (!remainder) return `${hours} jam`;
  return `${hours} jam ${remainder} menit`;
}
export function toDateInputValue(date: any) {
  if (!date) return "";
  if (typeof date === "string") return date.slice(0, 10);
  return format(date, "yyyy-MM-dd");
}

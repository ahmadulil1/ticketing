import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { id } from "date-fns/locale";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date) {
  if (!date) {
    return "-";
  }

  return format(new Date(date), "dd MMM yyyy", { locale: id });
}

export function formatMinutes(value) {
  const minutes = Number(value || 0);
  if (!minutes) {
    return "0 menit";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!hours) {
    return `${remainder} menit`;
  }

  if (!remainder) {
    return `${hours} jam`;
  }

  return `${hours} jam ${remainder} menit`;
}

export function toDateInputValue(date) {
  if (!date) {
    return "";
  }

  if (typeof date === "string") {
    return date;
  }

  return format(date, "yyyy-MM-dd");
}

export function isIgnorableSupabaseAbortError(error) {
  const message = error?.message || "";

  return (
    error?.name === "AbortError" ||
    message.includes("Lock broken by another request with the 'steal' option.")
  );
}

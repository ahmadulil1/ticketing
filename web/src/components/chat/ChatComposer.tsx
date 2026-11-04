import { useRef } from "react";
import type { RefObject } from "react";
import { Loader2, Lock, LockOpen, Paperclip, Send, X } from "lucide-react";

interface ChatComposerProps {
  message: string;
  onMessageChange: (v: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onTypingChange: (typing: boolean) => void;
  pendingFiles: File[];
  previewUrl: string | null;
  onPickFiles: (list: FileList | null) => void;
  onClearFiles: () => void;
  isInternal: boolean;
  onToggleInternal: () => void;
  canMarkInternal: boolean;
  isPending: boolean;
  sendError: string | null;
  onSend: () => void;
}

// Komposer mengambang ala aplikasi chat modern: kartu membulat dengan
// bayangan lembut, textarea tanpa border, tombol kirim bulat yang menyala
// hanya saat ada yang bisa dikirim.
export default function ChatComposer({
  message,
  onMessageChange,
  textareaRef,
  onTypingChange,
  pendingFiles,
  previewUrl,
  onPickFiles,
  onClearFiles,
  isInternal,
  onToggleInternal,
  canMarkInternal,
  isPending,
  sendError,
  onSend,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = (message.trim() || pendingFiles.length > 0) && !isPending;

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="w-full">
        {sendError && (
          <p
            role="alert"
            className="mb-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            {sendError}
          </p>
        )}
        <div className="rounded-[26px] border border-border bg-card shadow-[0_10px_36px_rgba(0,0,0,0.10)] transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/25">
          {pendingFiles.length > 0 && (
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Pratinjau lampiran"
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{pendingFiles.length} gambar siap dikirim</div>
                <div className="truncate text-xs text-muted-foreground">
                  {pendingFiles.map((f) => f.name).join(", ")}
                </div>
              </div>
              <button
                type="button"
                onClick={onClearFiles}
                aria-label="Batalkan gambar"
                title="Batalkan gambar"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1 p-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Lampirkan gambar"
              aria-label="Lampirkan gambar"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {isPending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={isInternal ? "Tulis catatan internal…" : "Ketik pesan…"}
              value={message}
              onChange={(e) => {
                onMessageChange(e.target.value);
                onTypingChange(true);
              }}
              onBlur={() => onTypingChange(false)}
              enterKeyHint="send"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              className="max-h-[144px] min-h-[42px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Kirim pesan"
              title="Kirim pesan"
              className={
                "flex size-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 " +
                (canSend
                  ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                  : "bg-muted text-muted-foreground/60")
              }
            >
              {isPending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 pb-3">
            {canMarkInternal ? (
              <button
                type="button"
                aria-pressed={isInternal}
                onClick={onToggleInternal}
                title="Catatan internal tidak terlihat oleh pengguna"
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 " +
                  (isInternal
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground")
                }
              >
                {isInternal ? <LockOpen size={12} /> : <Lock size={12} />}
                Internal
              </button>
            ) : (
              <span />
            )}
            <span className="text-[11px] text-muted-foreground/70">
              Enter kirim · Shift+Enter baris baru
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

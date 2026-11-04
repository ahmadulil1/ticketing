import dayjs from "dayjs";
import { Check, CheckCheck, Lock, MessageCircle } from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";
import Gallery from "../Gallery";

export interface ChatMessageItem {
  id: string | number;
  sender_role: string;
  message_type?: string;
  body?: string;
  created_at: string;
  read_at?: string | null;
  attachments?: any[];
  sender_full_name?: string;
  sender_name?: string;
}

interface ChatThreadProps {
  messages: ChatMessageItem[];
  viewerRole: string;
  requesterName?: string;
  ticketClosed: boolean;
  typing: Array<{ username: string }>;
  pagination?: ReactNode;
}

// Label pemisah hari di daftar pesan (tanpa plugin dayjs tambahan).
function dayLabel(iso: string) {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), "day")) return "Hari ini";
  if (d.isSame(dayjs().subtract(1, "day"), "day")) return "Kemarin";
  return d.format("DD MMM YYYY");
}

// "Milik saya" relatif terhadap siapa yang melihat: di tampilan admin/agent,
// pesan agent/admin di kanan; di tampilan user, pesan user di kanan.
function isMine(m: ChatMessageItem, viewerRole: string) {
  return m.sender_role === "agent" || m.sender_role === "admin"
    ? viewerRole !== "user"
    : viewerRole === "user";
}

function displayName(m: ChatMessageItem, viewerRole: string, requesterName?: string) {
  return (
    m.sender_full_name ||
    m.sender_name ||
    (m.sender_role === "user"
      ? viewerRole === "user"
        ? "Anda"
        : requesterName || "Karyawan"
      : "Tim Support")
  );
}

const AVATAR_TONES = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

function avatarTone(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function initials(name: string) {
  const s = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return s || "?";
}

interface Group {
  key: string;
  mine: boolean;
  internal: boolean;
  name: string;
  items: ChatMessageItem[];
}

// Pesan berurutan dari pihak yang sama (dan jenis yang sama) digabung jadi
// satu grup visual — nama hanya tampil sekali, seperti aplikasi chat modern.
function groupMessages(
  messages: ChatMessageItem[],
  viewerRole: string,
  requesterName?: string
): Group[] {
  const groups: Group[] = [];
  for (const m of messages) {
    const mine = isMine(m, viewerRole);
    const internal = m.message_type === "internal";
    const key = (internal ? "internal:" : "") + (mine ? "mine" : "theirs");
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(m);
    } else {
      groups.push({
        key,
        mine,
        internal,
        name: displayName(m, viewerRole, requesterName),
        items: [m],
      });
    }
  }
  return groups;
}

// Jam + centang dibaca ala WhatsApp: menempel di akhir baris terakhir bubble.
function MsgMeta({ m, mine }: { m: ChatMessageItem; mine: boolean }) {
  return (
    <span className="float-right ml-2 mt-[7px] inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-none">
      <span className="opacity-60">{dayjs(m.created_at).format("HH:mm")}</span>
      {mine &&
        (m.read_at ? (
          <span title="Dibaca" className="inline-flex text-sky-400">
            <CheckCheck size={15} strokeWidth={2.5} aria-label="Dibaca" />
          </span>
        ) : (
          <span title="Terkirim" className="inline-flex opacity-50">
            <Check size={15} strokeWidth={2.5} aria-label="Terkirim" />
          </span>
        ))}
    </span>
  );
}

function MsgBody({ m, mine }: { m: ChatMessageItem; mine: boolean }) {
  return (
    <>
      {m.attachments && m.attachments.length > 0 && (
        <div className="mb-1.5">
          <Gallery items={m.attachments} compact />
        </div>
      )}
      {m.body?.trim() ? (
        <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {m.body}
          <MsgMeta m={m} mine={mine} />
        </div>
      ) : (
        <div className="flex justify-end">
          <MsgMeta m={m} mine={mine} />
        </div>
      )}
    </>
  );
}

const bubbleBase =
  "max-w-full rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.07)]";

function RegularGroup({ g }: { g: Group }) {
  return (
    <div className={"flex items-end gap-2.5 " + (g.mine ? "justify-end" : "justify-start")}>
      {!g.mine && (
        <div
          aria-hidden
          className={
            "mb-[3px] flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-foreground/10 " +
            avatarTone(g.name)
          }
        >
          {initials(g.name)}
        </div>
      )}
      <div
        className={
          "flex min-w-0 max-w-[78%] flex-col gap-1 " + (g.mine ? "items-end" : "items-start")
        }
      >
        {!g.mine && (
          <div className="mb-0.5 ml-1 text-xs font-semibold text-muted-foreground">{g.name}</div>
        )}
        {g.items.map((m) => (
          <div
            key={m.id}
            className={
              bubbleBase +
              (g.mine
                ? " rounded-br-md bg-primary text-primary-foreground"
                : " rounded-bl-md border border-border bg-card text-card-foreground")
            }
          >
            <MsgBody m={m} mine={g.mine} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Catatan internal bukan bubble chat — tampil sebagai kartu catatan agar
// jelas terpisah dari alur percakapan dengan pengguna.
function InternalGroup({
  g,
  viewerRole,
  requesterName,
}: {
  g: Group;
  viewerRole: string;
  requesterName?: string;
}) {
  return (
    <div className="flex justify-end">
      <div className="w-full max-w-[78%] overflow-hidden rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-1.5 border-b border-amber-500/15 bg-amber-500/[0.07] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          <Lock size={11} />
          Catatan internal · hanya tim
        </div>
        <div className="divide-y divide-amber-500/10">
          {g.items.map((m) => (
            <div key={m.id} className="px-3.5 py-2.5">
              {m.attachments && m.attachments.length > 0 && (
                <div className="mb-1.5">
                  <Gallery items={m.attachments} compact />
                </div>
              )}
              {m.body?.trim() && (
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
                  {m.body}
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-amber-700/80 dark:text-amber-200/70">
                  {displayName(m, viewerRole, requesterName)}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/80">
                  <span>{dayjs(m.created_at).format("HH:mm")}</span>
                  {m.read_at ? (
                    <span
                      title="Dibaca"
                      className="inline-flex text-amber-600 dark:text-amber-400"
                    >
                      <CheckCheck size={14} strokeWidth={2.5} aria-label="Dibaca" />
                    </span>
                  ) : (
                    <span title="Terkirim" className="inline-flex opacity-50">
                      <Check size={14} strokeWidth={2.5} aria-label="Terkirim" />
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="flex justify-center">
      <span className="rounded-full border border-border bg-card px-3.5 py-1 text-xs font-medium text-muted-foreground shadow-sm">
        {dayLabel(iso)}
      </span>
    </div>
  );
}

function EmptyState({ ticketClosed }: { ticketClosed: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
        <MessageCircle size={26} className="text-primary" />
      </div>
      <div>
        <div className="text-[15px] font-semibold">Belum ada pesan</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {ticketClosed
            ? "Tiket ini belum memiliki pesan."
            : "Kirim pesan pertama untuk memulai percakapan."}
        </div>
      </div>
    </div>
  );
}

export default function ChatThread({
  messages,
  viewerRole,
  requesterName,
  ticketClosed,
  typing,
  pagination,
}: ChatThreadProps) {
  if (messages.length === 0 && typing.length === 0) {
    return <EmptyState ticketClosed={ticketClosed} />;
  }
  const groups = groupMessages(messages, viewerRole, requesterName);
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g, gi) => {
        const first = g.items[0];
        const prevGroup = gi > 0 ? groups[gi - 1] : undefined;
        const prevMsg = prevGroup ? prevGroup.items[prevGroup.items.length - 1] : undefined;
        const showDay =
          !prevMsg || !dayjs(first.created_at).isSame(dayjs(prevMsg.created_at), "day");
        return (
          <Fragment key={`${g.key}-${gi}`}>
            {showDay && <DayDivider iso={first.created_at} />}
            {g.internal ? (
              <InternalGroup g={g} viewerRole={viewerRole} requesterName={requesterName} />
            ) : (
              <RegularGroup g={g} />
            )}
          </Fragment>
        );
      })}
      {pagination && <div className="chat-pagination">{pagination}</div>}
      {typing.length > 0 && (
        <div className="flex items-end gap-2.5">
          <div className="min-w-0">
            <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.07)]">
              <span className="flex items-center gap-1.5" role="status" aria-label="Sedang mengetik">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
            <div className="ml-1 mt-1.5 text-[11px] text-muted-foreground">
              {typing.map((t) => t.username).join(", ")} sedang mengetik…
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

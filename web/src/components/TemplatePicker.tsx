import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import api from "../lib/api";

interface Template {
  id: string;
  name: string;
  body: string;
}

export default function TemplatePicker({ onSelect }: { onSelect: (body: string) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["ticket-templates"],
    queryFn: async () => (await api.get<Template[]>("/templates")).data,
    staleTime: 60000,
  });

  if (templates.length === 0) return null;

  return (
    <details ref={detailsRef} className="template-picker">
      <summary className="icon-btn" title="Template balasan cepat" aria-label="Template balasan cepat">
        <MessageSquareText size={17} />
      </summary>
      <div className="template-menu">
        <div className="template-menu-head">Pilih Balasan Cepat</div>
        <div className="template-menu-list">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template-menu-item"
              onClick={() => {
                onSelect(t.body);
                if (detailsRef.current) detailsRef.current.open = false;
              }}
            >
              <strong>{t.name}</strong>
              <span>{t.body.slice(0, 75)}…</span>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

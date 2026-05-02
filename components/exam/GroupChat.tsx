"use client";

import { useState } from "react";
import type { GroupMessage } from "@/types";

interface Props {
  groupId: string | null;
  messages?: GroupMessage[];
  onSend?: (text: string) => void;
}

export function GroupChat({ groupId, messages = [], onSend }: Props) {
  const [text, setText] = useState("");

  if (!groupId) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-zinc-300">אין קבוצה פעילה. צור או הצטרף לקבוצה כדי להתחיל.</p>
      </div>
    );
  }

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setText("");
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm">אין הודעות עדיין.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="rounded-lg bg-white/5 p-3">
              <div className="text-xs text-zinc-400 mb-1">{m.sender_id} · {new Date(m.created_at).toLocaleString("he-IL")}</div>
              <div className="text-sm">{m.content}</div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-white/10 p-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="כתוב הודעה..."
          className="flex-1 bg-transparent outline-none px-3"
          dir="rtl"
        />
        <button onClick={send} className="px-4 py-1.5 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-medium">
          שלח
        </button>
      </div>
    </div>
  );
}

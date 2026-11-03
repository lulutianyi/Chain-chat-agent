"use client";

import { Fragment } from "react";
import { AlertTriangle, Bot, Info, UserRound } from "lucide-react";
import { localeTag, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dict";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: number;
  sender: "supplier" | "ai" | "human" | "system";
  content: string;
  created_at: string;
};

// 同一段对话里间隔小于这个值就不再重复显示时间，减少视觉噪声。
const TIME_GROUP_GAP_MS = 5 * 60 * 1000;

// 模型不可用时的系统提示：既匹配后端的新文案，也兼容历史库里已经写成 AI 发言的旧兜底文案。
// 这里比对的是接口返回的正文，属于数据而非展示文案，两种语言下都保持原样。
const SERVICE_NOTICE_PREFIXES = ["AI 服务暂时不可用", "模型服务暂时不可用"];

function isServiceNotice(message: ChatMessage): boolean {
  return SERVICE_NOTICE_PREFIXES.some((prefix) => message.content.startsWith(prefix));
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDay(iso: string, locale: Locale, labels: Dictionary["supplier"]["message"]): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(iso) === dayKey(today.toISOString())) return labels.today;
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return labels.yesterday;
  return date.toLocaleDateString(localeTag(locale), { year: "numeric", month: "long", day: "numeric" });
}

function formatTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleTimeString(localeTag(locale), { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * 谈判消息单行渲染。商家端与供应商端共用，避免两处样式各自漂移。
 * - supplier：左侧白底气泡
 * - ai / human：右侧深色气泡（AI 为墨黑，人工为品牌蓝）
 * - system：居中的事件行；AI 服务不可用时用琥珀色警示样式，避免被当成 AI 的回复
 */
export function ChatMessageItem({
  message,
  supplierName,
  showTimestamp = true,
}: {
  message: ChatMessage;
  supplierName: string;
  showTimestamp?: boolean;
}) {
  const { locale, d } = useI18n();
  const t = d.supplier.message;

  if (message.sender === "system" || isServiceNotice(message)) {
    const alert = isServiceNotice(message);
    return (
      <div className="flex justify-center">
        <div
          className={cn(
            "flex max-w-[92%] items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5",
            alert
              ? "border-[var(--warning)]/25 bg-[var(--warning-faint)] text-[var(--warning)]"
              : "border-[var(--line)] bg-[var(--paper-deep)] text-[var(--muted)]",
          )}
        >
          {alert ? (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  const fromSupplier = message.sender === "supplier";
  return (
    <div className={cn("flex gap-2.5", !fromSupplier && "justify-end")}>
      {fromSupplier && (
        <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)] text-xs font-bold">
          {supplierName.slice(0, 1)}
        </div>
      )}
      <div className={cn("max-w-[82%]", !fromSupplier && "text-right")}>
        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-3 text-left text-sm leading-6",
            fromSupplier
              ? "rounded-tl-sm border border-[var(--line)] bg-white"
              : message.sender === "ai"
                ? "rounded-tr-sm bg-[var(--ink)] text-white"
                : "rounded-tr-sm bg-[var(--accent)] text-white",
          )}
        >
          {message.sender === "ai" && (
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[var(--ai-on-dark)]">
              <Bot className="size-3" />
              {t.ai}
            </div>
          )}
          {message.sender === "human" && (
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-white/75">
              <UserRound className="size-3" />
              {t.human}
            </div>
          )}
          {message.content}
        </div>
        {showTimestamp && (
          <div className="tnum mt-1 text-[11px] text-[var(--muted)]">
            {formatTime(message.created_at, locale)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 消息列表：负责按天分组与时间聚合。
 * 原来每条消息都带一串完整的「2026/10/14 17:34:33」，一屏十几条全是时间；
 * 现在跨天插入日期分隔，同一分钟内只保留一个时间戳。
 */
export function ChatMessageList({
  messages,
  supplierName,
}: {
  messages: ChatMessage[];
  supplierName: string;
}) {
  const { locale, d } = useI18n();

  return (
    <>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
        const gap = previous
          ? new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()
          : Number.POSITIVE_INFINITY;
        const showTimestamp = newDay || !Number.isFinite(gap) || gap >= TIME_GROUP_GAP_MS;
        return (
          <Fragment key={message.id}>
            {newDay && (
              <div className="flex justify-center">
                <span className="tnum rounded-full bg-[var(--paper-deep)] px-3 py-1 text-[11px] text-[var(--muted)]">
                  {formatDay(message.created_at, locale, d.supplier.message)}
                </span>
              </div>
            )}
            <ChatMessageItem
              message={message}
              supplierName={supplierName}
              showTimestamp={showTimestamp}
            />
          </Fragment>
        );
      })}
    </>
  );
}

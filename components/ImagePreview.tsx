"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface ImagePreviewProps {
  src: string;
  alt?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ImagePreview({ src, alt = "", children, className, style }: ImagePreviewProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`block border-0 bg-transparent p-0 text-inherit ${className ?? ""}`}
          style={style}
          aria-label={t("chat.previewImage")}
          title={t("chat.previewImage")}
        >
          {children}
        </button>
      </DialogTrigger>
      <DialogContent
        aria-label={t("chat.previewImage")}
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none border-none bg-black/72 p-0 pt-[max(16px,env(safe-area-inset-top))] pr-[max(16px,env(safe-area-inset-right))] pb-[max(16px,env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))] shadow-none ring-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="block max-h-full max-w-full rounded-lg object-contain shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
          src={src}
          alt={alt}
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("chat.close")}
          title={t("chat.close")}
          className="absolute top-[max(12px,env(safe-area-inset-top))] right-[max(12px,env(safe-area-inset-right))] inline-flex size-9 items-center justify-center rounded-md border border-border bg-popover text-muted-foreground shadow-[0_2px_10px_rgba(0,0,0,0.28)] transition-colors [touch-action:manipulation] hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 [@media(pointer:coarse)]:size-11"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </DialogContent>
    </Dialog>
  );
}

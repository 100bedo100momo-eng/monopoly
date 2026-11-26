"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export function Modal({
  open, onClose, title, children, footer, maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative z-10 w-full rounded-t-2xl bg-surface p-4 shadow-2xl border border-white/10 sm:rounded-2xl", maxWidth)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-gold">{title}</h2>
          <button onClick={onClose} aria-label="close" className="rounded-lg px-2 py-1 hover:bg-white/10">✕</button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto">{children}</div>
        {footer && <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel, danger = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>{/* cancel */}<span aria-hidden>✕</span></Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed">{message}</p>
    </Modal>
  );
}

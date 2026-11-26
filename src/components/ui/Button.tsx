"use client";

import React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-gold text-navy-900 hover:bg-gold/90 disabled:opacity-40 shadow-gold/30",
  secondary: "bg-navy-700/70 text-white hover:bg-navy-700 border border-white/10",
  danger: "bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-40",
  ghost: "bg-transparent hover:bg-white/5 text-current border border-white/10",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
    />
  );
}

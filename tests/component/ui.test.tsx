// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvatarPicker } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { ConnectionBadge } from "@/components/ui/StatusBadge";

describe("مكونات الواجهة", () => {
  it("منتقي الأفاتار يعرض 8 خيارات ويعمل", () => {
    let picked = "";
    render(<AvatarPicker value="crown" onChange={(id) => (picked = id)} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(8);
    fireEvent.click(radios[2]);
    expect(picked).toBe("camel");
  });

  it("زر معطل لا يستجيب للنقر", () => {
    let clicks = 0;
    render(<Button disabled onClick={() => clicks++}>اضغط</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(clicks).toBe(0);
  });

  it("نافذة التأكيد تعرض الرسالة وتنفذ التأكيد", () => {
    let confirmed = false;
    render(
      <ConfirmDialog
        open
        title="تأكيد"
        message="هل أنت متأكد؟"
        confirmLabel="نعم"
        onConfirm={() => (confirmed = true)}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByText("هل أنت متأكد؟")).toBeInTheDocument();
    fireEvent.click(screen.getByText("نعم"));
    expect(confirmed).toBe(true);
  });

  it("شارة الاتصال تعكس الحالة", () => {
    render(<ConnectionBadge state="offline" label="غير متصل" />);
    expect(screen.getByRole("status")).toHaveTextContent("غير متصل");
  });
});

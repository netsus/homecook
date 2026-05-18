// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebModal,
} from "@/components/web";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("desktop web primitives", () => {
  it("renders the prototype-locked button variants and sizes", () => {
    render(
      <div>
        <WebButton>Primary</WebButton>
        <WebButton size="sm" variant="secondary">Secondary</WebButton>
        <WebButton fullWidth size="lg" variant="tertiary">Tertiary</WebButton>
        <WebButton variant="ghost">Ghost</WebButton>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Primary" }).className).toContain("web-button-primary");
    expect(screen.getByRole("button", { name: "Secondary" }).className).toContain("web-button-sm");
    expect(screen.getByRole("button", { name: "Tertiary" }).className).toContain("web-button-full");
    expect(screen.getByRole("button", { name: "Ghost" }).className).toContain("web-button-ghost");
  });

  it("renders a centered desktop dialog with header, body, and footer regions", () => {
    render(
      <WebDialog aria-labelledby="dialog-title" size="wide">
        <WebDialogHeader>
          <WebDialogTitle id="dialog-title">데스크탑 모달</WebDialogTitle>
        </WebDialogHeader>
        <WebDialogBody>본문</WebDialogBody>
        <WebDialogFooter>
          <WebButton>확인</WebButton>
        </WebDialogFooter>
      </WebDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "데스크탑 모달" });
    expect(dialog.className).toContain("web-dialog");
    expect(dialog.className).toContain("web-dialog-wide");
    expect(screen.getByText("본문")).toBeTruthy();
    expect(screen.getByRole("button", { name: "확인" })).toBeTruthy();
  });

  it("keeps modal backdrop clicks separate from dialog content clicks", () => {
    const onBackdropClick = vi.fn();
    const onClick = vi.fn();

    render(
      <WebModal data-testid="backdrop" onBackdropClick={onBackdropClick} onClick={onClick}>
        <WebDialog aria-labelledby="modal-title">
          <WebDialogHeader>
            <WebDialogTitle id="modal-title">로그인</WebDialogTitle>
          </WebDialogHeader>
        </WebDialog>
      </WebModal>,
    );

    fireEvent.click(screen.getByRole("dialog", { name: "로그인" }));
    expect(onBackdropClick).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("backdrop"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  it("locks the component reference and porting ledger artifacts", () => {
    const root = process.cwd();
    const referenceLock = fs.readFileSync(
      path.join(root, "components/web/REFERENCE_LOCK.md"),
      "utf8",
    );
    const ledger = fs.readFileSync(
      path.join(root, "ui/designs/evidence/desktop-mvp-porting/slice1/porting-ledger.md"),
      "utf8",
    );

    expect(referenceLock).toContain("## WebButton");
    expect(referenceLock).toContain("## WebDialog");
    expect(referenceLock).toContain("#00A1FF");
    expect(ledger).toContain("screen:HOME");
    expect(ledger).toContain("modal:COOK_MODE::CookNoticeDialog");

    const canonicalRows = ledger.match(/^\| `(?:screen|surface|modal|gate):[^`]+` \|/gm) ?? [];
    expect(canonicalRows).toHaveLength(53);
  });
});

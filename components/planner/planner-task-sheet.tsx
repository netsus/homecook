"use client";

import React, { createContext, useCallback, useContext, useRef } from "react";
import { createPortal } from "react-dom";
import { AppBottomSheet } from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { useDialogViewport } from "@/components/shared/use-dialog-viewport";

type DismissGuard = (close: () => void) => void;
const PlannerTaskSheetContext = createContext<{ registerDismissGuard: (guard: DismissGuard | null) => void; servingsDrafts: Map<string, number> } | null>(null);
export const usePlannerTaskSheet = () => useContext(PlannerTaskSheetContext);

type Props = React.ComponentProps<typeof AppBottomSheet>;

/** One bounded scroll surface for planner tasks; other app overlays keep their defaults. */
export function PlannerTaskSheet({ panelClassName, bodyClassName, onClose, closeDisabled, ...props }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const viewport = useDialogViewport();
  const servingsDrafts = useRef(new Map<string, number>());
  const dismissGuard = useRef<DismissGuard | null>(null);
  const registerGuard = useCallback((guard: DismissGuard | null) => { dismissGuard.current = guard; }, []);
  const close = () => {
    if (closeDisabled) return;
    if (dismissGuard.current) dismissGuard.current(onClose);
    else onClose();
  };
  useDialogBoundary({ dialogRef: panelRef, onClose: close, closeOnEscape: !closeDisabled });
  return createPortal(
    <PlannerTaskSheetContext.Provider value={{ registerDismissGuard: registerGuard, servingsDrafts: servingsDrafts.current }}>
      <AppBottomSheet
        {...props}
        bodyClassName={`overscroll-y-contain ${bodyClassName ?? ""}`}
        backdropStyle={{ ...viewport, top: "var(--dialog-viewport-top, 0px)", bottom: "auto", height: "var(--dialog-viewport-height, 100dvh)" }}
        closeDisabled={closeDisabled}
        onClose={close}
        panelRef={panelRef}
        panelClassName={`planner-task-sheet !max-h-[calc(var(--dialog-viewport-height,100dvh)-32px)] max-w-[520px] [&_h2]:font-semibold [&_input]:text-base [&_select]:text-base ${panelClassName ?? ""}`}
      />
    </PlannerTaskSheetContext.Provider>, document.body,
  );
}

"use client";

import React from "react";

import { ModalFooterActions } from "@/components/shared/modal-footer-actions";
import { ModalHeader } from "@/components/shared/modal-header";

interface AppOverlayBaseProps {
  ariaLabelledBy: string;
  badge?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
  closeDisabled?: boolean;
  closeButtonRef?: React.Ref<HTMLButtonElement>;
  description?: string;
  descriptionClassName?: string;
  footer?: React.ReactNode;
  headerSlot?: React.ReactNode;
  leadingAction?: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
  panelRef?: React.Ref<HTMLDivElement>;
  testId?: string;
  title: string;
}

interface AppModalFooterActionsProps {
  cancelAriaLabel?: string;
  cancelDisabled?: boolean;
  cancelLabel?: string;
  cancelTestId?: string;
  confirmAriaLabel?: string;
  confirmDisabled?: boolean;
  confirmLabel: string;
  confirmTestId?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

interface AppStepperProps {
  disabled?: boolean;
  label: string;
  min?: number;
  onChange: (value: number) => void;
  variant?: "default" | "compact";
  unit?: string;
  value: number;
}

function AppOverlayBackdrop({
  children,
  onClose,
  variant,
}: {
  children: React.ReactNode;
  onClose: () => void;
  variant: "bottom" | "center";
}) {
  return (
    <div
      className={[
        "fixed inset-0 z-50 flex bg-[var(--overlay-40)]",
        variant === "bottom"
          ? "items-end justify-center"
          : "items-center justify-center p-4",
      ].join(" ")}
      onClick={onClose}
    >
      {children}
    </div>
  );
}

export function AppBottomSheet({
  ariaLabelledBy,
  badge,
  bodyClassName,
  children,
  closeDisabled,
  closeButtonRef,
  description,
  descriptionClassName,
  footer,
  headerSlot,
  leadingAction,
  onClose,
  panelClassName,
  panelRef,
  testId,
  title,
}: AppOverlayBaseProps) {
  return (
    <AppOverlayBackdrop onClose={onClose} variant="bottom">
      <div
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={[
          "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[var(--radius-sheet)] bg-[var(--wave1-surface)] text-[var(--wave1-ink)] shadow-[0_-10px_30px_var(--shadow-color-heavy)]",
          panelClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        data-app-overlay-shell="bottom-sheet"
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
      >
        <div className="flex justify-center pt-2">
          <div
            className="h-1 w-9 rounded-full bg-[var(--wave1-border)]"
            data-app-overlay-handle=""
          />
        </div>
        <div className="px-5 pb-3 pt-3">
          <ModalHeader
            closeDisabled={closeDisabled}
            closeButtonRef={closeButtonRef}
            badge={badge}
            description={description}
            descriptionClassName={descriptionClassName}
            leadingAction={leadingAction}
            onClose={onClose}
            title={title}
            titleId={ariaLabelledBy}
          />
          {headerSlot ? <div className="mt-3">{headerSlot}</div> : null}
        </div>
        <div
          className={[
            "min-h-0 flex-1 overflow-y-auto px-5 pb-4",
            bodyClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
        {footer ? (
          <div
            className="border-t border-[var(--wave1-border)] bg-[var(--wave1-surface)] px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3"
            data-app-modal-footer=""
          >
            {footer}
          </div>
        ) : null}
      </div>
    </AppOverlayBackdrop>
  );
}

export function AppCenterDialog({
  ariaLabelledBy,
  badge,
  children,
  closeDisabled,
  closeButtonRef,
  description,
  descriptionClassName,
  footer,
  leadingAction,
  onClose,
  panelRef,
  testId,
  title,
}: AppOverlayBaseProps) {
  return (
    <AppOverlayBackdrop onClose={onClose} variant="center">
      <div
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className="w-full max-w-md rounded-[var(--radius-sheet)] bg-[var(--wave1-surface)] p-5 text-[var(--wave1-ink)] shadow-[var(--wave1-shadow-crisp)]"
        data-app-overlay-shell="center-dialog"
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
      >
        <ModalHeader
          closeDisabled={closeDisabled}
          closeButtonRef={closeButtonRef}
          badge={badge}
          description={description}
          descriptionClassName={descriptionClassName}
          leadingAction={leadingAction}
          onClose={onClose}
          title={title}
          titleId={ariaLabelledBy}
        />
        <div className="mt-4">{children}</div>
        {footer ? (
          <div className="mt-5" data-app-modal-footer="">
            {footer}
          </div>
        ) : null}
      </div>
    </AppOverlayBackdrop>
  );
}

export function AppPickerSheet(props: AppOverlayBaseProps) {
  return <AppBottomSheet {...props} />;
}

export function AppConfirmDialog(props: AppOverlayBaseProps) {
  return <AppCenterDialog {...props} />;
}

export function AppModalFooterActions(props: AppModalFooterActionsProps) {
  return (
    <div data-app-modal-footer="" data-testid="app-modal-footer-actions">
      <ModalFooterActions {...props} />
    </div>
  );
}

export function AppStepper({
  disabled,
  label,
  min = 1,
  onChange,
  variant = "default",
  unit,
  value,
}: AppStepperProps) {
  const isCompact = variant === "compact";

  return (
    <div className="flex w-full items-center justify-between rounded-[var(--radius-control)] border border-[var(--wave1-border)] bg-[var(--wave1-surface-fill)] px-3 py-2.5">
      <span className="text-sm font-medium text-[var(--wave1-text-2)]">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          aria-label={`${unit ?? label} 줄이기`}
          className={[
            "flex h-[var(--control-height-md)] w-11 items-center justify-center disabled:opacity-40",
            isCompact
              ? ""
              : "rounded-full border border-[var(--wave1-border)] bg-[var(--wave1-surface)] text-lg font-bold leading-none text-[var(--wave1-ink)]",
          ].join(" ")}
          data-app-stepper-control="decrement"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          type="button"
        >
          {isCompact ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--wave1-border)] bg-[var(--wave1-surface)] text-sm font-medium leading-none text-[var(--wave1-ink)]">
              −
            </span>
          ) : (
            "-"
          )}
        </button>
        <span
          aria-label={unit ? `${value}${unit}` : String(value)}
          aria-live="polite"
          className="min-w-10 text-center text-base font-bold text-[var(--wave1-ink)]"
        >
          {unit ? `${value}${unit}` : value}
        </span>
        <button
          aria-label={`${unit ?? label} 늘리기`}
          className={[
            "flex h-[var(--control-height-md)] w-11 items-center justify-center disabled:opacity-40",
            isCompact
              ? ""
              : "rounded-full bg-[var(--wave1-ink)] text-lg font-bold leading-none text-[var(--wave1-surface)]",
          ].join(" ")}
          data-app-stepper-control="increment"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          type="button"
        >
          {isCompact ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--wave1-mint-contrast)] text-sm font-bold leading-none text-[var(--wave1-surface)]">
              +
            </span>
          ) : (
            "+"
          )}
        </button>
      </div>
    </div>
  );
}

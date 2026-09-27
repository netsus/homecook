"use client";

import { useEffect, useState } from "react";

import { APP_VIEW_MAX_WIDTH } from "@/components/shared/view-mode";

function hasKeyboardInputFocus() {
  const element = document.activeElement;
  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly
      && !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(element.type)
      && element.inputMode !== "none";
  }
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly && element.inputMode !== "none";
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

export function useSoftKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    let fullHeight = window.innerHeight;
    let width = window.innerWidth;
    let keyboardOpen = false;
    let frame = 0;

    const update = () => {
      const focused = hasKeyboardInputFocus();
      const touch = window.matchMedia?.("(any-pointer: coarse)").matches ?? false;
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        fullHeight = window.innerHeight;
      }
      if (!focused && !keyboardOpen) fullHeight = window.innerHeight;

      // Normalize pinch zoom, and ignore ordinary browser toolbar movement.
      const visibleHeight = viewport
        ? viewport.height * viewport.scale
        : window.innerHeight;
      const reduced = Math.max(fullHeight, window.innerHeight) - visibleHeight > 120;
      keyboardOpen = touch && width <= APP_VIEW_MAX_WIDTH
        && (viewport ? (focused || keyboardOpen) && reduced : focused);
      setOpen(keyboardOpen);
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      // focusout fires before activeElement settles on the next element.
      frame = requestAnimationFrame(update);
    };

    update();
    document.addEventListener("focusin", scheduleUpdate);
    document.addEventListener("focusout", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    viewport?.addEventListener("resize", scheduleUpdate);
    viewport?.addEventListener("scroll", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", scheduleUpdate);
      document.removeEventListener("focusout", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      viewport?.removeEventListener("resize", scheduleUpdate);
      viewport?.removeEventListener("scroll", scheduleUpdate);
    };
  }, []);

  return open;
}

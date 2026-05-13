export const WEB_VIEW_MIN_WIDTH = 1024;
export const APP_VIEW_MAX_WIDTH = WEB_VIEW_MIN_WIDTH - 1;

export const WEB_VIEW_MEDIA_QUERY = `(min-width: ${WEB_VIEW_MIN_WIDTH}px)`;
export const APP_VIEW_MEDIA_QUERY = `(max-width: ${APP_VIEW_MAX_WIDTH}px)`;

export type ViewMode = "app" | "web";

export function getViewModeForWidth(width: number): ViewMode {
  return width >= WEB_VIEW_MIN_WIDTH ? "web" : "app";
}

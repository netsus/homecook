import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebRecipeCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  alt: string;
  badge?: React.ReactNode;
  imageSrc?: string;
  meta?: React.ReactNode;
  title: React.ReactNode;
}

export function WebRecipeCard({
  alt,
  badge,
  className,
  imageSrc,
  meta,
  title,
  ...props
}: WebRecipeCardProps) {
  return (
    <div className={cn("web-recipe-card", className)} {...props}>
      <div className="web-recipe-card-thumb">
        {imageSrc ? (
          <span
            aria-label={alt}
            className="web-recipe-card-image"
            role="img"
            style={{ backgroundImage: `url(${imageSrc})` }}
          />
        ) : null}
        {badge ? <span className="web-recipe-card-badge">{badge}</span> : null}
      </div>
      <div className="web-recipe-card-body">
        <div className="web-recipe-card-title">{title}</div>
        {meta ? <div className="web-recipe-card-meta">{meta}</div> : null}
      </div>
    </div>
  );
}

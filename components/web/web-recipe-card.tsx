import Image from "next/image";
import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebRecipeCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  alt: string;
  imageSrc?: string;
  meta?: React.ReactNode;
  title: React.ReactNode;
}

export function WebRecipeCard({
  alt,
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
          <Image alt={alt} fill sizes="(min-width: 1024px) 25vw, 100vw" src={imageSrc} />
        ) : null}
      </div>
      <div className="web-recipe-card-body">
        <div className="web-recipe-card-title">{title}</div>
        {meta ? <div className="web-recipe-card-meta">{meta}</div> : null}
      </div>
    </div>
  );
}

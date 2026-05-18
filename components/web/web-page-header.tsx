import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebPageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  actions?: React.ReactNode;
  description?: React.ReactNode;
  title: React.ReactNode;
}

export function WebPageHeader({
  actions,
  className,
  description,
  title,
  ...props
}: WebPageHeaderProps) {
  return (
    <div className={cn("web-page-header", className)} {...props}>
      <div>
        <h1 className="web-page-title">{title}</h1>
        {description ? (
          <p className="web-page-description">{description}</p>
        ) : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}

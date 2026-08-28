"use client";

import { useEffect } from "react";

const TOP_OFFSET = 208;

type StickyBulkActionsProps = {
  targetId: string;
  sectionId?: string;
};

export default function StickyBulkActions({
  targetId,
  sectionId = "matching-inventory-items",
}: StickyBulkActionsProps) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    const section = document.getElementById(sectionId);

    if (!target) return;

    const placeholder = document.createElement("div");
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.display = "none";

    target.parentElement?.insertBefore(placeholder, target);

    const updatePosition = () => {
      const targetRect = target.getBoundingClientRect();
      const placeholderRect = placeholder.getBoundingClientRect();
      const sectionRect = section?.getBoundingClientRect();
      const targetHeight = target.offsetHeight || targetRect.height;

      const anchorTop =
        placeholder.style.display === "none"
          ? targetRect.top
          : placeholderRect.top;

      const shouldFloat =
        anchorTop <= TOP_OFFSET &&
        (!sectionRect || sectionRect.bottom > TOP_OFFSET + targetHeight + 8);

      if (!shouldFloat) {
        placeholder.style.display = "none";
        placeholder.style.height = "0px";

        target.style.position = "";
        target.style.left = "";
        target.style.top = "";
        target.style.width = "";
        target.style.zIndex = "";

        target.classList.remove("search-bulk-actions-floating");
        return;
      }

      const widthRect =
        placeholder.style.display === "none"
          ? targetRect
          : placeholderRect;

      placeholder.style.display = "block";
      placeholder.style.height = `${targetHeight}px`;

      target.style.position = "fixed";
      target.style.left = `${widthRect.left}px`;
      target.style.top = `${TOP_OFFSET}px`;
      target.style.width = `${widthRect.width}px`;
      target.style.zIndex = "50";

      target.classList.add("search-bulk-actions-floating");
    };

    updatePosition();

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(target);
    if (section) resizeObserver.observe(section);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      resizeObserver.disconnect();

      placeholder.remove();

      target.style.position = "";
      target.style.left = "";
      target.style.top = "";
      target.style.width = "";
      target.style.zIndex = "";

      target.classList.remove("search-bulk-actions-floating");
    };
  }, [sectionId, targetId]);

  return null;
}

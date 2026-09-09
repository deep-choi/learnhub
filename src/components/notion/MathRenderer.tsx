import React, { useEffect, useRef } from "react";

declare global {
  interface Window {
    katex?: {
      render: (tex: string, element: HTMLElement, options?: any) => void;
      renderToString: (tex: string, options?: any) => string;
    };
  }
}

interface MathRendererProps {
  math: string;
  block?: boolean;
  className?: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ math, block = false, className = "" }) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current && window.katex) {
      try {
        window.katex.render(math, containerRef.current, {
          displayMode: block,
          throwOnError: false,
        });
      } catch (e) {
        containerRef.current.innerText = math;
      }
    }
  }, [math, block]);

  return (
    <span
      ref={containerRef}
      className={`font-serif ${block ? "block my-2 text-center overflow-x-auto py-1" : "inline-block px-1"} ${className}`}
    >
      {math}
    </span>
  );
};
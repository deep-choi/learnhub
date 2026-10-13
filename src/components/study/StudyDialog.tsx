import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
export function StudyDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="m-auto max-h-[88dvh] w-[min(760px,calc(100%_-_24px))] overflow-hidden rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-0 text-[var(--lh-ink)] shadow-2xl backdrop:bg-black/35"
    >
      <header className="flex items-center justify-between border-b border-[var(--lh-line)] px-5 py-3">
        <h2 className="truncate text-base font-medium">{title}</h2>
        <button
          type="button"
          aria-label="닫기"
          onClick={close}
          className="rounded-full p-2 hover:bg-[var(--lh-surface-subtle)]"
        >
          <X size={19} />
        </button>
      </header>
      <div className="max-h-[calc(88dvh-65px)] overflow-y-auto p-5">
        {children}
      </div>
    </dialog>,
    document.body,
  );
}

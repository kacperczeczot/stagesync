import { useCallback, useRef, useState } from "react";

export function useTimelineCanvasNotice() {
  const [canvasNotice, setCanvasNotice] = useState<string | null>(null);
  const canvasNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const flashCanvasNotice = useCallback((message: string) => {
    if (canvasNoticeTimerRef.current) {
      clearTimeout(canvasNoticeTimerRef.current);
    }
    setCanvasNotice(message);
    canvasNoticeTimerRef.current = setTimeout(() => {
      setCanvasNotice(null);
      canvasNoticeTimerRef.current = null;
    }, 3200);
  }, []);

  return {
    canvasNotice,
    setCanvasNotice,
    canvasNoticeTimerRef,
    flashCanvasNotice,
  };
}

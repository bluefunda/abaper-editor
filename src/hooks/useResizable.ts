import { useCallback, useRef } from 'react';

interface UseResizableOptions {
  direction: 'horizontal' | 'vertical';
  initialSize: number;
  min: number;
  max: number;
  reverse?: boolean;
  onResize: (size: number) => void;
}

export function useResizable({ direction, initialSize, min, max, reverse, onResize }: UseResizableOptions) {
  const startPos = useRef(0);
  const startSize = useRef(initialSize);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
      startSize.current = initialSize;

      const onMouseMove = (ev: MouseEvent) => {
        const current = direction === 'horizontal' ? ev.clientX : ev.clientY;
        const delta = reverse ? startPos.current - current : current - startPos.current;
        const newSize = Math.min(max, Math.max(min, startSize.current + delta));
        onResize(newSize);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [direction, initialSize, min, max, reverse, onResize],
  );

  return { onMouseDown };
}

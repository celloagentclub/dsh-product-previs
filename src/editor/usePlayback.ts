import { useCallback, useEffect, useRef, useState } from 'react';
import { clampFrame } from './commands';

export function usePlayback(duration: number, fps: number, projectId: string) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const frameRef = useRef(0);
  const clock = useRef({ time: 0, frame: 0 });
  const seek = useCallback((next: number) => {
    const clamped = clampFrame(next, duration);
    frameRef.current = clamped;
    clock.current = { time: performance.now(), frame: clamped };
    setFrame(clamped);
  }, [duration]);
  useEffect(() => { setPlaying(false); frameRef.current = 0; setFrame(0); }, [projectId]);
  useEffect(() => { if (frameRef.current >= duration) seek(duration - 1); }, [duration, seek]);
  useEffect(() => {
    if (!playing || duration < 1) return;
    if (frameRef.current >= duration - 1) { frameRef.current = 0; setFrame(0); }
    clock.current = { time: performance.now(), frame: frameRef.current };
    let handle = 0;
    const tick = (now: number) => {
      const next = clock.current.frame + Math.floor((now - clock.current.time) * fps / 1000);
      if (next >= duration && !loop) {
        frameRef.current = duration - 1; setFrame(duration - 1); setPlaying(false); return;
      }
      const result = next % duration;
      if (frameRef.current !== result) { frameRef.current = result; setFrame(result); }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, duration, fps, loop]);
  const toggle = useCallback(() => setPlaying(value => !value), []);
  return { frame, seek, playing, toggle, pause: () => setPlaying(false), loop, setLoop };
}

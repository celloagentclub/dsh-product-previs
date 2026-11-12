/** Pixel check used when no vision model is configured. Samples the RGBA buffer. */
export function scorePixels(before: Uint8Array | number[], after: Uint8Array | number[], step = 16): {visible: number; changed: number} {
  const count = Math.floor(Math.min(before.length, after.length) / 4);
  let seen = 0, visible = 0, changed = 0;
  for (let pixel = 0; pixel < count; pixel += step) {
    const index = pixel * 4;
    seen++;
    const bright = before[index] + before[index + 1] + before[index + 2];
    if (bright > 0.08 * 3 || bright > 24) visible++;
    const delta = Math.abs(before[index] - after[index]) + Math.abs(before[index + 1] - after[index + 1]) + Math.abs(before[index + 2] - after[index + 2]);
    if (delta > 0.12 * 3 || delta > 36) changed++;
  }
  return {visible: seen ? visible / seen : 0, changed: seen ? changed / seen : 0};
}

export function pixelVerdict(score: {visible: number; changed: number}, motion: boolean): string[] {
  const notes: string[] = [];
  if (score.visible < 0.02) notes.push('产品几乎不在画面里');
  if (motion && score.changed < 0.035) notes.push('动作在像素上不明显');
  return notes;
}

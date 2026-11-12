import type {PrevisProject, Shot} from '../core/types';

const moveLine = (shot: Shot): string => {
  const move = shot.intent?.move ?? shot.camera.move;
  const composition = shot.intent?.composition ?? 'centered';
  if (move === 'locked') return `Locked-off camera, composition ${composition}. The product moves; the camera does not. Base and pivots stay inside the frame.`;
  if (move === 'slow-pull') return `Slow constant pull-back, same speed as the other product shots, composition ${composition}. The product itself holds still.`;
  if (move === 'slow-push') return `Slow constant push-in, composition ${composition}.`;
  if (move === 'handheld') return `Gentle handheld, composition ${composition}, as if a creator is sitting across the desk.`;
  if (move === 'orbit') return `Short orbit, composition ${composition}.`;
  if (move === 'crane') return `Slow crane up, composition ${composition}.`;
  if (move === 'over-shoulder') return `Over-shoulder, the person stays out of focus at the frame edge, composition ${composition}.`;
  return `${move}, composition ${composition}.`;
};

export function videoPrompt(project: PrevisProject, shot: Shot): string {
  const seconds = ((shot.end - shot.start) / project.fps).toFixed(2);
  const look = project.film?.look === 'studio-black'
    ? 'Pure black studio, thin rim light on the metal, soft contact shadow, faint floor reflection.'
    : 'Real desk, soft daylight, a creator setup.';
  const action = shot.intent?.move === 'locked'
    ? `Action: ${shot.description}`
    : shot.kind === 'broll-code'
      ? `Full-frame kinetic type on black: "${(shot.broll?.lines ?? []).join(' / ')}". No product, no people.`
      : 'The arm holds its pose.';
  const people = project.film?.style === 'brand' ? 'No people, no voiceover, no hands.' : 'At most the suggestion of a person; do not invent a face.';
  return [
    `Photoreal product commercial, ${seconds}s, 24fps, 16:9.`,
    look,
    'Subject: a six-axis AI monitor arm on a desk, matte metal segments, a 27-inch display.',
    moveLine(shot),
    action,
    people,
    `Lens around ${Math.round(shot.camera.from.focalLength)}mm, aperture f/${shot.camera.from.aperture}.`,
  ].join(' ');
}

export function promptPack(project: PrevisProject): {id: string; name: string; kind: string; seconds: number; prompt: string}[] {
  return [...project.shots].sort((a, b) => a.start - b.start).map(shot => ({
    id: shot.id, name: shot.name, kind: shot.kind ?? '3d',
    seconds: (shot.end - shot.start) / project.fps,
    prompt: shot.videoPrompt || videoPrompt(project, shot),
  }));
}

export function storyboardHtml(project: PrevisProject): string {
  const shots = [...project.shots].sort((a, b) => a.start - b.start);
  const cards = shots.map(shot => {
    const seconds = ((shot.end - shot.start) / project.fps).toFixed(2);
    const lines = (shot.broll?.lines ?? []).join('<br>');
    return `<article>
      <img src="output/frames/${shot.id}.png" alt="${escapeHtml(shot.name)}"/>
      <header><b>${escapeHtml(shot.id)} ${escapeHtml(shot.name)}</b><span>${shot.kind ?? '3d'} · ${seconds}s · ${shot.start}–${shot.end}</span></header>
      <p>${escapeHtml(shot.description)}</p>
      ${lines ? `<p class="type">${lines}</p>` : ''}
      <p class="meta">${escapeHtml(shot.intent?.move ?? '')} ${escapeHtml(shot.intent?.composition ?? '')} ${escapeHtml(shot.intent?.role ?? '')}</p>
      <p class="prompt">${escapeHtml(shot.videoPrompt || videoPrompt(project, shot))}</p>
    </article>`;
  }).join('\n');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${escapeHtml(project.film?.title ?? project.name)} 分镜</title>
<style>
body{margin:0;background:#0b0b0b;color:#eee;font:15px/1.45 Helvetica,Arial,"WenQuanYi Micro Hei",sans-serif}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;padding:24px}
article{background:#141414;border:1px solid #2a2a2a;padding:12px}
img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
header{display:flex;justify-content:space-between;gap:8px;margin-top:8px}
span,.meta,.prompt{color:#9a9a9a;font-size:12px}
.type{font-size:28px;letter-spacing:-.04em;margin:.2em 0}
h1{padding:24px 24px 0;font-weight:500;letter-spacing:-.03em}
</style></head><body>
<h1>${escapeHtml(project.film?.title ?? project.name)}</h1>
<p style="padding:0 24px;color:#9a9a9a">${escapeHtml(project.film?.logline ?? '')} · ${project.fps}fps · ${((project.durationFrames - 1) / project.fps).toFixed(1)}s · ${project.film?.bpm ?? ''} BPM</p>
<main>${cards}</main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[char]!));
}

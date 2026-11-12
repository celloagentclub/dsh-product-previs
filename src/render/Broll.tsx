import {AbsoluteFill} from 'remotion';
import type {Shot} from '../core/types';

const font = '"Helvetica Neue", Helvetica, Arial, "WenQuanYi Micro Hei", sans-serif';

/** Full-frame code shots: type, specs, a fake UI, a joint diagram, the end card. */
export function BrollFrame({shot, frame}: {shot: Shot; frame: number}) {
  const length = Math.max(1, shot.end - shot.start - 1);
  const t = Math.min(1, Math.max(0, (frame - shot.start) / length));
  const lines = shot.broll?.lines ?? [''];
  const template = shot.broll?.template ?? 'kinetic';
  const climax = shot.intent?.role === 'climax';
  const scale = climax ? 1 : 1.045 - t * 0.045;
  if (template === 'logo') {
    return <AbsoluteFill style={{background: '#000', color: '#fff', fontFamily: font, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{textAlign: 'center'}}>
        <div style={{fontSize: 168, fontWeight: 560, letterSpacing: '-0.045em', transform: `scale(${scale})`}}>{lines[0]}</div>
        {lines[1] && <div style={{marginTop: 18, fontSize: 28, letterSpacing: '0.18em', opacity: t > 0.18 ? 1 : 0}}>{lines[1]}</div>}
      </div>
    </AbsoluteFill>;
  }
  if (template === 'spec') {
    return <AbsoluteFill style={{background: '#000', color: '#fff', fontFamily: font, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{textAlign: 'center', transform: `scale(${scale})`}}>
        <div style={{fontSize: 220, fontWeight: 560, letterSpacing: '-0.05em', lineHeight: 0.9}}>{lines[0]}</div>
        {lines[1] && <div style={{marginTop: 8, fontSize: 42, letterSpacing: '0.22em'}}>{lines[1]}</div>}
      </div>
    </AbsoluteFill>;
  }
  if (template === 'diagram') {
    return <AbsoluteFill style={{background: '#000', color: '#fff', fontFamily: font, justifyContent: 'center', alignItems: 'center', gap: 18}}>
      <div style={{display: 'flex', gap: 18, alignItems: 'center'}}>
        {lines.map((line, index) => <div key={line} style={{display: 'flex', alignItems: 'center', gap: 18}}>
          <div style={{width: 92, height: 92, borderRadius: 46, border: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, letterSpacing: '0.08em'}}>{line}</div>
          {index < lines.length - 1 && <div style={{width: 28, height: 1, background: '#fff'}}/>}
        </div>)}
      </div>
    </AbsoluteFill>;
  }
  if (template === 'ui') {
    return <AbsoluteFill style={{background: '#000', color: '#fff', fontFamily: font, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{minWidth: 640, padding: '36px 48px', borderRadius: 28, background: '#141414', border: '1px solid #333', transform: `scale(${scale})`}}>
        <div style={{fontSize: 18, letterSpacing: '0.16em', color: '#9a9a9a', marginBottom: 12}}>CYBOPAL</div>
        <div style={{fontSize: 64, letterSpacing: '-0.04em'}}>{lines[0]}</div>
        {lines[1] && <div style={{marginTop: 14, fontSize: 18, letterSpacing: '0.14em', color: '#c8c8c8'}}>{lines[1]}</div>}
      </div>
    </AbsoluteFill>;
  }
  return <AbsoluteFill style={{background: '#000', color: '#fff', fontFamily: font, justifyContent: 'center', alignItems: 'center'}}>
    <div style={{fontSize: climax ? 200 : 168, fontWeight: 560, letterSpacing: '-0.05em', lineHeight: 0.9, textAlign: 'center', transform: `scale(${scale})`}}>{lines[0]}</div>
  </AbsoluteFill>;
}

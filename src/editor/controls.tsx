import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { V3 } from '../core/types';

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button type="button" {...props} className={`icon-button ${className}`} aria-label={label} title={props.title || label}>{children}</button>;
}
export function Section({ title, children, defaultOpen = true, action }: { title: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode }) {
  return <details className="inspector-section" open={defaultOpen || undefined}>
    <summary><ChevronDown size={13} /><span>{title}</span>{action && <span className="section-action" onClick={event => event.preventDefault()}>{action}</span>}</summary>
    <div className="section-body">{children}</div>
  </details>;
}
export function NumberField({ label, value, onCommit, min, max, step = 0.1, suffix, disabled, compact = false }: {
  label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean; compact?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(Number(value.toFixed(4)))); }, [value]);
  const commit = () => {
    focused.current = false;
    if (cancelled.current) { cancelled.current = false; setDraft(String(value)); return; }
    if (!draft.trim() || !Number.isFinite(Number(draft))) { setDraft(String(value)); return; }
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(draft)));
    setDraft(String(next));
    if (Math.abs(next - value) > 0.000001) onCommit(next);
  };
  return <label className={`number-field ${compact ? 'compact' : ''}`}><span>{label}</span><span className="number-input-wrap">
    <input type="number" aria-label={label} value={draft} min={min} max={max} step={step} disabled={disabled}
      onFocus={() => { focused.current = true; }} onChange={event => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(String(value)); event.currentTarget.blur(); } }} />
    {suffix && <span className="input-suffix">{suffix}</span>}
  </span></label>;
}
export function TextField({ label, value, onCommit, disabled, multiline = false }: { label: string; value: string; onCommit: (value: string) => void; disabled?: boolean; multiline?: boolean }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  const commit = () => { focused.current = false; if (draft !== value) onCommit(draft); };
  const props = { value: draft, disabled, 'aria-label': label, onFocus: () => { focused.current = true; }, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: commit };
  return <label className="field-row"><span>{label}</span>{multiline ? <textarea {...props} rows={2} /> : <input {...props} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />}</label>;
}
export function VectorField({ label, value, onCommit, step = 0.1, min, suffix }: { label: string; value: V3; onCommit: (axis: 0 | 1 | 2, value: number) => void; step?: number; min?: number; suffix?: string }) {
  return <div className="vector-field"><span className="vector-label">{label}{suffix && <small>{suffix}</small>}</span><div className="vector-inputs">
    {(['X', 'Y', 'Z'] as const).map((axis, index) => <NumberField compact key={axis} label={axis} value={value[index]} min={min} step={step} onCommit={next => onCommit(index as 0 | 1 | 2, next)} />)}
  </div></div>;
}
export function RangeField({ label, value, min, max, step = 1, onPreview, onCommit, suffix = '', disabled }: {
  label: string; value: number; min: number; max: number; step?: number; onPreview?: (value: number) => void; onCommit: (value: number) => void; suffix?: string; disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const draftRef = useRef(value);
  useEffect(() => { if (!dirty.current) { setDraft(value); draftRef.current = value; } }, [value]);
  const commit = () => { if (dirty.current) { dirty.current = false; onCommit(draftRef.current); } };
  return <div className="range-field"><div className="range-heading"><label htmlFor={`range-${label}`}>{label}</label><span>{Number(draft.toFixed(2))}{suffix}</span></div>
    <input id={`range-${label}`} aria-label={label} type="range" min={min} max={max} step={step} value={draft} disabled={disabled}
      onChange={event => { const next = Number(event.target.value); dirty.current = true; draftRef.current = next; setDraft(next); onPreview?.(next); }}
      onPointerUp={commit} onBlur={commit} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(); }} />
  </div>;
}
export function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="field-row"><span>{label}</span><select value={value} aria-label={label} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}

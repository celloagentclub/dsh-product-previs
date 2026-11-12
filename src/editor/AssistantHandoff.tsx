import { useEffect, useRef, useState } from 'react';
import { Check, Clipboard, MessageSquareText, RefreshCw, X } from 'lucide-react';
import type { PrevisProject } from '../core/types';
import { request } from './api';

export function AssistantHandoff({ project, selectedId, selectedPartId, frame, onClose }: { project: PrevisProject; selectedId?: string; selectedPartId?: string; frame: number; onClose: () => void }) {
  const [context, setContext] = useState('正在整理项目上下文…');
  const [requestText, setRequestText] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef<HTMLElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const refresh = async () => {
    setError('');
    try {
      const result = await request<{ project: PrevisProject; selection?: unknown; [key: string]: unknown }>(`/api/context?id=${encodeURIComponent(project.id)}`);
      const payload = { ...result, projectId: project.id, selectedId: selectedId || null, selectedPartId: selectedPartId || null, frame, frameTimeSeconds: Number((frame / project.fps).toFixed(3)) };
      setContext(JSON.stringify(payload, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setContext(JSON.stringify({ projectId: project.id, selectedId: selectedId || null, selectedPartId: selectedPartId || null, frame, frameTimeSeconds: Number((frame / project.fps).toFixed(3)) }, null, 2));
    }
  };
  useEffect(() => { void refresh(); }, [project.id, selectedId, selectedPartId, frame]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    prompt.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') || []);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    panel.current?.addEventListener('keydown', onKey);
    const element = panel.current;
    return () => { element?.removeEventListener('keydown', onKey); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  const copyContent = `${context}\n\n请求：${requestText.trim() || '请基于这个项目、当前选中对象与帧，协助编排镜头和动作。'}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(copyContent); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { textarea.current?.focus(); textarea.current?.select(); setError('浏览器不允许自动复制，已选中文本。按 ⌘C 复制。'); }
  };
  return <div className="handoff-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className="handoff-panel" role="dialog" aria-modal="true" aria-labelledby="handoff-title"><header><div><MessageSquareText size={16} /><h2 id="handoff-title">带入 DSH 对话</h2></div><button className="icon-button" aria-label="关闭编排上下文" onClick={onClose}><X size={15} /></button></header>
      <p>这里不直接运行 AI。复制项目上下文，回到 DSH 对话发送请求；AI 会在同一个项目中修改。</p>
      <label className="handoff-request"><span>编排请求</span><textarea ref={prompt} value={requestText} onChange={event => setRequestText(event.target.value)} placeholder="例如：让人偶从桌边走近，抬手操作屏幕，镜头缓慢环绕机械臂。" rows={2} /></label>
      <div className="handoff-status"><span>项目 {project.id} · 修订 {project.revision}</span><button className="text-button" onClick={() => void refresh()}><RefreshCw size={12} />刷新上下文</button></div>
      {error && <p className="inline-error">{error}</p>}
      <textarea ref={textarea} className="context-textarea" aria-label="待复制的项目上下文与请求" value={copyContent} readOnly spellCheck={false} />
      <footer><span>复制后回到 DSH 对话发送</span><button className="primary-button copy-button" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? '已复制' : '复制上下文与请求'}</button></footer>
    </section>
  </div>;
}

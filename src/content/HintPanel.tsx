import { Fragment, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  buildHintPrompt,
  DEFAULT_HINT_PANEL_LAYOUT,
  DEFAULT_LEARNER_REQUEST,
  DEFAULT_OLLAMA_SETTINGS,
  HintHistoryEntry,
  HintPanelLayout,
  normaliseEndpoint,
  parseOllamaLine,
} from '../shared/ollama';
import { ollamaStorage } from '../shared/storage';

export interface ProblemContext {
  slug: string;
  title: string;
  description: string;
  language: string;
  code: string;
}

interface Props { context: ProblemContext }
type HealthStatus = 'unknown' | 'checking' | 'online' | 'offline';

function readCurrentLanguage(fallback: string): string {
  const candidates = [
    document.querySelector<HTMLSelectElement>('select[aria-label*="language" i]')?.value,
    document.querySelector<HTMLSelectElement>('select[name*="language" i]')?.value,
    document.querySelector<HTMLElement>('[aria-label*="language" i]')?.textContent,
    document.querySelector<HTMLElement>('[class*="language-selector" i]')?.textContent,
    document.querySelector<HTMLElement>('[class*="language" i][role="button"]')?.textContent,
  ];
  const languagePattern = /\b(c\+\+|c#|cpp|csharp|javascript|typescript|python|java|kotlin|swift|rust|ruby|php|golang|go|js|ts|py)\b/i;
  for (const candidate of candidates) {
    const match = candidate?.match(languagePattern);
    if (match) return match[1];
  }

  for (const editor of document.querySelectorAll<HTMLElement>('.monaco-editor, .cm-editor')) {
    for (const className of Array.from(editor.classList)) {
      const match = className.match(/(?:language|lang)[-_](.+)/i)?.[1]?.match(languagePattern);
      if (match) return match[1];
    }
  }
  return fallback;
}

function readProblemDescription(): string {
  const selectors = [
    '[data-testid*="problem" i]', '[data-testid*="description" i]',
    '[class*="problem-description" i]', '[class*="problem-statement" i]',
    '[class*="statement" i]', '[class*="question" i]', '[class*="description" i]',
    '[class*="prose" i]', 'main article', 'main', 'article',
  ];
  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element) => {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript').forEach((node) => node.remove());
      return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    }))
    .filter((text) => text.length > 80 && text.length < 12000)
    .sort((left, right) => right.length - left.length);
  return candidates[0]
    ?? document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.trim()
    ?? '';
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\$[^$]+\$)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('$') && part.endsWith('$')) return <span className="ollama-hint-math" key={index}>{part.slice(1, -1)}</span>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function MarkdownHint({ text }: { text: string }) {
  const blocks = text.split(/(```[^\n]*\n[\s\S]*?```)/g);
  return <>{blocks.map((block, index) => {
    const codeMatch = block.match(/^```[^\n]*\n([\s\S]*?)```$/);
    if (codeMatch) return <pre className="ollama-hint-code" key={index}><code>{codeMatch[1].trimEnd()}</code></pre>;
    return <span key={index}>{block.split('\n').map((line, lineIndex) => (
      <Fragment key={lineIndex}>{lineIndex > 0 ? <br /> : null}{renderInlineMarkdown(line)}</Fragment>
    ))}</span>;
  })}</>;
}

function readCurrentEditorCode(fallback: string): string {
  return document.querySelector<HTMLTextAreaElement>('.monaco-editor textarea')?.value
    ?? document.querySelector<HTMLTextAreaElement>('textarea')?.value
    ?? document.querySelector<HTMLElement>('.view-lines')?.innerText
    ?? document.querySelector<HTMLElement>('.cm-content')?.innerText
    ?? fallback;
}

export default function HintPanel({ context }: Props) {
  const [history, setHistory] = useState<HintHistoryEntry[]>([]);
  const [layout, setLayout] = useState<HintPanelLayout>(DEFAULT_HINT_PANEL_LAYOUT);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [learnerRequest, setLearnerRequest] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [health, setHealth] = useState<HealthStatus>('unknown');
  const [healthMessage, setHealthMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const checkHealth = useCallback(async (endpointOverride = endpoint) => {
    if (!endpointOverride.trim()) return;
    setHealth('checking');
    setHealthMessage('');
    try {
      const response = await fetch(`${normaliseEndpoint(endpointOverride)}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setHealth('online');
    } catch (caught) {
      setHealth('offline');
      setHealthMessage(caught instanceof Error ? caught.message : 'Unable to reach Ollama');
    }
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    setReady(false);
    void Promise.all([
      ollamaStorage.getHintHistory(context.slug),
      ollamaStorage.getSettings(),
      ollamaStorage.getPanelLayout(),
    ])
      .then(([savedHistory, settings, savedLayout]) => {
        if (!active) return;
        setHistory(savedHistory);
        setLayout(normaliseLayout(savedLayout));
        setEndpoint(settings.endpoint);
        setModel(settings.model);
        setSystemPrompt(settings.systemPrompt);
        setLearnerRequest(settings.learnerRequest);
        setAnswer('');
        setError('');
        setReady(true);
        void checkHealth(settings.endpoint);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Unable to load hint settings.');
          setReady(true);
        }
      });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [checkHealth, context.slug]);

  useEffect(() => {
    if (!ready) return;
    void ollamaStorage.savePanelLayout(layout);
  }, [layout, ready]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || layout.collapsed) return;
    const observer = new ResizeObserver(() => {
      const rect = panel.getBoundingClientRect();
      setLayout((current) => normaliseLayout({ ...current, width: rect.width, height: rect.height }));
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [layout.collapsed]);

  const updateLayout = (changes: Partial<HintPanelLayout>) => {
    setLayout((current) => normaliseLayout({ ...current, ...changes }));
  };

  const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      offsetX: event.clientX - layout.x,
      offsetY: event.clientY - layout.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleHeaderPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    updateLayout({
      x: event.clientX - dragRef.current.offsetX,
      y: event.clientY - dragRef.current.offsetY,
    });
  };

  const stopDragging = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      event.preventDefault();
      updateLayout({
        x: event.clientX - dragRef.current.offsetX,
        y: event.clientY - dragRef.current.offsetY,
      });
    };
    const handleWindowPointerUp = () => stopDragging();
    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  });

  const requestHint = async () => {
    const code = readCurrentEditorCode(context.code).trim();
    if (!code) {
      setError('Add some code in the editor before asking for a hint.');
      return;
    }
    setLoading(true);
    setAnswer('');
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const language = readCurrentLanguage(context.language);
      const currentDescription = readProblemDescription();
      const prompt = buildHintPrompt(context.title, currentDescription || context.description, language, code, history.map((item) => item.response), learnerRequest);
      const response = await fetch(`${normaliseEndpoint(endpoint)}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
      setHealth('online');
      if (!response.body) throw new Error('Ollama returned an empty response.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let remainder = '';
      let text = '';
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        remainder += decoder.decode(chunk.value, { stream: !chunk.done });
        const lines = remainder.split('\n');
        remainder = lines.pop() ?? '';
        for (const line of lines) {
          const parsed = parseOllamaLine(line);
          if (parsed.error) throw new Error(parsed.error);
          text += parsed.content;
          setAnswer(text);
          done = parsed.done;
        }
        if (chunk.done) done = true;
      }
      if (remainder.trim()) {
        const parsed = parseOllamaLine(remainder);
        if (parsed.error) throw new Error(parsed.error);
        text += parsed.content;
        setAnswer(text);
      }
      if (!text.trim()) throw new Error('Ollama returned no hint.');
      const entry = { id: crypto.randomUUID(), prompt, response: text, model, createdAt: Date.now() };
      const nextHistory = [...history, entry];
      setHistory(nextHistory);
      await ollamaStorage.saveHintHistory(context.slug, nextHistory);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setHealth('offline');
      setError(caught instanceof Error ? caught.message : 'Unable to request a hint.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!endpoint.trim() || !model.trim() || !systemPrompt.trim() || !learnerRequest.trim()) {
      setError('Endpoint, model, system prompt, and learner request are required.');
      return;
    }
    try {
      await ollamaStorage.saveSettings({ endpoint: endpoint.trim(), model: model.trim(), systemPrompt: systemPrompt.trim(), learnerRequest: learnerRequest.trim() });
      setSettingsOpen(false);
      setError('');
      void checkHealth(endpoint.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save hint settings.');
    }
  };

  const restoreDefaultSystemPrompt = () => {
    setSystemPrompt(DEFAULT_OLLAMA_SETTINGS.systemPrompt);
    setError('');
  };

  const restoreDefaultLearnerRequest = () => {
    setLearnerRequest(DEFAULT_LEARNER_REQUEST);
    setError('');
  };

  const deleteHint = async (id: string) => {
    const nextHistory = history.filter((item) => item.id !== id);
    setHistory(nextHistory);
    await ollamaStorage.saveHintHistory(context.slug, nextHistory);
  };

  const deleteAllHints = async () => {
    if (!history.length) return;
    setHistory([]);
    setAnswer('');
    await ollamaStorage.saveHintHistory(context.slug, []);
  };

  return (
    <section
      ref={panelRef}
      className={`ollama-hint-panel${layout.collapsed ? ' ollama-hint-panel-collapsed' : ''}`}
      style={{ left: `${layout.x}px`, top: `${layout.y}px`, width: `${layout.width}px`, height: layout.collapsed ? 'auto' : `${layout.height}px` }}
    >
      <div
        className="ollama-hint-header"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div className="ollama-hint-title"><strong>AI hint coach</strong><span className={`ollama-health ollama-health-${health}`}><span className="ollama-health-dot" />{health === 'checking' ? 'Checking Ollama…' : health === 'online' ? 'Ollama ready' : health === 'offline' ? 'Ollama offline' : 'Ollama status unknown'}</span></div>
        <div className="ollama-hint-header-actions">
          <button onClick={() => updateLayout({ collapsed: !layout.collapsed })} aria-label={layout.collapsed ? 'Expand hints' : 'Collapse hints'}>{layout.collapsed ? '＋' : '−'}</button>
          <button onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Hint settings">⚙</button>
        </div>
      </div>
      {!layout.collapsed && (settingsOpen ? (
        <div className="ollama-hint-settings">
          <label>Ollama endpoint<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label>
          <label>Model<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
          <label>System prompt<textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} /></label>
          <label>Learner request<textarea value={learnerRequest} onChange={(event) => setLearnerRequest(event.target.value)} /></label>
          <div className="ollama-hint-settings-actions">
            <button className="ollama-hint-secondary" onClick={restoreDefaultSystemPrompt}>Restore default</button>
            <button className="ollama-hint-secondary" onClick={restoreDefaultLearnerRequest}>Restore default</button>
            <button className="ollama-hint-secondary" onClick={() => void checkHealth()}>Check connection</button>
            <button className="ollama-hint-primary" onClick={() => void saveSettings()}>Save settings</button>
          </div>
          {healthMessage ? <p className="ollama-hint-health-message">{healthMessage}</p> : null}
        </div>
      ) : <>
        <div className="ollama-hint-toolbar">
          <small>{history.length} {history.length === 1 ? 'hint' : 'hints'}</small>
          <button className="ollama-hint-danger-link" disabled={!history.length} onClick={() => void deleteAllHints()}>Delete all</button>
        </div>
        {history.map((item, index) => <div className="ollama-hint-history" key={item.id}><div className="ollama-hint-history-heading"><small>Hint {index + 1}</small><button className="ollama-hint-delete" onClick={() => void deleteHint(item.id)} aria-label={`Delete hint ${index + 1}`}>×</button></div><p><MarkdownHint text={item.response} /></p><small className="ollama-hint-model">Model: {item.model ?? 'unknown'}</small></div>)}
        {answer && !history.some((item) => item.response === answer) ? <div className="ollama-hint-history ollama-hint-streaming"><div className="ollama-hint-history-heading"><small>Streaming hint…</small><span className="ollama-hint-live">LIVE</span></div><p><MarkdownHint text={answer} /></p></div> : null}
        {error ? <p className="ollama-hint-error">{error}</p> : null}
        <div className="ollama-hint-actions">
          {loading ? <><span className="ollama-hint-waiting"><span className="ollama-hint-spinner" />Ollama is thinking and streaming your hint…</span><button onClick={() => abortRef.current?.abort()}>Cancel</button></> : <button className="ollama-hint-primary" disabled={!ready} onClick={() => void requestHint()}>Get hint</button>}
        </div>
      </>)}
    </section>
  );
}

function normaliseLayout(layout: HintPanelLayout): HintPanelLayout {
  const width = Math.min(Math.max(layout.width, 280), Math.max(window.innerWidth - 24, 280));
  const height = Math.min(Math.max(layout.height, 180), Math.max(window.innerHeight - 24, 180));
  const x = layout.x < 0 ? window.innerWidth - width - 24 : layout.x;
  const y = layout.y < 0 ? window.innerHeight - height - 24 : layout.y;
  return {
    ...layout,
    width,
    height,
    x: Math.min(Math.max(x, 12), Math.max(window.innerWidth - width - 12, 12)),
    y: Math.min(Math.max(y, 12), Math.max(window.innerHeight - height - 12, 12)),
  };
}

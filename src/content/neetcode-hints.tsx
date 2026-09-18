import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import HintPanel, { ProblemContext } from './HintPanel';
import './hints.css';

const LANGUAGE_NAMES = new Set([
  'c', 'c++', 'cpp', 'csharp', 'c#', 'go', 'java', 'javascript', 'js',
  'kotlin', 'php', 'python', 'py', 'ruby', 'rust', 'swift', 'typescript', 'ts',
]);

function normaliseLanguage(value: string): string | null {
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 30) return null;
  const match = cleaned.match(/\b(c\+\+|c#|c|cpp|csharp|javascript|typescript|python|java|kotlin|swift|rust|ruby|php|golang|go|js|ts|py)\b/);
  return match?.[1] ?? (LANGUAGE_NAMES.has(cleaned) ? cleaned : null);
}

function readLanguage(): string {
  const candidates = [
    document.querySelector<HTMLSelectElement>('select[aria-label*="language" i]')?.value,
    document.querySelector<HTMLSelectElement>('select[name*="language" i]')?.value,
    document.querySelector<HTMLElement>('[aria-label*="language" i]')?.textContent,
    document.querySelector<HTMLElement>('[class*="language-selector" i]')?.textContent,
    document.querySelector<HTMLElement>('[class*="language" i][role="button"]')?.textContent,
  ];
  for (const candidate of candidates) {
    const language = candidate ? normaliseLanguage(candidate) : null;
    if (language) return language;
  }
  const editorClasses = Array.from(document.querySelectorAll<HTMLElement>('.monaco-editor, .cm-editor'))
    .flatMap((element) => Array.from(element.classList));
  for (const className of editorClasses) {
    const language = normaliseLanguage(className.replace(/^language[-_]/, '').replace(/^lang[-_]/, ''));
    if (language) return language;
  }
  return 'unknown';
}

function textFromCandidate(element: Element | null): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, noscript').forEach((node) => node.remove());
  return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function readProblemDescription(): string {
  const selectors = [
    '[data-testid*="problem" i]',
    '[data-testid*="description" i]',
    '[class*="problem-description" i]',
    '[class*="problem-statement" i]',
    '[class*="statement" i]',
    '[class*="question" i]',
    '[class*="description" i]',
    '[class*="prose" i]',
    'main article',
    'main',
    'article',
  ];
  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)).map(textFromCandidate))
    .filter((text) => text.length > 80 && text.length < 12000)
    .sort((left, right) => right.length - left.length);
  if (candidates[0]) return candidates[0];

  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.trim();
  return metaDescription ?? '';
}

function readContext(): ProblemContext | null {
  const match = window.location.pathname.match(/\/problems\/([^/]+)/);
  if (!match) return null;
  const editor = document.querySelector<HTMLTextAreaElement>('.monaco-editor textarea')?.value
    ?? document.querySelector<HTMLTextAreaElement>('textarea')?.value
    ?? document.querySelector<HTMLElement>('.view-lines')?.innerText
    ?? document.querySelector<HTMLElement>('.cm-content')?.innerText
    ?? '';
  const title = document.querySelector('h1')?.textContent?.trim() || match[1].replace(/-/g, ' ');
  const description = readProblemDescription();
  const language = readLanguage();
  return { slug: match[1], title, description, language, code: editor };
}

function Panel() {
  const [context] = useState<ProblemContext | null>(readContext);
  return context ? <HintPanel key={context.slug} context={context} /> : null;
}

const host = document.createElement('div');
host.className = 'ollama-hint-root';
document.documentElement.appendChild(host);
const root = createRoot(host);
root.render(<StrictMode><Panel /></StrictMode>);

const observer = new MutationObserver(() => {
  if (window.location.href !== lastObservedUrl) {
    lastObservedUrl = window.location.href;
    root.render(<StrictMode><Panel /></StrictMode>);
  }
});
let lastObservedUrl = window.location.href;
observer.observe(document.body, { childList: true, subtree: true });

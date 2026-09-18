import { describe, expect, it } from 'vitest';
import { buildHintPrompt, DEFAULT_LEARNER_REQUEST, parseOllamaLine } from './ollama';

describe('Ollama helpers', () => {
  it('parses streamed NDJSON chunks', () => {
    expect(parseOllamaLine('{"message":{"content":"Think about the invariant."}}')).toEqual({
      content: 'Think about the invariant.',
      done: false,
    });
    expect(parseOllamaLine('{"done":true}')).toEqual({ content: '', done: true });
  });

  it('constructs a prompt with context and hint history', () => {
    const prompt = buildHintPrompt('Two Sum', 'Find two numbers.', 'typescript', 'const nums = [];', ['Use a map.'], DEFAULT_LEARNER_REQUEST);
    expect(prompt).toContain('Two Sum');
    expect(prompt).toContain('```typescript');
    expect(prompt).toContain('Previous hints');
    expect(prompt).toContain('Do not repeat');
    expect(prompt).toContain('edge cases');
  });
});

import {spawn} from 'node:child_process';

export interface LanguageModel {
  id: string;
  complete(system: string, user: string): Promise<string>;
}

export function scriptedModel(): LanguageModel {
  return {id: 'scripted', async complete() { throw new Error('scripted 模型不发请求'); }};
}

export function deepseekModel(apiKey = process.env.DEEPSEEK_API_KEY, baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'): LanguageModel {
  return {
    id: 'deepseek',
    async complete(system, user) {
      if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
        body: JSON.stringify({model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat', messages: [{role: 'system', content: system}, {role: 'user', content: user}], temperature: 0.2}),
      });
      if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
      const body = await response.json() as {choices?: {message?: {content?: string}}[]};
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new Error('DeepSeek 没有返回文本');
      return text;
    },
  };
}

export function codexModel(): LanguageModel {
  return {
    id: 'codex',
    async complete(system, user) {
      const prompt = `${system}\n\n${user}\n\n只输出 JSON。`;
      const child = spawn('codex', ['exec', '--skip-git-repo-check', prompt], {stdio: ['ignore', 'pipe', 'pipe']});
      let out = '', err = '';
      child.stdout.on('data', chunk => { out += chunk; });
      child.stderr.on('data', chunk => { err += chunk; });
      const code = await new Promise<number>(resolve => child.on('close', resolve));
      if (code !== 0) throw new Error(err.trim() || `codex 退出 ${code}`);
      return out;
    },
  };
}

export function resolveModel(name = process.env.PREVIS_MODEL ?? 'scripted'): LanguageModel {
  if (name === 'deepseek') return deepseekModel();
  if (name === 'codex') return codexModel();
  if (name === 'scripted') return scriptedModel();
  throw new Error(`未知模型 ${name}（支持 scripted / deepseek / codex）`);
}

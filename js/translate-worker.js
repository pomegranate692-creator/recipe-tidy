/* Recipe Snap — on-device translation worker (Transformers.js). Runs off the main thread so the page stays responsive. */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

env.allowLocalModels = false; // always fetch models from the Hugging Face hub (cached by the browser after the first time)
const pipes = {};

self.onmessage = async ({ data }) => {
  const { id, model, texts, src } = data;
  try {
    if (!pipes[model]) {
      pipes[model] = pipeline('translation', model, {
        dtype: 'q8',
        progress_callback: p => { if (p.status === 'progress') self.postMessage({ id, download: { file: p.file, loaded: p.loaded, total: p.total } }); }
      });
    }
    const tr = await pipes[model];
    const isNllb = model.includes('nllb');
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      const opts = isNllb ? { src_lang: src, tgt_lang: 'eng_Latn', max_new_tokens: 400 } : { max_new_tokens: 400 };
      const r = await tr(texts[i], opts);
      out.push((r[0] && r[0].translation_text) || texts[i]);
      self.postMessage({ id, done: i + 1, total: texts.length });
    }
    self.postMessage({ id, result: out });
  } catch (e) {
    delete pipes[model];
    self.postMessage({ id, error: e && e.message ? e.message : String(e) });
  }
};

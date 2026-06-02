/**
 * translator.js — Multi-engine Translation Module
 */

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const DEEPL_URL_FREE = 'https://api-free.deepl.com/v2/translate';

/**
 * Translate text using selected service
 * @param {string} text - Text to translate
 * @param {string} from - Source language code
 * @param {string} to - Target language code
 * @param {object} settings - { service: 'mymemory'|'deepl'|'gemini', apiKey: string }
 * @returns {Promise<string>} Translated text
 */
export async function translate(text, from, to, settings = { service: 'mymemory' }) {
    if (!text || !text.trim()) return '';

    if (settings.service === 'deepl') {
        return translateDeepL(text, from, to, settings.apiKey, settings.plan);
    }
    if (settings.service === 'gemini') {
        return translateGemini(text, from, to, settings.geminiApiKey);
    }
    return translateMyMemory(text, from, to);
}

/**
 * Handle MyMemory API
 */
async function translateMyMemory(text, from, to) {
    const langpair = `${from}|${to}`;
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`MyMemory API error: ${response.status}`);
    const data = await response.json();

    if (data.responseStatus === 200 && data.responseData) {
        return decodeHtmlEntities(data.responseData.translatedText);
    }
    if (data.matches && data.matches.length > 0) {
        return decodeHtmlEntities(data.matches[0].translation);
    }
    throw new Error('No translation found');
}

/**
 * Decode HTML entities from API responses (e.g. &#39; → ' , &amp; → &)
 */
function decodeHtmlEntities(text) {
    if (!text) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

/**
 * Handle DeepL API via Proxy
 */
async function translateDeepL(text, from, to, apiKey, plan) {
    if (!apiKey) throw new Error('DeepL API Key is missing. Please set it in Settings.');

    // Language code adjustments for DeepL
    const sourceLang = from.toUpperCase();
    let targetLang = to.toUpperCase();
    if (targetLang === 'EN') targetLang = 'EN-US'; 

    // Call our Netlify Function (Proxy) to avoid CORS
    try {
        const response = await fetch('/.netlify/functions/translate-deepl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                target_lang: targetLang,
                source_lang: sourceLang,
                auth_key: apiKey,
                plan: plan
            })
        });

        if (response.status === 404) {
            throw new Error('DeepL integration error (404). If you are testing locally, this is expected as functions require Netlify. If on Netlify, please check your API key type (Free/Pro).');
        }

        if (response.status === 403) throw new Error('DeepL API Key is invalid');
        
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(`DeepL Error: ${data.error || response.status}`);
        }

        if (data.translations && data.translations.length > 0) {
            return data.translations[0].text;
        }
        throw new Error('No translation found from DeepL');
    } catch (e) {
        if (e.message.includes('Failed to fetch')) {
            throw new Error('Connection error. Please ensure you are using Netlify.');
        }
        throw e;
    }
}

/**
 * Get language pair codes
 */
export function getLangPair(side, userLang) {
    if (side === 'user') {
        return { from: userLang, to: 'yue' };
    } else {
        return { from: 'yue', to: userLang };
    }
}

/**
 * Handle Gemini API Translation
 */
const GEMINI_TRANSLATE_MODELS = [
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
];

const LANG_NAMES = {
    'en': 'English', 'ja': 'Japanese', 'zh': 'Chinese',
    'yue': 'Cantonese Chinese', 'ko': 'Korean',
};

async function translateGemini(text, from, to, apiKey) {
    if (!apiKey) throw new Error('Gemini API Keyが未設定です。設定から入力してください。');

    const fromName = LANG_NAMES[from] || from;
    const toName = LANG_NAMES[to] || to;
    const prompt = `Translate the following text from ${fromName} to ${toName}. Return ONLY the translated text, no explanations or extra formatting.\n\n${text}`;

    let lastError = null;
    for (const model of GEMINI_TRANSLATE_MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
                }),
            });

            if (response.status === 429 || response.status === 404) {
                lastError = `Model ${model}: ${response.status}`;
                continue;
            }
            if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

            const data = await response.json();
            const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (result) return result.trim();
            throw new Error('No translation returned');
        } catch (err) {
            lastError = err.message;
            if (err.message.includes('429') || err.message.includes('404')) continue;
            throw err;
        }
    }
    throw new Error(`Gemini翻訳失敗: ${lastError}`);
}

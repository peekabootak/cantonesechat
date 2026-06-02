/**
 * main.js — Cantonese Chat Translator Application
 */

import { translate, getLangPair } from './modules/translator.js';
import { startRecognition, stopRecognition, getIsRecording, speak, getSpeechLang, isSpeechRecognitionSupported } from './modules/speech.js';
import { toJyutping, toJyutpingSegments } from './modules/jyutping.js';
import { lookupWord, hasEntry, getAllWords, initDictionary } from './modules/dictionary.js';

// ═══════════════════════════
// State
// ═══════════════════════════
const MAX_CHAT_HISTORY = 100;

const state = {
    userLang: localStorage.getItem('userLang') || 'en',
    currentSide: 'user',
    messages: [],
    isTranslating: false,
    translationService: localStorage.getItem('translationService') || 'mymemory',
    deeplApiKey: localStorage.getItem('deeplApiKey') || '',
    deeplPlan: localStorage.getItem('deeplPlan') || 'free',
    geminiApiKey: localStorage.getItem('geminiApiKey') || '',
};

// ═══════════════════════════
// DOM Elements
// ═══════════════════════════
const $ = (sel) => document.querySelector(sel);
const chatArea = $('#chat-area');
const messageInput = $('#message-input');
const sendBtn = $('#send-btn');
const voiceBtn = $('#voice-btn');
const langJa = $('#lang-ja');
const langEn = $('#lang-en');
const tabUser = $('#tab-user');
const tabPartner = $('#tab-partner');
const inputLangHint = $('#input-lang-hint');
const modeIndicator = $('#mode-indicator');
const wordPopup = $('#word-popup');
const popupClose = $('#popup-close');
const popupWord = $('#popup-word');
const popupJyutping = $('#popup-jyutping');
const popupMeaning = $('#popup-meaning');
const popupSynonyms = $('#popup-synonyms');
const popupAntonyms = $('#popup-antonyms');
// Settings elements are queried dynamically to avoid issues with early script execution
const getSettingsElements = () => ({
    popup: $('#settings-popup'),
    close: $('#settings-close'),
    toggle: $('#settings-toggle'),
    save: $('#settings-save'),
    deeplKey: $('#deepl-key-input'),
    deeplConfig: $('#deepl-config'),
    geminiKey: $('#gemini-key-input'),
    radios: document.querySelectorAll('input[name="api-service"]'),
    deeplPlanRadios: document.querySelectorAll('input[name="deepl-plan"]'),
    helpPopup: $('#help-popup'),
    helpToggle: $('#help-toggle'),
    helpClose: $('#help-close')
});

// ═══════════════════════════
// Initialize
// ═══════════════════════════
async function init() {
    // Load dictionaries
    inputLangHint.textContent = 'Loading Dictionary...';
    
    const { initJyutpingDictionary } = await import('./modules/jyutping.js');
    await Promise.all([
        initJyutpingDictionary(),
        initDictionary()
    ]);

    // Restore saved language from localStorage
    setLanguage(state.userLang);

    updateUI();
    loadSettingsUI();
    bindEvents();
    autoResizeTextarea();

    // Restore chat history from localStorage
    restoreChatHistory();

    // Check speech support
    if (!isSpeechRecognitionSupported()) {
        voiceBtn.title = 'Please use Chrome/Edge for voice recognition';
        voiceBtn.style.opacity = '0.4';
    }
}

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

function bindEvents() {
    // Language toggle
    langJa.addEventListener('click', () => setLanguage('ja'));
    langEn.addEventListener('click', () => setLanguage('en'));

    // Side tabs
    tabUser.addEventListener('click', () => setSide('user'));
    tabPartner.addEventListener('click', () => setSide('partner'));

    // Send
    sendBtn.addEventListener('click', handleSend);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Voice
    voiceBtn.addEventListener('click', handleVoice);

    // Popup
    popupClose.addEventListener('click', closePopup);
    wordPopup.addEventListener('click', (e) => {
        if (e.target === wordPopup) closePopup();
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', autoResizeTextarea);

    // Mobile: scroll to bottom on focus to ensure input is visible
    messageInput.addEventListener('focus', () => {
        setTimeout(scrollToBottom, 300);
    });

    // Settings Modal
    const els = getSettingsElements();
    if (els.toggle) els.toggle.addEventListener('click', openSettings);
    if (els.close) els.close.addEventListener('click', closeSettings);
    if (els.save) els.save.addEventListener('click', saveSettings);
    els.radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (els.deeplConfig) els.deeplConfig.style.display = e.target.value === 'deepl' ? 'block' : 'none';
        });
    });

    // Help Modal
    if (els.helpToggle) els.helpToggle.addEventListener('click', openHelp);
    if (els.helpClose) els.helpClose.addEventListener('click', closeHelp);
    if (els.helpPopup) {
        els.helpPopup.addEventListener('click', (e) => {
            if (e.target === els.helpPopup) closeHelp();
        });
    }
}

// ═══════════════════════════
// Language & Side
// ═══════════════════════════
function setLanguage(lang) {
    state.userLang = lang;
    localStorage.setItem('userLang', lang);
    langJa.classList.toggle('active', lang === 'ja');
    langEn.classList.toggle('active', lang === 'en');
    updateUI();
}

function setSide(side) {
    state.currentSide = side;
    tabUser.classList.toggle('active', side === 'user');
    tabPartner.classList.toggle('active', side === 'partner');
    updateUI();
}

function updateUI() {
    const { userLang, currentSide } = state;
    const modeText = modeIndicator.querySelector('.mode-text');

    if (currentSide === 'user') {
        const langLabel = userLang === 'ja' ? 'Japanese' : 'English';
        inputLangHint.textContent = `Type in ${langLabel} → Translate to Cantonese`;
        messageInput.placeholder = userLang === 'ja' ? 'Type message...' : 'Type message...';
        modeText.textContent = 'Your Mode';
        tabUser.innerHTML = '<span class="tab-icon">👤</span> You';
        tabPartner.innerHTML = '<span class="tab-icon">🙋</span> Partner';
    } else {
        inputLangHint.textContent = '廣東話輸入 → Translate';
        messageInput.placeholder = '廣東話輸入...';
        modeText.textContent = 'Partner Mode';
        tabUser.innerHTML = '<span class="tab-icon">👤</span> You';
        tabPartner.innerHTML = '<span class="tab-icon">🙋</span> Partner';
    }
}

// ═══════════════════════════
// Send Message
// ═══════════════════════════
async function handleSend() {
    const text = messageInput.value.trim();
    if (!text || state.isTranslating) return;

    state.isTranslating = true;
    messageInput.value = '';
    autoResizeTextarea();

    const side = state.currentSide;
    const { from, to } = getLangPair(side, state.userLang);

    // Add original message with loading
    const msgId = addMessage(side, text, null, null, true);

    try {
        const translated = await translate(text, from, to, {
            service: state.translationService,
            apiKey: state.deeplApiKey,
            plan: state.deeplPlan,
            geminiApiKey: state.geminiApiKey
        });

        // Determine which text is Cantonese for Jyutping
        let cantoneseText, otherText;
        if (side === 'user') {
            // User typed ja/en → got Cantonese back
            cantoneseText = translated;
            otherText = text;
        } else {
            // Partner typed Cantonese → got ja/en back
            cantoneseText = text;
            otherText = translated;
        }

        const jyutping = toJyutping(cantoneseText);

        updateMessage(msgId, {
            original: text,
            translated: translated,
            cantoneseText: cantoneseText,
            jyutping: jyutping,
            side: side,
            loading: false,
        });

        // Save to chat history (max 100)
        saveChatMessage({
            original: text,
            translated: translated,
            cantoneseText: cantoneseText,
            jyutping: jyutping,
            side: side,
            time: new Date().toISOString(),
        });
    } catch (error) {
        updateMessage(msgId, {
            original: text,
            translated: '⚠️ 翻訳エラー: ' + error.message,
            cantoneseText: side === 'partner' ? text : '',
            jyutping: side === 'partner' ? toJyutping(text) : '',
            side: side,
            loading: false,
            error: true,
        });
    }

    state.isTranslating = false;

    // Auto-alternate mode: switch You ↔ Partner after each message
    setSide(side === 'user' ? 'partner' : 'user');
}

// ═══════════════════════════
// Voice Input
// ═══════════════════════════
function handleVoice() {
    if (getIsRecording()) {
        stopRecognition();
        voiceBtn.classList.remove('recording');
        return;
    }

    voiceBtn.classList.add('recording');

    startRecognition(
        state.currentSide,
        state.userLang,
        // onResult
        (text) => {
            messageInput.value = text;
            autoResizeTextarea();
        },
        // onEnd
        () => {
            voiceBtn.classList.remove('recording');
        },
        // onError
        (errMsg) => {
            voiceBtn.classList.remove('recording');
            showToast(errMsg);
        }
    );
}

// ═══════════════════════════
// Message Rendering
// ═══════════════════════════
let messageCounter = 0;

function addMessage(side, text, translated, jyutping, loading = false) {
    // Remove welcome screen
    const welcome = chatArea.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const id = `msg-${++messageCounter}`;
    const div = document.createElement('div');
    div.className = `message ${side}`;
    div.id = id;

    if (loading) {
        div.innerHTML = `
      <div class="message-bubble">
        <div class="message-original">${escapeHtml(text)}</div>
        <div class="message-loading">
          <div class="loading-dot"></div>
          <div class="loading-dot"></div>
          <div class="loading-dot"></div>
        </div>
      </div>
    `;
    }

    chatArea.appendChild(div);
    scrollToBottom();
    return id;
}

function updateMessage(msgId, data) {
    const div = document.getElementById(msgId);
    if (!div) return;

    const { original, translated, cantoneseText, jyutping, side, error } = data;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Build Cantonese text with clickable words
    let cantoneseHtml = '';
    if (cantoneseText) {
        const segments = toJyutpingSegments(cantoneseText, getAllWords());
        cantoneseHtml = segments.map(seg => {
            if (seg.isChinese && seg.text.trim()) {
                return `<span class="cantonese-word" data-word="${escapeHtml(seg.text)}" data-jyutping="${escapeHtml(seg.jyutping)}">${escapeHtml(seg.text)}</span>`;
            }
            return escapeHtml(seg.text);
        }).join('');
    }

    if (side === 'user') {
        // User typed ja/en. Show: original(ja/en) → translated(cantonese + jyutping)
        div.innerHTML = `
      <div class="message-bubble">
        <div class="message-original">${escapeHtml(original)}</div>
        <div class="message-translation" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
          ${cantoneseHtml || escapeHtml(translated)}
        </div>
        ${jyutping ? `<div class="message-jyutping">${escapeHtml(jyutping)}</div>` : ''}
      </div>
      <div class="message-meta">
        <span class="message-time">${time}</span>
        ${cantoneseText ? `<button class="message-speak-btn" data-text="${escapeAttr(cantoneseText)}" data-lang="cantonese" title="読み上げ">🔊</button>` : ''}
      </div>
    `;
    } else {
        // Partner typed Cantonese. Show: original(cantonese + jyutping) → translated(ja/en)
        div.innerHTML = `
      <div class="message-bubble">
        <div class="message-original">${cantoneseHtml || escapeHtml(original)}</div>
        ${jyutping ? `<div class="message-jyutping">${escapeHtml(jyutping)}</div>` : ''}
        <div class="message-translation">${escapeHtml(translated)}</div>
      </div>
      <div class="message-meta">
        <span class="message-time">${time}</span>
        <button class="message-speak-btn" data-text="${escapeAttr(cantoneseText || original)}" data-lang="cantonese" title="Read in Cantonese">🔊粵</button>
        <button class="message-speak-btn" data-text="${escapeAttr(translated)}" data-lang="${state.userLang}" title="${state.userLang === 'ja' ? 'Read in Japanese' : 'Read in English'}">🔊${state.userLang === 'ja' ? '日' : 'EN'}</button>
      </div>
    `;
    }

    // Bind speak buttons
    div.querySelectorAll('.message-speak-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.dataset.text;
            const lang = getSpeechLang(btn.dataset.lang);
            speak(text, lang).catch(() => { });
        });
    });

    // Bind word clicks
    div.querySelectorAll('.cantonese-word').forEach(wordEl => {
        wordEl.addEventListener('click', () => {
            const word = wordEl.dataset.word;
            showWordPopup(word);
        });
    });

    scrollToBottom();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    });
}

// ═══════════════════════════
// Chat History Persistence
// ═══════════════════════════
function saveChatMessage(msg) {
    try {
        const history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        history.push(msg);
        // Keep only last MAX_CHAT_HISTORY messages
        while (history.length > MAX_CHAT_HISTORY) history.shift();
        localStorage.setItem('chatHistory', JSON.stringify(history));
    } catch (e) {
        console.warn('Failed to save chat history:', e);
    }
}

function restoreChatHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        if (history.length === 0) return;

        // Remove welcome screen
        const welcome = chatArea.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        for (const msg of history) {
            const id = `msg-${++messageCounter}`;
            const div = document.createElement('div');
            div.className = `message ${msg.side}`;
            div.id = id;
            chatArea.appendChild(div);

            const time = msg.time ? new Date(msg.time) : new Date();
            const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

            // Build Cantonese HTML with clickable words
            let cantoneseHtml = '';
            if (msg.cantoneseText) {
                const segments = toJyutpingSegments(msg.cantoneseText, getAllWords());
                cantoneseHtml = segments.map(seg => {
                    if (seg.isChinese && seg.text.trim()) {
                        return `<span class="cantonese-word" data-word="${escapeHtml(seg.text)}" data-jyutping="${escapeHtml(seg.jyutping)}">${escapeHtml(seg.text)}</span>`;
                    }
                    return escapeHtml(seg.text);
                }).join('');
            }

            if (msg.side === 'user') {
                div.innerHTML = `
                  <div class="message-bubble">
                    <div class="message-original">${escapeHtml(msg.original)}</div>
                    <div class="message-translation" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
                      ${cantoneseHtml || escapeHtml(msg.translated)}
                    </div>
                    ${msg.jyutping ? `<div class="message-jyutping">${escapeHtml(msg.jyutping)}</div>` : ''}
                  </div>
                  <div class="message-meta">
                    <span class="message-time">${timeStr}</span>
                    ${msg.cantoneseText ? `<button class="message-speak-btn" data-text="${escapeAttr(msg.cantoneseText)}" data-lang="cantonese" title="読み上げ">🔊</button>` : ''}
                  </div>
                `;
            } else {
                div.innerHTML = `
                  <div class="message-bubble">
                    <div class="message-original">${cantoneseHtml || escapeHtml(msg.original)}</div>
                    ${msg.jyutping ? `<div class="message-jyutping">${escapeHtml(msg.jyutping)}</div>` : ''}
                    <div class="message-translation">${escapeHtml(msg.translated)}</div>
                  </div>
                  <div class="message-meta">
                    <span class="message-time">${timeStr}</span>
                    <button class="message-speak-btn" data-text="${escapeAttr(msg.cantoneseText || msg.original)}" data-lang="cantonese" title="Read in Cantonese">🔊粵</button>
                    <button class="message-speak-btn" data-text="${escapeAttr(msg.translated)}" data-lang="${state.userLang}" title="${state.userLang === 'ja' ? 'Read in Japanese' : 'Read in English'}">🔊${state.userLang === 'ja' ? '日' : 'EN'}</button>
                  </div>
                `;
            }

            // Bind speak buttons
            div.querySelectorAll('.message-speak-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    speak(btn.dataset.text, getSpeechLang(btn.dataset.lang)).catch(() => {});
                });
            });

            // Bind word clicks
            div.querySelectorAll('.cantonese-word').forEach(wordEl => {
                wordEl.addEventListener('click', () => showWordPopup(wordEl.dataset.word));
            });
        }

        scrollToBottom();
        console.log(`Restored ${history.length} chat messages from history`);
    } catch (e) {
        console.warn('Failed to restore chat history:', e);
    }
}

// ═══════════════════════════
// Word Popup
// ═══════════════════════════
function showWordPopup(word) {
    const entry = lookupWord(word, state.userLang);

    if (!entry) {
        // Show basic info even without dictionary entry
        popupWord.textContent = word;
        const jp = toJyutping(word);
        popupJyutping.textContent = jp || '';
        popupMeaning.textContent = state.userLang === 'ja'
            ? '辞書に登録されていません'
            : 'No dictionary entry found';
        popupSynonyms.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">—</span>';
        popupAntonyms.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">—</span>';
    } else {
        popupWord.textContent = entry.word;
        popupJyutping.textContent = entry.jyutping;
        popupMeaning.textContent = entry.meaning;

        popupSynonyms.innerHTML = entry.synonyms.length > 0
            ? entry.synonyms.map(s => `
          <span class="popup-tag">
            ${escapeHtml(s.word)}
            <span class="popup-tag-jyutping">${escapeHtml(s.jyutping)}</span>
          </span>
        `).join('')
            : '<span style="color: var(--text-muted); font-size: 0.8rem;">—</span>';

        popupAntonyms.innerHTML = entry.antonyms.length > 0
            ? entry.antonyms.map(a => `
          <span class="popup-tag">
            ${escapeHtml(a.word)}
            <span class="popup-tag-jyutping">${escapeHtml(a.jyutping)}</span>
          </span>
        `).join('')
            : '<span style="color: var(--text-muted); font-size: 0.8rem;">—</span>';
    }

    wordPopup.classList.add('active');

    // Add/update favorites button in popup
    let favBtn = wordPopup.querySelector('.popup-fav-btn');
    if (!favBtn) {
        favBtn = document.createElement('button');
        favBtn.className = 'popup-fav-btn';
        favBtn.style.cssText = 'margin-top:12px; padding:8px 16px; background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); color:#fbbf24; border-radius:10px; font-size:16px; cursor:pointer; width:100%;';
        wordPopup.querySelector('.popup-content').appendChild(favBtn);
    }
    const favs = JSON.parse(localStorage.getItem('favoriteWords') || '[]');
    const isSaved = favs.some(f => f.word === word);
    favBtn.textContent = isSaved ? '✅ 追加済み' : '⭐ 単語帳に追加';
    favBtn.style.color = isSaved ? '#86efac' : '#fbbf24';
    favBtn.onclick = () => {
        const currentFavs = JSON.parse(localStorage.getItem('favoriteWords') || '[]');
        if (currentFavs.some(f => f.word === word)) return;
        currentFavs.push({
            word: word,
            jyutping: popupJyutping.textContent,
            meaning: popupMeaning.textContent,
            addedAt: new Date().toISOString(),
        });
        localStorage.setItem('favoriteWords', JSON.stringify(currentFavs));
        favBtn.textContent = '✅ 追加済み';
        favBtn.style.color = '#86efac';
    };
}

function closePopup() {
    wordPopup.classList.remove('active');
}

// ═══════════════════════════
// Toast Notification
// ═══════════════════════════
function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
    position: fixed;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(231, 76, 60, 0.9);
    color: white;
    padding: 10px 20px;
    border-radius: 20px;
    font-size: 0.85rem;
    z-index: 200;
    backdrop-filter: blur(10px);
    animation: toast-in 0.3s ease;
  `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openSettings() {
    const els = getSettingsElements();
    if (!els.popup) {
        console.error('Settings popup not found');
        return;
    }
    // Sync UI with state
    els.radios.forEach(radio => {
        if (radio.value === state.translationService) radio.checked = true;
    });
    if (els.deeplKey) els.deeplKey.value = state.deeplApiKey;
    if (els.deeplPlanRadios) {
        els.deeplPlanRadios.forEach(radio => {
            if (radio.value === state.deeplPlan) radio.checked = true;
        });
    }
    if (els.deeplConfig) els.deeplConfig.style.display = state.translationService === 'deepl' ? 'block' : 'none';
    if (els.geminiKey) els.geminiKey.value = state.geminiApiKey;
    els.popup.classList.add('active');
}

function closeSettings() {
    const els = getSettingsElements();
    if (els.popup) els.popup.classList.remove('active');
}

function saveSettings() {
    const els = getSettingsElements();
    const checkedRadio = Array.from(els.radios).find(r => r.checked);
    if (!checkedRadio) return;

    state.translationService = checkedRadio.value;
    state.deeplApiKey = els.deeplKey ? els.deeplKey.value.trim() : '';
    state.geminiApiKey = els.geminiKey ? els.geminiKey.value.trim() : '';

    const checkedPlan = Array.from(els.deeplPlanRadios).find(r => r.checked);
    if (checkedPlan) state.deeplPlan = checkedPlan.value;

    localStorage.setItem('translationService', state.translationService);
    localStorage.setItem('deeplApiKey', state.deeplApiKey);
    localStorage.setItem('deeplPlan', state.deeplPlan);
    localStorage.setItem('geminiApiKey', state.geminiApiKey);

    closeSettings();
    showToast('Settings saved');
}

function loadSettingsUI() {
    const els = getSettingsElements();
    // Initial UI fix based on state
    els.radios.forEach(radio => {
        if (radio.value === state.translationService) radio.checked = true;
    });
    if (els.deeplPlanRadios) {
        els.deeplPlanRadios.forEach(radio => {
            if (radio.value === state.deeplPlan) radio.checked = true;
        });
    }
    if (els.deeplConfig) els.deeplConfig.style.display = state.translationService === 'deepl' ? 'block' : 'none';
}

function openHelp() {
    const els = getSettingsElements();
    if (els.helpPopup) els.helpPopup.classList.add('active');
}

function closeHelp() {
    const els = getSettingsElements();
    if (els.helpPopup) els.helpPopup.classList.remove('active');
}

// ═══════════════════════════
// Utilities
// ═══════════════════════════
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ═══════════════════════════
// Theme Toggle
// ═══════════════════════════
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeButton(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeButton(next);
}

function updateThemeButton(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// ═══════════════════════════
// Start
// ═══════════════════════════
initTheme();
document.addEventListener('DOMContentLoaded', () => {
    init();
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
});

/**
 * speech.js — Web Speech API Module (Recognition + Synthesis)
 */

let recognition = null;
let isRecording = false;

/**
 * Check if speech recognition is supported
 */
export function isSpeechRecognitionSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Get SpeechRecognition language code
 * @param {'user'|'partner'} side
 * @param {'ja'|'en'} userLang
 * @returns {string}
 */
function getRecognitionLang(side, userLang) {
    let lang = 'ja-JP';
    if (side === 'partner') {
        lang = 'zh-HK'; // Using zh-HK as it's more universally supported than yue-Hant-HK
    } else {
        lang = userLang === 'ja' ? 'ja-JP' : 'en-US';
    }
    console.log('Using recognition lang:', lang);
    return lang;
}

/**
 * Start speech recognition
 * @param {'user'|'partner'} side
 * @param {'ja'|'en'} userLang
 * @param {(text: string) => void} onResult
 * @param {() => void} onEnd
 * @param {(err: string) => void} onError
 */
export function startRecognition(side, userLang, onResult, onEnd, onError) {
    if (!isSpeechRecognitionSupported()) {
        onError('このブラウザは音声認識をサポートしていません。Chrome をお試しください。');
        return;
    }

    stopRecognition();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = getRecognitionLang(side, userLang);
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interim += transcript;
            }
        }
        onResult(finalTranscript || interim);
    };

    recognition.onend = () => {
        isRecording = false;
        onEnd();
    };

    recognition.onerror = (event) => {
        isRecording = false;
        let msg = 'Speech recognition error';
        switch (event.error) {
            case 'no-speech': msg = 'No speech was detected'; break;
            case 'audio-capture': msg = 'Microphone not found'; break;
            case 'not-allowed': msg = 'Microphone permission denied. Note: HTTPS(SSL) is required.'; break;
            case 'network': msg = 'Network error (offline?)'; break;
            case 'language-not-supported': msg = 'Selected language is not supported'; break;
            case 'service-not-allowed': msg = 'Speech service not allowed'; break;
            default: msg = `Recognition error: ${event.error}`;
        }
        console.error('Speech recognition error:', event.error);
        onError(msg);
    };

    recognition.start();
    isRecording = true;
}

/**
 * Stop current recognition
 */
export function stopRecognition() {
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {
            // Already stopped
        }
        recognition = null;
    }
    isRecording = false;
}

/**
 * Check if currently recording
 */
export function getIsRecording() {
    return isRecording;
}

/**
 * Speak text using SpeechSynthesis
 * @param {string} text - Text to speak
 * @param {'zh-HK'|'ja-JP'|'en-US'} lang - Language code
 * @returns {Promise<void>}
 */
export function speak(text, lang) {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            reject(new Error('Speech synthesis not supported'));
            return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9;
        utterance.pitch = 1;

        // Try to find a matching voice
        const voices = window.speechSynthesis.getVoices();
        
        let matchingVoice = null;
        if (lang === 'zh-HK') {
            // Prioritize Cantonese specific voices
            matchingVoice = voices.find(v => 
                v.lang === 'zh-HK' || 
                v.lang === 'yue-HK' || 
                v.lang === 'zh-yue-HK' ||
                v.name.toLowerCase().includes('hong kong') ||
                v.name.toLowerCase().includes('cantonese') ||
                v.name.toLowerCase().includes('粤語') ||
                v.name.toLowerCase().includes('粵語')
            );
        } else {
            const langPrefix = lang.split('-')[0];
            matchingVoice = voices.find(v => v.lang === lang) ||
                            voices.find(v => v.lang.startsWith(langPrefix));
        }

        if (matchingVoice) {
            utterance.voice = matchingVoice;
            console.log('Selected voice:', matchingVoice.name, matchingVoice.lang);
        }

        utterance.onend = resolve;
        utterance.onerror = (e) => reject(e);

        window.speechSynthesis.speak(utterance);
    });
}

/**
 * Get speech language code for output
 * @param {'cantonese'|'ja'|'en'} type
 * @returns {string}
 */
export function getSpeechLang(type) {
    switch (type) {
        case 'cantonese': return 'zh-HK';
        case 'ja': return 'ja-JP';
        case 'en': return 'en-US';
        default: return 'zh-HK';
    }
}

// Preload voices
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

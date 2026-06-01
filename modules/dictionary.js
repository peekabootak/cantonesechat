/**
 * dictionary.js — Cantonese Synonym & Antonym Dictionary Module
 * Updated to load data from dictionary_data.json
 */

// Loaded dictionary data
let DICTIONARY = {};
let isLoaded = false;

/**
 * Initialize the dictionary by fetching the JSON data.
 * @returns {Promise<boolean>} Success status
 */
export async function initDictionary() {
    if (isLoaded) return true;
    
    try {
        const response = await fetch('./dictionary_data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        DICTIONARY = await response.json();
        isLoaded = true;
        console.log('Dictionary labels loaded:', Object.keys(DICTIONARY).length, 'entries');
        return true;
    } catch (error) {
        console.error('Failed to load dictionary data:', error);
        // Minimal fallback for safety if fetch fails
        DICTIONARY = {
            '好': { jyutping: 'hou2', meaning_ja: '良い', meaning_en: 'good' },
            '唔該': { jyutping: 'm4goi1', meaning_ja: 'ありがとう', meaning_en: 'thank you' }
        };
        return false;
    }
}

/**
 * Look up a word in the dictionary
 * @param {string} word - Cantonese word to look up
 * @param {'ja'|'en'} lang - Language for meaning
 * @returns {object|null}
 */
export function lookupWord(word, lang = 'ja') {
    // Try exact match
    let entry = DICTIONARY[word];

    // Try substrings (for compound words)
    if (!entry && word.length > 1) {
        for (let len = word.length; len >= 1; len--) {
            for (let start = 0; start <= word.length - len; start++) {
                const sub = word.substring(start, start + len);
                if (DICTIONARY[sub]) {
                    entry = DICTIONARY[sub];
                    word = sub;
                    break;
                }
            }
            if (entry) break;
        }
    }

    if (!entry) return null;

    // Normalize synonym/antonym entries to always use {word, jyutping} format
    // (handles legacy {w, j} format from earlier data imports)
    const normalize = (arr) => (arr || []).map(item => ({
        word: item.word || item.w || '',
        jyutping: item.jyutping || item.j || '',
    }));

    return {
        word: word,
        jyutping: entry.jyutping,
        meaning: lang === 'ja' ? entry.meaning_ja : entry.meaning_en,
        synonyms: normalize(entry.synonyms),
        antonyms: normalize(entry.antonyms),
    };
}

/**
 * Check if a word exists in the dictionary
 * @param {string} word
 * @returns {boolean}
 */
export function hasEntry(word) {
    if (DICTIONARY[word]) return true;
    // Try single-char lookups
    for (const char of word) {
        if (DICTIONARY[char]) return true;
    }
    return false;
}

/**
 * Get all word keys from dictionary, sorted by length (desc)
 * @returns {string[]}
 */
export function getAllWords() {
    return Object.keys(DICTIONARY).sort((a, b) => b.length - a.length);
}

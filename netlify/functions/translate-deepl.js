const DEEPL_URL_FREE = 'https://api-free.deepl.com/v2/translate';
const DEEPL_URL_PRO = 'https://api.deepl.com/v2/translate';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

    try {
    const { text, target_lang, source_lang, auth_key, plan } = JSON.parse(event.body);

    if (!auth_key) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Missing DeepL API Key' }) 
      };
    }

    // Determine API URL based on plan or auto-detect
    // Aggressively clean the key of any hidden characters
    const cleanKey = auth_key.replace(/[\s\n\r\t]/g, ''); 
    let isFree = cleanKey.endsWith(':fx');
    if (plan === 'free') isFree = true;
    if (plan === 'pro') isFree = false;
    
    const apiUrl = isFree ? DEEPL_URL_FREE : DEEPL_URL_PRO;

    console.log(`DeepL Debug (Header Auth): URL=${apiUrl}, KeyLength=${cleanKey.length}, isFree=${isFree}`);
    console.log(`Key Prefix: ${cleanKey.substring(0, 4)}... Key Suffix: ...${cleanKey.slice(-4)}`);

    const params = new URLSearchParams();
    params.append('text', text);
    params.append('target_lang', target_lang);
    if (source_lang && source_lang !== '') {
      params.append('source_lang', source_lang);
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      body: params.toString(),
      headers: {
        'Authorization': `DeepL-Auth-Key ${cleanKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const bodyText = await response.text();
    let data = {};
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      data = { raw: bodyText };
    }
    
    if (!response.ok) {
        console.error('DeepL API Error:', response.status, data);
        return {
            statusCode: response.status,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: data.message || `DeepL API returned ${response.status}`,
                details: data 
            })
        };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('DeepL Proxy Function Exception:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

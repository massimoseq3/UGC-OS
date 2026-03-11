# Security

## Architecture

UGC Lab runs **100% client-side** in your browser. There is no backend server. Your data never leaves your machine except when making API calls directly to Google.

## API Key Handling

- You provide your own Google AI API key via the Settings modal.
- Your key is stored in your browser's `localStorage` — it never touches any server we control.
- API calls go directly from your browser to Google's Gemini API over HTTPS.
- Your key is sent in the `x-goog-api-key` request header (not in URLs).

## Recommendations

1. **Use a restricted API key.** In the Google Cloud Console, restrict your key to only the Generative Language API.
2. **Set a billing alert.** Configure budget alerts in Google Cloud to avoid unexpected charges.
3. **Don't share your browser storage.** Your API key lives in localStorage — don't export or share it.
4. **Rotate keys if compromised.** If you suspect your key was exposed, revoke it in Google Cloud Console and create a new one.

## Reporting Vulnerabilities

If you discover a security issue, please open a GitHub issue or contact the maintainers directly.

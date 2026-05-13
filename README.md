# Nisor Image Box

Chrome extension for generating image prompts with Gemini and sending them into Google Flow.

Repository: https://github.com/noralam/nisor-image-box

## Overview

Nisor Image Box lets you upload multiple images, generate prompt text from each image with the Gemini API, preview the generated prompts, and send them into Google Flow in sequence.

## Features

- Upload multiple images with drag and drop or file picker.
- Generate prompts from images using the Gemini API.
- Preview generated prompts before sending them.
- Send prompts to Google Flow one by one.
- Track prompt progress inside the popup UI.
- Store API key and model settings locally in Chrome storage.

## Requirements

- Google Chrome or another Chromium-based browser with extension developer mode.
- A Gemini API key from Google AI Studio.
- Access to Google Flow at https://labs.google/fx/tools/flow.

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this project folder.
6. Reload the extension after future code changes.

## Setup

1. Open the extension popup.
2. Enter your Gemini API key in the Settings tab.
3. Choose a Gemini model, or enter a custom model name.
4. Open Google Flow in a browser tab.

## Usage

1. Upload one or more images.
2. Adjust the injection interval if needed.
3. Click `Generate & Start Auto-Inject`.
4. Wait for prompt generation to finish.
5. Keep the Google Flow tab open while prompts are sent.

## Permissions

The extension currently uses these Chrome permissions:

- `storage` to save API key and model settings locally.
- `activeTab` to work with the current Flow tab.
- `scripting` to inject page-side logic into Flow.
- `clipboardWrite` for fallback editor insertion behavior.
- `debugger` to dispatch browser-level input events when submitting prompts to Flow.

## Project Structure

```text
nisor-image-box/
├── background.js
├── content.js
├── manifest.json
├── popup.html
├── popup.js
├── icon16.png
├── icon48.png
├── icon128.png
└── README.md
```

## Notes

- Generated prompts are based on Gemini API responses.
- The extension runs only against Google Flow and Gemini API endpoints declared in `manifest.json`.
- Chrome may show a debugging infobar because the extension uses the `debugger` permission for submission input.

## Limitations

- The Flow UI can change without notice, which may break selectors or submission behavior.
- Gemini API usage is subject to rate limits and billing rules on your account.
- The extension currently supports up to 100 uploaded images per session.

## Troubleshooting

### Flow tab not found

- Open https://labs.google/fx/tools/flow in a tab.
- Refresh the Flow page and try again.

### Prompt generation failed

- Check that your Gemini API key is valid.
- Confirm the selected model name is available to your account.
- Verify your network connection and API quota.

### Prompt inserts but does not submit

- Reload the extension after code changes.
- Refresh the Flow page before retrying.
- Keep the Flow tab visible and active during injection.

## Development

No build step is required. This project is a plain Chrome extension loaded directly from source.

## Contributing

Issues and pull requests are welcome.

## Disclaimer

This project is not affiliated with Google. Use it at your own risk and review Google Flow and Gemini terms before production use.

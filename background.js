let injectionState = {
  isRunning: false,
  prompts: [],
  currentIndex: 0,
  interval: 15000,
  intervalId: null,
  generationComplete: false,
  isSending: false,
  lastSentAt: 0
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startInjection') {
    startInjection(message);
  } else if (message.action === 'stopInjection') {
    stopInjection();
  }
});

async function startInjection({ prompts, interval, images, apiKey, model }) {
  injectionState.prompts = (prompts || []).map((item, index) => ({
    prompt: item.prompt,
    index: typeof item.index === 'number' ? item.index : index
  }));
  injectionState.interval = interval;
  injectionState.isRunning = true;
  injectionState.currentIndex = 0;
  injectionState.generationComplete = !(images && images.length);
  injectionState.isSending = false;
  injectionState.lastSentAt = 0;
  if (injectionState.intervalId) {
    clearTimeout(injectionState.intervalId);
    injectionState.intervalId = null;
  }
  scheduleNextPrompt();

  if (images && images.length) {
    void generatePromptsInBackground(images, apiKey, model);
  }
}

function stopInjection() {
  injectionState.isRunning = false;
  if (injectionState.intervalId) {
    clearTimeout(injectionState.intervalId);
    injectionState.intervalId = null;
  }
  injectionState.isSending = false;
}

async function generatePromptsInBackground(images, apiKey, model) {
  if (!apiKey) {
    chrome.runtime.sendMessage({ action: 'injectionError', error: 'Please enter your Gemini API key in Settings tab.' });
    stopInjection();
    return;
  }

  const activeModel = model || 'gemini-3.1-flash-lite';

  try {
    for (let index = 0; index < images.length; index++) {
      if (!injectionState.isRunning) {
        return;
      }

      const image = images[index];
      const base64Data = image.data.split(',')[1];
      const mimeTypeMatch = image.data.match(/^data:(.*?);base64,/i);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

      chrome.runtime.sendMessage({
        action: 'generationProgress',
        current: index + 1,
        total: images.length
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: 'Analyze this image and create a detailed, creative text prompt that describes it. The prompt should be suitable for AI image generation tools. Focus on: style, mood, colors, composition, subject, lighting, and artistic details. Keep it concise but descriptive (2-3 sentences maximum).'
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }]
          })
        }
      );

      if (!response.ok) {
        let errorMessage = 'API request failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (error) {
          // Keep fallback error message.
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const prompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!prompt) {
        throw new Error('Gemini returned an empty prompt');
      }

      injectionState.prompts.push({ prompt, index });
      chrome.runtime.sendMessage({
        action: 'promptGenerated',
        index,
        prompt,
        imageName: image.name
      });
      scheduleNextPrompt();
    }

    injectionState.generationComplete = true;
    scheduleNextPrompt();
  } catch (error) {
    console.error('Error generating prompts:', error);
    chrome.runtime.sendMessage({ action: 'injectionError', error: error.message });
    stopInjection();
  }
}

function scheduleNextPrompt() {
  if (!injectionState.isRunning || injectionState.isSending) {
    return;
  }

  if (injectionState.currentIndex >= injectionState.prompts.length) {
    if (injectionState.generationComplete) {
      stopInjection();
      chrome.runtime.sendMessage({ action: 'injectionComplete' });
    }
    return;
  }

  const elapsed = Date.now() - injectionState.lastSentAt;
  const delay = injectionState.lastSentAt === 0
    ? 0
    : Math.max(0, injectionState.interval - elapsed);

  if (injectionState.intervalId) {
    clearTimeout(injectionState.intervalId);
    injectionState.intervalId = null;
  }

  injectionState.intervalId = setTimeout(() => {
    injectionState.intervalId = null;
    void sendNextPrompt();
  }, delay);
}

async function focusTab(tab) {
  if (typeof tab.windowId === 'number') {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  await chrome.tabs.update(tab.id, { active: true });
}

function sendDebuggerCommand(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

function attachDebugger(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, '1.3', () => {
      const error = chrome.runtime.lastError;
      if (error && !error.message.includes('Another debugger is already attached')) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function detachDebugger(target) {
  return new Promise((resolve) => {
    chrome.debugger.detach(target, () => {
      resolve();
    });
  });
}

async function dispatchTrustedClick(tabId, point) {
  const target = { tabId };
  await attachDebugger(target);

  try {
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
      button: 'none'
    });
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1
    });
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1
    });
  } finally {
    await detachDebugger(target);
  }
}

async function sendNextPrompt() {
  if (!injectionState.isRunning || injectionState.isSending) {
    return;
  }

  if (injectionState.currentIndex >= injectionState.prompts.length) {
    scheduleNextPrompt();
    return;
  }

  injectionState.isSending = true;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://labs.google/fx/tools/flow*' });
    if (tabs.length === 0) throw new Error('Flow tab not found');

    const tab = tabs[0];
    const currentPrompt = injectionState.prompts[injectionState.currentIndex];

    await focusTab(tab);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectPromptIntoFlow,
      args: [currentPrompt.prompt],
      world: 'MAIN'
    });

    if (!result?.ok) {
      throw new Error(result?.error || 'Prompt injection failed');
    }

    if (!result.submitButton) {
      throw new Error('Flow submit button coordinates not found');
    }

    await dispatchTrustedClick(tab.id, result.submitButton);

    chrome.runtime.sendMessage({ action: 'promptSent', index: currentPrompt.index });
    injectionState.lastSentAt = Date.now();
    injectionState.currentIndex++;

  } catch (error) {
    console.error('Error sending prompt:', error);
    chrome.runtime.sendMessage({ action: 'injectionError', error: error.message });
    stopInjection();
  } finally {
    injectionState.isSending = false;
    scheduleNextPrompt();
  }
}

// ─────────────────────────────────────────────────────────────
// Runs in MAIN world — MUST be synchronous (no async/await)
// chrome.scripting.executeScript does NOT await async functions.
// Use setTimeout for any delayed actions.
// ─────────────────────────────────────────────────────────────
function injectPromptIntoFlow(promptText) {

  // ── Find Slate editor DOM element ──
  const editorEl =
    document.querySelector('[data-slate-editor="true"][contenteditable="true"]') ||
    document.querySelector('[role="textbox"][contenteditable="true"]');

  if (!editorEl) {
    console.error('Flow Injector: editor not found');
    return { ok: false, error: 'Flow editor not found' };
  }

  // ── Get Slate editor instance via React fiber ──
  function getSlateEditor(domNode) {
    const fiberKey = Object.keys(domNode).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    if (!fiberKey) return null;
    let fiber = domNode[fiberKey];
    while (fiber) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props && props.editor &&
        typeof props.editor.apply === 'function' &&
        Array.isArray(props.editor.children)) {
        return props.editor;
      }
      fiber = fiber.return;
    }
    return null;
  }

  function getReactPropsChain(domNode) {
    const propsList = [];
    let node = domNode;

    while (node) {
      const propsKey = Object.keys(node).find(key => key.startsWith('__reactProps'));
      if (propsKey && node[propsKey]) {
        propsList.push(node[propsKey]);
      }
      node = node.parentElement;
    }

    return propsList;
  }

  function moveCaretToEnd() {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function notifyEditorChanged(inputType, data) {
    const propsChain = getReactPropsChain(editorEl);
    const nativeInputEvent = new InputEvent('input', {
      bubbles: true,
      inputType,
      data
    });

    try {
      editorEl.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType,
        data
      }));
    } catch (error) {
      console.warn('Flow Injector: beforeinput dispatch failed', error);
    }

    try {
      editorEl.dispatchEvent(nativeInputEvent);
    } catch (error) {
      console.warn('Flow Injector: input dispatch failed', error);
    }

    editorEl.dispatchEvent(new Event('change', { bubbles: true }));

    const syntheticEvent = {
      target: editorEl,
      currentTarget: editorEl,
      nativeEvent: nativeInputEvent,
      type: 'input',
      bubbles: true,
      preventDefault() {},
      stopPropagation() {}
    };

    for (const props of propsChain) {
      if (typeof props.onInput === 'function') {
        props.onInput(syntheticEvent);
      }
      if (typeof props.onChange === 'function') {
        props.onChange(syntheticEvent);
      }
    }
  }

  function findCreateButton() {
    const composer = editorEl.closest('.sc-e5032833-0') || editorEl.parentElement?.parentElement;
    const buttons = composer
      ? Array.from(composer.querySelectorAll('button'))
      : Array.from(document.querySelectorAll('button'));

    const byArrowIcon = buttons.find((button) => {
      if (button.disabled) return false;

      const iconText = Array.from(button.querySelectorAll('i, span'))
        .map((node) => (node.textContent || '').trim())
        .find((text) => text === 'arrow_forward');

      return Boolean(iconText);
    });
    if (byArrowIcon) {
      return byArrowIcon;
    }

    return buttons.find((button) => {
      if (button.disabled) return false;
      if (button.getAttribute('aria-haspopup') === 'dialog') return false;

      const label = [
        button.getAttribute('aria-label') || '',
        button.textContent || ''
      ].join(' ').toLowerCase();

      return label.includes('create');
    }) || null;
  }

  function getSubmitButtonInfo() {
    const button = findCreateButton();
    if (!button) {
      console.error('Flow Injector: Create button not found');
      return null;
    }

    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      console.error('Flow Injector: Create button has no size');
      return null;
    }

    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function replaceEditorTextDom() {
    editorEl.focus();

    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editorEl);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    document.execCommand('selectAll', false, null);

    if (document.execCommand('insertText', false, promptText)) {
      moveCaretToEnd();
      notifyEditorChanged('insertText', promptText);
      console.log('Flow Injector ✓ native insertText used');
      return true;
    }

    const rootTextNode = editorEl.firstChild?.firstChild;
    if (rootTextNode && rootTextNode.nodeType === Node.TEXT_NODE) {
      rootTextNode.textContent = promptText;
    } else {
      editorEl.textContent = promptText;
    }

    moveCaretToEnd();
    notifyEditorChanged('insertText', promptText);
    console.log('Flow Injector ✓ DOM text replacement used');
    return editorEl.textContent.includes(promptText);
  }

  // ── Insert text into Slate's internal state ──
  function insertText() {
    const slate = getSlateEditor(editorEl);
    if (slate) {
      try {
        if (typeof slate.select === 'function' && slate.start && slate.end) {
          slate.select({ anchor: slate.start([]), focus: slate.end([]) });
        }
        if (typeof slate.deleteFragment === 'function') {
          slate.deleteFragment();
        }
        if (typeof slate.insertText === 'function') {
          slate.insertText(promptText);
        } else {
          const currentText = slate.children?.[0]?.children?.[0]?.text || '';
          if (currentText.length > 0) {
            slate.apply({ type: 'remove_text', path: [0, 0], offset: 0, text: currentText });
          }
          slate.apply({ type: 'insert_text', path: [0, 0], offset: 0, text: promptText });
        }
        if (typeof slate.onChange === 'function') {
          slate.onChange();
        }
        editorEl.focus();
        moveCaretToEnd();
        console.log('Flow Injector ✓ Slate fiber insertion done');
        return true;
      } catch (e) {
        console.warn('Flow Injector: fiber insert failed', e);
        return false;
      }
    }

    return replaceEditorTextDom();
  }

  // ── STEP 1: Insert the text ──
  const inserted = insertText();

  if (!inserted) {
    // Clipboard fallback
    navigator.clipboard.writeText(promptText).then(() => {
      editorEl.focus();
      setTimeout(() => {
        document.execCommand('selectAll', false, null);
        document.execCommand('paste', false, null);
        console.log('Flow Injector ✓ clipboard paste used');
      }, 150);
    }).catch(e => console.error('Flow Injector: clipboard failed', e));
    return { ok: false, error: 'Prompt injection fallback did not complete synchronously' };
  }

  const submitButton = getSubmitButtonInfo();
  if (!submitButton) {
    return { ok: false, error: 'Flow submit button not found' };
  }

  console.log('Flow Injector ✓ prompt inserted and submit target located');
  return { ok: true, submitButton };
}

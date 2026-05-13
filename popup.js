let selectedImages = [];
let generatedPrompts = [];
let currentPromptIndex = 0;
let isRunning = false;

const MAX_IMAGES = 100;

// ── DOM Elements ──
const apiKeyInput       = document.getElementById('apiKey');
const modelSelect       = document.getElementById('modelSelect');
const activeBadge       = document.getElementById('activeBadge');
const customModelWrap   = document.getElementById('customModelWrap');
const customModelInput  = document.getElementById('customModelInput');
const uploadArea    = document.getElementById('uploadArea');
const fileInput     = document.getElementById('fileInput');
const imagesPreview = document.getElementById('imagesPreview');
const imageCounter  = document.getElementById('imageCounter');
const maxImagesInp  = document.getElementById('maxImages');
const intervalInput = document.getElementById('interval');
const startBtn      = document.getElementById('startBtn');
const stopBtn       = document.getElementById('stopBtn');
const statusDiv     = document.getElementById('status');
const promptsSection= document.getElementById('promptsSection');
const promptsList   = document.getElementById('promptsList');
const progressWrap  = document.getElementById('progressWrap');
const progressBar   = document.getElementById('progressBar');

// ── Tab Switching ──
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
}

document.getElementById('tabWorking').addEventListener('click', () => switchTab('working'));
document.getElementById('tabSettings').addEventListener('click', () => switchTab('settings'));

// ── Load saved settings ──
chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'geminiCustomModel'], (result) => {
  if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
  if (result.geminiModel) {
    modelSelect.value = result.geminiModel;
    if (result.geminiModel === 'custom') {
      customModelWrap.style.display = 'block';
      if (result.geminiCustomModel) {
        customModelInput.value = result.geminiCustomModel;
        activeBadge.textContent = result.geminiCustomModel;
      }
    } else {
      activeBadge.textContent = result.geminiModel;
    }
  }
});

// ── Save API key ──
apiKeyInput.addEventListener('change', () => {
  chrome.storage.local.set({ geminiApiKey: apiKeyInput.value.trim() });
});

// ── Save model selection ──
modelSelect.addEventListener('change', () => {
  const model = modelSelect.value;
  chrome.storage.local.set({ geminiModel: model });
  if (model === 'custom') {
    customModelWrap.style.display = 'block';
    activeBadge.textContent = customModelInput.value.trim() || 'custom';
  } else {
    customModelWrap.style.display = 'none';
    activeBadge.textContent = model;
  }
});

// ── Save custom model input ──
customModelInput.addEventListener('input', () => {
  const val = customModelInput.value.trim();
  chrome.storage.local.set({ geminiCustomModel: val });
  activeBadge.textContent = val || 'custom';
});

// ── Upload area interactions ──
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

// ── Handle file selection ──
function handleFiles(files) {
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));

  const remaining = MAX_IMAGES - selectedImages.length;
  if (remaining <= 0) {
    showStatus(`Maximum ${MAX_IMAGES} images already loaded.`, 'error');
    return;
  }

  const toAdd = imageFiles.slice(0, remaining);
  if (imageFiles.length > remaining) {
    showStatus(`Only ${remaining} more image(s) can be added (limit: ${MAX_IMAGES}).`, 'info');
  }

  toAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedImages.push({ data: e.target.result, name: file.name });
      updateImagePreview();
    };
    reader.readAsDataURL(file);
  });
}

// ── Update image preview ──
function updateImagePreview() {
  const count = selectedImages.length;
  imageCounter.textContent = `${count} image${count !== 1 ? 's' : ''} selected`;
  maxImagesInp.value = count;
  imagesPreview.innerHTML = '';

  selectedImages.forEach((img, index) => {
    const div = document.createElement('div');
    div.className = 'image-item';
    div.innerHTML = `
      <img src="${img.data}" alt="${img.name}" title="${img.name}">
      <button class="remove-btn" data-index="${index}" title="Remove">×</button>
    `;
    imagesPreview.appendChild(div);
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);
      selectedImages.splice(idx, 1);
      updateImagePreview();
    });
  });

  // Reset prompts if images change
  if (generatedPrompts.length > 0) {
    generatedPrompts = [];
    promptsSection.style.display = 'none';
  }
}

// ── Show status ──
function showStatus(message, type = 'info') {
  statusDiv.className = `status ${type}`;
  statusDiv.textContent = message;
}

// ── Update progress bar ──
function setProgress(current, total) {
  if (total === 0) {
    progressWrap.classList.remove('visible');
    return;
  }
  progressWrap.classList.add('visible');
  progressBar.style.width = `${Math.round((current / total) * 100)}%`;
}

// ── Get selected model ──
function getModel() {
  if (modelSelect && modelSelect.value === 'custom') {
    return customModelInput.value.trim() || 'gemini-3.1-flash-lite';
  }
  return modelSelect ? modelSelect.value : 'gemini-3.1-flash-lite';
}

// ── Generate prompts using Gemini API ──
async function generatePrompts() {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus('Please enter your Gemini API key in Settings tab.', 'error');
    return false;
  }

  if (selectedImages.length === 0) {
    showStatus('Please upload at least one image.', 'error');
    return false;
  }

  const model = getModel();
  showStatus(`Generating prompts using ${model}…`, 'info');
  startBtn.disabled = true;
  generatedPrompts = [];
  setProgress(0, selectedImages.length);

  try {
    for (let i = 0; i < selectedImages.length; i++) {
      showStatus(`Processing image ${i + 1} / ${selectedImages.length}…`, 'info');
      setProgress(i + 1, selectedImages.length);

      const base64Data = selectedImages[i].data.split(',')[1];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: "Analyze this image and create a detailed, creative text prompt that describes it. The prompt should be suitable for AI image generation tools. Focus on: style, mood, colors, composition, subject, lighting, and artistic details. Keep it concise but descriptive (2-3 sentences maximum)."
                },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: base64Data
                  }
                }
              ]
            }]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API request failed');
      }

      const data = await response.json();
      const prompt = data.candidates[0].content.parts[0].text.trim();

      generatedPrompts.push({
        prompt,
        sent: false,
        imageName: selectedImages[i].name
      });

      updatePromptsList();
    }

    setProgress(selectedImages.length, selectedImages.length);
    showStatus(`✓ Generated ${generatedPrompts.length} prompts successfully!`, 'success');
    promptsSection.style.display = 'block';
    startBtn.disabled = false;
    return true;

  } catch (error) {
    console.error('Error generating prompts:', error);
    showStatus(`Error: ${error.message}`, 'error');
    startBtn.disabled = false;
    setProgress(0, 0);
    return false;
  }
}

// ── Update prompts list display ──
function updatePromptsList() {
  promptsList.innerHTML = '';
  generatedPrompts.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = `prompt-item ${item.sent ? 'sent' : ''}`;
    div.innerHTML = `
      <strong>${index + 1}. ${item.imageName}</strong><br>
      ${item.prompt}
      ${item.sent ? '<br><small>✓ Inserted</small>' : ''}
    `;
    promptsList.appendChild(div);
  });
}

// ── Start auto-injection ──
startBtn.addEventListener('click', async () => {
  if (generatedPrompts.length === 0) {
    const success = await generatePrompts();
    if (!success) return;
  }

  const tabs = await chrome.tabs.query({ url: 'https://labs.google/fx/tools/flow*' });
  if (tabs.length === 0) {
    showStatus('Please open Google Flow in a tab first!', 'error');
    return;
  }

  isRunning = true;
  currentPromptIndex = 0;
  startBtn.style.display = 'none';
  stopBtn.style.display = 'block';

  chrome.runtime.sendMessage({
    action: 'startInjection',
    prompts: generatedPrompts,
    interval: parseInt(intervalInput.value) * 1000
  });

  showStatus('Auto-injection started! Switch to the Flow tab.', 'success');
});

// ── Stop auto-injection ──
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopInjection' });
  isRunning = false;
  startBtn.style.display = 'block';
  stopBtn.style.display = 'none';
  showStatus('Auto-injection stopped.', 'info');
});

// ── Listen for background script messages ──
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'promptSent') {
    if (generatedPrompts[message.index]) {
      generatedPrompts[message.index].sent = true;
      updatePromptsList();
      showStatus(`Inserted prompt ${message.index + 1} / ${generatedPrompts.length}`, 'success');
    }
  } else if (message.action === 'injectionComplete') {
    isRunning = false;
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    showStatus('All prompts inserted! ✓', 'success');
  } else if (message.action === 'injectionError') {
    showStatus(`Error: ${message.error}`, 'error');
  }
});

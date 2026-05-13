// This script runs on the Google Flow page
// It helps detect the input field and can provide additional functionality

console.log('Flow Prompt Injector: Content script loaded');

// Observer to detect when Flow's input becomes available
const observer = new MutationObserver((mutations) => {
  detectInputField();
});

// Start observing the document
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Detect and mark the input field
function detectInputField() {
  const selectors = [
    'textarea[placeholder*="prompt"]',
    'textarea[placeholder*="Prompt"]',
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]'
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      const inputField = Array.from(elements).find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 100 && rect.height > 30;
      });
      
      if (inputField && !inputField.dataset.flowInjectorReady) {
        inputField.dataset.flowInjectorReady = 'true';
        console.log('Flow Prompt Injector: Input field detected');
        
        // Add visual indicator (optional)
        inputField.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.3)';
        setTimeout(() => {
          inputField.style.boxShadow = '';
        }, 2000);
      }
    }
  }
}

// Initial detection
setTimeout(detectInputField, 1000);

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ status: 'ready' });
  }
});

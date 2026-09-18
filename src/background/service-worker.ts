import { storage } from '../shared/storage';

console.log('Background service worker started.');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PROBLEM_SOLVED') {
    const slug = message.payload.slug;
    console.log('Problem solved:', slug);
    
    storage.getProblem(slug).then(existing => {
      if (existing) {
        console.log('Problem already in database, ignoring automatic DOM detection.');
        return;
      }
      const state = { interval: 0, ease: 2.5, repetitions: 0, nextReview: 0 };
      return storage.saveProblem(slug, state);
    }).then(() => {
      sendResponse({ success: true });
    }).catch(console.error);
    
    return true; // Keep message channel open for async response
  }
});

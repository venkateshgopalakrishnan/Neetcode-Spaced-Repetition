function detectSuccessMessage(mutations: MutationRecord[]) {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      const addedNodes = Array.from(mutation.addedNodes) as HTMLElement[];
      for (const node of addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const text = node.textContent?.toLowerCase() || '';
          const hasSuccessClass = node.className && typeof node.className === 'string' && node.className.toLowerCase().includes('success');
          
          if ((text.includes('accepted') || text.includes('success')) && hasSuccessClass) {
            handleProblemSolved();
            return;
          }
          
          if (node.querySelectorAll) {
            const successElements = node.querySelectorAll('[class*="success" i], [class*="accepted" i]');
            if (successElements?.length) {
              for (const el of Array.from(successElements)) {
                const elText = el.textContent?.toLowerCase() || '';
                if (elText.includes('accepted') || elText.includes('success')) {
                  handleProblemSolved();
                  return;
                }
              }
            }
          }
        }
      }
    }
  }
}

let solvedReported = false;

function handleProblemSolved() {
  if (solvedReported) return;
  
  const path = window.location.pathname; // e.g. /problems/two-sum/
  const match = path.match(/\/problems\/([^/]+)/);
  if (!match) return;

  const slug = match[1];
  chrome.runtime.sendMessage({
    type: 'PROBLEM_SOLVED',
    payload: { slug }
  });

  solvedReported = true;
  
  setTimeout(() => {
    solvedReported = false;
  }, 10000);
}

const observer = new MutationObserver(detectSuccessMessage);
observer.observe(document.body, { childList: true, subtree: true });

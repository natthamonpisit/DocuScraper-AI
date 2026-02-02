/**
 * Uses a public CORS proxy to fetch external HTML.
 * Note: For a production app, you should host your own proxy.
 * We use 'allorigins.win' for this demo as it's reliable for text.
 */
export const fetchHtml = async (url: string): Promise<string> => {
  try {
    const encodedUrl = encodeURIComponent(url);
    const proxyUrl = `https://api.allorigins.win/get?url=${encodedUrl}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    return data.contents; // allorigins returns content in 'contents' field
  } catch (error) {
    console.error("Failed to fetch HTML:", error);
    throw error;
  }
};

/**
 * Fixes relative URLs in the fetched HTML to make them absolute.
 * e.g., src="/images/logo.png" -> src="https://docs.example.com/images/logo.png"
 */
export const makeLinksAbsolute = (html: string, baseUrl: string): string => {
  const urlObj = new URL(baseUrl);
  const origin = urlObj.origin; // https://docs.example.com
  
  let fixedHtml = html;

  // Fix images src attributes
  // 1. Root relative (starts with /)
  fixedHtml = fixedHtml.replace(/src="\/([^"]*)"/g, `src="${origin}/$1"`);
  // 2. Relative (doesn't start with http or /)
  fixedHtml = fixedHtml.replace(/src="(?!http|\/)([^"]*)"/g, `src="${origin}/${urlObj.pathname}/$1"`); // Approximate

  // Fix href links (for internal navigation consistency in PDF if clicked)
  fixedHtml = fixedHtml.replace(/href="\/([^"]*)"/g, `href="${origin}/$1"`);
  
  return fixedHtml;
};

/**
 * Attempts to extract only the main content area from a full HTML page.
 * It looks for common semantic tags or IDs.
 */
export const extractMainContent = (fullHtml: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');

  // Priority list of selectors to find the "meat" of the documentation
  const selectors = [
    'main',
    'article',
    '#content',
    '#main-content',
    '.markdown-body', // Github style
    '.documentation-content',
    '.doc-content',
    'div[role="main"]'
  ];

  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (element) {
      return element.innerHTML;
    }
  }

  // Fallback: If we can't find a specific main container, return body but try to remove nav/headers
  // This is a rough fallback.
  const body = doc.body;
  const navs = body.querySelectorAll('nav, header, footer, script, style, aside');
  navs.forEach(el => el.remove());
  
  return body.innerHTML;
};

/**
 * Extracts links from the sidebar/navigation to build a sitemap.
 */
export const extractNavLinks = (fullHtml: string, baseUrl: string): { text: string, href: string }[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');
  const origin = new URL(baseUrl).origin;

  // Try to find the sidebar
  const sidebarSelectors = ['nav', 'aside', '.sidebar', '#sidebar', '.nav-list'];
  let sidebar: Element | null = null;
  
  for (const sel of sidebarSelectors) {
    sidebar = doc.querySelector(sel);
    if (sidebar) break;
  }

  if (!sidebar) return [];

  const links = Array.from(sidebar.querySelectorAll('a'));
  const extracted = links.map(link => {
    let href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return null;

    // Normalize URL
    if (href.startsWith('/')) {
        href = origin + href;
    } else if (!href.startsWith('http')) {
        href = new URL(href, baseUrl).href;
    }

    return {
      text: link.textContent?.trim() || 'Untitled',
      href: href
    };
  }).filter((l): l is { text: string, href: string } => l !== null);

  // Remove duplicates based on href
  return Array.from(new Map(extracted.map(item => [item.href, item])).values());
};

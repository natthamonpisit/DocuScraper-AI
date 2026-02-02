/**
 * Uses a public CORS proxy to fetch external HTML.
 * Note: For a production app, you should host your own proxy.
 * We use 'allorigins.win' for this demo as it's reliable for text.
 */
export const fetchHtml = async (url: string): Promise<string> => {
  // Helper to fetch with timeout to prevent hanging
  const fetchWithTimeout = async (resource: string, options: RequestInit = {}) => {
      const { timeout = 10000 } = options as any; // 10s timeout
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (error) {
        clearTimeout(id);
        throw error;
      }
  }

  // 1. Primary Strategy: AllOrigins (Returns JSON wrapped content)
  try {
    const encodedUrl = encodeURIComponent(url);
    const proxyUrl = `https://api.allorigins.win/get?url=${encodedUrl}`;
    
    const response = await fetchWithTimeout(proxyUrl);
    if (!response.ok) throw new Error('Primary proxy network response was not ok');
    
    const data = await response.json();
    if (!data.contents) throw new Error('Primary proxy returned empty content');
    return data.contents; 
  } catch (error) {
    console.warn("Primary proxy (AllOrigins) failed, switching to backup...", error);
  }

  // 2. Backup Strategy: CorsProxy.io (Returns Raw HTML)
  try {
      // corsproxy.io usage: https://corsproxy.io/?url_here
      // It handles the request directly
      const encodedUrl = encodeURIComponent(url);
      const proxyUrl = `https://corsproxy.io/?${encodedUrl}`;
      
      const response = await fetchWithTimeout(proxyUrl);
      if (!response.ok) throw new Error('Backup proxy network response was not ok');
      
      const html = await response.text();
      return html;
  } catch (error) {
      console.error("All proxies failed for URL:", url, error);
      throw new Error("Failed to fetch content. The target site might be blocking proxies or rate limiting.");
  }
};

/**
 * Fixes relative URLs in the fetched HTML to make them absolute.
 * e.g., src="/images/logo.png" -> src="https://docs.example.com/images/logo.png"
 */
export const makeLinksAbsolute = (html: string, baseUrl: string): string => {
  try {
      const urlObj = new URL(baseUrl);
      const origin = urlObj.origin; // https://docs.example.com
      
      let fixedHtml = html;

      // Fix images src attributes
      // 1. Root relative (starts with /)
      fixedHtml = fixedHtml.replace(/src="\/([^"]*)"/g, `src="${origin}/$1"`);
      // 2. Relative (doesn't start with http or /)
      fixedHtml = fixedHtml.replace(/src="(?!http|\/)([^"]*)"/g, `src="${origin}/${urlObj.pathname.replace(/\/[^/]*$/, '')}/$1"`); 

      // Fix href links (for internal navigation consistency in PDF if clicked)
      fixedHtml = fixedHtml.replace(/href="\/([^"]*)"/g, `href="${origin}/$1"`);
      
      return fixedHtml;
  } catch (e) {
      return html;
  }
};

/**
 * Attempts to extract only the main content area from a full HTML page.
 * It looks for common semantic tags or IDs.
 */
export const extractMainContent = (fullHtml: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');

  // Remove Script and Styles first to clean up noise
  doc.querySelectorAll('script, style, iframe, noscript').forEach(el => el.remove());

  // Priority list of selectors to find the "meat" of the documentation
  const selectors = [
    'main',
    'article',
    '#content',
    '#main-content',
    '.markdown-body', // Github style
    '.documentation-content',
    '.doc-content',
    'div[role="main"]',
    '.theme-doc-markdown', // Docusaurus
    '.page-content',
    '.prose'
  ];

  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (element) {
      return element.innerHTML;
    }
  }

  // Fallback: If we can't find a specific main container, return body but remove obvious navs
  const body = doc.body;
  const navs = body.querySelectorAll('nav, header, footer, aside, .sidebar, .nav');
  navs.forEach(el => el.remove());
  
  return body.innerHTML;
};

/**
 * Normalizes a URL to ensure consistency (removes trailing slashes, hashes, etc.)
 */
const normalizeUrl = (url: string): string => {
    try {
        const u = new URL(url);
        // Remove hash
        u.hash = ''; 
        // Remove trailing slash for consistency unless it's root
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
            u.pathname = u.pathname.slice(0, -1);
        }
        return u.href;
    } catch (e) {
        return url;
    }
};

/**
 * Extracts links from the page to build a sitemap.
 * Now improved to scan the whole body if sidebar is missing, 
 * but prioritizes sidebar/nav to avoid garbage links.
 */
export const extractNavLinks = (fullHtml: string, baseUrl: string): { text: string, href: string }[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');
  const origin = new URL(baseUrl).origin;
  const hostname = new URL(baseUrl).hostname;

  // 1. Try to find the sidebar/nav first (High Quality Links)
  const sidebarSelectors = ['nav', 'aside', '.sidebar', '#sidebar', '.nav-list', '.menu', 'div[role="navigation"]'];
  let searchArea: Element | null = null;
  
  for (const sel of sidebarSelectors) {
    const el = doc.querySelector(sel);
    // Basic heuristic: A sidebar usually has many links (more than 5)
    if (el && el.querySelectorAll('a').length > 5) {
        searchArea = el;
        break;
    }
  }

  // 2. If no sidebar found, or it's empty, scan the whole body (Fallback)
  // This is useful for "Index" pages that list all modules.
  if (!searchArea) {
      searchArea = doc.body;
  }

  const links = Array.from(searchArea.querySelectorAll('a'));
  const extracted = links.map(link => {
    let href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto')) return null;

    // Normalize URL
    try {
        if (href.startsWith('//')) {
            href = 'https:' + href;
        } else if (href.startsWith('/')) {
            href = origin + href;
        } else if (!href.startsWith('http')) {
            href = new URL(href, baseUrl).href;
        }
    } catch (e) {
        return null;
    }

    // Filter: Must be same domain
    try {
        if (new URL(href).hostname !== hostname) return null;
    } catch (e) { return null; }

    // Clean text
    let text = link.textContent?.trim() || 'Untitled';
    text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

    return {
      text: text,
      href: normalizeUrl(href)
    };
  }).filter((l): l is { text: string, href: string } => l !== null);

  // Remove duplicates based on href
  const uniqueMap = new Map();
  extracted.forEach(item => {
      if (!uniqueMap.has(item.href)) {
          uniqueMap.set(item.href, item);
      }
  });

  return Array.from(uniqueMap.values());
};
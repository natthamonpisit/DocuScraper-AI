# Functional Documentation: DocuScraper AI

## 1. Overview
**DocuScraper AI** is a client-side web application designed to aggregate scattered web documentation into a single, clean, readable format. It allows users to crawl documentation sites, select specific pages, extract the main content (removing ads/navigation), generate AI summaries using Google Gemini, and export the result as a PDF for offline usage.

## 2. Core Features & User Flow

### 2.1. URL Entry & Scanning (Phase 1: Discovery)
*   **Input:** Users provide a starting URL (e.g., `https://docs.example.com`).
*   **Scanning Modes:**
    *   **Standard Scan:** Scans only the provided URL to find navigation links immediately visible.
    *   **Deep Crawler (Toggle):** Enables a Breadth-First Search (BFS) algorithm to crawl linked pages up to a safety limit (50 pages) to discover nested documentation.
*   **Proxy Strategy:** To bypass CORS (Cross-Origin Resource Sharing) restrictions in the browser:
    1.  **Primary:** Uses `api.allorigins.win` (returns JSON).
    2.  **Backup:** Uses `corsproxy.io` (returns raw HTML) if the primary fails.

### 2.2. Link Discovery & Selection (Sidebar)
*   **Link Extraction:** The app parses the HTML to find `<a>` tags.
    *   **Heuristics:** Prioritizes sidebar navigation (`<nav>`, `.sidebar`) over the generic body to ensure high-quality links.
    *   **Filtering:** Only includes links belonging to the same hostname to prevent crawling external sites.
*   **Selection UI:**
    *   Displays discovered links in a sidebar.
    *   Allows "Select All" or individual selection via checkboxes.
    *   Shows scan progress and discovered count.

### 2.3. Content Fetching (Phase 2: Multi-Agent Scraping)
*   **Architecture:** **Multi-Agent Worker Pool**.
    *   Instead of fetching pages one-by-one, the system initializes **3 Concurrent Agents**.
    *   Agents pull URLs from a shared Job Queue.
    *   Significantly speeds up the process for large documentation sets (e.g., 200+ links).
*   **Content Extraction (`extractMainContent`):**
    *   Uses DOM selectors (`main`, `article`, `#content`, `.markdown-body`) to isolate the actual documentation text.
    *   Removes noise: Scripts, styles, iframes, headers, footers, and sidebars.
*   **Asset Repair (`makeLinksAbsolute`):**
    *   Converts relative URLs (e.g., `<img src="/img/logo.png">`) to absolute URLs so images load correctly in the scraper and the generated PDF.

### 2.4. AI Summarization (Gemini Integration)
*   **Model:** Uses `@google/genai` SDK with the `gemini-3-flash-preview` model.
*   **Trigger:** User clicks "AI Summarize" on a specific loaded page.
*   **Process:**
    1.  Strips HTML tags to reduce token usage.
    2.  Sends content to Gemini with a system prompt acting as an "expert technical writer".
    3.  Returns a Markdown-formatted bullet-point summary.
*   **Display:** Renders the summary in a distinct purple box above the main content.

### 2.5. Reading & Export (PDF)
*   **Reading Mode:** Displays content in a single continuous scroll view using Tailwind Typography (`prose`).
*   **Print/PDF Generation:**
    *   **CSS Media Queries (`@media print`):**
        *   Hides UI elements (Sidebar, Header, Buttons).
        *   Formats text for A4/Letter paper.
        *   Forces page breaks between articles (`page-break-before`).
        *   Generates a Cover Page with the hostname and Table of Contents.
    *   **Action:** Triggers the browser's native `window.print()` dialog.

## 3. Technical Architecture

### 3.1. Tech Stack
*   **Framework:** React 19 (Client-side only).
*   **Styling:** Tailwind CSS (via CDN and script injection).
*   **Icons:** Lucide React.
*   **AI:** Google GenAI SDK (`@google/genai`).
*   **Markdown Rendering:** `react-markdown` (for displaying AI summaries).

### 3.2. Data Structures (`types.ts`)
*   **`ScrapedPage`:** Stores the URL, raw HTML content, AI summary string, and processing status.
*   **`AppStatus`:** State machine handling (IDLE -> SCANNING -> FETCHING_CONTENT -> READY_TO_PRINT).

### 3.3. Key Services
*   **`proxyService.ts`:**
    *   `fetchHtml(url)`: Handles the CORS proxy logic.
    *   `extractMainContent(html)`: DOM manipulation to clean content.
    *   `extractNavLinks(html)`: Logic to find relevant documentation links.
*   **`geminiService.ts`:**
    *   `generateSummary(content)`: Interfaces with the Gemini API.

## 4. UI/UX Design Decisions
*   **Split View:** Left sidebar for navigation/control, Right pane for content consumption.
*   **Feedback:** Progress indicators during scanning and fetching (pulsing text, loading states).
*   **Print-First CSS:** The visual output in the browser closely mirrors the final PDF output to ensure "What You See Is What You Get".

## 5. Limitations & Future Improvements
*   **CORS Dependencies:** Heavily relies on public proxies (`allorigins`, `corsproxy`) which may be unstable or blocked by some target sites.
*   **Client-Side Only:** Large sites may cause memory issues in the browser.
*   **Rate Limiting:** Deep scanning includes artificial delays to avoid getting IP banned, making it slower for large documentation sets.

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchHtml, extractMainContent, makeLinksAbsolute, extractNavLinks } from './services/proxyService';
import { generateSummary } from './services/geminiService';
import { ScrapedPage, AppStatus } from './types';
import { BookOpen, FileText, Download, RefreshCw, Search, CheckSquare, Square, Cpu, Printer, ChevronRight, Menu } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const App: React.FC = () => {
  // State
  const [baseUrl, setBaseUrl] = useState<string>('https://docs.openclaw.ai/');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [discoveredLinks, setDiscoveredLinks] = useState<{ text: string, href: string }[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<ScrapedPage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentProcessingUrl, setCurrentProcessingUrl] = useState<string>('');
  
  // Gemini/AI State
  const [isSummarizing, setIsSummarizing] = useState(false);

  // 1. Scan the URL for navigation links
  const handleScan = async () => {
    if (!baseUrl) return;
    setStatus(AppStatus.SCANNING);
    setDiscoveredLinks([]);
    setSelectedLinks(new Set());
    setPages([]);

    try {
      const html = await fetchHtml(baseUrl);
      const links = extractNavLinks(html, baseUrl);
      
      // Filter links to only keep those on the same domain or documentation path
      const filteredLinks = links.filter(link => link.href.includes(new URL(baseUrl).hostname));
      
      // Always add the base URL itself as the first page if not present
      if (!filteredLinks.some(l => l.href === baseUrl)) {
          filteredLinks.unshift({ text: 'Home / Introduction', href: baseUrl });
      }

      setDiscoveredLinks(filteredLinks);
      // Auto-select all by default (limit to first 10 for demo safety, user can add more)
      const initialSelection = new Set(filteredLinks.slice(0, 5).map(l => l.href));
      setSelectedLinks(initialSelection);
      setStatus(AppStatus.IDLE);
    } catch (error) {
      alert(`Error scanning URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatus(AppStatus.IDLE);
    }
  };

  // 2. Toggle link selection
  const toggleLink = (href: string) => {
    const newSelection = new Set(selectedLinks);
    if (newSelection.has(href)) {
      newSelection.delete(href);
    } else {
      newSelection.add(href);
    }
    setSelectedLinks(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedLinks.size === discoveredLinks.length) {
      setSelectedLinks(new Set());
    } else {
      setSelectedLinks(new Set(discoveredLinks.map(l => l.href)));
    }
  };

  // 3. Fetch Content for selected links
  const handleFetchContent = async () => {
    setStatus(AppStatus.FETCHING_CONTENT);
    const linksToFetch = discoveredLinks.filter(l => selectedLinks.has(l.href));
    
    const newPages: ScrapedPage[] = [];

    for (const link of linksToFetch) {
      setCurrentProcessingUrl(link.href);
      try {
        const rawHtml = await fetchHtml(link.href);
        const mainContent = extractMainContent(rawHtml);
        const cleanContent = makeLinksAbsolute(mainContent, link.href);

        newPages.push({
          url: link.href,
          title: link.text,
          content: cleanContent,
          status: 'success',
          links: []
        });
      } catch (error) {
        console.error(`Failed to fetch ${link.href}`, error);
        newPages.push({
            url: link.href,
            title: link.text,
            content: '<p class="text-red-500">Failed to load content.</p>',
            status: 'error',
            links: []
        });
      }
      // Add a small delay to be polite to the server
      await new Promise(r => setTimeout(r, 500));
    }

    setPages(newPages);
    setStatus(AppStatus.READY_TO_PRINT);
    setIsSidebarOpen(false); // Close sidebar to show content
  };

  // 4. AI Summarization for a specific page
  const handleSummarize = async (pageIndex: number) => {
    setIsSummarizing(true);
    const page = pages[pageIndex];
    // Strip HTML tags for the AI prompt to save tokens
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = page.content;
    const textContent = tempDiv.textContent || "";
    
    const summary = await generateSummary(textContent);
    
    const updatedPages = [...pages];
    updatedPages[pageIndex] = { ...page, summary };
    setPages(updatedPages);
    setIsSummarizing(false);
  };

  // 5. Print Function
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* Top Bar (No Print) */}
      <header className="no-print bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <BookOpen className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">DocuScraper AI</h1>
            <p className="text-xs text-slate-500">Offline Documentation Reader</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-1 max-w-2xl mx-8">
          <div className="flex-1 flex gap-2">
            <input 
              type="text" 
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Enter documentation URL (e.g., https://docs.openclaw.ai/)"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
            <button 
                onClick={handleScan}
                disabled={status !== AppStatus.IDLE && status !== AppStatus.READY_TO_PRINT}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {status === AppStatus.SCANNING ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Scan
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={handlePrint}
             disabled={pages.length === 0}
             className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 text-sm font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:shadow-none"
           >
             <Printer className="w-4 h-4" />
             Print / Save PDF
           </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Sidebar: Link Selection (No Print) */}
        <aside className={`no-print bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
             <h2 className="font-semibold text-slate-700 flex items-center gap-2">
               <FileText className="w-4 h-4" /> 
               Found Pages ({discoveredLinks.length})
             </h2>
             {discoveredLinks.length > 0 && (
                 <button onClick={toggleSelectAll} className="text-xs text-blue-600 font-medium hover:underline">
                    {selectedLinks.size === discoveredLinks.length ? 'Deselect All' : 'Select All'}
                 </button>
             )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {discoveredLinks.length === 0 && status === AppStatus.IDLE && (
                 <div className="text-center p-8 text-slate-400 text-sm">
                    Enter a URL and scan to see pages here.
                 </div>
             )}
             
             {discoveredLinks.map((link, idx) => (
               <div 
                 key={idx} 
                 className={`flex items-start gap-3 p-2 rounded-md cursor-pointer text-sm hover:bg-slate-50 transition-colors ${selectedLinks.has(link.href) ? 'bg-blue-50' : ''}`}
                 onClick={() => toggleLink(link.href)}
               >
                 <div className="mt-1">
                    {selectedLinks.has(link.href) 
                        ? <CheckSquare className="w-4 h-4 text-blue-600" /> 
                        : <Square className="w-4 h-4 text-slate-300" />
                    }
                 </div>
                 <div className="flex-1 break-words">
                   <p className={`font-medium ${selectedLinks.has(link.href) ? 'text-blue-900' : 'text-slate-600'}`}>{link.text}</p>
                   <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{link.href}</p>
                 </div>
               </div>
             ))}
          </div>

          <div className="p-4 border-t border-slate-200 bg-white">
            <button
                onClick={handleFetchContent}
                disabled={selectedLinks.size === 0 || status === AppStatus.FETCHING_CONTENT}
                className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium text-sm flex justify-center items-center gap-2 disabled:opacity-50 hover:bg-slate-800 transition-colors"
            >
                {status === AppStatus.FETCHING_CONTENT ? (
                   <>
                     <RefreshCw className="w-4 h-4 animate-spin" />
                     Fetching...
                   </>
                ) : (
                   <>
                     <Download className="w-4 h-4" />
                     Fetch {selectedLinks.size} Pages
                   </>
                )}
            </button>
            {status === AppStatus.FETCHING_CONTENT && (
                <p className="text-xs text-center text-slate-500 mt-2 truncate">
                    Reading: {currentProcessingUrl}
                </p>
            )}
          </div>
        </aside>

        {/* Toggle Sidebar Button (No Print) */}
        <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="no-print absolute top-4 left-4 z-20 bg-white border border-slate-200 p-2 rounded-md shadow-sm hover:bg-slate-50"
            style={{ left: isSidebarOpen ? '20.5rem' : '1rem' }}
        >
            {isSidebarOpen ? <Menu className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Main Content Viewer (The "Paper") */}
        <main className="flex-1 overflow-y-auto bg-slate-100 p-8 flex justify-center">
           {pages.length === 0 ? (
               <div className="flex flex-col items-center justify-center text-slate-400 mt-20">
                  <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                      <BookOpen className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-600">Ready to Scrape</h3>
                  <p className="max-w-md text-center mt-2 text-sm">
                      1. Scan a documentation URL.<br/>
                      2. Select the pages you want.<br/>
                      3. Click Fetch to generate your offline reader.
                  </p>
               </div>
           ) : (
               <div className="w-full max-w-4xl bg-white shadow-2xl min-h-screen print:shadow-none print:w-full print:max-w-none">
                  
                  {/* Cover Page for PDF */}
                  <div className="p-16 border-b-2 border-slate-100 print:border-none print:h-screen flex flex-col justify-center text-center">
                      <h1 className="text-4xl font-extrabold text-slate-900 mb-4">Documentation Export</h1>
                      <p className="text-xl text-slate-500 mb-8">{new URL(baseUrl).hostname}</p>
                      <p className="text-sm text-slate-400">Generated by DocuScraper AI on {new Date().toLocaleDateString()}</p>
                      
                      {/* Table of Contents */}
                      <div className="mt-12 text-left max-w-lg mx-auto bg-slate-50 p-8 rounded-xl print:bg-white print:p-0">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wider">Table of Contents</h2>
                          <ul className="space-y-2">
                              {pages.map((page, idx) => (
                                  <li key={idx} className="flex gap-2 text-sm">
                                      <span className="text-slate-400 font-mono">{idx + 1}.</span>
                                      <span className="text-slate-700 font-medium">{page.title}</span>
                                  </li>
                              ))}
                          </ul>
                      </div>
                  </div>

                  {/* Rendered Pages */}
                  <div className="divide-y divide-slate-200 print:divide-none">
                      {pages.map((page, idx) => (
                          <article key={idx} className="p-16 print:p-0 print:pt-8 print:pb-8 page-break">
                              
                              {/* Page Header */}
                              <div className="mb-8 pb-4 border-b border-slate-100 print:border-black flex justify-between items-start">
                                  <div>
                                     <h2 className="text-3xl font-bold text-slate-900">{page.title}</h2>
                                     <a href={page.url} className="text-xs text-blue-500 hover:underline print:text-black print:no-underline">{page.url}</a>
                                  </div>
                                  
                                  {/* AI Action (No Print) */}
                                  <div className="no-print">
                                    <button 
                                        onClick={() => handleSummarize(idx)}
                                        disabled={isSummarizing}
                                        className="flex items-center gap-1.5 text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full hover:bg-purple-200 transition-colors"
                                    >
                                        <Cpu className="w-3 h-3" />
                                        {page.summary ? 'Regenerate Summary' : 'AI Summarize'}
                                    </button>
                                  </div>
                              </div>

                              {/* AI Summary Section */}
                              {page.summary && (
                                  <div className="mb-8 bg-purple-50 p-6 rounded-lg border border-purple-100 print:border-black print:bg-white print:border-2">
                                      <h3 className="text-purple-900 font-bold flex items-center gap-2 mb-2 print:text-black">
                                          <Cpu className="w-4 h-4" /> AI Summary
                                      </h3>
                                      <div className="prose prose-sm prose-purple print:prose-neutral max-w-none text-slate-700">
                                          <ReactMarkdown>{page.summary}</ReactMarkdown>
                                      </div>
                                  </div>
                              )}

                              {/* Main Content */}
                              <div 
                                className="scraped-content prose prose-slate max-w-none print:prose-neutral"
                                dangerouslySetInnerHTML={{ __html: page.content }} 
                              />
                              
                              <div className="mt-12 pt-4 border-t border-slate-100 print:hidden text-center text-xs text-slate-400">
                                  End of section: {page.title}
                              </div>
                          </article>
                      ))}
                  </div>

               </div>
           )}
        </main>
      </div>
    </div>
  );
};

export default App;

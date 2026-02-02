import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchHtml, extractMainContent, makeLinksAbsolute, extractNavLinks } from './services/proxyService';
import { generateSummary } from './services/geminiService';
import { ScrapedPage, AppStatus } from './types';
import { BookOpen, FileText, Download, RefreshCw, Search, CheckSquare, Square, Cpu, Printer, ChevronRight, Menu, Layers, StopCircle, Zap, Activity, FileOutput, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const App: React.FC = () => {
  // State
  const [baseUrl, setBaseUrl] = useState<string>('https://docs.openclaw.ai/');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [discoveredLinks, setDiscoveredLinks] = useState<{ text: string, href: string }[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<ScrapedPage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Progress State for 3 Phases
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 50, currentUrl: '' });
  const [readProgress, setReadProgress] = useState({ current: 0, total: 0, activeUrls: [] as string[] });
  const [writeProgress, setWriteProgress] = useState({ current: 0, total: 0, lastWritten: '' });

  // Crawler State
  const [deepScan, setDeepScan] = useState<boolean>(false);
  const stopScanRef = useRef<boolean>(false);
  
  // Gemini/AI State
  const [isSummarizing, setIsSummarizing] = useState(false);

  // 1. Deep Crawler Logic
  const handleScan = async () => {
    if (!baseUrl) return;
    setStatus(AppStatus.SCANNING);
    setDiscoveredLinks([]);
    setSelectedLinks(new Set());
    setPages([]);
    
    // Reset Progress Bars
    setScanProgress({ current: 0, total: deepScan ? 50 : 1, currentUrl: 'Starting...' });
    setReadProgress({ current: 0, total: 0, activeUrls: [] });
    setWriteProgress({ current: 0, total: 0, lastWritten: '' });

    stopScanRef.current = false;

    // Queue for BFS (Breadth-First Search)
    let queue: string[] = [baseUrl];
    const visited = new Set<string>();
    const foundLinksMap = new Map<string, string>(); // href -> text

    try {
      const MAX_PAGES_TO_SCAN = deepScan ? 50 : 1; 

      while (queue.length > 0 && visited.size < MAX_PAGES_TO_SCAN) {
        if (stopScanRef.current) break;

        const currentUrl = queue.shift()!;
        if (visited.has(currentUrl)) continue;

        // Update Scan Progress
        setScanProgress(prev => ({ ...prev, currentUrl: currentUrl }));
        
        try {
            const html = await fetchHtml(currentUrl);
            visited.add(currentUrl);
            
            // Update Scan Count
            setScanProgress(prev => ({ ...prev, current: visited.size }));

            // Extract links from this page
            const links = extractNavLinks(html, currentUrl);
            
            // Filter and add new links
            links.forEach(link => {
                // Must be same hostname
                if (!link.href.includes(new URL(baseUrl).hostname)) return;

                if (!foundLinksMap.has(link.href)) {
                    foundLinksMap.set(link.href, link.text);
                    // If deep scan is on, add to queue to explore later
                    if (deepScan && !visited.has(link.href) && !queue.includes(link.href)) {
                         queue.push(link.href);
                    }
                }
            });

        } catch (error) {
            console.warn(`Failed to scan ${currentUrl}`, error);
        }

        // Delay for politeness
        await new Promise(r => setTimeout(r, 500));
      }

      const allFoundLinks = Array.from(foundLinksMap.entries()).map(([href, text]) => ({ href, text }));
      if (!foundLinksMap.has(baseUrl)) {
         allFoundLinks.unshift({ href: baseUrl, text: 'Home / Entry' });
      }

      setDiscoveredLinks(allFoundLinks);
      const initialSelection = new Set(allFoundLinks.slice(0, 50).map(l => l.href));
      setSelectedLinks(initialSelection);
      setStatus(AppStatus.IDLE);
      setScanProgress(prev => ({ ...prev, currentUrl: 'Done' }));

    } catch (error) {
      alert(`Error scanning: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatus(AppStatus.IDLE);
    }
  };

  const handleStopScan = () => {
    stopScanRef.current = true;
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

  // 3. Fetch Content (Updated with 3-Phase Progress)
  const handleFetchContent = async () => {
    setStatus(AppStatus.FETCHING_CONTENT);
    stopScanRef.current = false;
    const linksToFetch = discoveredLinks.filter(l => selectedLinks.has(l.href));
    
    // Init Progress
    const total = linksToFetch.length;
    setReadProgress({ current: 0, total, activeUrls: [] });
    setWriteProgress({ current: 0, total, lastWritten: 'Waiting...' });
    
    const results: ScrapedPage[] = [];
    const jobQueue = [...linksToFetch];
    const CONCURRENCY_LIMIT = 3; 

    // Worker Function
    const worker = async (workerId: number) => {
        while (jobQueue.length > 0 && !stopScanRef.current) {
            const link = jobQueue.shift(); 
            if (!link) break;

            // Phase 2: Reading Update (Start)
            setReadProgress(prev => ({
                ...prev,
                current: prev.current + 1,
                activeUrls: [...prev.activeUrls, link.href]
            }));
            
            try {
                // Network Request
                const rawHtml = await fetchHtml(link.href);
                const mainContent = extractMainContent(rawHtml);
                const cleanContent = makeLinksAbsolute(mainContent, link.href);

                // Phase 2: Reading Done (Remove from active list)
                setReadProgress(prev => ({
                    ...prev,
                    activeUrls: prev.activeUrls.filter(u => u !== link.href)
                }));

                const pageData: ScrapedPage = {
                    url: link.href,
                    title: link.text,
                    content: cleanContent,
                    status: 'success',
                    links: []
                };
                results.push(pageData);

                // Phase 3: Writing Update (Completed)
                setWriteProgress(prev => ({
                    ...prev,
                    current: prev.current + 1,
                    lastWritten: link.text
                }));

            } catch (error) {
                console.error(`Agent ${workerId} failed: ${link.href}`, error);
                // Even if failed, we count as processed
                setWriteProgress(prev => ({ ...prev, current: prev.current + 1, lastWritten: `Error: ${link.text}` }));
                setReadProgress(prev => ({ ...prev, activeUrls: prev.activeUrls.filter(u => u !== link.href) }));
            }

            const delay = 300 + Math.random() * 500;
            await new Promise(r => setTimeout(r, delay));
        }
    };

    const workers = [];
    for (let i = 1; i <= CONCURRENCY_LIMIT; i++) {
        workers.push(worker(i));
    }

    await Promise.all(workers);

    const resultMap = new Map(results.map(r => [r.url, r]));
    const sortedPages = linksToFetch
        .map(link => resultMap.get(link.href))
        .filter((p): p is ScrapedPage => p !== undefined);

    setPages(sortedPages);
    setStatus(AppStatus.READY_TO_PRINT);
    setIsSidebarOpen(false); 
  };

  const handleSummarize = async (pageIndex: number) => {
    setIsSummarizing(true);
    const page = pages[pageIndex];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = page.content;
    const textContent = tempDiv.textContent || "";
    const summary = await generateSummary(textContent);
    const updatedPages = [...pages];
    updatedPages[pageIndex] = { ...page, summary };
    setPages(updatedPages);
    setIsSummarizing(false);
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper to calculate percentage safely
  const getPercent = (current: number, total: number) => {
      if (total === 0) return 0;
      return Math.min(100, Math.round((current / total) * 100));
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* Top Bar */}
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
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex gap-2">
                <input 
                type="text" 
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="Enter documentation URL (e.g., https://docs.openclaw.ai/)"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                
                {status === AppStatus.SCANNING ? (
                    <button 
                        onClick={handleStopScan}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                    >
                        <StopCircle className="w-4 h-4" /> Stop
                    </button>
                ) : (
                    <button 
                        onClick={handleScan}
                        disabled={status !== AppStatus.IDLE && status !== AppStatus.READY_TO_PRINT}
                        className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        <Search className="w-4 h-4" /> Scan
                    </button>
                )}
            </div>
            
            <div className="flex items-center gap-2 px-1">
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input 
                        type="checkbox" 
                        checked={deepScan}
                        onChange={(e) => setDeepScan(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium flex items-center gap-1">
                        <Layers className="w-3 h-3" /> 
                        Deep Crawler (Slow but finds all pages)
                    </span>
                </label>
            </div>

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
        
        {/* Sidebar */}
        <aside className={`no-print bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
          <div className="p-4 border-b border-slate-100 flex flex-col gap-2 bg-slate-50">
             <div className="flex justify-between items-center">
                <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> 
                    Found ({discoveredLinks.length})
                </h2>
                {discoveredLinks.length > 0 && (
                    <button onClick={toggleSelectAll} className="text-xs text-blue-600 font-medium hover:underline">
                        {selectedLinks.size === discoveredLinks.length ? 'Deselect All' : 'Select All'}
                    </button>
                )}
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {discoveredLinks.length === 0 && status === AppStatus.IDLE && (
                 <div className="text-center p-8 text-slate-400 text-sm">
                    1. Enter URL<br/>2. Check "Deep Crawler"<br/>3. Click Scan
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
            {status === AppStatus.FETCHING_CONTENT ? (
                <button
                    onClick={handleStopScan}
                    className="w-full bg-red-500 text-white py-3 rounded-lg font-medium text-sm flex justify-center items-center gap-2 hover:bg-red-600 transition-colors"
                >
                     <StopCircle className="w-4 h-4" /> Stop Agents
                </button>
            ) : (
                <button
                    onClick={handleFetchContent}
                    disabled={selectedLinks.size === 0 || status === AppStatus.SCANNING}
                    className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium text-sm flex justify-center items-center gap-2 disabled:opacity-50 hover:bg-slate-800 transition-colors"
                >
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Multi-Agent Fetch ({selectedLinks.size})
                </button>
            )}
          </div>
        </aside>

        {/* Toggle Sidebar Button */}
        <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="no-print absolute top-4 left-4 z-20 bg-white border border-slate-200 p-2 rounded-md shadow-sm hover:bg-slate-50"
            style={{ left: isSidebarOpen ? '20.5rem' : '1rem' }}
        >
            {isSidebarOpen ? <Menu className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Main Content Viewer */}
        <main className="flex-1 overflow-y-auto bg-slate-100 p-8 flex justify-center relative">
           
           {/* Progress Dashboard - Floating Card */}
           {(status === AppStatus.SCANNING || status === AppStatus.FETCHING_CONTENT) && (
               <div className="no-print fixed top-24 right-8 z-50 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden ring-1 ring-slate-900/5">
                   <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                       <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
                           <Activity className="w-4 h-4 text-blue-500" /> Live Progress
                       </h3>
                   </div>
                   <div className="p-4 space-y-4">
                       
                       {/* 1. Scanning Bar */}
                       <div>
                           <div className="flex justify-between text-xs mb-1">
                               <span className="font-medium text-slate-700 flex items-center gap-1"><Globe className="w-3 h-3"/> Scanning Links</span>
                               <span className="text-slate-500">{scanProgress.current} found</span>
                           </div>
                           <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                               <div 
                                   className="h-full bg-blue-500 transition-all duration-300"
                                   style={{ width: `${getPercent(scanProgress.current, scanProgress.total)}%` }}
                               ></div>
                           </div>
                           <p className="text-[10px] text-slate-400 mt-1 truncate">
                               Current: {scanProgress.currentUrl}
                           </p>
                       </div>

                       {/* 2. Reading Bar */}
                       <div>
                           <div className="flex justify-between text-xs mb-1">
                               <span className="font-medium text-slate-700 flex items-center gap-1"><Download className="w-3 h-3"/> Reading (Agents)</span>
                               <span className="text-slate-500">{readProgress.current} / {readProgress.total}</span>
                           </div>
                           <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                               <div 
                                   className="h-full bg-orange-400 transition-all duration-300"
                                   style={{ width: `${getPercent(readProgress.current, readProgress.total)}%` }}
                               ></div>
                           </div>
                           <div className="text-[10px] text-slate-400 mt-1 h-8 overflow-hidden">
                               {readProgress.activeUrls.length > 0 ? (
                                   readProgress.activeUrls.map((u, i) => (
                                       <div key={i} className="truncate">• {u}</div>
                                   ))
                               ) : <span className="text-slate-300">Agents idle...</span>}
                           </div>
                       </div>

                       {/* 3. Writing Bar */}
                       <div>
                           <div className="flex justify-between text-xs mb-1">
                               <span className="font-medium text-slate-700 flex items-center gap-1"><FileOutput className="w-3 h-3"/> Formatting PDF</span>
                               <span className="text-slate-500">{writeProgress.current} / {writeProgress.total}</span>
                           </div>
                           <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                               <div 
                                   className="h-full bg-green-500 transition-all duration-300"
                                   style={{ width: `${getPercent(writeProgress.current, writeProgress.total)}%` }}
                               ></div>
                           </div>
                           <p className="text-[10px] text-slate-400 mt-1 truncate">
                               Done: <span className="text-green-600 font-medium">{writeProgress.lastWritten || '-'}</span>
                           </p>
                       </div>
                   </div>
               </div>
           )}

           {pages.length === 0 ? (
               <div className="flex flex-col items-center justify-center text-slate-400 mt-20">
                  <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                      <BookOpen className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-600">Ready to Scrape</h3>
                  <p className="max-w-md text-center mt-2 text-sm">
                      Check <strong>"Deep Crawler"</strong> to find hidden pages,<br/>or just Scan for quick mode.
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
                              
                              <div className="mb-8 pb-4 border-b border-slate-100 print:border-black flex justify-between items-start">
                                  <div>
                                     <h2 className="text-3xl font-bold text-slate-900">{page.title}</h2>
                                     <a href={page.url} className="text-xs text-blue-500 hover:underline print:text-black print:no-underline">{page.url}</a>
                                  </div>
                                  
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
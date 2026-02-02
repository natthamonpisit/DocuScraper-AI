export interface ScrapedPage {
  url: string;
  title: string;
  content: string; // HTML content
  summary?: string; // AI Summary
  status: 'pending' | 'loading' | 'success' | 'error';
  links: string[]; // Links found on this page
}

export interface NavLink {
  href: string;
  text: string;
  depth: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  FETCHING_CONTENT = 'FETCHING_CONTENT',
  READY_TO_PRINT = 'READY_TO_PRINT',
}

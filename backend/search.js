// Scrape a webpage and extract clean body text (max 2000 characters for bookmarked URLs)
export async function scrapeUrlText(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000); // 4-second timeout for manual bookmarks
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(id);
    
    if (!res.ok) return '';
    const html = await res.text();
    
    // Strip script, style, head, nav, footer, iframe tags to extract clean text
    let cleanText = html.replace(/<(script|style|head|nav|footer|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // Strip remaining HTML tags
    cleanText = cleanText.replace(/<[^>]*>/g, ' ');
    // Clean up whitespace
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    // Return first 2500 characters
    return cleanText.slice(0, 2500);
  } catch (err) {
    console.log(`Failed to scrape URL ${url}:`, err.message);
    return '';
  }
}

// Helper: Fetch webpage and extract clean text (max 800 characters) for quick search snippets
async function fetchPageText(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000); // 2-second timeout
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(id);
    
    if (!res.ok) return '';
    const html = await res.text();
    
    let cleanText = html.replace(/<(script|style|head|nav|footer|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '');
    cleanText = cleanText.replace(/<[^>]*>/g, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    return cleanText.slice(0, 1000);
  } catch (err) {
    console.log(`Failed to crawl page content for ${url}:`, err.message);
    return '';
  }
}

// Web Search utility using DuckDuckGo HTML search + page crawler
export async function searchWeb(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    console.log(`Scraping DuckDuckGo HTML for query: "${query}"`);
    
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo responded with status ${res.status}`);
    }

    const html = await res.text();
    const results = [];
    
    const titleRegex = /<h2 class="result__title">([\s\S]*?)<\/h2>/g;
    let match;
    
    while ((match = titleRegex.exec(html)) !== null) {
      const h2Content = match[1];
      const h2End = titleRegex.lastIndex;
      
      const linkMatch = h2Content.match(/href="([^"]*?uddg=([^"&]*)[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      
      const encodedUrl = linkMatch[2];
      const title = linkMatch[3].replace(/<[^>]*>/g, '').trim();
      const pageUrl = decodeURIComponent(encodedUrl);
      
      const snippetPart = html.slice(h2End, h2End + 2000);
      const snippetMatch = snippetPart.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      let snippet = '';
      if (snippetMatch) {
        snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim();
      }
      
      results.push({ title, url: pageUrl, snippet });
    }
    
    const topResults = results.slice(0, 5);
    
    console.log(`Crawling top ${Math.min(3, topResults.length)} page details in parallel...`);
    const crawledResults = await Promise.all(
      topResults.map(async (item, idx) => {
        if (idx < 3) {
          const pageText = await fetchPageText(item.url);
          if (pageText && pageText.length > 50) {
            return {
              ...item,
              snippet: `${item.snippet}\n[Full Article Context]: ${pageText}`
            };
          }
        }
        return item;
      })
    );
    
    return crawledResults;
  } catch (error) {
    console.error('Web search error:', error);
    return [];
  }
}

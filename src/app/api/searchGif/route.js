// // app/api/searchGif/route.js
// import { NextResponse } from 'next/server';
// import puppeteer from 'puppeteer';

// export async function GET(request) {
//   const { searchParams } = new URL(request.url);
//   const query = searchParams.get('query');

//   if (!query) {
//     return NextResponse.json({ 
//       success: false, 
//       message: 'Missing search query' 
//     }, { status: 400 });
//   }

//   let browser;
//   try {
//     // Launch browser
//     browser = await puppeteer.launch({
//       headless: "new",
//       args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
//     });
    
//     const page = await browser.newPage();
    
//     // Configure browser to appear more like a real user
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
//     await page.setExtraHTTPHeaders({
//       'Accept-Language': 'en-US,en;q=0.9',
//       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
//       'Referer': 'https://www.google.com/'
//     });

//     // Enable console logging from the page
//     page.on('console', msg => console.log('PAGE LOG:', msg.text()));

//     // Visit either DuckDuckGo or Giphy
//     // const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}+gif&iax=images&ia=images`;
//     const searchUrl = `https://giphy.com/search/${encodeURIComponent(query)}`;
    
//     console.log(`Navigating to: ${searchUrl}`);
//     await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
//     // Wait for content to load
//     await new Promise(resolve => setTimeout(resolve, 5000));
    
//     // Take a screenshot for debugging
//     await page.screenshot({ path: './public/debug-screenshot.png', fullPage: false });
//     console.log("Screenshot saved to ./public/debug-screenshot.png");

//     // For Giphy
//     const gifs = await page.evaluate(() => {
//       const results = [];
      
//       // Giphy-specific selectors
//       const gifsElements = document.querySelectorAll('.giphy-gif');
      
//       if (gifsElements.length > 0) {
//         console.log("Found Giphy elements");
//         gifsElements.forEach((element, i) => {
//           // Get data from the element
//           const imgElement = element.querySelector('img');
//           const src = imgElement?.getAttribute('src');
//           // Get the actual gif URL
//           const url = element.getAttribute('data-gif-url') || 
//                      element.getAttribute('data-animated-src') ||
//                      src;
          
//           if (url) {
//             results.push({
//               id: i,
//               url: url,
//               alt: imgElement?.getAttribute('alt') || 'GIF image',
//               source: 'giphy'
//             });
//           }
//         });
//       } else {
//         // Fallback: Try generic image selectors
//         console.log("No Giphy elements found, trying generic selectors");
        
//         const selectors = [
//           'img[src*=".gif"]',
//           'img[data-src*=".gif"]',
//           'img[srcset*=".gif"]',
//           'picture source[srcset*=".gif"]',
//           // Additional selectors
//           '.media-content img',
//           '.gif-container img',
//           '[data-testid="gif-image-container"] img'
//         ];
        
//         for (const selector of selectors) {
//           document.querySelectorAll(selector).forEach((img, i) => {
//             const src = img.getAttribute('src') || img.getAttribute('data-src');
//             if (src) {
//               results.push({
//                 id: i,
//                 url: src,
//                 alt: img.getAttribute('alt') || 'GIF image',
//                 selector: selector
//               });
//             }
//           });
//         }
//       }
      
//       // Add debug info about all images on the page
//       const allImages = [];
//       document.querySelectorAll('img').forEach((img, i) => {
//         if (i < 10) { // Limit to first 10 to avoid too much data
//           allImages.push({
//             src: img.getAttribute('src'),
//             dataSrc: img.getAttribute('data-src'),
//             class: img.getAttribute('class'),
//             width: img.width,
//             height: img.height
//           });
//         }
//       });
      
//       console.log("All images found:", allImages.length);
      
//       return {
//         results: results,
//         debug: {
//           allImages: allImages,
//           url: window.location.href,
//           title: document.title
//         }
//       };
//     });

//     console.log(`Found ${gifs.results?.length || 0} GIFs for query "${query}"`);
    
//     // Close the browser
//     await browser.close();
    
//     // Process results
//     if (gifs.results && gifs.results.length > 0) {
//       return NextResponse.json({
//         success: true,
//         gif: gifs.results[0],
//         alternatives: gifs.results.slice(1, 5),
//         debug: {
//           foundCount: gifs.results.length,
//           pageInfo: gifs.debug
//         }
//       });
//     }
    
//     // No results found
//     return NextResponse.json({
//       success: false,
//       message: 'No GIFs found. Try a different query.',
//       debug: gifs.debug
//     });

//   } catch (error) {
//     // Handle errors
//     if (browser) await browser.close();
    
//     console.error('GIF search error:', error);
//     return NextResponse.json({
//       success: false,
//       message: 'Failed to fetch GIFs.',
//       error: error.message,
//       stack: error.stack
//     }, { status: 500 });
//   }
// }

// app/api/searchGif/route.js
// app/api/searchGif/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio'; // Updated import syntax

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ 
      success: false, 
      message: 'Missing search query' 
    }, { status: 400 });
  }

  try {
    const { data } = await axios.get(`https://giphy.com/search/${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const gifs = [];
    const uniqueUrls = new Set();

    // Ordered selectors - most specific first
    const selectors = [
      '.giphy-gif-img',
      'img[src*=".gif"]',
      'img[data-src*=".gif"]',
      '[data-testid="gif"] img',
      'picture source[srcset*=".gif"]',
      '.gif-container img'
    ];

    for (const selector of selectors) {
      $(selector).each((index, element) => {
        const $el = $(element);
        const src = $el.attr('src') || 
                   $el.attr('data-src') ||
                   $el.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];

        if (src && src.includes('.gif') && !uniqueUrls.has(src)) {
          uniqueUrls.add(src);
          gifs.push({
            url: src,
            alt: $el.attr('alt') || `GIF ${gifs.length + 1}`,
            source: 'giphy',
            selectorFound: selector
          });
        }
      });

      // Early exit if we found results with a high-confidence selector
      if (gifs.length > 3 && selector === '.giphy-gif-img') break;
    }

    return NextResponse.json({
      success: true,
      count: gifs.length,
      gifs: gifs.slice(0, 20) // Limit results
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch GIFs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      suggestion: 'Try again later or use official APIs'
    }, { status: 500 });
  }
}
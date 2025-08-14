// app/api/searchImage/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Optional: Rotating proxies list
const PROXIES = [
  { host: '45.76.177.213', port: 3128 },
  { host: '103.145.57.109', port: 8080 },
  // Add more proxies as needed
];

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
    const searchQuery = encodeURIComponent(query);
    const url = `https://www.google.com/search?q=${searchQuery}&tbm=isch`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': 'https://www.google.com/',
      'DNT': '1',
    };

    // Try with proxy first, then fallback to direct request
    let response;
    const images = [];

    // Attempt 1: Try with proxy if available
    if (PROXIES.length > 0) {
      try {
        const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
        response = await axios.get(url, {
          headers,
          proxy,
          timeout: 5000
        });
      } catch (proxyError) {
        console.warn('Proxy failed, trying direct connection',proxyError.message);
      }
    }

    // Attempt 2: Direct connection if proxy fails
    if (!response) {
      response = await axios.get(url, {
        headers,
        timeout: 5000
      });
    }

    const $ = cheerio.load(response.data);

    // Method 1: Standard image extraction
    $('img[src^="http"], img[data-src^="http"]').each((i, element) => {
      const src = $(element).attr('src') || $(element).attr('data-src');
      if (src && !src.startsWith('data:')) {
        images.push({
          id: i,
          url: src.split('?')[0], // Remove query params
          alt: $(element).attr('alt') || query
        });
      }
    });

    // Method 2: Fallback to JSON parsing if no images found
    if (images.length === 0) {
      const scriptData = $('script').toString();
      const imageRegex = /\["https:\/\/[^"]+",\d+,\d+\]/g;
      const matches = scriptData.match(imageRegex);

      if (matches) {
        matches.slice(0, 10).forEach((match, i) => {
          try {
            const url = JSON.parse(match)[0];
            images.push({
              id: i,
              url: url.replace(/\\u003d/g, '='),
              alt: query
            });
          } catch (e) {
            console.error('Failed to parse image URL:', match);
            console.log(e);
          }
        });
      }
    }

    // Return the second image (index 1) if available
    if (images.length > 1) {
      return NextResponse.json({
        success: true,
        image: images[1]
      });
    }

    // Final fallback: Return first image if only one exists
    if (images.length === 1) {
      return NextResponse.json({
        success: true,
        image: images[0]
      });
    }

    return NextResponse.json({
      success: false,
      message: 'No images found after multiple extraction attempts',
      debug: images.length > 0 ? 'Found images but less than required' : 'No images extracted'
    });

  } catch (error) {
    console.error('Full error:', error);
    return NextResponse.json({
      success: false,
      message: 'Google blocked the request or network error occurred',
      error: error.message
    }, { status: 500 });
  }
}
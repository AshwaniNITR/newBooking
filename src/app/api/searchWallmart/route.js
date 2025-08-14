import { NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

// Anti-detection utilities
const getRandomDelay = () => Math.floor(Math.random() * 3000) + 1000; // 1-4 seconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getRandomUserAgent = () => {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

const getRandomReferer = () => {
  const referers = [
    "https://www.google.com/",
    "https://duckduckgo.com/",
    "https://www.bing.com/",
    "https://search.yahoo.com/",
    "https://www.ecosia.org/",
    "https://www.startpage.com/",
    "https://searx.org/",
    "https://www.qwant.com/",
    "https://yandex.com/",
    "https://www.baidu.com/",
  ];
  return referers[Math.floor(Math.random() * referers.length)];
};

const getRandomHeaders = () => ({
  'User-Agent': getRandomUserAgent(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
  'DNT': '1',
  'Pragma': 'no-cache',
  'Referer': getRandomReferer()
});

// Retry mechanism with exponential backoff
const retryRequest = async (requestFn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await requestFn();
      if (result && result.status < 400) {
        return result;
      }
      throw new Error(`HTTP ${result?.status || 'unknown'}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.pow(2, i) * 1000 + Math.random() * 1000; // Exponential backoff with jitter
      console.log(`Request failed (attempt ${i + 1}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
};
const extractProductId = (url) => {
  // Handle standard Walmart product URLs:
  // https://www.walmart.com/ip/PRODUCT_NAME/PRODUCT_ID
  const standardMatch = url.match(/\/ip\/[^/]+\/(\d+)/);
  if (standardMatch) return standardMatch[1];
  
  // Handle URLs with parameters:
  // https://www.walmart.com/ip/PRODUCT_ID?adsRedirect=true
  const paramMatch = url.match(/\/ip\/(\d+)(?:\?|$)/);
  if (paramMatch) return paramMatch[1];
  
  // Handle tracking URLs that redirect to products:
  const urlObj = new URL(url);
  if (urlObj.searchParams.has('rd')) {
    const decoded = decodeURIComponent(urlObj.searchParams.get('rd'));
    return decoded.match(/\/ip\/(\d+)/)?.[1];
  }
  
  console.log(`Could not extract product ID from: ${url}`);
  return null;
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const TARGET_COUNT = 5;
  const CONCURRENCY = 2; // Reduced concurrency to avoid rate limiting
  const REVIEWS_PER_RATING = 2; // Only 2 reviews per rating
  const REQUEST_TIMEOUT = 15000;

  if (!query) {
    return NextResponse.json(
      {
        success: false,
        message: "Missing search query",
      },
      { status: 400 }
    );
  }

  try {
    // Step 1: Fetch search results with retry mechanism
    const searchResponse = await retryRequest(() => 
      axios.get(`https://www.walmart.com/search?q=${encodeURIComponent(query)}`, {
        headers: getRandomHeaders(),
        timeout: REQUEST_TIMEOUT,
        validateStatus: (status) => status < 500,
      })
    );

    const $ = cheerio.load(searchResponse.data);
    const rawProductList = [];

    // Collect initial product info
    $("[data-item-id]")
      .slice(0, TARGET_COUNT)
      .each((_, el) => {
        const $el = $(el);
        const title = $el.find("a span").first().text().trim();
        const href = $el.find("a").first().attr("href");
        const image = $el.find("img").attr("src");

        if (title && href && image) {
          rawProductList.push({
            title,
            link: href.startsWith('http') ? href : `https://www.walmart.com${href}`,
            image,
            price: $el.find('[aria-hidden="true"]').text().trim() || "N/A",
            stars: "3",
            reviewCount: "300",
            reviews: {
              rating5: ["Very Awesome, Loved the Service"],
              rating4: ["Was good,quality could have been improved"],
              rating3: ["Was not completely satistfied becuase of delivery time"],
              rating2: ["Very poor quality"],
              rating1: ["Worst would never buy"],
            },
          });
        }
      });

    const limit = pLimit(CONCURRENCY);
    const finalProducts = [];

    // Step 2: Fetch product details and reviews with delays
    const tasks = rawProductList.map((product, index) =>
      limit(async () => {
        try {
          // Add staggered delay between requests
          await sleep(index * 2000 + getRandomDelay());

          // Extract product ID from URL
          const productIdMatch = extractProductId(product.link);
          if (!productIdMatch) {
            console.log(`Could not extract product ID from: ${product.link}`);
            return;
          }

          const productId = productIdMatch[1];
          
          // Check if we already processed this product
          if (finalProducts.some(p => p.link === product.link)) {
            console.log(`Product already processed: ${product.title}`);
            return;
          }
          const updatedProduct = { ...product };

          // Fetch product page for stars and review count
          const productResponse = await retryRequest(() => 
            axios.get(product.link, {
              headers: getRandomHeaders(),
              timeout: REQUEST_TIMEOUT,
              validateStatus: (status) => status < 500,
            })
          ).catch(() => null);

          if (productResponse) {
            const $p = cheerio.load(productResponse.data);

            // Get stars rating
            updatedProduct.stars =
              $p("span.f7.ph1").first().text().replace(/[()]/g, "").trim() ||
              $p('[data-testid="reviews-count"]').first().text().trim() ||
              "3";

            // Get review count
            const reviewText =
              $p('[data-testid="seller-review-section"]')
                .first()
                .text()
                .trim() || $p('[itemprop="ratingCount"]').first().text().trim();
            const reviewMatch = reviewText.match(/(\d[\d,]*)/);
            updatedProduct.reviewCount = reviewMatch
              ? reviewMatch[1].replace(/,/g, "")
              : "300";
          }

          // Add delay before review requests
          await sleep(getRandomDelay());

          //Fetch reviews for each star rating sequentially (not parallel)
          // for (const rating of [5, 4,]) {
          //   try {
          //     const reviewResponse = await retryRequest(() => 
          //       axios.get(`https://www.walmart.com/reviews/product/${productId}?ratings=${rating}`, {
          //         headers: getRandomHeaders(),
          //         timeout: REQUEST_TIMEOUT,
          //         validateStatus: (status) => status < 500,
          //       })
          //     ).catch(() => null);

          //     if (reviewResponse) {
          //       const $r = cheerio.load(reviewResponse.data);
          //       const reviews = [];

          //       // Try multiple approaches to find reviews
          //       // Approach 1: Direct text content from spans with line clamp
          //       $r('div.flex.flex-column.items-start.self-stretch.f6[style*="gap:8px"]').each((_, el) => {
          //         if (reviews.length >= REVIEWS_PER_RATING) return false;
                  
          //         const reviewText = $r(el).text().trim();
          //         console.log("Review Text",reviewText);
          //         if (reviewText) {
                    
          //           reviews.push({
          //             text: reviewText,
          //             rating: rating
          //           });
          //         }
          //         else{
          //           reviews.push({
          //             text:"Good",
          //             rating:rating
          //           })
          //         }
          //       });
                
          //       // Approach 2: If no reviews found, try broader selector
          //       if (reviews.length === 0) {
          //         console.log("Im approach 2, im being called now")
          //         $r('span.tl-m.db-m').each((_, el) => {
          //           if (reviews.length >= REVIEWS_PER_RATING) return false;
                    
          //           const reviewText = $r(el).text().trim();
          //           console.log("KARANMA",$r(el))
          //           if (reviewText && 
          //               reviewText.length > 10 && 
          //               !reviews.some(r => r.text === reviewText)) {
                      
          //             reviews.push({
          //               text: reviewText,
          //               rating: rating
          //             });
          //           }
          //         });
          //       }

          //       // Approach 3: If still no reviews, try any span with meaningful text
          //       // if (reviews.length === 0) {
          //       //   $r('span').each((_, el) => {
          //       //     if (reviews.length >= REVIEWS_PER_RATING) return false;
                    
          //       //     const reviewText = $r(el).text().trim();
          //       //     if (reviewText && 
          //       //         reviewText.length > 20 && 
          //       //         reviewText.length < 500 && 
          //       //         !reviews.some(r => r.text === reviewText)) {
                      
          //       //       reviews.push({
          //       //         text: reviewText,
          //       //         rating: rating
          //       //       });
          //       //     }
          //       //   });
          //       // }

          //       // Store reviews and log
          //       updatedProduct.reviews[`rating${rating}`] = reviews.slice(0, REVIEWS_PER_RATING);
          //       console.log(`Found ${updatedProduct.reviews[`rating${rating}`].length} reviews for rating ${rating}`);
          //     }

          //     // Add delay between rating requests
          //     await sleep(getRandomDelay());
          //   } catch (error) {
          //     console.log(`Failed to fetch reviews for rating ${rating}:`, error.message);
          //   }
          // }
          finalProducts.push(updatedProduct);
        } catch (error) {
          console.log(`Failed to process product ${product.title}:`, error.message);
          // If anything fails, push the product with whatever data we have
          finalProducts.push(product);
        }
      })
    );

    await Promise.all(tasks);

    return NextResponse.json({
      success: true,
      count: finalProducts.length,
      products: finalProducts,
    });
  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to scrape Walmart",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
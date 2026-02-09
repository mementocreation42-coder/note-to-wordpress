require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const NOTE_ID = process.env.NOTE_ID;
const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;
const WP_CATEGORY_ID = process.env.WP_CATEGORY_ID;

const parser = new Parser();

async function run() {
    console.log('Starting Note to WordPress automation...');

    if (!NOTE_ID || !WP_URL || !WP_USER || !WP_APP_PASSWORD) {
        console.error('Missing required environment variables.');
        process.exit(1);
    }

    try {
        // 1. Fetch Note RSS using Axios for reliable User-Agent header
        const feedUrl = `https://note.com/${NOTE_ID}/rss`;
        console.log(`Fetching RSS from: ${feedUrl}`);

        const rssResponse = await axios.get(feedUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/rss+xml, application/xml, text/xml'
            }
        });

        const feed = await parser.parseString(rssResponse.data);

        if (!feed.items || feed.items.length === 0) {
            console.log('No articles found in the RSS feed.');
            return;
        }

        const latestItem = feed.items[0];
        console.log(`Latest article: "${latestItem.title}"`);
        console.log(`Link: ${latestItem.link}`);

        // 2. Check for duplicates in WordPress
        const token = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
        const searchUrl = `${WP_URL}/wp-json/wp/v2/posts`;

        console.log('Checking for duplicates...');
        const searchResponse = await axios.get(searchUrl, {
            params: {
                search: latestItem.title,
                per_page: 5,
                status: 'any'
            },
            headers: {
                'Authorization': `Basic ${token}`,
                'User-Agent': USER_AGENT
            }
        });

        const existingPosts = searchResponse.data;
        if (existingPosts.some(post => post.title.rendered === latestItem.title)) {
            console.log(`Skip: Article "${latestItem.title}" already exists in WordPress.`);
            return;
        }

        // 3. Fetch full article content from Note
        console.log('Fetching full article content...');
        const articleResponse = await axios.get(latestItem.link, {
            headers: {
                'User-Agent': USER_AGENT
            }
        });
        const $ = cheerio.load(articleResponse.data);

        // Extract article body - Note uses .note-common-styles__textnote-body or similar
        let contentForWp = '';
        const articleBody = $('.note-common-styles__textnote-body').first();

        if (articleBody.length) {
            articleBody.children().each((i, el) => {
                const tag = el.tagName.toLowerCase();
                // Clean HTML: Remove attributes to prevent Block Validation Errors
                const innerHtml = $(el).html();
                const cleanHtml = `<${tag}>${innerHtml}</${tag}>`;

                if (tag === 'p') {
                    contentForWp += `<!-- wp:paragraph -->\n${cleanHtml}\n<!-- /wp:paragraph -->\n\n`;
                } else if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
                    const level = tag.charAt(1);
                    contentForWp += `<!-- wp:heading {"level":${level}} -->\n${cleanHtml}\n<!-- /wp:heading -->\n\n`;
                } else if (tag === 'figure') {
                    const img = $(el).find('img');
                    if (img.length) {
                        const src = img.attr('src') || '';
                        const alt = img.attr('alt') || '';
                        contentForWp += `<!-- wp:image -->\n<figure class="wp-block-image"><img src="${src}" alt="${alt}"/></figure>\n<!-- /wp:image -->\n\n`;
                    }
                } else if (tag === 'blockquote') {
                    contentForWp += `<!-- wp:quote -->\n<blockquote class="wp-block-quote">${innerHtml}</blockquote>\n<!-- /wp:quote -->\n\n`;
                } else {
                    contentForWp += `<!-- wp:paragraph -->\n${cleanHtml}\n<!-- /wp:paragraph -->\n\n`;
                }
            });
        } else {
            // Fallback to RSS description
            contentForWp = `<!-- wp:paragraph -->\n<p>${latestItem.contentSnippet || latestItem.content || 'Content not available.'}</p>\n<!-- /wp:paragraph -->`;
        }

        // 4. Prepare Data for WordPress
        const wpPostData = {
            title: latestItem.title,
            content: contentForWp,
            status: 'draft',
        };

        // Add category if defined
        if (WP_CATEGORY_ID) {
            wpPostData.categories = [parseInt(WP_CATEGORY_ID)];
        }

        // 5. Post to WordPress
        console.log('Posting to WordPress as draft...');
        const postResponse = await axios.post(`${WP_URL}/wp-json/wp/v2/posts`, wpPostData, {
            headers: {
                'Authorization': `Basic ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT
            }
        });

        console.log(`Success! Draft created: ${postResponse.data.link}`);
        console.log(`Post ID: ${postResponse.data.id}`);

    } catch (error) {
        console.error('Error occurred:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

run();

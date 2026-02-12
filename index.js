require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const NOTE_ID = process.env.NOTE_ID;

// Site configurations
const sites = [];

// Site 1 (Original)
if (process.env.WP_URL) {
    sites.push({
        name: 'Site 1',
        url: process.env.WP_URL,
        user: process.env.WP_USER,
        password: process.env.WP_APP_PASSWORD,
        categoryId: process.env.WP_CATEGORY_ID
    });
}

// Site 2 (New: shinealight.jp)
if (process.env.WP2_URL) {
    sites.push({
        name: 'Site 2',
        url: process.env.WP2_URL,
        user: process.env.WP2_USER,
        password: process.env.WP2_APP_PASSWORD,
        categoryId: process.env.WP2_CATEGORY_ID
    });
}

const parser = new Parser();

async function run() {
    console.log('Starting Note to WordPress automation...');

    if (!NOTE_ID || sites.length === 0) {
        console.error('Missing required environment variables (NOTE_ID or WP sites).');
        process.exit(1);
    }

    try {
        // 1. Fetch Note RSS
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

        // 2. Fetch full article content from Note once
        console.log('Fetching full article content...');
        const articleResponse = await axios.get(latestItem.link, {
            headers: {
                'User-Agent': USER_AGENT
            }
        });
        const $ = cheerio.load(articleResponse.data);

        let contentForWp = '';
        const articleBody = $('.note-common-styles__textnote-body').first();

        if (articleBody.length) {
            articleBody.children().each((i, el) => {
                const tag = el.tagName.toLowerCase();
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
            contentForWp = `<!-- wp:paragraph -->\n<p>${latestItem.contentSnippet || latestItem.content || 'Content not available.'}</p>\n<!-- /wp:paragraph -->`;
        }

        // 3. Loop through configured sites
        for (const site of sites) {
            console.log(`\nProcessing ${site.name}: ${site.url}`);
            try {
                const token = Buffer.from(`${site.user}:${site.password}`).toString('base64');
                const searchUrl = `${site.url}/wp-json/wp/v2/posts`;

                // Check for duplicates
                console.log(`[${site.name}] Checking for duplicates...`);
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
                    console.log(`[${site.name}] Skip: Article already exists.`);
                    continue;
                }

                // Prepare and post
                console.log(`[${site.name}] Posting as draft...`);
                const wpPostData = {
                    title: latestItem.title,
                    content: contentForWp,
                    status: 'draft',
                };

                if (site.categoryId) {
                    wpPostData.categories = [parseInt(site.categoryId)];
                }

                const postResponse = await axios.post(`${site.url}/wp-json/wp/v2/posts`, wpPostData, {
                    headers: {
                        'Authorization': `Basic ${token}`,
                        'Content-Type': 'application/json',
                        'User-Agent': USER_AGENT
                    }
                });

                console.log(`[${site.name}] Success! Draft created: ${postResponse.data.link}`);
            } catch (siteError) {
                console.error(`[${site.name}] Error: ${siteError.message}`);
            }
        }

    } catch (error) {
        console.error('Core error:', error.message);
        process.exit(1);
    }
}

run();

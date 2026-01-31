import { MediaItem } from "@/components/gallery/types";

const API_URL = process.env.NEXT_PUBLIC_WORDPRESS_API_URL as string;

export async function getPosts(): Promise<MediaItem[]> {
    const query = `
    query GetGalleryPosts {
      posts(first: 100) {
        nodes {
            id
            title
            date
            content
            featuredImage {
                node {
                    sourceUrl
                    mediaDetails {
                        width
                        height
                    }
                }
            }
            mediaMetadata {
                mediaType
                cloudinaryId
                wpImage {
                    node {
                        sourceUrl
                        mediaDetails {
                            width
                            height
                        }
                    }
                }
                transcription
                galleryImage1 { node { sourceUrl mediaDetails { width height } } }
                galleryImage2 { node { sourceUrl mediaDetails { width height } } }
                galleryImage3 { node { sourceUrl mediaDetails { width height } } }
                galleryImage4 { node { sourceUrl mediaDetails { width height } } }
                galleryImage5 { node { sourceUrl mediaDetails { width height } } }
                galleryImage6 { node { sourceUrl mediaDetails { width height } } }
                galleryImage7 { node { sourceUrl mediaDetails { width height } } }
                galleryImage8 { node { sourceUrl mediaDetails { width height } } }
                galleryImage9 { node { sourceUrl mediaDetails { width height } } }
                galleryImage10 { node { sourceUrl mediaDetails { width height } } }
            }
        }
      }
    }
  `;

    try {
        const url = new URL(API_URL);
        url.searchParams.append("query", query);

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        const responseText = await res.text();
        let json;

        try {
            json = JSON.parse(responseText);
        } catch (e) {
            console.error("❌ API Error: WordPress returned HTML instead of JSON.");
            console.error("Response Preview:", responseText.slice(0, 500));
            return [];
        }

        if (json.errors) {
            console.error("GraphQL Errors:", json.errors);
        }

        const posts = json.data?.posts?.nodes || [];

        console.log("📦 Fetched posts:", posts.length);

        return posts.map((post: any) => {
            const acf = post.mediaMetadata || {};
            const featuredImg = post.featuredImage?.node;
            const mediaType = acf.mediaType || "image";

            let mainSrc = "";
            let mainWidth = 1920;
            let mainHeight = 1080;

            // Handle VIDEO type
            if (mediaType === "video") {
                const cloudinaryId = acf.cloudinaryId;
                if (!cloudinaryId) {
                    console.log("⚠️ Video post has no Cloudinary ID:", post.title);
                    return null;
                }

                return {
                    id: post.id,
                    type: "video" as const,
                    src: cloudinaryId,
                    aspectRatio: 16 / 9, // Default video aspect ratio
                    alt: post.title || "Untitled",
                    date: post.date,
                    description: post.content?.replace(/<[^>]*>?/gm, "") || "",
                    transcription: acf.transcription,
                };
            }

            // Handle IMAGE type
            if (acf.wpImage?.node?.sourceUrl) {
                mainSrc = acf.wpImage.node.sourceUrl;
                mainWidth = acf.wpImage.node.mediaDetails?.width || 1920;
                mainHeight = acf.wpImage.node.mediaDetails?.height || 1080;
            } else if (featuredImg?.sourceUrl) {
                mainSrc = featuredImg.sourceUrl;
                mainWidth = featuredImg.mediaDetails?.width || 1920;
                mainHeight = featuredImg.mediaDetails?.height || 1080;
            }

            if (!mainSrc) {
                console.log("⚠️ Post has no image:", post.title);
                return null;
            }

            // Build Gallery Array
            const gallery: Array<{ src: string; type: string; aspectRatio: number }> = [];

            // First item is the main image
            gallery.push({
                src: mainSrc,
                type: "image",
                aspectRatio: mainWidth / mainHeight,
            });

            // Add Extra Photos (10 fields)
            for (let i = 1; i <= 10; i++) {
                const img = acf[`galleryImage${i}`]?.node;
                if (img?.sourceUrl) {
                    gallery.push({
                        src: img.sourceUrl,
                        type: "image",
                        aspectRatio: (img.mediaDetails?.width || 1920) / (img.mediaDetails?.height || 1080),
                    });
                }
            }

            return {
                id: post.id,
                type: "image" as const,
                src: mainSrc,
                aspectRatio: mainWidth / mainHeight,
                alt: post.title || "Untitled",
                date: post.date,
                description: post.content?.replace(/<[^>]*>?/gm, "") || "",
                transcription: acf.transcription,
                gallery: gallery.length > 1 ? gallery : undefined,
            };
        }).filter(Boolean);

    } catch (error) {
        console.error("Failed to fetch posts:", error);
        return [];
    }
}

import {defineCollection, z} from "astro:content";
import {type Loader} from 'astro/loaders';
import {execSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {createMarkdownProcessor, parseFrontmatter} from "@astrojs/markdown-remark";
import type { AstroIntegrationLogger } from "astro";

interface PR {
    number: number,
    author: string,
    updatedAt: string,
    url: string,
    labels: string[],

    content: string,
}

async function loadPRs(repo: string, logger: AstroIntegrationLogger): Promise<PR[]> {
    const raw = execSync(`gh pr list --json author,updatedAt,url,number,labels,files,headRefOid --repo ${repo} --state \"all\" --limit 100`);
    const prs = JSON.parse(raw.toString());

    const rfds = prs.map(async ({
                                    author,
                                    number,
                                    updatedAt,
                                    url,
                                    labels,
                                    headRefOid,
                                    files
                                }): Promise<PR> => {
        let rfd_path = files.find((file) => file.path.startsWith("rfds")).path;

        let content
        try {
            // go fetch the content
            logger.debug(`fetching https://raw.githubusercontent.com/${repo}/${headRefOid}/${rfd_path}`)
            const response = await fetch(`https://raw.githubusercontent.com/${repo}/${headRefOid}/${rfd_path}`);
            content = await response.text();
        } catch (err) {
            logger.error(`failed to fetch RFD content ${err}`);
        }

        return {
            number,
            updatedAt,
            url,
            author: author.name,
            labels: labels.map((label) => label.name),

            content,
        };
    });

    return await Promise.all(rfds);
}

function loadPrs(): Loader {
    const repo = "JonasKruckenberg/rfds";

    return {
        name: "load PRs",
        async load({config, parseData, store, generateDigest, logger}) {
            store.clear();

            const processor = await createMarkdownProcessor(config.markdown);

            for (const pr of await loadPRs(repo, logger)) {
                const id = pr.number.toString();
                const { frontmatter, content } = parseFrontmatter(pr.content);
                const rendered = await processor.render(content);

                let data
                try {
                    data = await parseData({
                        id, data: {
                            authors: frontmatter.authors || [pr.author],
                            title: frontmatter.title,
                            state: frontmatter.state,
                            number: pr.number,
                            updatedAt: pr.updatedAt,
                            url: pr.url,
                            labels: pr.labels,
                        }
                    });
                } catch(err) {
                    logger.error(`Ignoring RFD with malformed data: ${err}`);
                    return;
                }

                const digest = generateDigest(data);

                store.set({
                    id, data, rendered: {
                        html: rendered.code,
                    }, digest
                });
            }
        },
    }
}


const rfd = defineCollection({
    loader: loadPrs(),
    schema: z.object({
        number: z.number(),
        authors: z.array(z.string()),
        title: z.string(),
        updatedAt: z.coerce.date(),
        url: z.string(),

        state: z.enum(["discussion", "published", "abandoned"]),
        labels: z.array(z.string()).optional(),
    }),
});

export const collections = {rfd};

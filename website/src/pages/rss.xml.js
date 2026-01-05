import rss from "@astrojs/rss";
import { SITE } from "@consts";
import { getCollection } from "astro:content";

export async function GET(context) {
  const rfds = (await getCollection("rfd"));

  const items = [...rfds].sort(
    (a, b) => new Date(b.data.updatedAt).valueOf() - new Date(a.data.updatedAt).valueOf(),
  );

  return rss({
    title: SITE.TITLE,
    description: SITE.DESCRIPTION,
    site: context.site,
    items: items.map((item) => ({
      title: item.data.title,
      pubDate: item.data.updatedAt,
      link: `/${item.collection}/${item.id}/`,
    })),
  });
}

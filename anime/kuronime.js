//by Gweh t.me/kriszzyy | keknua gk bisa cjs

import axios from "axios";
import * as cheerio from "cheerio";

class KuronimeScraper {
  constructor() {
    this.baseUrl = "https://kuronime.sbs";
    this.ajaxUrl = `${this.baseUrl}/wp-admin/admin-ajax.php`;
    this.apiURL = "https://animeku.org/api/v9/sources";

    this.httpClient = axios.create({
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": this.baseUrl,
      },
      timeout: 15000,
    });
  }

  async #fetchPage(url) {
    try {
      const res = await this.httpClient.get(url);
      return cheerio.load(res.data);
    } catch (err) {
      throw new Error(`Gagal fetch: ${url} (${err.message})`);
    }
  }

  #extractHash(html) {
    const m = html.match(/var\s+_0x[a-f0-9]+\s*=\s*["'`]([A-Za-z0-9+/=]{50,})["'`]/);
    return m?.[1] || null;
  }

  async search(query) {
    const body = new URLSearchParams({
      action: "ajaxy_sf",
      sf_value: query,
      search: "false",
    }).toString();

    try {
      const { data } = await this.httpClient.post(this.ajaxUrl, body, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      if (!data?.anime?.[0]?.all) return [];

      return data.anime[0].all.map((item) => ({
        id: item.ID,
        title: item.post_title,
        url: item.post_link,
        thumbnail: item.post_image,
        genres: item.post_genres ? item.post_genres.split(/,\s*/) : [],
        type: item.post_type,
        latestEpisode: item.post_latest,
        status: item.post_sub,
      }));
    } catch (err) {
      throw new Error(`Gagal search: "${query}" (${err.message})`);
    }
  }

  async getAnimeDetail(animeUrl) {
    const $ = await this.#fetchPage(animeUrl);

    const info = {};
    $(".infodetail ul li").each((i, el) => {
      const key = $(el).find("b").text().replace(":", "").trim().toLowerCase();
      const val = $(el).clone().find("b").remove().end().text().replace(/^[\s:]+/, "").trim();
      if (key) info[key] = val;
    });

    const genres = [];
    $(".infodetail a[href*='/genres/']").each((i, el) => {
      genres.push($(el).text().trim());
    });

    let thumbnail = null;
    $(".main-info img").each((i, el) => {
      const src = $(el).attr("src") || "";
      if (!src.startsWith("data:")) { thumbnail = src; return false; }
    });
    if (!thumbnail) {
      $(".main-info img").each((i, el) => {
        const src = $(el).attr("data-src") || $(el).attr("data-lazy-src") || "";
        if (src) { thumbnail = src; return false; }
      });
    }

    const synopsis = $(".conx p, .conx h3").first().text().trim() || null;

    const episodes = [];
    $(".bxcl ul li").each((i, el) => {
      const link = $(el).find("a");
      const title = link.text().trim();
      const url = link.attr("href") || "";
      const fromTitle = title.match(/episode[\s]+(\d+(?:\.\d+)?)/i);
      const fromUrl = url.match(/episode-(\d+(?:-\d+)?)/i);
      const epNum = fromTitle ? fromTitle[1] : fromUrl ? fromUrl[1].replace('-', '.') : String(i + 1);
      episodes.push({
        title,
        url,
        episode: `Episode ${epNum}`,
      });
    });

    return {
      title: $(".entry-title").first().text().trim(),
      thumbnail,
      synopsis,
      japaneseTitle: info["judul"] ? info["judul"].split(",")[0].trim() : null,
      genres,
      status: info["status"] || null,
      studio: info["studio"] || null,
      aired: info["tayang"] || null,
      season: info["season"] || null,
      type: info["tipe"] || null,
      duration: info["durasi"] || null,
      totalEpisode: info["jumlah episode"] || null,
      episodes,
      url: animeUrl,
    };
  }

  async getStreamingLink(episodeUrl) {
    const res = await this.httpClient.get(episodeUrl);
    const html = res.data;
    const $ = cheerio.load(html);

    let iframeSrc = null;
    $("iframe").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !src.startsWith("data:")) { iframeSrc = src; return false; }
    });
    if (iframeSrc) {
      return { success: true, type: "iframe", embedUrl: iframeSrc, sources: null, downloads: null };
    }

    const hash = this.#extractHash(html);
    if (hash) {
      const embedUrl = `https://player.animeku.org/?data=${encodeURIComponent(hash)}`;
      const DECRYPT_KEY = "3&!" + "Z0M," + "VIZ" + ";dZW" + "==";
      let vipUrl = null;
      let downloads = null;
      let mirrors = null;

      try {
        const { data: apiData } = await this.httpClient.post(
          this.apiURL,
          JSON.stringify({ id: hash }),
          { headers: { "Content-Type": "application/json", "Referer": "https://animeku.org/" } }
        );

        if (apiData?.status === 200) {
          if (apiData.src) {
            vipUrl = `https://player.animeku.org/?data=${apiData.src}`;
          }
          if (apiData.data) {
            try {
              const CryptoJS = (await import("crypto-js")).default;
              const CryptoJSAesJson = {
                stringify: (cp) => {
                  const obj = { ct: cp.ciphertext.toString(CryptoJS.enc.Base64) };
                  if (cp.iv) obj.iv = cp.iv.toString();
                  if (cp.salt) obj.s = cp.salt.toString();
                  return JSON.stringify(obj);
                },
                parse: (str) => {
                  const obj = JSON.parse(str);
                  const cp = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(obj.ct) });
                  if (obj.iv) cp.iv = CryptoJS.enc.Hex.parse(obj.iv);
                  if (obj.s) cp.salt = CryptoJS.enc.Hex.parse(obj.s);
                  return cp;
                },
              };
              const raw = atob(apiData.data);
              const decrypted = CryptoJS.AES.decrypt(raw, DECRYPT_KEY, { format: CryptoJSAesJson });
              const parsed = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
              downloads = parsed.download || null;
              mirrors = parsed.embed || null;
            } catch { }
          }
        }
      } catch { }

      const sources = [];
      if (vipUrl) sources.push({ url: vipUrl, label: "VIP", type: "embed" });
      if (mirrors) {
        for (const [quality, links] of Object.entries(mirrors)) {
          for (const [server, url] of Object.entries(links)) {
            if (url) sources.push({ url, label: `${quality} - ${server}`, type: "embed" });
          }
        }
      }

      return {
        success: true,
        type: sources.length ? "direct" : "embed",
        sources: sources.length ? sources : null,
        downloads,
      };
    }

    const dlLinks = [];
    $('a[href*="mega"], a[href*="google"], a[href*="mediafire"], a[href*="drive"]').each((i, el) => {
      dlLinks.push({ text: $(el).text().trim(), url: $(el).attr("href") });
    });
    if (dlLinks.length) {
      return { success: true, type: "download", embedUrl: null, sources: null, downloads: dlLinks };
    }

    return { success: false, embedUrl: null, sources: null, downloads: null };
  }

  async cariDanTonton(judul, episodeKe = 1) {
    const hasilSearch = await this.search(judul);
    if (!hasilSearch.length) return { success: false, pesan: `Anime "${judul}" gak ketemu` };

    const detail = await this.getAnimeDetail(hasilSearch[0].url);
    if (!detail.episodes.length) return { success: false, pesan: "Gak ada episode" };

    let target;
    if (episodeKe === "terbaru") {
      target = detail.episodes[0];
    } else if (typeof episodeKe === "number") {
      target = detail.episodes.find((ep) =>
        ep.episode.includes(String(episodeKe)) || ep.title.includes(`Episode ${episodeKe}`)
      ) || detail.episodes[episodeKe - 1];
    } else {
      target = detail.episodes[0];
    }

    if (!target) return { success: false, pesan: `Episode ${episodeKe} gak ketemu` };

    const stream = await this.getStreamingLink(target.url);

    return {
      success: stream.success,
      anime: detail.title,
      japaneseTitle: detail.japaneseTitle,
      thumbnail: detail.thumbnail,
      synopsis: detail.synopsis,
      genres: detail.genres,
      status: detail.status,
      studio: detail.studio,
      aired: detail.aired,
      season: detail.season,
      type: detail.type,
      duration: detail.duration,
      totalEpisode: detail.totalEpisode,
      totalEpisodeList: detail.episodes.length,
      episode: target.title,
      episodeUrl: target.url,
      streamType: stream.type,
      embedUrl: stream.embedUrl,
      sources: stream.sources,
      downloads: stream.downloads,
    };
  }

  async cmdSearch(query) {
    if (!query) return { success: false, pesan: 'Masukkan judul anime' };
    try {
      const results = await this.search(query);
      if (!results.length) return { success: false, pesan: `Anime "${query}" gak ketemu` };
      return { success: true, total: results.length, results };
    } catch (err) {
      return { success: false, pesan: err.message };
    }
  }

  async cmdDetail(animeUrl) {
    if (!animeUrl) return { success: false, pesan: 'Masukkan URL anime' };
    try {
      const detail = await this.getAnimeDetail(animeUrl);
      return { success: true, ...detail };
    } catch (err) {
      return { success: false, pesan: err.message };
    }
  }

  async cmdDownload(episodeUrl) {
    if (!episodeUrl) return { success: false, pesan: 'Masukkan URL episode' };
    try {
      const stream = await this.getStreamingLink(episodeUrl);
      return { success: stream.success, episodeUrl, ...stream };
    } catch (err) {
      return { success: false, pesan: err.message };
    }
  }
}

const kuronime = new KuronimeScraper();

(async () => {
//search
  console.log(JSON.stringify(await kuronime.cmdSearch('solo leveling'), null, 2));

//detail
  console.log(JSON.stringify(await kuronime.cmdDetail('https://kuronime.sbs/anime/solo-leveling/'), null, 2));

//stream
  console.log(JSON.stringify(await kuronime.cmdDownload('https://kuronime.sbs/nonton-solo-leveling-episode-11/'), null, 2));
})();

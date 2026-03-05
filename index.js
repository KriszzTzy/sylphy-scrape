const axios = require('axios');
const cheerio = require('cheerio');

async function tiktok(url) {
  try {
    const response = await axios.post('https://www.tikwm.com/api/', 
      new URLSearchParams({ url: url }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    const data = response.data.data;
    return {
      title: data.title,
      author: data.author.nickname,
      username: data.author.unique_id,
      video: data.play || data.wmplay,
      music: data.music,
      cover: data.cover,
      views: data.play_count,
      likes: data.digg_count,
      comments: data.comment_count,
      shares: data.share_count
    };
  } catch (error) {
    throw new Error(`TikTok error: ${error.message}`);
  }
}

async function youtube(url, format = 'mp4') {
  try {
    const form = new URLSearchParams();
    form.append('q', url);
    form.append('vt', 'mp3');
    
    const response = await axios.post('https://www.y2mate.com/mates/analyzeV2/ajax', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    const result = response.data;
    return {
      title: result.title,
      duration: result.t,
      thumbnail: `https:${result.vid.thumbnail}`,
      download: format === 'mp3' ? result.links.mp3 : result.links.mp4
    };
  } catch (error) {
    throw new Error(`YouTube error: ${error.message}`);
  }
}

async function instagram(url) {
  try {
    const response = await axios.get(`https://publer.io/api/mediaDownloader?url=${encodeURIComponent(url)}`);
    return response.data.media.map(item => item.url);
  } catch (error) {
    throw new Error(`Instagram error: ${error.message}`);
  }
}

async function youtubeSearch(query) {
  try {
    const response = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    const $ = cheerio.load(response.data);
    const results = [];
    
    $('ytd-video-renderer').each((i, el) => {
      if (i < 10) {
        results.push({
          title: $(el).find('#video-title').text().trim(),
          url: 'https://youtube.com' + $(el).find('#video-title').attr('href'),
          duration: $(el).find('span.ytd-thumbnail-overlay-time-status-renderer').text().trim()
        });
      }
    });
    
    return results;
  } catch (error) {
    throw new Error(`YouTube search error: ${error.message}`);
  }
}

module.exports = {
  tiktok,
  youtube,
  instagram,
  youtubeSearch
};

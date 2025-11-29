const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Utility function to format video data
function formatVideoData(videoInfo, formats) {
  const videoFormats = formats
    .filter(format => format.hasVideo && !format.hasAudio)
    .map(format => ({
      quality: format.qualityLabel || format.quality,
      url: format.url,
      mimeType: format.mimeType,
      hasAudio: format.hasAudio,
      fileSize: format.contentLength ? parseInt(format.contentLength) : null,
      container: format.container
    }));

  const audioFormats = formats
    .filter(format => !format.hasVideo && format.hasAudio)
    .map(format => ({
      quality: format.audioQuality || 'audio',
      url: format.url,
      mimeType: format.mimeType,
      hasAudio: true,
      fileSize: format.contentLength ? parseInt(format.contentLength) : null,
      container: format.container
    }));

  const combinedFormats = formats
    .filter(format => format.hasVideo && format.hasAudio)
    .map(format => ({
      quality: format.qualityLabel || format.quality,
      url: format.url,
      mimeType: format.mimeType,
      hasAudio: format.hasAudio,
      fileSize: format.contentLength ? parseInt(format.contentLength) : null,
      container: format.container
    }));

  return {
    title: videoInfo.videoDetails.title,
    image: videoInfo.videoDetails.thumbnails[videoInfo.videoDetails.thumbnails.length - 1].url,
    description: videoInfo.videoDetails.description,
    lengthSeconds: videoInfo.videoDetails.lengthSeconds,
    author: videoInfo.videoDetails.author.name,
    format_options: {
      video: {
        mp4: [...videoFormats, ...combinedFormats].filter(f => f.container === 'mp4'),
        webm: [...videoFormats, ...combinedFormats].filter(f => f.container === 'webm')
      },
      audio: {
        mp3: audioFormats.filter(f => f.container === 'mp4' || f.mimeType.includes('audio/mp4')),
        webm: audioFormats.filter(f => f.container === 'webm')
      }
    }
  };
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'YouTube Downloader API is running!',
    endpoints: {
      extract: '/extract?url=YOUTUBE_URL',
      search: '/search?q=QUERY'
    },
    usage: 'Send a GET request to /extract with a YouTube URL as query parameter'
  });
});

// Main extraction endpoint
app.get('/extract', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        error: 'URL parameter is required',
        example: '/extract?url=https://www.youtube.com/watch?v=VIDEO_ID'
      });
    }

    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({
        error: 'Invalid YouTube URL'
      });
    }

    // Get video info
    const videoInfo = await ytdl.getInfo(url);
    const formats = videoInfo.formats;

    // Format the response
    const formattedData = formatVideoData(videoInfo, formats);

    res.json(formattedData);

  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.message.includes('Video unavailable')) {
      return res.status(404).json({
        error: 'Video not found or unavailable'
      });
    }

    res.status(500).json({
      error: 'Failed to extract video information',
      details: error.message
    });
  }
});

// Search endpoint
app.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        error: 'Query parameter "q" is required'
      });
    }

    const searchResults = await ytSearch(q);
    
    const videos = searchResults.videos.map(video => ({
      videoId: video.videoId,
      title: video.title,
      description: video.description,
      duration: video.duration.timestamp,
      views: video.views,
      uploaded: video.uploaded,
      thumbnail: video.thumbnail,
      author: video.author.name,
      url: video.url
    }));

    res.json({
      query: q,
      results: videos
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message
    });
  }
});

// Video details endpoint (without formats)
app.get('/details', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        error: 'URL parameter is required'
      });
    }

    if (!ytdl.validateURL(url)) {
      return res.status(400).json({
        error: 'Invalid YouTube URL'
      });
    }

    const videoInfo = await ytdl.getInfo(url);
    
    const videoDetails = {
      title: videoInfo.videoDetails.title,
      description: videoInfo.videoDetails.description,
      lengthSeconds: videoInfo.videoDetails.lengthSeconds,
      author: videoInfo.videoDetails.author.name,
      thumbnail: videoInfo.videoDetails.thumbnails[videoInfo.videoDetails.thumbnails.length - 1].url,
      viewCount: videoInfo.videoDetails.viewCount,
      publishDate: videoInfo.videoDetails.publishDate,
      category: videoInfo.videoDetails.category,
      keywords: videoInfo.videoDetails.keywords,
      isLive: videoInfo.videoDetails.isLiveContent
    };

    res.json(videoDetails);

  } catch (error) {
    console.error('Details error:', error);
    res.status(500).json({
      error: 'Failed to get video details',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /extract?url=YOUTUBE_URL',
      'GET /search?q=QUERY',
      'GET /details?url=YOUTUBE_URL'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`YouTube Downloader API running on port ${PORT}`);
  console.log(`Access the API at: http://localhost:${PORT}`);
});

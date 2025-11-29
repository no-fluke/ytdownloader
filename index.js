const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 3000;

// Disable ytdl-core update check to prevent 403/410 errors
process.env.YTDL_NO_UPDATE = 'true';

// Middleware
app.use(cors());
app.use(express.json());

// Utility function to format video data
function formatVideoData(videoInfo, formats) {
  // Filter and sort video formats
  const videoFormats = formats
    .filter(format => format.hasVideo)
    .map(format => ({
      quality: format.qualityLabel || format.quality || 'unknown',
      url: format.url,
      mimeType: format.mimeType,
      hasAudio: format.hasAudio,
      fileSize: format.contentLength ? parseInt(format.contentLength) : null,
      container: format.container,
      codecs: format.codecs
    }))
    .sort((a, b) => {
      // Sort by quality (extract number from quality string)
      const getQualityNum = (quality) => {
        const match = quality.match(/(\d+)p/);
        return match ? parseInt(match[1]) : 0;
      };
      return getQualityNum(b.quality) - getQualityNum(a.quality);
    });

  // Filter audio formats
  const audioFormats = formats
    .filter(format => format.hasAudio && !format.hasVideo)
    .map(format => ({
      quality: format.audioQuality || 'audio',
      url: format.url,
      mimeType: format.mimeType,
      hasAudio: true,
      fileSize: format.contentLength ? parseInt(format.contentLength) : null,
      container: format.container
    }));

  return {
    title: videoInfo.videoDetails.title,
    image: videoInfo.videoDetails.thumbnails[videoInfo.videoDetails.thumbnails.length - 1]?.url,
    description: videoInfo.videoDetails.description,
    lengthSeconds: videoInfo.videoDetails.lengthSeconds,
    author: videoInfo.videoDetails.author?.name || 'Unknown',
    viewCount: videoInfo.videoDetails.viewCount,
    expiresInSeconds: "21540",
    format_options: {
      video: {
        mp4: videoFormats.filter(f => f.container === 'mp4' || f.mimeType?.includes('mp4')),
        webm: videoFormats.filter(f => f.container === 'webm' || f.mimeType?.includes('webm'))
      },
      audio: {
        mp3: audioFormats.filter(f => f.container === 'mp4' || f.mimeType?.includes('mp4')),
        webm: audioFormats.filter(f => f.container === 'webm' || f.mimeType?.includes('webm'))
      }
    }
  };
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'YouTube Downloader API is running!',
    status: 'active',
    version: '2.0.0',
    endpoints: {
      extract: '/extract?url=YOUTUBE_URL',
      search: '/search?q=QUERY',
      details: '/details?url=YOUTUBE_URL'
    },
    example: 'https://ytdownloader-q366.onrender.com/extract?url=https://www.youtube.com/watch?v=LPuWoqQNUuM'
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
        error: 'Invalid YouTube URL',
        supported_formats: [
          'https://www.youtube.com/watch?v=VIDEO_ID',
          'https://youtu.be/VIDEO_ID',
          'https://www.youtube.com/embed/VIDEO_ID'
        ]
      });
    }

    console.log('Fetching info for:', url);

    // Get video info with comprehensive error handling
    let videoInfo;
    try {
      videoInfo = await ytdl.getInfo(url, {
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        }
      });
    } catch (ytdlError) {
      console.error('ytdl-core error:', ytdlError.message);
      
      if (ytdlError.message.includes('Video unavailable')) {
        return res.status(404).json({
          error: 'Video not found or unavailable',
          details: 'The video may have been removed or made private'
        });
      }
      
      if (ytdlError.message.includes('Sign in to confirm')) {
        return res.status(403).json({
          error: 'Age-restricted content',
          details: 'This video is age-restricted and cannot be downloaded'
        });
      }

      return res.status(500).json({
        error: 'Failed to fetch video information from YouTube',
        details: 'YouTube may have changed their API. Please try again later.',
        technical: ytdlError.message
      });
    }

    const formats = videoInfo.formats;

    // Check if we have any formats
    if (!formats || formats.length === 0) {
      return res.status(500).json({
        error: 'No downloadable formats available',
        details: 'The video might be live streaming or protected'
      });
    }

    // Format the response
    const formattedData = formatVideoData(videoInfo, formats);

    res.json(formattedData);

  } catch (error) {
    console.error('Unexpected error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      details: 'An unexpected error occurred',
      message: error.message
    });
  }
});

// Search endpoint
app.get('/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({
        error: 'Query parameter "q" is required',
        example: '/search?q=javascript+tutorial&limit=10'
      });
    }

    const searchResults = await ytSearch(q);
    
    const videos = searchResults.videos
      .slice(0, parseInt(limit))
      .map(video => ({
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
      results: videos,
      total: videos.length
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
      isLive: videoInfo.videoDetails.isLiveContent,
      isAgeRestricted: videoInfo.videoDetails.age_restricted,
      videoId: videoInfo.videoDetails.videoId
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

// Bulk extract endpoint for multiple videos
app.get('/bulk-extract', async (req, res) => {
  try {
    const { urls } = req.query;
    
    if (!urls) {
      return res.status(400).json({
        error: 'URLs parameter is required',
        example: '/bulk-extract?urls=URL1,URL2,URL3'
      });
    }

    const urlArray = urls.split(',').map(url => url.trim());
    const results = [];

    for (const url of urlArray) {
      try {
        if (ytdl.validateURL(url)) {
          const videoInfo = await ytdl.getInfo(url);
          const formattedData = formatVideoData(videoInfo, videoInfo.formats);
          results.push({
            url: url,
            status: 'success',
            data: formattedData
          });
        } else {
          results.push({
            url: url,
            status: 'error',
            error: 'Invalid YouTube URL'
          });
        }
      } catch (error) {
        results.push({
          url: url,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({
      total: urlArray.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      results: results
    });

  } catch (error) {
    console.error('Bulk extract error:', error);
    res.status(500).json({
      error: 'Bulk extraction failed',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET / - API documentation',
      'GET /extract?url=YOUTUBE_URL - Extract video download links',
      'GET /search?q=QUERY - Search YouTube videos',
      'GET /details?url=YOUTUBE_URL - Get video details only',
      'GET /bulk-extract?urls=URL1,URL2 - Extract multiple videos'
    ],
    example: 'https://ytdownloader-q366.onrender.com/extract?url=https://www.youtube.com/watch?v=LPuWoqQNUuM'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 YouTube Downloader API running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Update checks disabled: ${process.env.YTDL_NO_UPDATE}`);
});

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

const getYouTubeId = (url: URL) => {
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] || '';
  }

  if (url.pathname.startsWith('/embed/')) {
    return url.pathname.split('/').filter(Boolean)[1] || '';
  }

  if (url.pathname.startsWith('/shorts/')) {
    return url.pathname.split('/').filter(Boolean)[1] || '';
  }

  return url.searchParams.get('v') || '';
};

const getVimeoId = (url: URL) => {
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'player.vimeo.com' && parts[0] === 'video') {
    return parts[1] || '';
  }
  return parts.find((part) => /^\d+$/.test(part)) || '';
};

export const getVideoEmbedUrl = (value?: string) => {
  if (!value?.trim()) return '';

  try {
    const url = new URL(value.trim());
    if (YOUTUBE_HOSTS.has(url.hostname)) {
      const id = getYouTubeId(url);
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : '';
    }

    if (VIMEO_HOSTS.has(url.hostname)) {
      const id = getVimeoId(url);
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : '';
    }
  } catch {
    return '';
  }

  return '';
};

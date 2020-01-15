class UrlMatcher {
  static isMatch(text) {
    return text.match(/^m3u8-downloader:\/{2}/);
  }
}

export default UrlMatcher;

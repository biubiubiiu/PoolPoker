/** Account servers use TLS; loopback HTTP remains available for local development. */
export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function normalizeAccountServer(value: string): string {
  const text = value.trim();
  if (!text) return '';
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('请填写服务器地址，不要包含路径或登录信息');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname)))
    throw new Error('请使用 HTTPS 服务器地址');
  return url.origin;
}

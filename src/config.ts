const apiBaseUrl = process.env.SYSTEMCALL_API_BASE_URL?.trim();

if (!apiBaseUrl) {
  throw new Error('SYSTEMCALL_API_BASE_URL is not configured');
}

export const config = {apiBaseUrl: apiBaseUrl.replace(/\/+$/, '')} as const;

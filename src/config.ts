const apiBaseUrl = process.env.SYSTEMCALL_API_BASE_URL?.trim();

export const config = {apiBaseUrl: apiBaseUrl?.replace(/\/+$/, '') ?? ''} as const;

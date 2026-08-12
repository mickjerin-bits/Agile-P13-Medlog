import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, getToken, setToken } from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  setToken(null);
});

describe('token storage', () => {
  it('persists and clears the token', () => {
    expect(getToken()).toBeNull();
    setToken('abc');
    expect(getToken()).toBe('abc');
    setToken(null);
    expect(getToken()).toBeNull();
  });
});

describe('api requests', () => {
  it('attaches the bearer token when one is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ records: [] }));
    vi.stubGlobal('fetch', fetchMock);
    setToken('token-123');

    await api.listRecords();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/records');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer token-123');
  });

  it('omits the header when no token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ records: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await api.listRecords();

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Headers).has('Authorization')).toBe(false);
  });

  it('builds the list query from filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ records: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await api.listRecords({ recordType: 'IMAGING', search: 'chest x-ray' });

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/records?recordType=IMAGING&search=chest+x-ray');
  });

  it('throws an ApiError carrying the server message and details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: [{ field: 'title', message: 'Title is required' }],
          },
          400,
        ),
      ),
    );

    await expect(api.summary()).rejects.toMatchObject({
      status: 400,
      message: 'Validation failed',
      details: [{ field: 'title', message: 'Title is required' }],
    });
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));

    await expect(api.summary()).rejects.toBeInstanceOf(ApiError);
    await expect(api.summary()).rejects.toThrow('Request failed (500)');
  });
});

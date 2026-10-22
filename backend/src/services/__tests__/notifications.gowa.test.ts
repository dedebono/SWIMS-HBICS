import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../db/pool.js', () => ({
  pool: { connect: vi.fn() },
  queryWithTenant: vi.fn(),
}));

vi.mock('../tenant-settings.service.js', () => ({
  getGowaSettings: vi.fn(),
}));

import { getGowaSettings } from '../tenant-settings.service.js';
import { sendWhatsAppMessage, normalizeGowaPhone } from '../notifications.service.js';

const TENANT = 'tenant-1';

function mockSettings(overrides: Partial<{
  enabled: boolean;
  url: string;
  basicAuth: string;
  deviceId: string;
}> = {}) {
  vi.mocked(getGowaSettings).mockResolvedValue({
    enabled: true,
    url: 'http://gowa.test:3000',
    basicAuth: 'user:pass',
    deviceId: '',
    ...overrides,
  } as any);
}

describe('normalizeGowaPhone', () => {
  it('keeps an already-international number', () => {
    expect(normalizeGowaPhone('6289650309013')).toBe('6289650309013');
  });

  it('strips a leading +', () => {
    expect(normalizeGowaPhone('+6289650309013')).toBe('6289650309013');
  });

  it('converts Indonesian local format to international', () => {
    // GOWA rejects a leading 0 outright.
    expect(normalizeGowaPhone('081234567890')).toBe('6281234567890');
  });

  it('strips spaces, dashes and parentheses', () => {
    expect(normalizeGowaPhone('+62 (812) 345-678-90')).toBe('6281234567890');
  });

  it('leaves a full JID untouched', () => {
    expect(normalizeGowaPhone('6289650309013@s.whatsapp.net')).toBe(
      '6289650309013@s.whatsapp.net',
    );
    expect(normalizeGowaPhone('120363042997018802@g.us')).toBe('120363042997018802@g.us');
  });

  it('returns null for unusable input', () => {
    expect(normalizeGowaPhone('')).toBeNull();
    expect(normalizeGowaPhone('   ')).toBeNull();
    expect(normalizeGowaPhone('abc')).toBeNull();
    expect(normalizeGowaPhone('123')).toBeNull();
  });
});

describe('sendWhatsAppMessage (GOWA transport)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockSettings();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs { phone, message } to /send/message with Basic auth', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          code: 'SUCCESS',
          message: 'sent',
          results: { message_id: 'MSG-1', status: 'sent' },
        }),
    });

    const res = await sendWhatsAppMessage(TENANT, {
      chatId: '6289650309013',
      text: 'halo',
    });

    expect(res).toEqual({ success: true, messageId: 'MSG-1' });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('http://gowa.test:3000/send/message');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ phone: '6289650309013', message: 'halo' });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('user:pass').toString('base64')}`,
    );
    // The old WAHA transport sent these; GOWA must not.
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('normalises a local-format number before sending', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ code: 'SUCCESS', results: { message_id: 'M' } }),
    });

    await sendWhatsAppMessage(TENANT, { chatId: '081234567890', text: 'x' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).phone).toBe('6281234567890');
  });

  it('sends the X-Device-Id header when a device is pinned', async () => {
    mockSettings({ deviceId: 'device-abc' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ code: 'SUCCESS', results: { message_id: 'M' } }),
    });

    await sendWhatsAppMessage(TENANT, { chatId: '6289650309013', text: 'x' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Device-Id']).toBe('device-abc');
  });

  it('treats a 200 with code=VALIDATION_ERROR as a failure', async () => {
    // GOWA answers HTTP 200 with a non-SUCCESS code for a rejected payload, so
    // the status code alone must not be treated as "sent".
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({ code: 'VALIDATION_ERROR', message: 'phone: cannot be blank' }),
    });

    const res = await sendWhatsAppMessage(TENANT, { chatId: '6289650309013', text: 'x' });

    expect(res).toEqual({ success: false });
  });

  it('reports failure on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
    });

    const res = await sendWhatsAppMessage(TENANT, { chatId: '6289650309013', text: 'x' });

    expect(res).toEqual({ success: false });
  });

  it('does not call the API when the transport is disabled', async () => {
    mockSettings({ enabled: false });

    const res = await sendWhatsAppMessage(TENANT, { chatId: '6289650309013', text: 'x' });

    expect(res).toEqual({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call the API for an unusable recipient number', async () => {
    const res = await sendWhatsAppMessage(TENANT, { chatId: 'not-a-number', text: 'x' });

    expect(res).toEqual({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips a trailing slash from the base URL', async () => {
    mockSettings({ url: 'http://gowa.test:3000/' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ code: 'SUCCESS', results: { message_id: 'M' } }),
    });

    await sendWhatsAppMessage(TENANT, { chatId: '6289650309013', text: 'x' });

    expect(fetchMock.mock.calls[0]![0]).toBe('http://gowa.test:3000/send/message');
  });
});

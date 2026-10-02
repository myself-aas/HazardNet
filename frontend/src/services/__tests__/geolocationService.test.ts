import { detectExactPinpointLocation } from '../geolocationService';

describe('geolocationService — strict on-device privacy', () => {
  const originalFetch = global.fetch;
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    global.fetch = jest.fn(() => {
      throw new Error('External network fetch must not be called during geolocation detection');
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
    });
  });

  it('never calls external IP geolocation services when GPS is denied or unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({
            code: 1,
            message: 'User denied Geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        },
      },
      configurable: true,
    });

    const result = await detectExactPinpointLocation();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.method).toBe('fallback');
    expect(result.nearestDistrict.id).toBe('dhaka');
    expect(result.rawIp).toBeUndefined();
  });

  it('resolves nearest district strictly on-device when GPS coordinates are provided', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 24.8949,
              longitude: 91.8687,
              accuracy: 25,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
      configurable: true,
    });

    const result = await detectExactPinpointLocation();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.method).toBe('gps');
    expect(result.nearestDistrict.id).toBe('sylhet');
  });
});

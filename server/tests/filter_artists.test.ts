import request from 'supertest';
import app from '../src/app';

describe('Advanced Artist Discovery Filters', () => {
  it('filters artists by date availability for open slots', async () => {
    const res = await request(app)
      .get('/api/artists')
      .query({ date: '2026-11-01' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.artists)).toBe(true);
    expect(res.body.artists.length).toBeGreaterThan(0);
    res.body.artists.forEach((artist: any) => {
      const hasSlot = artist.availabilitySlots.some((s: any) => s.date === '2026-11-01' && !s.isBooked);
      expect(hasSlot).toBe(true);
    });
  });

  it('filters artists by budget range in INR', async () => {
    const res = await request(app)
      .get('/api/artists')
      .query({ minFee: 15000, maxFee: 35000 });

    expect(res.status).toBe(200);
    expect(res.body.artists.length).toBeGreaterThan(0);
    res.body.artists.forEach((artist: any) => {
      expect(artist.baseFee).toBeGreaterThanOrEqual(15000);
      expect(artist.baseFee).toBeLessThanOrEqual(35000);
    });
  });

  it('filters artists by multi-genre query parameter', async () => {
    const res = await request(app)
      .get('/api/artists')
      .query({ genres: 'Rock,Sufi' });

    expect(res.status).toBe(200);
    expect(res.body.artists.length).toBeGreaterThan(0);
    res.body.artists.forEach((artist: any) => {
      const genres = typeof artist.genres === 'string' ? JSON.parse(artist.genres) : artist.genres;
      const matches = genres.some((g: string) => /rock|sufi/i.test(g));
      expect(matches).toBe(true);
    });
  });
});

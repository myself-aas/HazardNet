import { publicProfile } from '../profilePrivacy';
jest.mock('../../services/firebase', () => ({ db: {} }));
test('public demographic projection excludes credentials and sensitive personal fields', () => {
  expect(publicProfile({ display_name: 'Farmer', country: 'BD', email: 'private', phone_number: 'private',
    date_of_birth: 'private', pinpoint_lat: 24, annual_income_bdt: 100, role: 'admin' }))
    .toEqual({ display_name: 'Farmer', country: 'BD', profile_visibility: 'public' });
});
test('private profile only reserves its username', () => {
  expect(publicProfile({ username: 'farmer', country: 'BD', profile_visibility: 'private' }))
    .toEqual({ username: 'farmer', profile_visibility: 'private' });
});

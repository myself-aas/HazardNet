module.exports = {
  getForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({ coords: { latitude: 23.8, longitude: 90.4, accuracy: 100 }, timestamp: Date.now() })),
  Accuracy: { Low: 2, Balanced: 3, High: 4, Best: 5, Lowest: 1 },
};

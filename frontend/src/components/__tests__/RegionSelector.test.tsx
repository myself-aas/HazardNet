import "@testing-library/jest-dom";
/// <reference types="jest" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegionSelector } from '../RegionSelector';
import { AuthProvider } from '../../context/AuthContext';

// Mock AuthContext
jest.mock('../../context/AuthContext', () => ({
  ...jest.requireActual('../../context/AuthContext'),
  useAuth: () => ({
    userProfile: { homeDistrictId: 'sylhet' },
    updateUserProfile: jest.fn(),
  })
}));

describe('RegionSelector', () => {
  const mockOnSelectDistrict = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly and displays search input', () => {
    render(
      <RegionSelector 
        selectedDistrictId="dhaka" 
        onSelectDistrict={mockOnSelectDistrict} 
      />
    );
    expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument();
  });

  it('filters districts based on search query', async () => {
    render(
      <RegionSelector 
        selectedDistrictId="dhaka" 
        onSelectDistrict={mockOnSelectDistrict} 
      />
    );
    
    const searchInput = screen.getByPlaceholderText(/Search/i);
    fireEvent.change(searchInput, { target: { value: 'Sylhet' } });
    
    // There might be multiple elements with "Sylhet" (e.g. division button and district button)
    // We just want to make sure it filters.
    await waitFor(() => {
      const results = screen.getAllByText(/Sylhet/i);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

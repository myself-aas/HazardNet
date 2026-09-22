import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ categories: [] }),
  })
);

// Mock dependencies for ChatBot component
jest.mock('react-markdown', () => (props) => <div>{props.children}</div>);

jest.mock('../frontend/src/components/LiveVoiceAdvisor', () => ({
  LiveVoiceAdvisor: () => <div data-testid="live-voice-advisor">Live Voice Mode Active</div>,
}));

import ChatBot from '../frontend/src/components/ChatBot';

describe('Phase 5 Grounded RAG AI Assistant Prompt Sheet', () => {
  test('renders 60x60px Floating Action Button (FAB) with accessible title', () => {
    render(<ChatBot />);

    const fab = screen.getByLabelText('Open AI Advisor');
    expect(fab).toBeInTheDocument();
    expect(fab).toHaveClass('w-[60px]', 'h-[60px]', 'rounded-full', 'bg-nasa-blue');
  });

  test('opens AI Advisor chat dialog sheet when FAB is clicked', async () => {
    render(<ChatBot />);

    const fab = screen.getByLabelText('Open AI Advisor');
    await act(async () => {
      fireEvent.click(fab);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hello! I am HazardNet AI Advisor.')).toBeInTheDocument();
  });

  test('switches between Text and Live Voice modes', async () => {
    render(<ChatBot />);

    const fab = screen.getByLabelText('Open AI Advisor');
    await act(async () => {
      fireEvent.click(fab);
    });

    const voiceBtn = screen.getByText('Live Voice');
    await act(async () => {
      fireEvent.click(voiceBtn);
    });

    expect(screen.getByTestId('live-voice-advisor')).toBeInTheDocument();

    const textBtn = screen.getByText('Text');
    await act(async () => {
      fireEvent.click(textBtn);
    });

    expect(screen.getByText('Hello! I am HazardNet AI Advisor.')).toBeInTheDocument();
  });
});

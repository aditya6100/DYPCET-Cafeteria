import { render, screen } from '@testing-library/react';
import React from 'react';

function TestApp() {
  return <div>DYPCET Cafeteria</div>;
}

test('renders app smoke text', () => {
  render(<TestApp />);
  expect(screen.getByText(/DYPCET Cafeteria/i)).toBeInTheDocument();
});
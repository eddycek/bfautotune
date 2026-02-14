import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileCard } from './ProfileCard';
import type { DroneProfileMetadata } from '@shared/types/profile.types';

const createMockProfile = (overrides?: Partial<DroneProfileMetadata>): DroneProfileMetadata => ({
  id: 'test-profile-1',
  name: 'Test Drone 5"',
  size: '5"',
  battery: '4S',
  fcSerialNumber: '1234567890ABCDEF1234567890ABCDEF',
  lastConnected: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  connectionCount: 15,
  ...overrides,
});

describe('ProfileCard', () => {
  const mockOnSelect = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders profile name', () => {
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.getByText('Test Drone 5"')).toBeInTheDocument();
  });

  it('renders profile size', () => {
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('5"')).toBeInTheDocument();
  });

  it('renders battery information', () => {
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.getByText('Battery')).toBeInTheDocument();
    expect(screen.getByText('4S')).toBeInTheDocument();
  });

  it('renders connection count', () => {
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders truncated FC serial number', () => {
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    // Serial is truncated to 16 chars
    expect(screen.getByText('1234567890ABCDEF')).toBeInTheDocument();
  });

  it('shows "Active" badge when profile is active', () => {
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={true}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows "Recent" badge when last connected within 24 hours and not active', () => {
    const profile = createMockProfile({
      lastConnected: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    });
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.getByText('Recent')).toBeInTheDocument();
  });

  it('does not show "Recent" badge when active', () => {
    const profile = createMockProfile({
      lastConnected: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    render(
      <ProfileCard
        profile={profile}
        isActive={true}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });

  it('shows relative time for last connection (hours ago)', () => {
    const profile = createMockProfile({
      lastConnected: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    });
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.getByText(/3 hours ago/i)).toBeInTheDocument();
  });

  it('shows relative time for last connection (days ago)', () => {
    const profile = createMockProfile({
      lastConnected: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    });
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    expect(screen.getByText(/3 days ago/i)).toBeInTheDocument();
  });

  it('calls onSelect when card is clicked', async () => {
    const user = userEvent.setup();
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    const card = screen.getByText('Test Drone 5"').closest('.profile-card');
    await user.click(card!);

    expect(mockOnSelect).toHaveBeenCalledWith('test-profile-1');
  });

  it('does not call onSelect when card is clicked and locked', async () => {
    const user = userEvent.setup();
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        isLocked={true}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    const card = screen.getByText('Test Drone 5"').closest('.profile-card');
    await user.click(card!);

    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const user = userEvent.setup();
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    const editButton = screen.getByTitle('Edit profile');
    await user.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledWith('test-profile-1');
    expect(mockOnSelect).not.toHaveBeenCalled(); // Should not trigger card selection
  });

  it('calls onExport when export button is clicked', async () => {
    const user = userEvent.setup();
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    const exportButton = screen.getByTitle('Export profile');
    await user.click(exportButton);

    expect(mockOnExport).toHaveBeenCalledWith('test-profile-1');
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('calls onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    const profile = createMockProfile();
    render(
      <ProfileCard
        profile={profile}
        isActive={false}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    const deleteButton = screen.getByTitle('Delete profile');
    await user.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith('test-profile-1');
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('applies "active" CSS class when isActive is true', () => {
    const profile = createMockProfile();
    const { container } = render(
      <ProfileCard
        profile={profile}
        isActive={true}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    const card = container.querySelector('.profile-card');
    expect(card).toHaveClass('active');
  });

  it('applies "locked" CSS class when isLocked is true', () => {
    const profile = createMockProfile();
    const { container } = render(
      <ProfileCard
        profile={profile}
        isActive={false}
        isLocked={true}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onExport={mockOnExport}
      />
    );

    const card = container.querySelector('.profile-card');
    expect(card).toHaveClass('locked');
  });
});

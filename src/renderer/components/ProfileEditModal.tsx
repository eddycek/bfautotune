import { useState, useEffect } from 'react';
import type {
  DroneProfile,
  DroneSize,
  BatteryType,
  FrameType,
  FlightStyle,
  FrameStiffness,
  ProfileUpdateInput
} from '@shared/types/profile.types';
import './ProfileWizard.css';

interface ProfileEditModalProps {
  profile: DroneProfile;
  onSave: (input: ProfileUpdateInput) => Promise<void>;
  onCancel: () => void;
}

export function ProfileEditModal({ profile, onSave, onCancel }: ProfileEditModalProps) {
  const [name, setName] = useState(profile.name);
  const [size, setSize] = useState(profile.size);
  const [propSize, setPropSize] = useState(profile.propSize);
  const [battery, setBattery] = useState(profile.battery);
  const [weight, setWeight] = useState(profile.weight);
  const [motorKV, setMotorKV] = useState(profile.motorKV);
  const [frameType, setFrameType] = useState(profile.frameType);
  const [flightStyle, setFlightStyle] = useState(profile.flightStyle);
  const [frameStiffness, setFrameStiffness] = useState(profile.frameStiffness);
  const [notes, setNotes] = useState(profile.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  const sizes: DroneSize[] = ['1"', '2"', '2.5"', '3"', '4"', '5"', '6"', '7"', '10"'];
  const batteries: BatteryType[] = ['1S', '2S', '3S', '4S', '6S'];
  const frameTypes: FrameType[] = ['freestyle', 'race', 'cinematic', 'long-range'];
  const flightStyles: FlightStyle[] = ['smooth', 'balanced', 'aggressive'];
  const frameStiffnesses: FrameStiffness[] = ['soft', 'medium', 'stiff'];

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);
    try {
      const input: ProfileUpdateInput = {
        name,
        size,
        propSize,
        battery,
        weight,
        motorKV,
        frameType,
        flightStyle,
        frameStiffness,
        notes: notes || undefined
      };
      await onSave(input);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-wizard-overlay">
      <div className="profile-wizard-modal">
        <div className="profile-wizard-header">
          <h2>Edit Profile</h2>
          <p>Update drone configuration for {profile.fcInfo.boardName || 'Unknown'}</p>
        </div>

        <div className="wizard-form-group">
          <label>
            Profile Name <span className="required">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., My 5 inch freestyle"
          />
        </div>

        <div className="wizard-form-grid">
          <div className="wizard-form-group">
            <label>
              Drone Size <span className="required">*</span>
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as DroneSize)}
            >
              {sizes.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="wizard-form-group">
            <label>
              Prop Size <span className="required">*</span>
            </label>
            <input
              type="text"
              value={propSize}
              onChange={(e) => setPropSize(e.target.value)}
              placeholder='e.g., 5.1"'
            />
          </div>
        </div>

        <div className="wizard-form-grid">
          <div className="wizard-form-group">
            <label>
              Battery <span className="required">*</span>
            </label>
            <select
              value={battery}
              onChange={(e) => setBattery(e.target.value as BatteryType)}
            >
              {batteries.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="wizard-form-group">
            <label>
              Weight (grams) <span className="required">*</span>
            </label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="wizard-form-group">
          <label>
            Motor KV <span className="required">*</span>
          </label>
          <input
            type="number"
            value={motorKV}
            onChange={(e) => setMotorKV(parseInt(e.target.value) || 0)}
            placeholder="e.g., 2400"
          />
        </div>

        <div className="wizard-form-group">
          <label>Frame Type</label>
          <select
            value={frameType || ''}
            onChange={(e) => setFrameType(e.target.value as FrameType || undefined)}
          >
            <option value="">Select...</option>
            {frameTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="wizard-form-group">
          <label>Flight Style</label>
          <select
            value={flightStyle || ''}
            onChange={(e) => setFlightStyle(e.target.value as FlightStyle || undefined)}
          >
            <option value="">Select...</option>
            {flightStyles.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="wizard-form-group">
          <label>Frame Stiffness</label>
          <select
            value={frameStiffness || ''}
            onChange={(e) => setFrameStiffness(e.target.value as FrameStiffness || undefined)}
          >
            <option value="">Select...</option>
            {frameStiffnesses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="wizard-form-group">
          <label>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional information about this drone..."
            rows={3}
          />
        </div>

        <div className="wizard-actions">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="wizard-btn wizard-btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="wizard-btn wizard-btn-success"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

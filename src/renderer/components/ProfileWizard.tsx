import { useState } from 'react';
import { PresetSelector } from './PresetSelector';
import { SIZE_DEFAULTS } from '@shared/constants';
import type {
  DroneSize,
  BatteryType,
  FrameType,
  FlightStyle,
  FrameStiffness,
  ProfileCreationInput
} from '@shared/types/profile.types';
import type { FCInfo } from '@shared/types/common.types';

interface ProfileWizardProps {
  fcSerial: string;
  fcInfo: FCInfo;
  onComplete: (input: ProfileCreationInput | { presetId: string; customName?: string }) => void;
  onCancel: () => void;
}

type WizardStep = 'method' | 'preset' | 'basic' | 'advanced' | 'review';
type CreationMethod = 'preset' | 'custom';

export function ProfileWizard({ fcSerial, fcInfo, onComplete, onCancel }: ProfileWizardProps) {
  const [step, setStep] = useState<WizardStep>('method');
  const [method, setMethod] = useState<CreationMethod | null>(null);

  // Preset path
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetCustomName, setPresetCustomName] = useState('');

  // Custom path - basic
  const [name, setName] = useState('');
  const [size, setSize] = useState<DroneSize>('5"');
  const [propSize, setPropSize] = useState('5.1"');
  const [battery, setBattery] = useState<BatteryType>('4S');
  const [weight, setWeight] = useState(650);
  const [motorKV, setMotorKV] = useState(2400);

  // Custom path - advanced (optional)
  const [frameType, setFrameType] = useState<FrameType | undefined>('freestyle');
  const [flightStyle, setFlightStyle] = useState<FlightStyle | undefined>('freestyle');
  const [frameStiffness, setFrameStiffness] = useState<FrameStiffness | undefined>('medium');
  const [notes, setNotes] = useState('');

  // Apply size defaults when size changes
  const handleSizeChange = (newSize: DroneSize) => {
    setSize(newSize);
    const defaults = SIZE_DEFAULTS[newSize];
    if (defaults) {
      setWeight(defaults.weight);
      setMotorKV(defaults.motorKV);
      setBattery(defaults.battery);
      setPropSize(defaults.propSize);
      setFrameStiffness(defaults.frameStiffness);
    }
  };

  const handleMethodSelect = (selectedMethod: CreationMethod) => {
    setMethod(selectedMethod);
    if (selectedMethod === 'preset') {
      setStep('preset');
    } else {
      setStep('basic');
    }
  };

  const handlePresetContinue = () => {
    if (!selectedPresetId) return;
    setStep('review');
  };

  const handleBasicContinue = () => {
    setStep('advanced');
  };

  const handleAdvancedContinue = () => {
    setStep('review');
  };

  const handleComplete = () => {
    if (method === 'preset' && selectedPresetId) {
      onComplete({
        presetId: selectedPresetId,
        customName: presetCustomName || undefined
      });
    } else {
      const input: ProfileCreationInput = {
        fcSerialNumber: fcSerial,
        fcInfo,
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
      onComplete(input);
    }
  };

  const canContinueBasic = name.trim().length > 0;
  const canContinuePreset = selectedPresetId !== null;

  return (
    <div className="profile-wizard fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Create Drone Profile</h2>
          <p className="text-gray-400 text-sm">
            New flight controller detected: <span className="text-blue-400">{fcInfo.boardName}</span>
          </p>
        </div>

        {/* Steps */}
        {step === 'method' && (
          <MethodStep
            onSelect={handleMethodSelect}
            onCancel={onCancel}
          />
        )}

        {step === 'preset' && (
          <PresetStep
            selectedPresetId={selectedPresetId}
            customName={presetCustomName}
            onPresetSelect={setSelectedPresetId}
            onNameChange={setPresetCustomName}
            onBack={() => setStep('method')}
            onContinue={handlePresetContinue}
            canContinue={canContinuePreset}
          />
        )}

        {step === 'basic' && (
          <BasicStep
            name={name}
            size={size}
            propSize={propSize}
            battery={battery}
            weight={weight}
            motorKV={motorKV}
            onNameChange={setName}
            onSizeChange={handleSizeChange}
            onPropSizeChange={setPropSize}
            onBatteryChange={setBattery}
            onWeightChange={setWeight}
            onMotorKVChange={setMotorKV}
            onBack={() => setStep('method')}
            onContinue={handleBasicContinue}
            canContinue={canContinueBasic}
          />
        )}

        {step === 'advanced' && (
          <AdvancedStep
            frameType={frameType}
            flightStyle={flightStyle}
            frameStiffness={frameStiffness}
            notes={notes}
            onFrameTypeChange={setFrameType}
            onFlightStyleChange={setFlightStyle}
            onFrameStiffnessChange={setFrameStiffness}
            onNotesChange={setNotes}
            onBack={() => setStep('basic')}
            onContinue={handleAdvancedContinue}
            onSkip={() => setStep('review')}
          />
        )}

        {step === 'review' && (
          <ReviewStep
            method={method!}
            presetId={selectedPresetId}
            presetCustomName={presetCustomName}
            name={name}
            size={size}
            propSize={propSize}
            battery={battery}
            weight={weight}
            motorKV={motorKV}
            frameType={frameType}
            flightStyle={flightStyle}
            frameStiffness={frameStiffness}
            notes={notes}
            onBack={() => setStep(method === 'preset' ? 'preset' : 'advanced')}
            onCreate={handleComplete}
          />
        )}
      </div>
    </div>
  );
}

// Method selection step
function MethodStep({ onSelect, onCancel }: {
  onSelect: (method: CreationMethod) => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">How would you like to create your profile?</h3>

      <div className="space-y-3 mb-6">
        <button
          onClick={() => onSelect('preset')}
          className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-lg border-2 border-gray-700 hover:border-blue-500 transition-all text-left"
        >
          <div className="font-semibold text-white mb-1">Use a Preset</div>
          <div className="text-sm text-gray-400">
            Quick setup with pre-configured values for common drone types
          </div>
        </button>

        <button
          onClick={() => onSelect('custom')}
          className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-lg border-2 border-gray-700 hover:border-blue-500 transition-all text-left"
        >
          <div className="font-semibold text-white mb-1">Custom Configuration</div>
          <div className="text-sm text-gray-400">
            Manually configure all parameters for maximum control
          </div>
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Preset selection step
function PresetStep({
  selectedPresetId,
  customName,
  onPresetSelect,
  onNameChange,
  onBack,
  onContinue,
  canContinue
}: {
  selectedPresetId: string | null;
  customName: string;
  onPresetSelect: (id: string) => void;
  onNameChange: (name: string) => void;
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
}) {
  return (
    <div>
      <PresetSelector
        selectedPresetId={selectedPresetId}
        onSelect={onPresetSelect}
      />

      {selectedPresetId && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Custom Name (optional)
          </label>
          <input
            type="text"
            value={customName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Leave empty to use preset name"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// Basic info step
function BasicStep({
  name,
  size,
  propSize,
  battery,
  weight,
  motorKV,
  onNameChange,
  onSizeChange,
  onPropSizeChange,
  onBatteryChange,
  onWeightChange,
  onMotorKVChange,
  onBack,
  onContinue,
  canContinue
}: {
  name: string;
  size: DroneSize;
  propSize: string;
  battery: BatteryType;
  weight: number;
  motorKV: number;
  onNameChange: (value: string) => void;
  onSizeChange: (value: DroneSize) => void;
  onPropSizeChange: (value: string) => void;
  onBatteryChange: (value: BatteryType) => void;
  onWeightChange: (value: number) => void;
  onMotorKVChange: (value: number) => void;
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
}) {
  const sizes: DroneSize[] = ['2.5"', '3"', '4"', '5"', '6"', '7"', '10"'];
  const batteries: BatteryType[] = ['3S', '4S', '6S'];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Basic Configuration</h3>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Profile Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., My 5 inch freestyle"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Drone Size <span className="text-red-500">*</span>
            </label>
            <select
              value={size}
              onChange={(e) => onSizeChange(e.target.value as DroneSize)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sizes.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Prop Size <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={propSize}
              onChange={(e) => onPropSizeChange(e.target.value)}
              placeholder="e.g., 5.1"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Battery <span className="text-red-500">*</span>
            </label>
            <select
              value={battery}
              onChange={(e) => onBatteryChange(e.target.value as BatteryType)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {batteries.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Weight (grams) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={weight}
              onChange={(e) => onWeightChange(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Motor KV <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={motorKV}
            onChange={(e) => onMotorKVChange(parseInt(e.target.value) || 0)}
            placeholder="e.g., 2400"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// Advanced step
function AdvancedStep({
  frameType,
  flightStyle,
  frameStiffness,
  notes,
  onFrameTypeChange,
  onFlightStyleChange,
  onFrameStiffnessChange,
  onNotesChange,
  onBack,
  onContinue,
  onSkip
}: {
  frameType?: FrameType;
  flightStyle?: FlightStyle;
  frameStiffness?: FrameStiffness;
  notes: string;
  onFrameTypeChange: (value?: FrameType) => void;
  onFlightStyleChange: (value?: FlightStyle) => void;
  onFrameStiffnessChange: (value?: FrameStiffness) => void;
  onNotesChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const frameTypes: FrameType[] = ['freestyle', 'race', 'cinematic', 'long-range'];
  const flightStyles: FlightStyle[] = ['freestyle', 'race', 'cruising', 'cinematic'];
  const frameStiffnesses: FrameStiffness[] = ['soft', 'medium', 'stiff'];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Advanced Settings (Optional)</h3>
      <p className="text-sm text-gray-400 mb-4">
        These settings help fine-tune PID recommendations
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Frame Type
          </label>
          <select
            value={frameType || ''}
            onChange={(e) => onFrameTypeChange(e.target.value as FrameType || undefined)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            {frameTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Flight Style
          </label>
          <select
            value={flightStyle || ''}
            onChange={(e) => onFlightStyleChange(e.target.value as FlightStyle || undefined)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            {flightStyles.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Frame Stiffness
          </label>
          <select
            value={frameStiffness || ''}
            onChange={(e) => onFrameStiffnessChange(e.target.value as FrameStiffness || undefined)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            {frameStiffnesses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Any additional information about this drone..."
            rows={3}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <div className="space-x-2">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Skip
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// Review step
function ReviewStep({
  method,
  presetId,
  presetCustomName,
  name,
  size,
  propSize,
  battery,
  weight,
  motorKV,
  frameType,
  flightStyle,
  frameStiffness,
  notes,
  onBack,
  onCreate
}: {
  method: CreationMethod;
  presetId: string | null;
  presetCustomName: string;
  name: string;
  size: DroneSize;
  propSize: string;
  battery: BatteryType;
  weight: number;
  motorKV: number;
  frameType?: FrameType;
  flightStyle?: FlightStyle;
  frameStiffness?: FrameStiffness;
  notes: string;
  onBack: () => void;
  onCreate: () => void;
}) {
  const preset = presetId ? Object.values(PRESET_PROFILES).find(p => p.presetId === presetId) : null;
  const displayName = method === 'preset'
    ? (presetCustomName || preset?.name || '')
    : name;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Review Profile</h3>

      <div className="bg-gray-800 rounded-lg p-4 mb-6 space-y-3">
        {method === 'preset' && (
          <div className="pb-3 border-b border-gray-700">
            <div className="text-sm text-gray-400">Source</div>
            <div className="text-white font-medium">Preset: {preset?.name}</div>
          </div>
        )}

        <div>
          <div className="text-sm text-gray-400">Name</div>
          <div className="text-white font-medium">{displayName}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm text-gray-400">Size</div>
            <div className="text-white">{method === 'preset' ? preset?.size : size}</div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Props</div>
            <div className="text-white">{method === 'preset' ? preset?.propSize : propSize}</div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Battery</div>
            <div className="text-white">{method === 'preset' ? preset?.battery : battery}</div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Weight</div>
            <div className="text-white">{method === 'preset' ? preset?.weight : weight}g</div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Motor KV</div>
            <div className="text-white">{method === 'preset' ? preset?.motorKV : motorKV}</div>
          </div>
        </div>

        {(frameType || flightStyle || frameStiffness) && (
          <>
            <div className="border-t border-gray-700 pt-3">
              <div className="text-sm text-gray-400 mb-2">Advanced Settings</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {frameType && (
                  <div>
                    <span className="text-gray-400">Frame:</span>{' '}
                    <span className="text-white capitalize">{frameType}</span>
                  </div>
                )}
                {flightStyle && (
                  <div>
                    <span className="text-gray-400">Style:</span>{' '}
                    <span className="text-white capitalize">{flightStyle}</span>
                  </div>
                )}
                {frameStiffness && (
                  <div>
                    <span className="text-gray-400">Stiffness:</span>{' '}
                    <span className="text-white capitalize">{frameStiffness}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {notes && (
          <div className="border-t border-gray-700 pt-3">
            <div className="text-sm text-gray-400 mb-1">Notes</div>
            <div className="text-white text-sm">{notes}</div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={onCreate}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
        >
          Create Profile
        </button>
      </div>
    </div>
  );
}

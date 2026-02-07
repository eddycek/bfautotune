import { PRESET_PROFILES } from '@shared/constants';
import type { PresetProfile } from '@shared/types/profile.types';

interface PresetSelectorProps {
  selectedPresetId: string | null;
  onSelect: (presetId: string) => void;
}

export function PresetSelector({ selectedPresetId, onSelect }: PresetSelectorProps) {
  const presets = Object.values(PRESET_PROFILES);

  return (
    <div className="preset-selector">
      <h3 className="text-lg font-semibold mb-4">Choose a preset profile</h3>
      <p className="text-sm text-gray-400 mb-4">
        Start with a pre-configured profile for common drone types
      </p>

      <div className="grid grid-cols-1 gap-3">
        {presets.map((preset) => (
          <PresetCard
            key={preset.presetId}
            preset={preset}
            selected={selectedPresetId === preset.presetId}
            onSelect={() => onSelect(preset.presetId)}
          />
        ))}
      </div>
    </div>
  );
}

interface PresetCardProps {
  preset: PresetProfile;
  selected: boolean;
  onSelect: () => void;
}

function PresetCard({ preset, selected, onSelect }: PresetCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        preset-card text-left p-4 rounded-lg border-2 transition-all
        ${selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
        }
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-semibold text-white mb-1">{preset.name}</h4>
          <p className="text-sm text-gray-400 mb-3">{preset.notes}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Size:</span>{' '}
              <span className="text-gray-300">{preset.size}</span>
            </div>
            <div>
              <span className="text-gray-500">Battery:</span>{' '}
              <span className="text-gray-300">{preset.battery}</span>
            </div>
            <div>
              <span className="text-gray-500">Props:</span>{' '}
              <span className="text-gray-300">{preset.propSize}</span>
            </div>
            <div>
              <span className="text-gray-500">Weight:</span>{' '}
              <span className="text-gray-300">{preset.weight}g</span>
            </div>
            <div>
              <span className="text-gray-500">Motor KV:</span>{' '}
              <span className="text-gray-300">{preset.motorKV}</span>
            </div>
            <div>
              <span className="text-gray-500">Style:</span>{' '}
              <span className="text-gray-300 capitalize">{preset.flightStyle}</span>
            </div>
          </div>
        </div>

        <div className="ml-4">
          <div
            className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center
              ${selected ? 'border-blue-500' : 'border-gray-600'}
            `}
          >
            {selected && (
              <div className="w-3 h-3 rounded-full bg-blue-500" />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

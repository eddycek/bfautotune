import { PRESET_PROFILES } from '@shared/constants';
import type { PresetProfile } from '@shared/types/profile.types';

interface PresetSelectorProps {
  selectedPresetId: string | null;
  onSelect: (presetId: string) => void;
}

export function PresetSelector({ selectedPresetId, onSelect }: PresetSelectorProps) {
  const presets = Object.entries(PRESET_PROFILES);

  return (
    <div>
      <div className="preset-grid">
        {presets.map(([id, preset]) => (
          <PresetCard
            key={id}
            preset={preset}
            selected={selectedPresetId === id}
            onSelect={() => onSelect(id)}
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
    <div
      onClick={onSelect}
      className={`preset-card ${selected ? 'selected' : ''}`}
    >
      <div className="preset-card-content">
        <div className="preset-card-title">{preset.name}</div>
        <div className="preset-card-description">{preset.description}</div>

        <div className="preset-card-specs">
          <div className="preset-card-spec">
            Size: <span className="preset-card-spec-value">{preset.size}</span>
          </div>
          <div className="preset-card-spec">
            Battery: <span className="preset-card-spec-value">{preset.battery}</span>
          </div>
          <div className="preset-card-spec">
            Props: <span className="preset-card-spec-value">{preset.propSize}</span>
          </div>
          <div className="preset-card-spec">
            Weight: <span className="preset-card-spec-value">{preset.weight}g</span>
          </div>
          <div className="preset-card-spec">
            Motor: <span className="preset-card-spec-value">{preset.motorKV}KV</span>
          </div>
        </div>
      </div>

      <div className="preset-card-radio">
        {selected && <div className="preset-card-radio-dot" />}
      </div>
    </div>
  );
}

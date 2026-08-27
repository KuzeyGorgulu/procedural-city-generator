import type { FormEvent } from 'react';

interface GenerationControlsProps {
  readonly seed: string;
  readonly generatorVersion: string;
  readonly onSeedChange: (seed: string) => void;
  readonly onGenerate: (seed: string) => void;
  readonly onRandomize: () => void;
}

export function GenerationControls({
  seed,
  generatorVersion,
  onSeedChange,
  onGenerate,
  onRandomize,
}: GenerationControlsProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGenerate(seed);
  }

  return (
    <form className="controls" onSubmit={handleSubmit}>
      <label className="seed-field">
        <span>Seed</span>
        <input
          aria-label="World seed"
          autoComplete="off"
          onChange={(event) => onSeedChange(event.target.value)}
          spellCheck={false}
          type="text"
          value={seed}
        />
      </label>
      <div className="button-group">
        <button className="primary-button" type="submit">
          Generate
        </button>
        <button className="secondary-button" onClick={onRandomize} type="button">
          Random seed
        </button>
      </div>
      <p className="version-label">
        Generator <code>{generatorVersion}</code>
      </p>
    </form>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface AdminSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface AdminSelectProps {
  value: string;
  options: AdminSelectOption[];
  disabled?: boolean;
  compact?: boolean;
  onChange: (value: string) => void;
}

function inputStyle(block = false): CSSProperties {
  return {
    width: '100%',
    display: block ? 'block' : 'inline-block',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff8ef',
    padding: '10px 12px',
    boxSizing: 'border-box',
  };
}

function tableInputStyle(disabled = false): CSSProperties {
  return {
    width: '100%',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)',
    background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
    color: '#fff8ef',
    padding: '8px 10px',
    boxSizing: 'border-box',
    opacity: disabled ? 0.5 : 1,
  };
}

function customSelectButtonStyle(disabled = false, compact = false, open = false): CSSProperties {
  const baseStyle = compact ? tableInputStyle(disabled) : inputStyle(true);
  return {
    ...baseStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    textAlign: 'left',
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderColor: open ? 'rgba(255,210,133,0.36)' : 'rgba(255,255,255,0.14)',
    background: open ? 'rgba(255,210,133,0.10)' : baseStyle.background,
  };
}

export function AdminSelect({ value, options, disabled = false, compact = false, onChange }: AdminSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find(option => option.value === value) ?? options[0] ?? null;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        title={selectedOption?.description ?? selectedOption?.label ?? '未选择'}
        onClick={() => {
          if (!disabled) {
            setOpen(current => !current);
          }
        }}
        style={customSelectButtonStyle(disabled, compact, open)}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            opacity: selectedOption ? 1 : 0.48,
          }}
        >
          {selectedOption?.label ?? '未选择'}
        </span>
        <span
          style={{
            flexShrink: 0,
            opacity: 0.72,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }}
        >
          ▾
        </span>
      </button>

      {open && !disabled ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 40,
            padding: 6,
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(20,16,22,0.98)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.28)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div style={{ display: 'grid', gap: 4, maxHeight: compact ? 220 : 280, overflowY: 'auto' }}>
            {options.map(option => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  title={option.description ?? option.label}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: compact ? '8px 10px' : '10px 12px',
                    background: selected ? 'rgba(255,210,133,0.18)' : 'rgba(255,255,255,0.04)',
                    color: '#fff8ef',
                    textAlign: 'left',
                    cursor: 'pointer',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    fontSize: compact ? 13 : 14,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

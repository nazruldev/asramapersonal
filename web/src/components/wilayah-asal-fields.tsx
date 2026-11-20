import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { BottomPicker } from '@/components/ui/bottom-picker';
import { appFieldThemed, appLabelThemed, appPickerBtnClass } from '@/lib/form-styles';
import { cn } from '@/lib/utils';
import type { SantriAsalWilayahFields } from '@/lib/wilayah-types';
import { asalWilayahDetailLevels } from '@/lib/wilayah-types';
import {
  fetchCities,
  fetchKecamatan,
  fetchKecamatanCari,
  fetchProvinces,
  type KecamatanSearchHit,
} from '@/lib/wilayah-api';
import {
  loadWilayahIndex,
  searchSubDistrictsGlobal,
  wilayahFromKecamatanCode,
} from '@/lib/wilayah-index';
import type { WilayahIndex } from '@/lib/wilayah-types';

export type WilayahFormSlice = SantriAsalWilayahFields;

type PickerKind = 'kecamatan-cari' | 'provinsi' | 'kota' | 'kecamatan' | null;

type Props = {
  value: WilayahFormSlice;
  onChange: (next: WilayahFormSlice) => void;
  theme: 'light' | 'dark';
};

const emptyAsal: WilayahFormSlice = {
  asal_provinsi_code: '',
  asal_provinsi_nama: '',
  asal_kota_code: '',
  asal_kota_nama: '',
  asal_kecamatan_code: '',
  asal_kecamatan_nama: '',
  asal_desa_code: '',
  asal_desa_nama: '',
};

export function emptyWilayahForm(): WilayahFormSlice {
  return { ...emptyAsal };
}

export function wilayahFromSantri(row: SantriAsalWilayahFields | null | undefined): WilayahFormSlice {
  return {
    asal_provinsi_code: row?.asal_provinsi_code ?? '',
    asal_provinsi_nama: row?.asal_provinsi_nama ?? '',
    asal_kota_code: row?.asal_kota_code ?? '',
    asal_kota_nama: row?.asal_kota_nama ?? '',
    asal_kecamatan_code: row?.asal_kecamatan_code ?? '',
    asal_kecamatan_nama: row?.asal_kecamatan_nama ?? '',
    asal_desa_code: row?.asal_desa_code ?? '',
    asal_desa_nama: row?.asal_desa_nama ?? '',
  };
}

export function WilayahAsalFields({ value, onChange, theme }: Props) {
  const [picker, setPicker] = useState<PickerKind>(null);
  const [options, setOptions] = useState<{ value: string; label: string; sublabel?: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [indexReady, setIndexReady] = useState(false);
  const [wilayahIndex, setWilayahIndex] = useState<WilayahIndex | null>(null);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    void loadWilayahIndex()
      .then((idx) => {
        setWilayahIndex(idx);
        setIndexReady(true);
      })
      .catch(() => setIndexReady(false));
  }, []);

  const label = (text: string) => <label className={appLabelThemed(theme)}>{text}</label>;

  const pickerBtn = cn(
    appPickerBtnClass,
    theme === 'dark'
      ? 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600/80'
      : 'text-slate-800'
  );

  const loadKecamatanCari = useCallback(async (q: string) => {
    setLoadingOptions(true);
    try {
      const rows = await fetchKecamatanCari(q);
      setOptions(
        rows.map((r: KecamatanSearchHit) => ({
          value: r.code,
          label: r.name,
          sublabel: [r.cityName, r.provinceName].filter(Boolean).join(' · '),
        }))
      );
    } catch {
      if (wilayahIndex && q.trim().length >= 2) {
        const local = searchSubDistrictsGlobal(wilayahIndex, q);
        setOptions(
          local.map((r) => ({
            value: r.code,
            label: r.name,
            sublabel: [r.cityName, r.provinceName].filter(Boolean).join(' · '),
          }))
        );
      } else {
        setOptions([]);
      }
    } finally {
      setLoadingOptions(false);
    }
  }, [wilayahIndex]);

  const loadOptions = useCallback(
    async (kind: PickerKind) => {
      if (!kind) return;
      if (kind === 'kecamatan-cari') {
        setOptions([]);
        return;
      }
      setLoadingOptions(true);
      try {
        if (kind === 'provinsi') {
          const rows = await fetchProvinces();
          setOptions(rows.map((r) => ({ value: r.code, label: r.name })));
        } else if (kind === 'kota' && value.asal_provinsi_code) {
          const rows = await fetchCities(value.asal_provinsi_code);
          setOptions(rows.map((r) => ({ value: r.code, label: r.name })));
        } else if (kind === 'kecamatan' && value.asal_kota_code) {
          const rows = await fetchKecamatan(value.asal_kota_code);
          setOptions(rows.map((r) => ({ value: r.code, label: r.name })));
        } else {
          setOptions([]);
        }
      } catch {
        setOptions([]);
      } finally {
        setLoadingOptions(false);
      }
    },
    [value.asal_provinsi_code, value.asal_kota_code, loadKecamatanCari]
  );

  useEffect(() => {
    if (picker) void loadOptions(picker);
  }, [picker, loadOptions]);

  const onKecamatanSearchQueryChange = useCallback(
    (q: string) => {
      if (q.trim().length < 2) {
        setOptions([]);
        return;
      }
      void loadKecamatanCari(q);
    },
    [loadKecamatanCari]
  );

  const pickerTitle = useMemo(() => {
    switch (picker) {
      case 'kecamatan-cari':
        return 'Cari Kecamatan';
      case 'provinsi':
        return 'Pilih Provinsi';
      case 'kota':
        return 'Pilih Kota / Kabupaten';
      case 'kecamatan':
        return 'Pilih Kecamatan';
      default:
        return '';
    }
  }, [picker]);

  const currentPickerValue = useMemo(() => {
    switch (picker) {
      case 'kecamatan-cari':
      case 'kecamatan':
        return value.asal_kecamatan_code ?? '';
      case 'provinsi':
        return value.asal_provinsi_code ?? '';
      case 'kota':
        return value.asal_kota_code ?? '';
      default:
        return '';
    }
  }, [picker, value]);

  const applyKecamatanCode = (code: string, labelName?: string) => {
    if (!code) {
      onChange({
        ...value,
        asal_kecamatan_code: '',
        asal_kecamatan_nama: '',
        asal_desa_code: '',
        asal_desa_nama: '',
      });
      return;
    }
    if (wilayahIndex) {
      const filled = wilayahFromKecamatanCode(wilayahIndex, code);
      if (filled) {
        onChange({ ...filled, asal_desa_nama: value.asal_desa_nama ?? '' });
        return;
      }
    }
    onChange({
      ...value,
      asal_kecamatan_code: code,
      asal_kecamatan_nama: labelName ?? '',
    });
  };

  const handleSelect = (code: string) => {
    if (!code) {
      if (picker === 'kecamatan-cari' || picker === 'kecamatan') {
        applyKecamatanCode('');
      } else if (picker === 'provinsi') onChange({ ...emptyAsal });
      else if (picker === 'kota') {
        onChange({
          ...value,
          asal_kota_code: '',
          asal_kota_nama: '',
          asal_kecamatan_code: '',
          asal_kecamatan_nama: '',
          asal_desa_code: '',
          asal_desa_nama: '',
        });
      }
      setPicker(null);
      return;
    }

    const opt = options.find((o) => o.value === code);
    const name = opt?.label ?? '';

    if (picker === 'kecamatan-cari') {
      applyKecamatanCode(code, name);
    } else if (picker === 'provinsi') {
      onChange({
        ...emptyAsal,
        asal_provinsi_code: code,
        asal_provinsi_nama: name,
      });
    } else if (picker === 'kota') {
      onChange({
        ...value,
        asal_kota_code: code,
        asal_kota_nama: name,
        asal_kecamatan_code: '',
        asal_kecamatan_nama: '',
        asal_desa_code: '',
        asal_desa_nama: '',
      });
    } else if (picker === 'kecamatan') {
      applyKecamatanCode(code, name);
    }
    setPicker(null);
  };

  const wilayahLevels = asalWilayahDetailLevels(value);
  const hasAny = wilayahLevels.length > 0;
  const fieldBase = appFieldThemed(theme);

  const kecamatanDisplay =
    value.asal_kecamatan_nama ||
    (value.asal_kota_nama ? 'Pilih kecamatan…' : 'Cari kecamatan (isi otomatis provinsi & kota)');

  return (
    <div className="space-y-3 border-t border-slate-200/80 dark:border-slate-700 pt-4 mt-1">
      <div>
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Asal / Domisili</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          Cukup pilih <strong className="font-semibold">kecamatan</strong> — provinsi dan kota/kabupaten
          terisi otomatis. Desa opsional (ketik manual).
        </p>
        {!indexReady && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            Memuat indeks wilayah…
          </p>
        )}
      </div>

      <div>
        {label('Kecamatan *')}
        <button
          type="button"
          disabled={!indexReady}
          onClick={() => {
            setOptions([]);
            setPicker('kecamatan-cari');
          }}
          className={cn(pickerBtn, 'border-emerald-200 dark:border-emerald-800')}
        >
          <Search className="w-4 h-4 shrink-0 opacity-50" />
          <span
            className={cn(
              'truncate text-left flex-1',
              !value.asal_kecamatan_nama && 'text-slate-400'
            )}
          >
            {kecamatanDisplay}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
        </button>
      </div>

      {hasAny ? (
        <div className="grid grid-cols-1 gap-1.5 text-[11px] rounded-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 px-3 py-2">
          {wilayahLevels.map((level) => (
            <p key={level.key}>
              <span className="text-slate-500">{level.label}: </span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{level.value}</span>
            </p>
          ))}
        </div>
      ) : null}

      <div>
        {label('Desa / Kelurahan (opsional)')}
        <input
          type="text"
          value={value.asal_desa_nama ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              asal_desa_nama: e.target.value,
              asal_desa_code: '',
            })
          }
          placeholder="Bisa dikosongkan atau ketik nama desa"
          className={fieldBase}
        />
      </div>

      <button
        type="button"
        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
        onClick={() => setShowManual((v) => !v)}
      >
        {showManual ? 'Sembunyikan pilihan manual' : 'Pilih manual (provinsi → kota → kecamatan)'}
      </button>

      {showManual ? (
        <div className="space-y-3 pl-0.5">
          <div>
            {label('Provinsi')}
            <button
              type="button"
              disabled={!indexReady}
              onClick={() => setPicker('provinsi')}
              className={pickerBtn}
            >
              <span
                className={cn('truncate text-left', !value.asal_provinsi_nama && 'text-slate-400')}
              >
                {value.asal_provinsi_nama || 'Pilih provinsi…'}
              </span>
              <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
            </button>
          </div>
          {value.asal_provinsi_code ? (
            <div>
              {label('Kota / Kabupaten')}
              <button type="button" onClick={() => setPicker('kota')} className={pickerBtn}>
                <span className={cn('truncate text-left', !value.asal_kota_nama && 'text-slate-400')}>
                  {value.asal_kota_nama || 'Pilih kota/kabupaten…'}
                </span>
                <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              </button>
            </div>
          ) : null}
          {value.asal_kota_code ? (
            <div>
              {label('Kecamatan')}
              <button type="button" onClick={() => setPicker('kecamatan')} className={pickerBtn}>
                <span
                  className={cn('truncate text-left', !value.asal_kecamatan_nama && 'text-slate-400')}
                >
                  {value.asal_kecamatan_nama || 'Pilih kecamatan…'}
                </span>
                <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}


      {picker === 'kecamatan-cari' ? (
        <BottomPicker
          open={picker !== null}
          onClose={() => setPicker(null)}
          title={pickerTitle}
          description={loadingOptions ? 'Memuat…' : 'Ketik minimal 2 huruf untuk mencari kecamatan'}
          options={options}
          value={currentPickerValue}
          onSelect={handleSelect}
          allowClear
          clearLabel="Kosongkan kecamatan"
          searchPlaceholder="Cari nama kecamatan…"
          closeOnSelect={true}
          remoteSearch
          onSearchQueryChange={onKecamatanSearchQueryChange}
        />
      ) : (
        <BottomPicker
          open={picker !== null}
          onClose={() => setPicker(null)}
          title={pickerTitle}
          description={loadingOptions ? 'Memuat…' : undefined}
          options={options}
          value={currentPickerValue}
          onSelect={handleSelect}
          allowClear
          clearLabel="Kosongkan pilihan"
          searchPlaceholder="Cari nama…"
        />
      )}
    </div>
  );
}

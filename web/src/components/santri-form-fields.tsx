import type { Dispatch, SetStateAction } from 'react';
import { Camera, ChevronDown, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  appFieldThemed,
  appLabelThemed,
  appPickerBtnClass,
  appTextareaClass,
} from '@/lib/form-styles';
import { WilayahAsalFields, type WilayahFormSlice } from '@/components/wilayah-asal-fields';

export type SantriFormState = {
  nama: string;
  kelas: string;
  kamar: string;
  nomor_wali: string;
  include_wa: boolean;
  catatan: string;
  catatan_medis: string;
  foto: string;
};

type KelasRow = { id: string; nama: string; tingkat?: string };
type KamarRow = { id: string; nama: string; terisi?: number; kapasitas?: number };

type Props = {
  formData: SantriFormState;
  setFormData: Dispatch<SetStateAction<SantriFormState>>;
  theme: 'light' | 'dark';
  kelasList: KelasRow[];
  kamarList: KamarRow[];
  onTakePhoto: () => void;
  onOpenKelasPicker: () => void;
  onOpenKamarPicker: () => void;
  includeWaId?: string;
  wilayah?: WilayahFormSlice;
  onWilayahChange?: (next: WilayahFormSlice) => void;
};

const fieldBase = (theme: 'light' | 'dark') => appFieldThemed(theme);

const pickerBtn = (theme: 'light' | 'dark') =>
  cn(
    appPickerBtnClass,
    theme === 'dark'
      ? 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600/80'
      : 'text-slate-800'
  );

export function SantriFormFields({
  formData,
  setFormData,
  theme,
  kelasList,
  kamarList,
  onTakePhoto,
  onOpenKelasPicker,
  onOpenKamarPicker,
  includeWaId = 'include_wa',
  wilayah,
  onWilayahChange,
}: Props) {
  const label = (text: string) => <label className={appLabelThemed(theme)}>{text}</label>;

  const kelasDisplay =
    formData.kelas ||
    (kelasList.length ? 'Pilih kelas…' : 'Data kelas kosong');
  const kamarDisplay = formData.kamar || 'Pilih kamar… (opsional)';

  return (
    <div className="grid grid-cols-1 gap-4 w-full">
      <div>
        {label('Foto Santri')}
        <div className="flex items-center gap-3">
          {formData.foto ? (
            <img src={formData.foto} alt="" className="w-14 h-14 rounded-sm object-cover shrink-0" />
          ) : (
            <div
              className={cn(
                'w-14 h-14 rounded-sm flex items-center justify-center shrink-0',
                theme === 'dark' ? 'bg-slate-700' : 'bg-slate-100'
              )}
            >
              <User className="w-7 h-7 text-slate-400" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={onTakePhoto}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold border',
                theme === 'dark'
                  ? 'border-emerald-700 text-emerald-400 bg-emerald-950/40'
                  : 'border-emerald-200 text-emerald-700 bg-emerald-50'
              )}
            >
              <Camera className="w-4 h-4" />
              Ambil Foto
            </button>
            {formData.foto && (
              <button
                type="button"
                onClick={() => setFormData({ ...formData, foto: '' })}
                className="p-2 rounded-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                aria-label="Hapus foto"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        {label('Nama Lengkap *')}
        <input
          type="text"
          value={formData.nama}
          onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
          placeholder="Ahmad Dahlan"
          className={fieldBase(theme)}
        />
      </div>

      <div>
        {label('Kelas *')}
        <button type="button" onClick={onOpenKelasPicker} className={pickerBtn(theme)}>
          <span className={cn('truncate text-left', !formData.kelas && 'text-slate-400')}>
            {kelasDisplay}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
        </button>
      </div>

      <div>
        {label('Kamar')}
        <button type="button" onClick={onOpenKamarPicker} className={pickerBtn(theme)}>
          <span className={cn('truncate text-left', !formData.kamar && 'text-slate-400')}>
            {kamarDisplay}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
        </button>
      </div>

      <div>
        {label('Nomor HP Wali')}
        <input
          type="tel"
          value={formData.nomor_wali}
          onChange={(e) => setFormData({ ...formData, nomor_wali: e.target.value })}
          placeholder="0812…"
          className={fieldBase(theme)}
        />
      </div>

      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          id={includeWaId}
          checked={formData.include_wa}
          onChange={(e) => setFormData({ ...formData, include_wa: e.target.checked })}
          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 shrink-0"
        />
        <label
          htmlFor={includeWaId}
          className={cn('text-xs leading-snug', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}
        >
          Sertakan opsi WhatsApp saat hubungi wali
        </label>
      </div>

      <div>
        {label('Catatan Medis')}
        <textarea
          value={formData.catatan_medis}
          onChange={(e) => setFormData({ ...formData, catatan_medis: e.target.value })}
          rows={3}
          placeholder="Penyakit yang pernah/sedang diderita, obat rutin, alergi makanan/obat, dll."
          className={cn(appTextareaClass, appFieldThemed(theme), 'min-h-[5.5rem]')}
        />
      </div>

      <div>
        {label('Catatan')}
        <textarea
          value={formData.catatan}
          onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
          rows={3}
          placeholder="Catatan umum santri…"
          className={cn(appTextareaClass, appFieldThemed(theme), 'min-h-[5.5rem]')}
        />
      </div>

      {wilayah && onWilayahChange ? (
        <WilayahAsalFields value={wilayah} onChange={onWilayahChange} theme={theme} />
      ) : null}
    </div>
  );
}
